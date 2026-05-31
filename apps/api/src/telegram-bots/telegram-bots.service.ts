import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../common/workspace.service';
import { TokenEncryptionService } from '../common/security/token-encryption.service';
import { CreateTelegramBotDto, ImportTelegramChannelsDto, UpdateTelegramBotDto } from './dto';
import { TelegramApiError, TelegramBotApiClient } from '../telegram/shared/telegram-bot-api.client';

@Injectable()
export class TelegramBotsService {
  constructor(
    private prisma: PrismaService,
    private workspaceService: WorkspaceService,
    private encryptionService: TokenEncryptionService,
    private telegramApi: TelegramBotApiClient,
  ) {}

  private maskToken(token: string) {
    if (token.length <= 10) return '***';
    return `${token.slice(0, 6)}...${token.slice(-4)}`;
  }

  private decryptBotToken(bot: { botTokenEncrypted: string; botTokenIv: string; botTokenAuthTag: string }) {
    return this.encryptionService.decrypt({
      encrypted: bot.botTokenEncrypted,
      iv: bot.botTokenIv,
      authTag: bot.botTokenAuthTag,
    });
  }

  private safe<T extends { botTokenMasked: string; botTokenEncrypted?: string; botTokenIv?: string; botTokenAuthTag?: string }>(bot: T) {
    return {
      ...bot,
      maskedToken: bot.botTokenMasked || '******',
      botTokenMasked: undefined,
      botTokenEncrypted: undefined,
      botTokenIv: undefined,
      botTokenAuthTag: undefined,
    };
  }

  private async diagnostics(token: string) {
    const me = await this.telegramApi.getMe(token);
    const webhook = await this.telegramApi.getWebhookInfo(token);
    return {
      botId: String(me.id),
      username: me.username || null,
      firstName: me.first_name || null,
      webhookUrl: webhook.url || null,
      webhookActive: !!webhook.url,
      hasExternalWebhook: !!webhook.url,
      lastErrorMessage: webhook.last_error_message || null,
      lastCheckedAt: new Date(),
    };
  }

  private normalizeChatRef(input: string) {
    const trimmed = input.trim();
    if (!trimmed) return null;
    const tmeMatch = trimmed.match(/(?:https?:\/\/)?t\.me\/([A-Za-z0-9_]{5,})/i);
    if (tmeMatch?.[1]) return `@${tmeMatch[1]}`;
    if (trimmed.startsWith('@') || trimmed.startsWith('-')) return trimmed;
    if (/^\d+$/.test(trimmed)) return trimmed;
    return `@${trimmed}`;
  }

