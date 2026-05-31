import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../common/workspace.service';
import { TokenEncryptionService } from '../common/security/token-encryption.service';
import { CheckBotAccessDto, CreateTelegramChannelDto, UpdateTelegramChannelDto } from './dto';
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
}
