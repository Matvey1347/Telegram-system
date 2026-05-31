import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramChannelsService } from '../telegram-channels/telegram-channels.service';

@Injectable()
export class TelegramUpdatesProcessor {
  private readonly logger = new Logger(TelegramUpdatesProcessor.name);

  constructor(
    private prisma: PrismaService,
    private channelsService: TelegramChannelsService,
  ) {}

  async processUpdate(bot: { id: string; workspaceId: string }, update: Record<string, any>) {
    const updateId = update?.update_id != null ? String(update.update_id) : null;
    const existing = updateId
      ? await this.prisma.telegramBotUpdateLog.findUnique({
          where: {
            telegramBotIntegrationId_updateId: {
              telegramBotIntegrationId: bot.id,
              updateId,
            },
          },
        })
      : null;

    if (existing) return { ignored: true, reason: 'duplicate' };

    const updateType = this.resolveUpdateType(update);
    const chatId = this.resolveChatId(update);

    const log = await this.prisma.telegramBotUpdateLog.create({
      data: {
        workspaceId: bot.workspaceId,
        telegramBotIntegrationId: bot.id,
        updateId,
        updateType,
        chatId,
        rawUpdate: update as Prisma.InputJsonValue,
        processed: false,
      },
    });

    try {
      if (update.chat_member) {
        await this.processChatMember(bot.workspaceId, updateId, update.chat_member);
      } else if (update.my_chat_member) {
        await this.processMyChatMember(bot.workspaceId, update.my_chat_member);
      } else if (update.chat_join_request) {
        this.logger.debug(`chat_join_request received for workspace=${bot.workspaceId}`);
      }

      await this.prisma.telegramBotUpdateLog.update({ where: { id: log.id }, data: { processed: true, errorMessage: null } });
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to process update';
      await this.prisma.telegramBotUpdateLog.update({ where: { id: log.id }, data: { processed: false, errorMessage: message } });
      throw error;
    }
  }

  private async processChatMember(workspaceId: string, updateId: string | null, payload: Record<string, any>) {
    const chatId = String(payload?.chat?.id ?? '');
    if (!chatId) return;

    const channel = await this.prisma.telegramChannel.findFirst({ where: { workspaceId, telegramChatId: chatId } });
    if (!channel) {
      this.logger.debug(`chat_member ignored; channel not found for chatId=${chatId}`);
      return;
    }

    const oldStatus = String(payload?.old_chat_member?.status || '');
    const newStatus = String(payload?.new_chat_member?.status || '');
    const userId = payload?.new_chat_member?.user?.id ? String(payload.new_chat_member.user.id) : null;

    const joined = ['left', 'kicked'].includes(oldStatus) && ['member', 'administrator', 'creator'].includes(newStatus);
    const left = ['member', 'administrator', 'creator'].includes(oldStatus) && ['left', 'kicked'].includes(newStatus);

    if (!joined && !left) return;

    const inviteUrl = payload?.invite_link?.invite_link ? String(payload.invite_link.invite_link) : null;
    const invite = inviteUrl
      ? await this.prisma.telegramInviteLink.findFirst({ where: { workspaceId, telegramChannelId: channel.id, url: inviteUrl } })
      : null;

    const eventDate = payload?.date ? new Date(Number(payload.date) * 1000) : new Date();
    const eventType = joined ? 'joined' : 'left';

    await this.prisma.subscriberEvent.upsert({
      where: { workspaceId_updateId: { workspaceId, updateId: updateId || `synthetic-${channel.id}-${eventType}-${eventDate.toISOString()}` } },
      update: {},
      create: {
        workspaceId,
        telegramChannelId: channel.id,
        adCampaignId: invite?.adCampaignId || null,
        inviteLinkId: invite?.id || null,
        telegramUserId: userId,
        eventType,
        eventDate,
        source: 'telegram_update',
        updateId,
        rawEvent: payload as Prisma.InputJsonValue,
      },
    });

    if (eventType === 'joined' && invite) {
      await this.prisma.telegramInviteLink.update({ where: { id: invite.id }, data: { joinedCount: { increment: 1 }, lastSyncedAt: new Date() } });
    }

    if (invite?.adCampaignId) {
      await this.channelsService.recalculateCampaignMetricsById(invite.adCampaignId);
    }
  }

  private async processMyChatMember(workspaceId: string, payload: Record<string, any>) {
    const chatId = String(payload?.chat?.id ?? '');
    if (!chatId) return;
    const channel = await this.prisma.telegramChannel.findFirst({ where: { workspaceId, telegramChatId: chatId } });
    if (!channel) return;

    const status = String(payload?.new_chat_member?.status || '');
    const isAdmin = status === 'administrator' || status === 'creator';

    await this.prisma.telegramChannel.update({
      where: { id: channel.id },
      data: {
        botStatus: status,
        botIsAdmin: isAdmin,
        botCanInviteUsers: !!payload?.new_chat_member?.can_invite_users,
        botCanManageChat: !!payload?.new_chat_member?.can_manage_chat,
        botCanPostMessages: !!payload?.new_chat_member?.can_post_messages,
        botCheckedAt: new Date(),
      },
    });
  }

  private resolveUpdateType(update: Record<string, any>) {
    if (update.chat_member) return 'chat_member';
    if (update.my_chat_member) return 'my_chat_member';
    if (update.chat_join_request) return 'chat_join_request';
    if (update.channel_post) return 'channel_post';
    if (update.edited_channel_post) return 'edited_channel_post';
    if (update.message_reaction) return 'message_reaction';
    if (update.message_reaction_count) return 'message_reaction_count';
    return 'unknown';
  }

  private resolveChatId(update: Record<string, any>) {
    const chat = update?.chat_member?.chat || update?.my_chat_member?.chat || update?.chat_join_request?.chat || update?.channel_post?.chat;
    return chat?.id != null ? String(chat.id) : null;
  }
}