  async findAll(userId: string) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const rows = await this.prisma.telegramBotIntegration.findMany({ where: { workspaceId, isActive: true }, orderBy: { createdAt: 'desc' } });
    return rows.map((row) => this.safe(row));
  }

  async findOne(userId: string, id: string) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const row = await this.prisma.telegramBotIntegration.findFirst({ where: { id, workspaceId } });
    if (!row) throw new NotFoundException('Telegram bot not found');
    return this.safe(row);
  }

  async create(userId: string, dto: CreateTelegramBotDto) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const diagnostics = await this.diagnostics(dto.botToken);
    const autoLabel = diagnostics.username ? `@${diagnostics.username.replace('@', '')}` : (diagnostics.firstName || `Bot ${diagnostics.botId}`);
    const encrypted = this.encryptionService.encrypt(dto.botToken);
    const row = await this.prisma.telegramBotIntegration.create({
      data: {
        workspaceId,
        label: autoLabel,
        botTokenEncrypted: encrypted.encrypted,
        botTokenIv: encrypted.iv,
        botTokenAuthTag: encrypted.authTag,
        botTokenMasked: this.maskToken(dto.botToken),
        ...diagnostics,
      },
    });
    return this.safe(row);
  }

  async update(userId: string, id: string, dto: UpdateTelegramBotDto) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const existing = await this.prisma.telegramBotIntegration.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException('Telegram bot not found');

    const token = dto.botToken || this.decryptBotToken(existing);
    const data: Record<string, unknown> = {};
    if (dto.label) data.label = dto.label;

    if (dto.botToken) {
      const encrypted = this.encryptionService.encrypt(dto.botToken);
      data.botTokenEncrypted = encrypted.encrypted;
      data.botTokenIv = encrypted.iv;
      data.botTokenAuthTag = encrypted.authTag;
      data.botTokenMasked = this.maskToken(dto.botToken);
      Object.assign(data, await this.diagnostics(token));
    }

    const row = await this.prisma.telegramBotIntegration.update({ where: { id }, data });
    return this.safe(row);
  }

  async remove(userId: string, id: string) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const existing = await this.prisma.telegramBotIntegration.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException('Telegram bot not found');
    const row = await this.prisma.$transaction(async (tx) => {
      const channels = await tx.telegramChannel.findMany({ where: { workspaceId, telegramBotIntegrationId: id }, select: { id: true } });

      for (const channel of channels) {
        const campaigns = await tx.adCampaign.findMany({ where: { workspaceId, telegramChannelId: channel.id }, select: { id: true } });
        const campaignIds = campaigns.map((c) => c.id);
        const inviteLinks = await tx.telegramInviteLink.findMany({ where: { workspaceId, telegramChannelId: channel.id }, select: { id: true } });
        const inviteIds = inviteLinks.map((x) => x.id);

        if (campaignIds.length) {
          await tx.transaction.deleteMany({ where: { workspaceId, adCampaignId: { in: campaignIds } } });
        }

        await tx.subscriberEvent.deleteMany({
          where: {
            workspaceId,
            OR: [
              { telegramChannelId: channel.id },
              campaignIds.length ? { adCampaignId: { in: campaignIds } } : undefined,
              inviteIds.length ? { inviteLinkId: { in: inviteIds } } : undefined,
            ].filter(Boolean) as any,
          },
        });

        await tx.promo.deleteMany({ where: { workspaceId, telegramChannelId: channel.id } });
        await tx.telegramInviteLink.deleteMany({ where: { workspaceId, telegramChannelId: channel.id } });
        await tx.adCampaign.deleteMany({ where: { workspaceId, telegramChannelId: channel.id } });
        await tx.telegramChannelDailyStats.deleteMany({ where: { telegramChannelId: channel.id } });
        await tx.telegramChannel.delete({ where: { id: channel.id } });
      }

      return tx.telegramBotIntegration.delete({ where: { id } });
    });
    return this.safe(row);
  }

  async check(userId: string, id: string) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const existing = await this.prisma.telegramBotIntegration.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException('Telegram bot not found');

    try {
      const token = this.decryptBotToken(existing);
      const row = await this.prisma.telegramBotIntegration.update({
        where: { id },
        data: { ...await this.diagnostics(token), isActive: true },
      });
      return this.safe(row);
    } catch (error) {
      const message = error instanceof TelegramApiError ? error.message : 'Failed to check bot';
      const row = await this.prisma.telegramBotIntegration.update({ where: { id }, data: { lastErrorMessage: message, lastCheckedAt: new Date() } });
      return this.safe(row);
    }
  }

  async importChannels(userId: string, id: string, dto: ImportTelegramChannelsDto) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const bot = await this.prisma.telegramBotIntegration.findFirst({ where: { id, workspaceId, isActive: true } });
    if (!bot) throw new NotFoundException('Telegram bot not found');
    const token = this.decryptBotToken(bot);

    const existing = await this.prisma.telegramChannel.findMany({ where: { workspaceId }, select: { username: true, telegramChatId: true } });
    const existingKeys = new Set<string>();
    for (const row of existing) {
      if (row.username) existingKeys.add(row.username.replace('@', '').toLowerCase());
      if (row.telegramChatId) existingKeys.add(row.telegramChatId);
    }

    const added: Array<{ id: string; title: string; username?: string | null; telegramChatId: string }> = [];
    const skipped: string[] = [];
    const errors: Array<{ input: string; error: string }> = [];

    for (const raw of dto.channels) {
      const chatRef = this.normalizeChatRef(raw);
      if (!chatRef) continue;

      try {
        const chat = await this.telegramApi.getChat(token, chatRef);
        const chatId = String(chat.id);
        const uname = chat.username ? chat.username.replace('@', '').toLowerCase() : null;

        if (existingKeys.has(chatId) || (uname && existingKeys.has(uname))) {
          skipped.push(raw);
          continue;
        }

        const member = await this.telegramApi.getChatMember(token, chatRef, bot.botId || '');
        const membersCount = await this.telegramApi.getChatMemberCount(token, chatRef);
        let photoUrl: string | null = null;
        const photoBigFileId = chat.photo?.big_file_id || null;
        const photoSmallFileId = chat.photo?.small_file_id || null;
        if (photoBigFileId) {
          const file = await this.telegramApi.getFile(token, photoBigFileId);
          if (file.file_path) photoUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
        }
        const created = await this.prisma.telegramChannel.create({
          data: {
            workspaceId,
            title: chat.title || chat.username || `Channel ${chat.id}`,
            username: chat.username ? `@${chat.username.replace('@', '')}` : null,
            telegramChatId: chatId,
            telegramBotIntegrationId: bot.id,
            currentSubscribersCount: membersCount,
            botStatus: member.status,
            botIsAdmin: member.status === 'administrator' || member.status === 'creator',
            botCanInviteUsers: !!member.can_invite_users,
            botCanManageChat: !!member.can_manage_chat,
            botCanPostMessages: !!member.can_post_messages,
            botCheckedAt: new Date(),
            photoSmallFileId,
            photoBigFileId,
            photoUrl,
          },
        });

        added.push({ id: created.id, title: created.title, username: created.username, telegramChatId: created.telegramChatId || chatId });
        existingKeys.add(chatId);
        if (uname) existingKeys.add(uname);
      } catch (error) {
        const message = error instanceof TelegramApiError ? error.message : 'Unable to import channel';
        errors.push({ input: raw, error: message });
      }
    }

    return {
      added,
      skipped,
      errors,
      note: 'Telegram Bot API cannot list all admin channels automatically. Imported only provided channels.',
    };
  }
}
