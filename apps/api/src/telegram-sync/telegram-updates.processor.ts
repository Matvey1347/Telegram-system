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

  async processUpdate(
    bot: { id: string; workspaceId: string },
    update: Record<string, any>,
  ) {
    const updateId =
      update?.update_id != null ? String(update.update_id) : null;
    this.logger.log(
      `Processing update started botId=${bot.id} workspaceId=${bot.workspaceId} updateId=${updateId ?? 'n/a'}`,
    );
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

    if (existing) {
      this.logger.debug(
        `Update ignored as duplicate botId=${bot.id} updateId=${updateId}`,
      );
      return { ignored: true, reason: 'duplicate' };
    }

    const updateType = this.resolveUpdateType(update);
    const chatId = this.resolveChatId(update);
    this.logger.log(
      `Update resolved botId=${bot.id} updateId=${updateId ?? 'n/a'} type=${updateType} chatId=${chatId ?? 'n/a'}`,
    );

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
        this.logger.debug(
          `Dispatching chat_member handler workspaceId=${bot.workspaceId} updateId=${updateId ?? 'n/a'}`,
        );
        await this.processChatMember(
          bot.workspaceId,
          updateId,
          update.chat_member,
        );
      } else if (update.my_chat_member) {
        this.logger.debug(
          `Dispatching my_chat_member handler workspaceId=${bot.workspaceId} updateId=${updateId ?? 'n/a'}`,
        );
        await this.processMyChatMember(bot.workspaceId, update.my_chat_member);
      } else if (update.chat_join_request) {
        this.logger.debug(
          `Dispatching chat_join_request handler workspaceId=${bot.workspaceId} updateId=${updateId ?? 'n/a'}`,
        );
        await this.processJoinRequest(
          bot.workspaceId,
          updateId,
          update.chat_join_request,
        );
      } else if (update.channel_post || update.edited_channel_post) {
        this.logger.debug(
          `Dispatching channel_post handler workspaceId=${bot.workspaceId} updateId=${updateId ?? 'n/a'}`,
        );
        await this.processChannelPost(
          bot.workspaceId,
          bot.id,
          update.channel_post || update.edited_channel_post,
        );
      } else if (update.message_reaction_count) {
        this.logger.debug(
          `Dispatching message_reaction_count handler workspaceId=${bot.workspaceId} updateId=${updateId ?? 'n/a'}`,
        );
        await this.processReactionCount(
          bot.workspaceId,
          update.message_reaction_count,
        );
      } else {
        this.logger.debug(
          `Unhandled update type for workspace=${bot.workspaceId} updateId=${updateId ?? 'n/a'} type=${updateType}`,
        );
      }

      await this.prisma.telegramBotUpdateLog.update({
        where: { id: log.id },
        data: { processed: true, errorMessage: null },
      });
      this.logger.log(
        `Processing update completed botId=${bot.id} updateId=${updateId ?? 'n/a'} type=${updateType}`,
      );
      return { ok: true };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to process update';
      await this.prisma.telegramBotUpdateLog.update({
        where: { id: log.id },
        data: { processed: false, errorMessage: message },
      });
      this.logger.error(
        `Processing update failed botId=${bot.id} updateId=${updateId ?? 'n/a'} type=${updateType} error=${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  private async processChatMember(
    workspaceId: string,
    updateId: string | null,
    payload: Record<string, any>,
  ) {
    const chatId = String(payload?.chat?.id ?? '');
    if (!chatId) {
      this.logger.debug('chat_member ignored: missing chatId');
      return;
    }

    const channel = await this.prisma.telegramChannel.findFirst({
      where: { workspaceId, telegramChatId: chatId },
    });
    if (!channel) {
      this.logger.debug(
        `chat_member ignored; channel not found for chatId=${chatId}`,
      );
      return;
    }

    const oldStatus = String(payload?.old_chat_member?.status || '');
    const newStatus = String(payload?.new_chat_member?.status || '');
    const userId = payload?.new_chat_member?.user?.id
      ? String(payload.new_chat_member.user.id)
      : null;

    const joined =
      ['left', 'kicked'].includes(oldStatus) &&
      ['member', 'administrator', 'creator'].includes(newStatus);
    const left =
      ['member', 'administrator', 'creator'].includes(oldStatus) &&
      ['left', 'kicked'].includes(newStatus);

    if (!joined && !left) return;
    if (!joined && !left) {
      this.logger.debug(
        `chat_member ignored: transition not tracked chatId=${chatId} old=${oldStatus} new=${newStatus}`,
      );
      return;
    }

    const inviteUrl = payload?.invite_link?.invite_link
      ? String(payload.invite_link.invite_link)
      : null;
    const invite = inviteUrl
      ? await this.prisma.telegramInviteLink.findFirst({
          where: { workspaceId, telegramChannelId: channel.id, url: inviteUrl },
        })
      : null;

    const eventDate = payload?.date
      ? new Date(Number(payload.date) * 1000)
      : new Date();
    const eventType = joined ? 'joined' : 'left';

    await this.prisma.subscriberEvent.upsert({
      where: {
        workspaceId_updateId: {
          workspaceId,
          updateId:
            updateId ||
            `synthetic-${channel.id}-${eventType}-${eventDate.toISOString()}`,
        },
      },
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
    this.logger.log(
      `subscriberEvent upserted type=${eventType} workspaceId=${workspaceId} chatId=${chatId} updateId=${updateId ?? 'n/a'} inviteMatched=${invite ? 'yes' : 'no'}`,
    );

    if (eventType === 'joined' && invite) {
      await this.prisma.telegramInviteLink.update({
        where: { id: invite.id },
        data: { joinedCount: { increment: 1 }, lastSyncedAt: new Date() },
      });
      this.logger.log(
        `invite joinedCount incremented inviteId=${invite.id} workspaceId=${workspaceId}`,
      );
    }

    if (invite?.adCampaignId) {
      await this.channelsService.recalculateCampaignMetricsById(
        invite.adCampaignId,
      );
    }
  }

  private async processMyChatMember(
    workspaceId: string,
    payload: Record<string, any>,
  ) {
    const chatId = String(payload?.chat?.id ?? '');
    if (!chatId) {
      this.logger.debug('my_chat_member ignored: missing chatId');
      return;
    }
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { workspaceId, telegramChatId: chatId },
    });
    if (!channel) {
      this.logger.debug(
        `my_chat_member ignored: channel not found for chatId=${chatId}`,
      );
      return;
    }

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
    this.logger.log(
      `my_chat_member applied workspaceId=${workspaceId} chatId=${chatId} status=${status} isAdmin=${isAdmin ? 'yes' : 'no'}`,
    );
  }

  private async processJoinRequest(
    workspaceId: string,
    updateId: string | null,
    payload: Record<string, any>,
  ) {
    const chatId = String(payload?.chat?.id ?? '');
    if (!chatId) {
      this.logger.debug('chat_join_request ignored: missing chatId');
      return;
    }
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { workspaceId, telegramChatId: chatId },
    });
    if (!channel) {
      this.logger.debug(
        `chat_join_request ignored: channel not found for chatId=${chatId}`,
      );
      return;
    }

    const inviteUrl = payload?.invite_link?.invite_link
      ? String(payload.invite_link.invite_link)
      : null;
    const invite = inviteUrl
      ? await this.prisma.telegramInviteLink.findFirst({
          where: { workspaceId, telegramChannelId: channel.id, url: inviteUrl },
        })
      : null;
    const eventDate = payload?.date
      ? new Date(Number(payload.date) * 1000)
      : new Date();

    await this.prisma.subscriberEvent.upsert({
      where: {
        workspaceId_updateId: {
          workspaceId,
          updateId:
            updateId ||
            `synthetic-${channel.id}-join_request-${eventDate.toISOString()}`,
        },
      },
      update: {},
      create: {
        workspaceId,
        telegramChannelId: channel.id,
        adCampaignId: invite?.adCampaignId || null,
        inviteLinkId: invite?.id || null,
        telegramUserId: payload?.from?.id ? String(payload.from.id) : null,
        eventType: 'join_request',
        eventDate,
        source: 'telegram_update',
        updateId,
        rawEvent: payload as Prisma.InputJsonValue,
      },
    });
    this.logger.log(
      `join_request event upserted workspaceId=${workspaceId} chatId=${chatId} updateId=${updateId ?? 'n/a'} inviteMatched=${invite ? 'yes' : 'no'}`,
    );
  }

  private async processChannelPost(
    workspaceId: string,
    botIntegrationId: string,
    payload: Record<string, any>,
  ) {
    const chatId = payload?.chat?.id != null ? String(payload.chat.id) : '';
    const messageId =
      payload?.message_id != null ? String(payload.message_id) : '';
    if (!chatId || !messageId) return;

    const channel = await this.prisma.telegramChannel.findFirst({
      where: { workspaceId, telegramChatId: chatId },
    });
    if (!channel) return;

    const day = payload?.date
      ? new Date(Number(payload.date) * 1000)
      : new Date();
    const date = new Date(
      Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()),
    );
    await this.prisma.telegramChannelDailyStats.upsert({
      where: {
        telegramChannelId_date: { telegramChannelId: channel.id, date },
      },
      create: {
        telegramChannelId: channel.id,
        date,
        viewsCount: payload?.views != null ? Number(payload.views) : 0,
        forwardsCount: payload?.forwards != null ? Number(payload.forwards) : 0,
      },
      update: {},
    });
  }

  private async processReactionCount(
    workspaceId: string,
    payload: Record<string, any>,
  ) {
    const chatId = payload?.chat?.id != null ? String(payload.chat.id) : '';
    const messageId =
      payload?.message_id != null ? String(payload.message_id) : '';
    if (!chatId || !messageId) return;

    const channel = await this.prisma.telegramChannel.findFirst({
      where: { workspaceId, telegramChatId: chatId },
    });
    if (!channel) return;

    const reactionsList = Array.isArray(payload?.reactions) ? payload.reactions : [];
    const reactionsCount = reactionsList.reduce(
      (sum: number, row: any) => sum + Number(row?.total_count || 0),
      0,
    );
    const day = payload?.date
      ? new Date(Number(payload.date) * 1000)
      : new Date();
    const date = new Date(
      Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()),
    );
    await this.prisma.telegramChannelDailyStats.upsert({
      where: {
        telegramChannelId_date: { telegramChannelId: channel.id, date },
      },
      create: {
        telegramChannelId: channel.id,
        date,
        reactionsCount,
      },
      update: {
        reactionsCount,
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
    const chat =
      update?.chat_member?.chat ||
      update?.my_chat_member?.chat ||
      update?.chat_join_request?.chat ||
      update?.channel_post?.chat ||
      update?.edited_channel_post?.chat ||
      update?.message_reaction_count?.chat ||
      update?.message?.chat;
    return chat?.id != null ? String(chat.id) : null;
  }
}
