import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../common/workspace.service';
import { TokenEncryptionService } from '../common/security/token-encryption.service';
import { TelegramBotApiClient } from '../telegram/shared/telegram-bot-api.client';
import { TelegramUpdatesProcessor } from './telegram-updates.processor';

const DEFAULT_ALLOWED_UPDATES = [
  'message',
  'chat_member',
  'my_chat_member',
  'chat_join_request',
  'channel_post',
  'edited_channel_post',
  'message_reaction',
  'message_reaction_count',
];

@Injectable()
export class TelegramSyncService {
  constructor(
    private prisma: PrismaService,
    private workspaceService: WorkspaceService,
    private encryption: TokenEncryptionService,
    private telegramApi: TelegramBotApiClient,
    private updatesProcessor: TelegramUpdatesProcessor,
  ) {}

  async handleWebhook(
    botIntegrationId: string,
    secretToken: string | undefined,
    update: Record<string, any>,
  ) {
    try {
      const bot = await this.prisma.telegramBotIntegration.findUnique({
        where: { id: botIntegrationId },
      });
      if (!bot || !bot.isActive)
        throw new NotFoundException('Bot integration not found');
      if (
        !bot.webhookSecret ||
        !secretToken ||
        bot.webhookSecret !== secretToken
      ) {
        throw new UnauthorizedException('Invalid webhook secret');
      }

      await this.updatesProcessor.processUpdate(
        { id: bot.id, workspaceId: bot.workspaceId },
        update,
      );
      return { ok: true };
    } catch (error: any) {
      return {
        ok: true,
        accepted: false,
        error: error?.message || 'Webhook processing failed',
      };
    }
  }

  async enableWebhook(userId: string, botId: string) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const bot = await this.prisma.telegramBotIntegration.findFirst({
      where: { id: botId, workspaceId, isActive: true },
    });
    if (!bot) throw new NotFoundException('Telegram bot not found');

    const explicitWebhookBase = process.env.TELEGRAM_WEBHOOK_BASE_URL?.trim();
    const publicApiUrl = process.env.PUBLIC_API_URL?.trim();
    const nextPublicApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
    const inferredBaseFromPublic = publicApiUrl
      ? `${publicApiUrl.replace(/\/+$/, '')}/api/telegram/webhook`
      : '';
    const inferredBaseFromNextPublic = nextPublicApiUrl
      ? `${nextPublicApiUrl.replace(/\/+$/, '').replace(/\/api$/, '')}/api/telegram/webhook`
      : '';
    const webhookBaseUrl =
      explicitWebhookBase ||
      inferredBaseFromPublic ||
      inferredBaseFromNextPublic;
    if (!webhookBaseUrl)
      throw new Error(
        'Webhook base URL is missing. Set TELEGRAM_WEBHOOK_BASE_URL or PUBLIC_API_URL.',
      );

    const webhookSecret = bot.webhookSecret || randomBytes(24).toString('hex');
    const webhookUrl = `${webhookBaseUrl.replace(/\/+$/, '')}/${bot.id}`;

    const token = this.encryption.decrypt({
      encrypted: bot.botTokenEncrypted,
      iv: bot.botTokenIv,
      authTag: bot.botTokenAuthTag,
    });
    await this.telegramApi.setWebhook(
      token,
      webhookUrl,
      webhookSecret,
      DEFAULT_ALLOWED_UPDATES,
    );

    return this.prisma.telegramBotIntegration.update({
      where: { id: bot.id },
      data: {
        webhookUrl,
        webhookSecret,
        webhookActive: true,
        hasExternalWebhook: false,
        updatesMode: 'webhook',
        lastErrorMessage: null,
        lastCheckedAt: new Date(),
      },
    });
  }

  async disableWebhook(userId: string, botId: string) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const bot = await this.prisma.telegramBotIntegration.findFirst({
      where: { id: botId, workspaceId },
    });
    if (!bot) throw new NotFoundException('Telegram bot not found');

    const token = this.encryption.decrypt({
      encrypted: bot.botTokenEncrypted,
      iv: bot.botTokenIv,
      authTag: bot.botTokenAuthTag,
    });
    await this.telegramApi.deleteWebhook(token, false);

    return this.prisma.telegramBotIntegration.update({
      where: { id: bot.id },
      data: {
        webhookActive: false,
        updatesMode: 'off',
        lastCheckedAt: new Date(),
      },
    });
  }

  async getWebhookStatus(userId: string, botId: string) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const bot = await this.prisma.telegramBotIntegration.findFirst({
      where: { id: botId, workspaceId },
    });
    if (!bot) throw new NotFoundException('Telegram bot not found');

    const token = this.encryption.decrypt({
      encrypted: bot.botTokenEncrypted,
      iv: bot.botTokenIv,
      authTag: bot.botTokenAuthTag,
    });
    const info = await this.telegramApi.getWebhookInfo(token);

    return {
      botId: bot.id,
      webhookActive: !!info.url,
      webhookUrl: info.url || null,
      pendingUpdateCount: info.pending_update_count || 0,
      lastErrorMessage: info.last_error_message || null,
      updatesMode: bot.updatesMode || 'off',
    };
  }

  async pollBotUpdates(botId: string) {
    const bot = await this.prisma.telegramBotIntegration.findUnique({
      where: { id: botId },
    });
    if (!bot || !bot.isActive) return;

    const token = this.encryption.decrypt({
      encrypted: bot.botTokenEncrypted,
      iv: bot.botTokenIv,
      authTag: bot.botTokenAuthTag,
    });
    const updates = await this.telegramApi.getUpdates(
      token,
      bot.lastUpdateId != null ? bot.lastUpdateId + 1 : undefined,
      0,
      [
        'message',
        'chat_member',
        'my_chat_member',
        'chat_join_request',
        'channel_post',
        'edited_channel_post',
        'message_reaction',
        'message_reaction_count',
      ],
    );

    let lastUpdateId = bot.lastUpdateId ?? null;
    for (const update of updates) {
      await this.updatesProcessor.processUpdate(
        { id: bot.id, workspaceId: bot.workspaceId },
        update,
      );
      if (typeof update.update_id === 'number') {
        lastUpdateId = Math.max(
          lastUpdateId ?? update.update_id,
          update.update_id,
        );
      }
    }

    if (lastUpdateId != null) {
      await this.prisma.telegramBotIntegration.update({
        where: { id: bot.id },
        data: {
          lastUpdateId,
          updatesMode: 'polling',
          lastCheckedAt: new Date(),
        },
      });
    }
  }
}
