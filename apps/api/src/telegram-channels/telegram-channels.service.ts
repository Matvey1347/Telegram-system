import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../common/workspace.service';
import { TokenEncryptionService } from '../common/security/token-encryption.service';
import { CheckBotAccessDto, CreateInviteLinkDto, CreateTelegramChannelDto, UpdateInviteLinkDto, UpdateTelegramChannelDto } from './dto';
import { TelegramApiError, TelegramBotApiClient } from '../telegram/shared/telegram-bot-api.client';

@Injectable()
export class TelegramChannelsService {
  constructor(
    private prisma: PrismaService,
    private workspaceService: WorkspaceService,
    private encryptionService: TokenEncryptionService,
    private telegramApi: TelegramBotApiClient,
  ) {}

  async findAll(userId: string) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(userId);
    return this.prisma.telegramChannel.findMany({
      where: { workspaceId },
      include: { telegramBotIntegration: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, id: string) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const row = await this.prisma.telegramChannel.findFirst({ where: { id, workspaceId }, include: { telegramBotIntegration: true } });
    if (!row) throw new NotFoundException('Telegram channel not found');
    return row;
  }

  async create(userId: string, dto: CreateTelegramChannelDto) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(userId);
    return this.prisma.telegramChannel.create({ data: { workspaceId, ...dto }, include: { telegramBotIntegration: true } });
  }

  async update(userId: string, id: string, dto: UpdateTelegramChannelDto) {
    await this.findOne(userId, id);
    return this.prisma.telegramChannel.update({ where: { id }, data: dto, include: { telegramBotIntegration: true } });
  }

  async remove(userId: string, id: string) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(userId);
    await this.findOne(userId, id);

    return this.prisma.$transaction(async (tx) => {
      const campaigns = await tx.adCampaign.findMany({ where: { workspaceId, telegramChannelId: id }, select: { id: true } });
      const campaignIds = campaigns.map((c) => c.id);
      const inviteLinks = await tx.telegramInviteLink.findMany({ where: { workspaceId, telegramChannelId: id }, select: { id: true } });
      const inviteIds = inviteLinks.map((x) => x.id);

      if (campaignIds.length) {
        await tx.transaction.deleteMany({ where: { workspaceId, adCampaignId: { in: campaignIds } } });
      }

      await tx.subscriberEvent.deleteMany({
        where: {
          workspaceId,
          OR: [
            { telegramChannelId: id },
            campaignIds.length ? { adCampaignId: { in: campaignIds } } : undefined,
            inviteIds.length ? { inviteLinkId: { in: inviteIds } } : undefined,
          ].filter(Boolean) as any,
        },
      });

      await tx.promo.deleteMany({ where: { workspaceId, telegramChannelId: id } });
      await tx.telegramInviteLink.deleteMany({ where: { workspaceId, telegramChannelId: id } });
      await tx.adCampaign.deleteMany({ where: { workspaceId, telegramChannelId: id } });
      await tx.telegramChannelDailyStats.deleteMany({ where: { telegramChannelId: id } });
      await tx.telegramChannel.delete({ where: { id } });

      return { success: true };
    });
  }

  async checkBotAccess(userId: string, channelId: string, dto: CheckBotAccessDto) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const channel = await this.prisma.telegramChannel.findFirst({ where: { id: channelId, workspaceId } });
    if (!channel) throw new NotFoundException('Telegram channel not found');

    const botId = dto.telegramBotIntegrationId || channel.telegramBotIntegrationId;
    if (!botId) throw new BadRequestException('No bot selected. Assign a Telegram bot to this channel first.');

    const bot = await this.prisma.telegramBotIntegration.findFirst({ where: { id: botId, workspaceId, isActive: true } });
    if (!bot) throw new NotFoundException('Telegram bot not found');
    const token = this.encryptionService.decrypt({
      encrypted: bot.botTokenEncrypted,
      iv: bot.botTokenIv,
      authTag: bot.botTokenAuthTag,
    });

    const target = channel.telegramChatId || channel.username;
    if (!target) throw new BadRequestException('Channel has no username or chatId. Add one before checking bot access.');
    const chatId = target.startsWith('@') || target.startsWith('-') ? target : `@${target}`;

    try {
      const chat = await this.telegramApi.getChat(token, chatId);
      const membersCount = await this.telegramApi.getChatMemberCount(token, chatId);
      const member = await this.telegramApi.getChatMember(token, chatId, bot.botId || '');
      const admins = await this.telegramApi.getChatAdministrators(token, chatId);
      const botAdmin = admins.find((a) => String(a.user.id) === String(bot.botId));
      let photoUrl: string | null = null;
      const photoBigFileId = chat.photo?.big_file_id || null;
      const photoSmallFileId = chat.photo?.small_file_id || null;
      if (photoBigFileId) {
        const file = await this.telegramApi.getFile(token, photoBigFileId);
        if (file.file_path) photoUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
      }

      const isAdmin = member.status === 'administrator' || member.status === 'creator';
      const canInviteUsers = !!(member.can_invite_users ?? botAdmin?.can_invite_users);
      const canManageChat = !!(member.can_manage_chat ?? botAdmin?.can_manage_chat);
      const canPostMessages = !!(member.can_post_messages ?? botAdmin?.can_post_messages);

      const diagnostics = {
        botStatus: member.status || (isAdmin ? 'administrator' : 'member'),
        botIsAdmin: isAdmin,
        botCanInviteUsers: canInviteUsers,
        botCanManageChat: canManageChat,
        botCanPostMessages: canPostMessages,
        botCheckedAt: new Date(),
        currentSubscribersCount: membersCount,
        photoSmallFileId,
        photoBigFileId,
        photoUrl,
      };

      await this.prisma.telegramChannel.update({ where: { id: channel.id }, data: diagnostics });

      if (!isAdmin) {
        return { ...diagnostics, message: 'Bot has access to channel but is not admin. Please promote the bot to admin.' };
      }
      return diagnostics;
    } catch (error) {
      const message = error instanceof TelegramApiError ? error.message : 'Bot cannot access this channel';
      const diagnostics = {
        botStatus: 'no_access',
        botIsAdmin: false,
        botCanInviteUsers: false,
        botCanManageChat: false,
        botCanPostMessages: false,
        botCheckedAt: new Date(),
      };
      await this.prisma.telegramChannel.update({ where: { id: channel.id }, data: diagnostics });
      return { ...diagnostics, message };
    }
  }

  async syncNow(userId: string, channelId: string) {
    return this.checkBotAccess(userId, channelId, {});
  }

  async events(userId: string, channelId: string, page = 1, limit = 50) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(userId);
    await this.findOne(userId, channelId);
    const safePage = Math.max(1, page);
    const safeLimit = Math.max(1, Math.min(200, limit));
    const skip = (safePage - 1) * safeLimit;
    const [items, total] = await Promise.all([
      this.prisma.subscriberEvent.findMany({
        where: { workspaceId, telegramChannelId: channelId },
        include: { inviteLink: true, adCampaign: true },
        orderBy: { eventDate: 'desc' },
        skip,
        take: safeLimit,
      }),
      this.prisma.subscriberEvent.count({ where: { workspaceId, telegramChannelId: channelId } }),
    ]);
    return { items, total, page: safePage, limit: safeLimit };
  }

  async inviteLinks(userId: string, channelId: string) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(userId);
    await this.findOne(userId, channelId);
    return this.prisma.telegramInviteLink.findMany({
      where: { workspaceId, telegramChannelId: channelId },
      include: { adCampaign: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async analytics(userId: string, channelId: string, from?: string, to?: string) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const channel = await this.findOne(userId, channelId);
    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const toDate = to ? new Date(to) : new Date();

    const [joinedTotal, leftTotal, inviteLinks, campaigns, dailyStats, recentEvents] = await Promise.all([
      this.prisma.subscriberEvent.count({ where: { workspaceId, telegramChannelId: channelId, eventType: 'joined', eventDate: { gte: fromDate, lte: toDate } } }),
      this.prisma.subscriberEvent.count({ where: { workspaceId, telegramChannelId: channelId, eventType: 'left', eventDate: { gte: fromDate, lte: toDate } } }),
      this.prisma.telegramInviteLink.findMany({ where: { workspaceId, telegramChannelId: channelId }, include: { adCampaign: true } }),
      this.prisma.adCampaign.findMany({ where: { workspaceId, telegramChannelId: channelId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.telegramChannelDailyStats.findMany({ where: { telegramChannelId: channelId, date: { gte: fromDate, lte: toDate } }, orderBy: { date: 'asc' } }),
      this.prisma.subscriberEvent.findMany({ where: { workspaceId, telegramChannelId: channelId }, include: { inviteLink: true, adCampaign: true }, orderBy: { eventDate: 'desc' }, take: 50 }),
    ]);

    return {
      channel: {
        id: channel.id,
        title: channel.title,
        username: channel.username,
        currentSubscribersCount: channel.currentSubscribersCount,
        botStatus: channel.botStatus,
        botIsAdmin: channel.botIsAdmin,
        botCanInviteUsers: channel.botCanInviteUsers,
        botCheckedAt: channel.botCheckedAt,
      },
      summary: {
        subscribersCurrent: channel.currentSubscribersCount ?? 0,
        joinedTotal,
        leftTotal,
        netGrowth: joinedTotal - leftTotal,
        inviteLinksCount: inviteLinks.length,
        campaignsCount: campaigns.length,
      },
      dailyStats,
      inviteLinks: inviteLinks.map((x) => ({ ...x, campaignTitle: x.adCampaign?.title || null })),
      campaigns,
      recentEvents: recentEvents.map((x) => ({
        id: x.id,
        eventType: x.eventType,
        eventDate: x.eventDate,
        telegramUserId: x.telegramUserId,
        inviteLinkName: x.inviteLink?.name || null,
        campaignTitle: x.adCampaign?.title || null,
      })),
    };
  }

  async createInviteLink(userId: string, channelId: string, dto: CreateInviteLinkDto) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const channel = await this.prisma.telegramChannel.findFirst({ where: { id: channelId, workspaceId } });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    if (!channel.telegramBotIntegrationId) throw new BadRequestException('Channel has no assigned bot');

    const bot = await this.prisma.telegramBotIntegration.findFirst({ where: { id: channel.telegramBotIntegrationId, workspaceId, isActive: true } });
    if (!bot) throw new NotFoundException('Telegram bot not found');
    const token = this.encryptionService.decrypt({ encrypted: bot.botTokenEncrypted, iv: bot.botTokenIv, authTag: bot.botTokenAuthTag });

    const target = channel.telegramChatId || channel.username;
    if (!target) throw new BadRequestException('Channel has no username or chatId');

    const result = await this.telegramApi.createChatInviteLink(token, target, {
      name: dto.name,
      expire_date: dto.expireDate ? Math.floor(new Date(dto.expireDate).getTime() / 1000) : undefined,
      member_limit: dto.memberLimit,
      creates_join_request: dto.createsJoinRequest,
    });

    return this.prisma.telegramInviteLink.create({
      data: {
        workspaceId,
        telegramChannelId: channel.id,
        adCampaignId: dto.adCampaignId || null,
        telegramBotIntegrationId: bot.id,
        name: dto.name,
        url: result.invite_link,
        telegramInviteLinkId: result.invite_link,
        createsJoinRequest: result.creates_join_request ?? dto.createsJoinRequest ?? false,
        expireDate: dto.expireDate ? new Date(dto.expireDate) : null,
        memberLimit: dto.memberLimit,
      },
    });
  }

  async updateInviteLink(userId: string, inviteLinkId: string, dto: UpdateInviteLinkDto) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const link = await this.prisma.telegramInviteLink.findFirst({ where: { id: inviteLinkId, workspaceId }, include: { telegramChannel: true, telegramBotIntegration: true } });
    if (!link) throw new NotFoundException('Invite link not found');
    if (!link.telegramBotIntegration) throw new BadRequestException('Invite link has no bot integration');

    const token = this.encryptionService.decrypt({
      encrypted: link.telegramBotIntegration.botTokenEncrypted,
      iv: link.telegramBotIntegration.botTokenIv,
      authTag: link.telegramBotIntegration.botTokenAuthTag,
    });
    const target = link.telegramChannel.telegramChatId || link.telegramChannel.username;
    if (!target) throw new BadRequestException('Channel has no username or chatId');

    const result = await this.telegramApi.editChatInviteLink(token, target, link.url, {
      name: dto.name ?? link.name,
      expire_date: dto.expireDate ? Math.floor(new Date(dto.expireDate).getTime() / 1000) : undefined,
      member_limit: dto.memberLimit,
      creates_join_request: dto.createsJoinRequest,
    });

    return this.prisma.telegramInviteLink.update({
      where: { id: link.id },
      data: {
        name: dto.name ?? link.name,
        url: result.invite_link || link.url,
        createsJoinRequest: dto.createsJoinRequest ?? link.createsJoinRequest,
        expireDate: dto.expireDate ? new Date(dto.expireDate) : link.expireDate,
        memberLimit: dto.memberLimit ?? link.memberLimit,
        lastSyncedAt: new Date(),
      },
    });
  }

  async revokeInviteLink(userId: string, inviteLinkId: string) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const link = await this.prisma.telegramInviteLink.findFirst({ where: { id: inviteLinkId, workspaceId }, include: { telegramChannel: true, telegramBotIntegration: true } });
    if (!link) throw new NotFoundException('Invite link not found');
    if (!link.telegramBotIntegration) throw new BadRequestException('Invite link has no bot integration');

    const token = this.encryptionService.decrypt({
      encrypted: link.telegramBotIntegration.botTokenEncrypted,
      iv: link.telegramBotIntegration.botTokenIv,
      authTag: link.telegramBotIntegration.botTokenAuthTag,
    });
    const target = link.telegramChannel.telegramChatId || link.telegramChannel.username;
    if (!target) throw new BadRequestException('Channel has no username or chatId');

    await this.telegramApi.revokeChatInviteLink(token, target, link.url);
    return this.prisma.telegramInviteLink.update({ where: { id: link.id }, data: { isRevoked: true, lastSyncedAt: new Date() } });
  }

  async recalculateCampaignMetricsById(campaignId: string) {
    const campaign = await this.prisma.adCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign) return null;
    const [joinedCount, leftCount] = await Promise.all([
      this.prisma.subscriberEvent.count({ where: { adCampaignId: campaignId, eventType: 'joined' } }),
      this.prisma.subscriberEvent.count({ where: { adCampaignId: campaignId, eventType: 'left' } }),
    ]);
    const cpa = joinedCount > 0 ? Number(campaign.priceInPrimaryCurrency) / joinedCount : null;
    return this.prisma.adCampaign.update({
      where: { id: campaignId },
      data: {
        joinedCount,
        leftCount,
        netGrowthCount: joinedCount - leftCount,
        cpa,
      },
    });
  }
}
