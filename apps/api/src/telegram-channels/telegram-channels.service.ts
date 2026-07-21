import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  Prisma,
  TelegramChannelDataType,
  TelegramDataSourceStatus,
  TelegramInviteLinkCreatorMatchSource,
  TelegramManagedPostStatus,
  TelegramManagedPostRemoteStatus,
  TelegramSourceType,
  TelegramUserAccountStatus,
} from '@prisma/client';
import ExcelJS from 'exceljs';
import type {
  BulkActionResult,
  BulkActionResultItem,
  SyncOperationResult,
  SyncStepResult,
  TelegramChannelSyncProgressItem,
} from '@telegram-system/shared';
import { HTMLParser } from 'telegram/extensions/html';
import {
  inviteLinkAttributedSubscribers,
  sumInviteLinkAttributedSubscribers,
} from '../common/analytics/invite-link-metrics';
import { ApplicationLoggerService } from '../application-logs/application-logger.service';
import { ResponseCacheService } from '../common/response-cache.service';
import { WorkspaceService } from '../common/workspace.service';
import { TokenEncryptionService } from '../common/security/token-encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  TelegramMtprotoClient,
  type TelegramInviteLinksResult,
} from '../telegram/shared/telegram-mtproto.client';
import { TelegramSourceAccessService } from '../telegram/shared/telegram-source-access.service';
import {
  AttachCampaignDto,
  CreatePostGroupDto,
  CreateTelegramChannelAdAnalysisDto,
  CreateTelegramChannelDto,
  CreateTelegramManagedPostDto,
  DeepSyncDto,
  HistoricalSyncDto,
  ImportTelegramChannelDto,
  ManagedPostLinkTargetsQueryDto,
  MovePostChannelDto,
  PostGroupsQueryDto,
  PostIdsDto,
  PublishPostGroupDto,
  ReorderManagedPostSidebarDto,
  ReorderPostGroupDto,
  SchedulePostGroupSequenceDto,
  ScheduleTelegramManagedPostDto,
  PublishTelegramManagedPostDto,
  SyncNowDto,
  UpdateTelegramChannelDto,
  UpdateTelegramChannelAdAnalysisDto,
  UpdateTelegramPostManualMetricsDto,
  UpdateTelegramManagedPostDto,
  UpdatePostGroupDto,
} from './dto';
import { TelegramChannelAnalyticsService } from './telegram-channel-analytics.service';
import {
  telegramHtmlToManagedMarkup,
  telegramHtmlToMtprotoHtml,
  telegramMarkupToHtml,
} from '../telegram/shared/telegram-markup';
import {
  extractInternalPostLinkIds,
  replaceInternalPostLinks,
} from '../telegram/shared/internal-post-links';
import {
  buildStableTelegramPostUrl,
  normalizeTelegramChannelId,
  parseTelegramPostUrl,
} from '../telegram/shared/telegram-post-url';
import {
  parseTelegramImportInput,
  canonicalTelegramInviteLink,
  normalizeTelegramUsername,
  type TelegramImportInput,
  type ResolvedTelegramEntity,
} from '../telegram/shared/telegram-import.helpers';
import {
  attributeInviteLinkCreator,
  buildInviteLinkAttributionMaps,
} from '../telegram/shared/telegram-invite-link-attribution';
import {
  bulkActionCounts,
  movedPostDatabaseState,
  movedPostState,
  postGroupStatusSummary,
  publishGroupPostSkipReason,
  scheduleGroupPostSkipReason,
  scheduleSequenceDates,
  validateCompletePostOrder,
} from './post-groups.helpers';

type BulkProgressCallback = (
  item: BulkActionResultItem | TelegramChannelSyncProgressItem,
  current: number,
  total: number,
) => void | Promise<void>;

type TelegramChannelSyncSelection = {
  syncIncludePublicInfo: boolean;
  syncIncludeInviteLinks: boolean;
  syncIncludeHistoricalPosts: boolean;
  syncIncludePostMetrics: boolean;
  syncIncludeOlderPosts: boolean;
  syncIncludeChannelStats: boolean;
  syncIncludeManagedPosts: boolean;
  syncIncludeAudienceSnapshot: boolean;
};

const TELEGRAM_BROADCAST_STATS_MIN_SUBSCRIBERS = 50;

const TELEGRAM_CAPTION_LIMIT = 1024;
const TELEGRAM_TEXT_MESSAGE_LIMIT = 4096;

type BotMessageEntity = {
  type: string;
  offset: number;
  length: number;
  url?: string;
  language?: string;
  custom_emoji_id?: string;
};

type ManagedPostPublishRender = {
  html: string;
  captionHtml: string;
  followupHtmlParts: string[];
  textHtmlParts: string[];
  publishMode: string;
};

type ManagedPostSyncMessage = {
  id: string;
  text: string;
  html: string;
  date: string | null;
  isScheduled: boolean;
  hasMedia: boolean;
  mediaKind: string | null;
  groupedId: string | null;
};

type TelegramTextEditOutcome = {
  updatedCount: number;
  unchangedCount: number;
};

type ManagedPostRevisionSource = {
  id: string;
  workspaceId: string;
  telegramChannelId: string;
  title: string;
  text: string | null;
  imageUrls: string[];
  status: TelegramManagedPostStatus;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  telegramMessageIds: string[];
  telegramMessageUrls: string[];
  telegramRemoteStatus: TelegramManagedPostRemoteStatus;
  lastTelegramSyncedAt: Date | null;
  lastTelegramSyncNote: string | null;
  sourceType: TelegramSourceType | null;
  sourceId: string | null;
  publishMode: string | null;
  lastError: string | null;
  assignedMemberId: string;
  icon: string | null;
  groupId: string | null;
  groupPosition: number | null;
  sidebarPosition: number | null;
};

type ManagedPostRevisionRecord = ManagedPostRevisionSource & {
  id: string;
  reason: string;
  createdAt: Date;
};

@Injectable()
export class TelegramChannelsService {
  private readonly logger = new Logger(TelegramChannelsService.name);
  private readonly defaultPostSyncLimit = 100;
  private readonly initialPostBackfillLimit = 10_000;
  private readonly olderPostBackfillMaxPages = 5;
  private readonly managedPostRevisionRetentionMs =
    7 * 24 * 60 * 60 * 1000;
  private managedPostRevisionStorageState:
    | 'unknown'
    | 'available'
    | 'missing' = 'unknown';
  private readonly managedPostInclude = {
    assignedMember: WorkspaceService.assignedMemberInclude,
    group: {
      include: {
        createdByMember: WorkspaceService.assignedMemberInclude,
      },
    },
  } as const;
  private readonly inviteLinkReadSelectWithoutRequestedCount = {
    id: true,
    workspaceId: true,
    telegramChannelId: true,
    adCampaignId: true,
    name: true,
    url: true,
    telegramInviteLinkId: true,
    createdBy: true,
    createsJoinRequest: true,
    expireDate: true,
    memberLimit: true,
    joinedCount: true,
    isRevoked: true,
    lastSyncedAt: true,
    creatorTelegramUserId: true,
    creatorUsername: true,
    creatorFirstName: true,
    creatorLastName: true,
    creatorPhotoUrl: true,
    creatorMemberId: true,
    creatorMatchSource: true,
    createdAt: true,
    updatedAt: true,
    adCampaign: true,
    creatorMember: WorkspaceService.assignedMemberInclude,
  } as const;
  private readonly inviteLinkSyncExistingSelect = {
    id: true,
    name: true,
    createdBy: true,
    adCampaignId: true,
  } as const;
  private readonly inviteLinkSyncUpsertSelect = {
    id: true,
    workspaceId: true,
    telegramChannelId: true,
    adCampaignId: true,
    joinedCount: true,
    requestedCount: true,
    isRevoked: true,
  } as const;
  private telegramInviteLinkRequestedCountSupported: boolean | null = null;
  private telegramInviteLinkRequestedCountColumnAvailable: boolean | null =
    null;
  private telegramInviteLinkSnapshotStorageState:
    | 'unknown'
    | 'available'
    | 'missing' = 'unknown';
  private ensureTelegramInviteLinkSnapshotStoragePromise:
    | Promise<boolean>
    | null = null;
  private ensureTelegramInviteLinkRequestedCountColumnPromise:
    | Promise<boolean>
    | null = null;
  private telegramChannelSyncScopeColumnsAvailable: boolean | null = null;
  private ensureTelegramChannelSyncScopeColumnsPromise: Promise<void> | null =
    null;

  constructor(
    private prisma: PrismaService,
    private workspaceService: WorkspaceService,
    private responseCache: ResponseCacheService,
    private encryptionService: TokenEncryptionService,
    private mtprotoClient: TelegramMtprotoClient,
    private sourceAccessService: TelegramSourceAccessService,
    private analyticsService: TelegramChannelAnalyticsService,
    private readonly applicationLogger: ApplicationLoggerService = ({
      info: () => undefined,
      writeStructured: () => undefined,
    } as unknown) as ApplicationLoggerService,
  ) {}

  private workspace(userId: string) {
    return this.workspaceService.resolveWorkspaceIdForUser(userId);
  }

  private cacheScopePrefix(userId: string, workspaceId: string) {
    return `api:${userId}:${workspaceId || 'no-workspace'}`;
  }

  private invalidateTelegramChannelReadCache(
    userId: string,
    workspaceId: string,
  ) {
    this.responseCache.clearByPrefix(
      `${this.cacheScopePrefix(userId, workspaceId)}:GET:/telegram-channels`,
    );
    this.responseCache.clearByPrefix(
      `${this.cacheScopePrefix(userId, '')}:GET:/telegram-channels`,
    );
  }

  private isMissingTelegramChannelSyncScopeColumn(error: unknown) {
    const message =
      error instanceof Error ? error.message : String(error || '');
    return (
      /column [`'"](?:TelegramChannel\.)?syncInclude[A-Za-z]+\b.*does not exist(?: in the current database)?/i.test(
        message,
      ) ||
      /column [`'"]syncInclude[A-Za-z]+ of relation TelegramChannel[`'"] does not exist/i.test(
        message,
      )
    );
  }

  private async ensureTelegramChannelSyncScopeColumnsAvailable() {
    if (this.telegramChannelSyncScopeColumnsAvailable === true) return;
    if (this.ensureTelegramChannelSyncScopeColumnsPromise) {
      return this.ensureTelegramChannelSyncScopeColumnsPromise;
    }
    this.ensureTelegramChannelSyncScopeColumnsPromise = (async () => {
      await this.prisma.$executeRawUnsafe(`
        ALTER TABLE "TelegramChannel"
        ADD COLUMN IF NOT EXISTS "syncIncludePublicInfo" BOOLEAN NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "syncIncludeInviteLinks" BOOLEAN NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "syncIncludeHistoricalPosts" BOOLEAN NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "syncIncludePostMetrics" BOOLEAN NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "syncIncludeOlderPosts" BOOLEAN NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "syncIncludeChannelStats" BOOLEAN NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "syncIncludeManagedPosts" BOOLEAN NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "syncIncludeAudienceSnapshot" BOOLEAN NOT NULL DEFAULT true
      `);
      this.telegramChannelSyncScopeColumnsAvailable = true;
      this.logger.warn(
        'TelegramChannel sync-scope columns were missing in the database and were created automatically for compatibility.',
      );
    })();
    try {
      await this.ensureTelegramChannelSyncScopeColumnsPromise;
    } finally {
      this.ensureTelegramChannelSyncScopeColumnsPromise = null;
    }
  }

  private telegramTextEditNote(result: TelegramTextEditOutcome) {
    return result.updatedCount > 0
      ? 'Text was edited in Telegram.'
      : 'Telegram text already matched the live post.';
  }

  private isBotMessageNotModified(description?: string | null) {
    const value = String(description || '').toLowerCase();
    return (
      value.includes('message is not modified') ||
      value.includes(
        'specified new message content and reply markup are exactly the same',
      )
    );
  }

  private async notifyTaskProgress(
    onProgress: BulkProgressCallback | undefined,
    current: number,
    total: number,
    message: string,
  ) {
    if (!onProgress) return;
    await onProgress(
      {
        phase: 'sync_step',
        message,
      },
      current,
      total,
    );
  }

  private async notifyInviteLinksProgress(
    onProgress: BulkProgressCallback | undefined,
    current: number,
    total: number,
    item: TelegramChannelSyncProgressItem,
  ) {
    if (!onProgress) return;
    await onProgress(item, current, total);
  }

  private async notifyDetailedTaskProgress(
    onProgress: BulkProgressCallback | undefined,
    current: number,
    total: number,
    message: string,
  ) {
    await this.notifyInviteLinksProgress(onProgress, current, total, {
      phase: 'sync_step',
      message,
    });
  }

  private async createAudienceSnapshotSafely(
    channelId: string,
    source = 'sync',
  ) {
    try {
      return await this.analyticsService.createAudienceSnapshot(
        channelId,
        source,
      );
    } catch (error) {
      this.logger.warn(
        `Audience snapshot skipped for channel=${channelId}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return null;
    }
  }

  private toUtcDay(value: Date) {
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }

  private channelRef(channel: {
    username: string | null;
    telegramChatId: string | null;
  }) {
    if (channel.telegramChatId) return channel.telegramChatId;
    if (channel.username) {
      return channel.username.startsWith('@')
        ? channel.username
        : `@${channel.username}`;
    }
    return null;
  }

  private mtprotoChannelReference(channel: {
    username: string | null;
    telegramChatId: string | null;
    inviteLink?: string | null;
    telegramAccessHash?: string | null;
  }) {
    return {
      username: channel.username,
      telegramChatId: channel.telegramChatId,
      inviteLink: channel.inviteLink || null,
      telegramAccessHash: channel.telegramAccessHash || null,
    };
  }

  private fallbackAccessMode(channel: {
    username?: string | null;
    inviteLink?: string | null;
    requiresJoinRequest?: boolean | null;
  }):
    | 'PUBLIC'
    | 'PRIVATE'
    | 'PRIVATE_INVITE'
    | 'PRIVATE_JOIN_REQUEST'
    | 'UNKNOWN' {
    if (channel.username) return 'PUBLIC';
    if (channel.requiresJoinRequest) return 'PRIVATE_JOIN_REQUEST';
    if (channel.inviteLink) return 'PRIVATE_INVITE';
    return 'UNKNOWN';
  }

  private channelIdentityPatch(info: ResolvedTelegramEntity) {
    return {
      title: info.title,
      username: this.normalizeUsername(info.username),
      telegramChatId: info.telegramChatId || null,
      inviteLink: info.inviteLink || undefined,
      description: info.description,
      currentSubscribersCount: info.participantsCount,
      photoUrl: info.photoUrl,
      accessMode:
        info.accessMode ||
        this.fallbackAccessMode({
          username: info.username,
          inviteLink: info.inviteLink,
          requiresJoinRequest: info.requiresJoinRequest,
        }),
      requiresJoinRequest: Boolean(info.requiresJoinRequest),
      telegramAccessHash: info.telegramAccessHash || null,
      lastEntityResolvedAt: new Date(),
    };
  }

  private async persistResolvedChannelIdentity(
    workspaceId: string,
    channelId: string,
    info?: ResolvedTelegramEntity | null,
  ) {
    if (!info || !info.telegramChatId) return null;
    return this.prisma.telegramChannel.update({
      where: { id: channelId, workspaceId },
      data: this.channelIdentityPatch(info),
    });
  }

  private syncStepSuccess(
    step: string,
    startedAt: number,
    message: string,
    metadata?: Record<string, unknown>,
  ): SyncStepResult {
    return {
      step,
      status: 'success' as const,
      errorCode: null,
      message,
      durationMs: Date.now() - startedAt,
      metadata: metadata || {},
    };
  }

  private syncStepPartial(
    step: string,
    startedAt: number,
    message: string,
    metadata?: Record<string, unknown>,
  ): SyncStepResult {
    return {
      step,
      status: 'partial' as const,
      errorCode: null,
      message,
      durationMs: Date.now() - startedAt,
      metadata: metadata || {},
    };
  }

  private syncStepFailure(
    step: string,
    startedAt: number,
    error: unknown,
    errorCode: string,
    fallbackMessage: string,
  ): SyncStepResult {
    return {
      step,
      status: 'failed' as const,
      errorCode,
      message: error instanceof Error ? error.message : fallbackMessage,
      durationMs: Date.now() - startedAt,
      metadata: {},
    };
  }

  private syncStepSkipped(
    step: string,
    startedAt: number,
    message: string,
    metadata?: Record<string, unknown>,
  ): SyncStepResult {
    return {
      step,
      status: 'skipped' as const,
      errorCode: null,
      message,
      durationMs: Date.now() - startedAt,
      metadata: metadata || {},
    };
  }

  private channelSyncSelection(channel: Partial<TelegramChannelSyncSelection>) {
    return {
      syncIncludePublicInfo: channel.syncIncludePublicInfo ?? true,
      syncIncludeInviteLinks: channel.syncIncludeInviteLinks ?? true,
      syncIncludeHistoricalPosts: channel.syncIncludeHistoricalPosts ?? true,
      syncIncludePostMetrics: channel.syncIncludePostMetrics ?? true,
      syncIncludeOlderPosts: channel.syncIncludeOlderPosts ?? true,
      syncIncludeChannelStats: channel.syncIncludeChannelStats ?? true,
      syncIncludeManagedPosts: channel.syncIncludeManagedPosts ?? true,
      syncIncludeAudienceSnapshot: channel.syncIncludeAudienceSnapshot ?? true,
    } satisfies TelegramChannelSyncSelection;
  }

  private resolveSyncSelection(
    channel: Partial<TelegramChannelSyncSelection>,
    dto?: SyncNowDto,
  ) {
    const stored = this.channelSyncSelection(channel);
    return {
      syncIncludePublicInfo:
        dto?.syncIncludePublicInfo ?? stored.syncIncludePublicInfo,
      syncIncludeInviteLinks:
        dto?.syncIncludeInviteLinks ?? stored.syncIncludeInviteLinks,
      syncIncludeHistoricalPosts:
        dto?.syncIncludeHistoricalPosts ?? stored.syncIncludeHistoricalPosts,
      syncIncludePostMetrics:
        dto?.syncIncludePostMetrics ?? stored.syncIncludePostMetrics,
      syncIncludeOlderPosts:
        dto?.syncIncludeOlderPosts ?? stored.syncIncludeOlderPosts,
      syncIncludeChannelStats:
        dto?.syncIncludeChannelStats ?? stored.syncIncludeChannelStats,
      syncIncludeManagedPosts:
        dto?.syncIncludeManagedPosts ?? stored.syncIncludeManagedPosts,
      syncIncludeAudienceSnapshot:
        dto?.syncIncludeAudienceSnapshot ?? stored.syncIncludeAudienceSnapshot,
    } satisfies TelegramChannelSyncSelection;
  }

  private syncSelectionHasAnyEnabled(selection: TelegramChannelSyncSelection) {
    return Object.values(selection).some(Boolean);
  }

  private syncSelectionTotalSteps(selection: TelegramChannelSyncSelection) {
    const includesHistorical =
      selection.syncIncludeInviteLinks || selection.syncIncludeHistoricalPosts;
    return (
      Number(selection.syncIncludePublicInfo) +
      Number(includesHistorical) +
      Number(selection.syncIncludePostMetrics) +
      Number(selection.syncIncludeOlderPosts) +
      Number(selection.syncIncludeChannelStats) +
      Number(selection.syncIncludeManagedPosts) +
      Number(selection.syncIncludeAudienceSnapshot) +
      1
    );
  }

  private normalizeUsername(value?: string | null) {
    return normalizeTelegramUsername(value);
  }

  private normalizeChatId(value?: string | null) {
    return normalizeTelegramChannelId(value);
  }

  private isMissingTimePostsTable(error: unknown) {
    const code = (error as { code?: string } | undefined)?.code;
    const cause = (
      error as {
        meta?: {
          driverAdapterError?: {
            cause?: { originalCode?: string; table?: string };
          };
        };
      }
    )?.meta?.driverAdapterError?.cause;

    return (
      code === 'P2010' &&
      cause?.originalCode === '42P01' &&
      cause?.table === 'TelegramChannelTimePost'
    );
  }

  private async timePostsByChannelIds(channelIds: string[]) {
    const uniqueChannelIds = [...new Set(channelIds.filter(Boolean))];
    const grouped = new Map<string, Array<Record<string, unknown>>>();
    if (!uniqueChannelIds.length) return grouped;

    let rows: Array<{
      id: string;
      telegramChannelId: string;
      title: string;
      time: string;
      position: number;
      iconId: string | null;
      icon_id: string | null;
      icon_type: string | null;
      icon_name: string | null;
      icon_emoji: string | null;
      icon_image_url: string | null;
    }>;
    try {
      rows = await this.prisma.$queryRaw(Prisma.sql`
        SELECT
          tp."id",
          tp."telegramChannelId",
          tp."title",
          tp."time",
          tp."position",
          tp."iconId",
          i."id" AS "icon_id",
          i."type" AS "icon_type",
          i."name" AS "icon_name",
          i."emoji" AS "icon_emoji",
          i."imageUrl" AS "icon_image_url"
        FROM "TelegramChannelTimePost" tp
        LEFT JOIN "Icon" i ON i."id" = tp."iconId"
        WHERE tp."telegramChannelId" IN (${Prisma.join(
          uniqueChannelIds.map((id) => Prisma.sql`${id}`),
        )})
        ORDER BY tp."position" ASC, tp."createdAt" ASC
      `);
    } catch (error) {
      if (this.isMissingTimePostsTable(error)) {
        this.logger.warn(
          'TelegramChannelTimePost table is missing; returning empty time posts until migrations are applied.',
        );
        return grouped;
      }
      throw error;
    }

    for (const row of rows) {
      const items = grouped.get(row.telegramChannelId) ?? [];
      items.push({
        id: row.id,
        title: row.title,
        time: row.time,
        position: row.position,
        iconId: row.iconId,
        icon: row.icon_id
          ? {
              id: row.icon_id,
              type: row.icon_type,
              name: row.icon_name,
              emoji: row.icon_emoji,
              imageUrl: row.icon_image_url,
            }
          : null,
      });
      grouped.set(row.telegramChannelId, items);
    }

    return grouped;
  }

  private telegramMessageUrl(
    channel: { telegramChatId: string | null },
    messageId: string,
  ) {
    return buildStableTelegramPostUrl({
      telegramChatId: channel.telegramChatId,
      messageId,
    });
  }

  private botChatId(channel: {
    username: string | null;
    telegramChatId: string | null;
  }) {
    const username = this.normalizeUsername(channel.username);
    if (username) return `@${username}`;
    const chatId = this.normalizeChatId(channel.telegramChatId);
    return chatId ? `-100${chatId}` : null;
  }

  private primaryTelegramMessageId(params: {
    messageIds: string[];
    imageCount?: number | null;
  }) {
    const { messageIds, imageCount } = params;
    if (!messageIds.length) return null;
    if ((imageCount ?? 0) > 1) {
      return messageIds[Math.min((imageCount ?? 1) - 1, messageIds.length - 1)];
    }
    return messageIds[0];
  }

  private telegramMessageUrlsForPost(
    channel: { username: string | null; telegramChatId: string | null },
    messageIds: string[],
    imageCount = 0,
  ) {
    const urls = messageIds.flatMap((id) => {
      const url = this.telegramMessageUrl(channel, id);
      return url ? [url] : [];
    });
    const primaryId = this.primaryTelegramMessageId({ messageIds, imageCount });
    const primaryUrl = primaryId ? this.telegramMessageUrl(channel, primaryId) : null;
    if (!primaryUrl) return urls;
    return [primaryUrl, ...urls.filter((url) => url !== primaryUrl)];
  }

  private normalizedPlainText(value: string) {
    const withoutInternalTargets = (value || '').replace(
      /\[([^\]\n]+)\]\(tg-post:[a-zA-Z0-9_-]+\)/g,
      '$1',
    );
    const [plain] = HTMLParser.parse(
      telegramMarkupToHtml(withoutInternalTargets),
    );
    return plain.replace(/\s+/g, ' ').trim().toLowerCase();
  }

  private normalizeSearchText(value: string) {
    return value
      .toLowerCase()
      .replace(/^\s*\d+(?:[.)]\d+)*(?:[.)])?\s*/g, '')
      .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private titleSearchClue(title: string) {
    const normalized = this.normalizeSearchText(title);
    if (!normalized || normalized === 'pinned') return null;
    const words = normalized.split(' ').filter(Boolean);
    if (words.length < 2 && normalized.length < 8) return null;
    return normalized;
  }

  private textMatchesTitle(title: string, text: string) {
    const clue = this.titleSearchClue(title);
    if (!clue) return true;
    const plain = this.normalizeSearchText(text);
    return plain.includes(clue) || clue.includes(plain.slice(0, clue.length));
  }

  private findMatchingRecentPublishedMessage(
    post: {
      title: string;
      text: string | null;
      publishMode: string | null;
    },
    recentPublished: ManagedPostSyncMessage[],
  ) {
    const titleClue = this.titleSearchClue(post.title);
    const localText = post.text?.trim() || '';
    const normalizedLocal = localText
      ? this.normalizedPlainText(localText)
      : '';
    const textLooksConsistent = localText
      ? this.textMatchesTitle(post.title, localText)
      : false;

    const byExactText =
      normalizedLocal &&
      recentPublished.find(
        (message) =>
          this.normalizedPlainText(message.text || '') === normalizedLocal,
      );
    const byTitle =
      titleClue &&
      recentPublished.find((message) =>
        this.normalizeSearchText(message.text || '').includes(titleClue),
      );
    if (!textLooksConsistent && titleClue && !byTitle) {
      return null;
    }
    const matched =
      !textLooksConsistent && byTitle
        ? byTitle
        : byExactText ?? byTitle ?? null;
    if (!matched) return null;

    const messageIds =
      post.publishMode === 'IMAGES_THEN_TEXT'
        ? [
            ...(() => {
              const previousMedia = recentPublished.find(
                (candidate) =>
                  candidate.hasMedia &&
                  candidate.date === matched.date &&
                  Number(candidate.id) < Number(matched.id),
              );
              return previousMedia ? [previousMedia.id] : [];
            })(),
            matched.id,
          ]
        : [matched.id];

    return {
      messageIds: [...new Set(messageIds)],
      matchedMessage: matched,
      remoteText: telegramHtmlToManagedMarkup(matched.html),
    };
  }

  private appendFollowupTextMessageForImagesThenText(
    publishMode: string | null,
    messages: ManagedPostSyncMessage[],
    recentPublished: ManagedPostSyncMessage[],
  ) {
    if (
      publishMode !== 'IMAGES_THEN_TEXT' ||
      messages.length !== 1 ||
      !messages[0]?.hasMedia
    ) {
      return messages;
    }
    const mediaMessage = messages[0];
    const followup = recentPublished
      .filter(
        (candidate) =>
          !candidate.hasMedia &&
          candidate.date === mediaMessage.date &&
          Number(candidate.id) > Number(mediaMessage.id),
      )
      .sort((left, right) => Number(left.id) - Number(right.id))[0];
    return followup ? [mediaMessage, followup] : messages;
  }

  private maskInviteHash(value?: string | null) {
    const hash = String(value || '').trim();
    if (!hash) return null;
    if (hash.length <= 6) return `${hash.slice(0, 2)}***`;
    return `${hash.slice(0, 4)}***${hash.slice(-2)}`;
  }

  private importProgressSteps(inputType: TelegramImportInput['type']) {
    if (inputType === 'invite') {
      return [
        'Parsing import input',
        'Checking private invite',
        'Resolving Telegram channel',
        'Adding channel to workspace',
        'Importing channel history and metrics',
      ] as const;
    }
    return [
      'Parsing import input',
      'Resolving Telegram channel',
      'Adding channel to workspace',
      'Importing channel history and metrics',
    ] as const;
  }

  private async notifyImportProgress(
    onProgress: BulkProgressCallback | undefined,
    steps: readonly string[],
    index: number,
  ) {
    await this.notifyTaskProgress(onProgress, index + 1, steps.length, steps[index]);
  }

  private ensureImportableChannelEntity(
    info: ResolvedTelegramEntity,
    inputType: TelegramImportInput['type'],
  ) {
    if (info.kind === 'channel' && !String(info.telegramChatId || '').trim()) {
      if (inputType === 'invite') {
        throw new BadRequestException(
          'Could not resolve a real Telegram channel from the invite link.',
        );
      }
      throw new BadRequestException(
        'Could not resolve a real Telegram channel for import.',
      );
    }
    return info;
  }

  private async resolveImportEntity(
    account: {
      id: string;
      apiId: string;
      apiHashEncrypted: string;
      apiHashIv: string;
      apiHashAuthTag: string;
      sessionEncrypted: string | null;
      sessionIv: string | null;
      sessionAuthTag: string | null;
    },
    input: TelegramImportInput,
  ) {
    const credentials = this.accountCredentials(account);
    if (input.type === 'title') {
      return this.mtprotoClient.findAccessibleChannelInfoByTitle({
        ...credentials,
        titleQuery: input.titleQuery,
      });
    }
    if (input.type === 'invite') {
      return this.mtprotoClient.getPublicChannelInfo({
        ...credentials,
        channelRef: input.inviteLink,
        inviteHash: input.inviteHash,
      });
    }
    return this.mtprotoClient.getPublicChannelInfo({
      ...credentials,
      channelRef: input.channelRef,
    });
  }

  private async connectedAccount(
    workspaceId: string,
    channelId: string,
    requestedAccountId?: string,
  ) {
    const linkedAdmin = requestedAccountId
      ? null
      : await this.prisma.telegramChannelAdminLink.findFirst({
          where: { workspaceId, telegramChannelId: channelId },
          orderBy: { createdAt: 'asc' },
        });
    const accountId =
      requestedAccountId || linkedAdmin?.telegramUserAccountIntegrationId;
    if (!accountId) {
      throw new BadRequestException(
        'No connected Telegram user account selected for MTProto sync',
      );
    }
    const account = await this.prisma.telegramUserAccountIntegration.findFirst({
      where: { id: accountId, workspaceId, isActive: true },
    });
    if (!account || account.status !== TelegramUserAccountStatus.connected) {
      throw new BadRequestException('Telegram user account is not connected');
    }
    return account;
  }

  private sourceDisplayName(account: {
    label: string;
    username: string | null;
    firstName: string | null;
    phoneMasked?: string | null;
  }) {
    return account.username
      ? `@${account.username}`
      : account.firstName ||
          account.label ||
          account.phoneMasked ||
          'MTProto account';
  }

  private async bestMtprotoAccountId(
    workspaceId: string,
    channelId: string,
    dataType: TelegramChannelDataType,
  ) {
    const best = await this.sourceAccessService.bestMtprotoSource(
      workspaceId,
      channelId,
      dataType,
    );
    return best?.sourceId;
  }

  private accountCredentials(account: {
    apiId: string;
    apiHashEncrypted: string;
    apiHashIv: string;
    apiHashAuthTag: string;
    sessionEncrypted: string | null;
    sessionIv: string | null;
    sessionAuthTag: string | null;
  }) {
    return {
      apiId: account.apiId,
      apiHash: this.encryptionService.decrypt({
        encrypted: account.apiHashEncrypted,
        iv: account.apiHashIv,
        authTag: account.apiHashAuthTag,
      }),
      session: this.encryptionService.decrypt({
        encrypted: account.sessionEncrypted || '',
        iv: account.sessionIv || '',
        authTag: account.sessionAuthTag || '',
      }),
    };
  }

  private async buildInviteAttributionMaps(workspaceId: string) {
    const [members, integrations] = await Promise.all([
      this.prisma.workspaceMember.findMany({
        where: { workspaceId },
        select: { id: true, telegramUsername: true },
      }),
      this.prisma.telegramUserAccountIntegration.findMany({
        where: { workspaceId },
        select: { telegramUserId: true, username: true, assignedMemberId: true },
      }),
    ]);
    return buildInviteLinkAttributionMaps({ members, integrations });
  }

  private async persistInviteLinkFromRemote(params: {
    workspaceId: string;
    channelId: string;
    link: TelegramInviteLinksResult['links'][number];
    maps: Awaited<ReturnType<TelegramChannelsService['buildInviteAttributionMaps']>>;
    processedCount: number;
    totalLinks: number;
    warnings: string[];
    onProgress?: BulkProgressCallback;
    progressStep: { current: number; total: number };
  }) {
    const attribution = attributeInviteLinkCreator(
      {
        creatorTelegramUserId: params.link.telegramCreatorUserId,
        creatorUsername: params.link.creatorUsername,
        creatorFirstName: params.link.creatorFirstName,
        creatorLastName: params.link.creatorLastName,
        creatorPhotoUrl: params.link.creatorPhotoUrl,
      },
      params.maps,
    );
    const existing = await this.prisma.telegramInviteLink.findUnique({
      where: {
        workspaceId_telegramChannelId_url: {
          workspaceId: params.workspaceId,
          telegramChannelId: params.channelId,
          url: params.link.url,
        },
      },
      select: this.inviteLinkSyncExistingSelect,
    });
    const payload = {
      name: params.link.title || existing?.name || 'Imported MTProto link',
      telegramInviteLinkId: params.link.url,
      createdBy:
        existing?.createdBy ||
        [params.link.creatorFirstName, params.link.creatorLastName]
          .filter(Boolean)
          .join(' ') ||
        attribution.creatorUsername ||
        null,
      createsJoinRequest: params.link.requestNeeded,
      expireDate: params.link.expireDate,
      memberLimit: params.link.usageLimit,
      joinedCount: params.link.usage,
      requestedCount: params.link.requested,
      isRevoked: params.link.revoked,
      lastSyncedAt: new Date(),
      creatorTelegramUserId: params.link.telegramCreatorUserId,
      creatorUsername: attribution.creatorUsername,
      creatorFirstName: params.link.creatorFirstName,
      creatorLastName: params.link.creatorLastName,
      creatorPhotoUrl: params.link.creatorPhotoUrl,
      creatorMemberId: attribution.creatorMemberId,
      creatorMatchSource: attribution.creatorMatchSource,
    };

    const upserted = await this.upsertInviteLinkWithRequestedCountFallback({
      workspaceId: params.workspaceId,
      channelId: params.channelId,
      url: params.link.url,
      existingId: existing?.id,
      create: {
        workspaceId: params.workspaceId,
        telegramChannelId: params.channelId,
        url: params.link.url,
        ...payload,
      },
      update: payload,
    });

    await this.notifyInviteLinksProgress(
      params.onProgress,
      params.progressStep.current,
      params.progressStep.total,
      {
        phase: 'saving_invite_links',
        message: `Saving invite links ${params.processedCount}/${params.totalLinks}`,
        stageCurrent: params.processedCount,
        stageTotal: params.totalLinks,
        warnings: params.warnings,
      },
    );

    return {
      existing,
      upserted,
      matchedMember: Boolean(attribution.creatorMemberId),
      unresolved:
        attribution.creatorMatchSource ===
        TelegramInviteLinkCreatorMatchSource.UNRESOLVED,
    };
  }

  private async finalizeInviteLinkSync(params: {
    workspaceId: string;
    channelId: string;
    account: {
      id: string;
      label: string;
      username: string | null;
      firstName: string | null;
      phoneMasked?: string | null;
    };
    remote: TelegramInviteLinksResult;
    importedCount: number;
    updatedCount: number;
    matchedMembersCount: number;
    unresolvedCreatorsCount: number;
    affectedCampaignIds: Set<string>;
    onProgress?: BulkProgressCallback;
    progressStep: { current: number; total: number };
  }) {
    const campaignIds = [...params.affectedCampaignIds];
    if (campaignIds.length) {
      await this.notifyDetailedTaskProgress(
        params.onProgress,
        params.progressStep.current,
        params.progressStep.total,
        `Recalculating metrics for ${campaignIds.length} affected campaigns`,
      );
    }
    for (const [index, campaignId] of campaignIds.entries()) {
      await this.recalculateCampaignMetricsById(campaignId);
      const processedCampaigns = index + 1;
      if (
        processedCampaigns === campaignIds.length ||
        processedCampaigns === 1 ||
        processedCampaigns % 10 === 0
      ) {
        await this.notifyDetailedTaskProgress(
          params.onProgress,
          params.progressStep.current,
          params.progressStep.total,
          `Recalculated ${processedCampaigns}/${campaignIds.length} affected campaigns`,
        );
      }
    }

    const status =
      params.remote.scope === 'ALL_ADMINS'
        ? TelegramDataSourceStatus.SUCCESS
        : TelegramDataSourceStatus.PARTIAL;
    const fetchedTotalLinks = params.remote.links.length;
    const missingTotalLinks = Math.max(
      0,
      (params.remote.expectedTotalLinks ?? 0) - fetchedTotalLinks,
    );
    await this.sourceAccessService.recordDataSource({
      workspaceId: params.workspaceId,
      channelId: params.channelId,
      sourceId: params.account.id,
      sourceType: TelegramSourceType.MTPROTO,
      dataType: TelegramChannelDataType.INVITE_LINKS,
      status,
      sourceDisplayName: this.sourceDisplayName(params.account),
      metadata: {
        scope: params.remote.scope,
        adminsCount: params.remote.admins.length,
        expectedTotalLinks: params.remote.expectedTotalLinks,
        fetchedTotalLinks,
        missingTotalLinks,
        activeLinksCount: params.remote.links.filter((link) => !link.revoked).length,
        revokedLinksCount: params.remote.links.filter((link) => link.revoked).length,
        importedCount: params.importedCount,
        updatedCount: params.updatedCount,
        matchedMembersCount: params.matchedMembersCount,
        unresolvedCreatorsCount: params.unresolvedCreatorsCount,
        warnings: params.remote.warnings,
      },
    });

    return {
      imported: params.importedCount,
      updated: params.updatedCount,
      scope: params.remote.scope,
      expectedTotalLinks: params.remote.expectedTotalLinks,
      fetchedTotalLinks,
      missingTotalLinks,
      warnings: params.remote.warnings,
    };
  }

  private inviteLinkHistoryPoints<T extends { syncedAt: Date; joinedCount: number; requestedCount: number; isRevoked?: boolean | null }>(
    rows: T[],
  ) {
    let peakJoinedCount = 0;
    return rows.map((row) => {
      const joinedCount = Number(row.joinedCount || 0);
      const requestedCount = Number(row.requestedCount || 0);
      peakJoinedCount = Math.max(peakJoinedCount, joinedCount);
      const drawdownFromPeak = Math.max(0, peakJoinedCount - joinedCount);
      const drawdownPercent =
        peakJoinedCount > 0 ? (drawdownFromPeak / peakJoinedCount) * 100 : 0;
      return {
        syncedAt: row.syncedAt,
        joinedCount,
        requestedCount,
        totalAttributed: joinedCount + requestedCount,
        peakJoinedCount,
        drawdownFromPeak,
        drawdownPercent,
        isRevoked: Boolean(row.isRevoked),
      };
    });
  }

  private inviteLinkHistorySummary<
    T extends {
      joinedCount: number;
      requestedCount: number;
      peakJoinedCount: number;
      drawdownFromPeak: number;
      drawdownPercent: number;
    },
  >(points: T[]) {
    const current = points[points.length - 1] ?? null;
    const peakJoinedCount = points.reduce(
      (max, point) => Math.max(max, Number(point.peakJoinedCount || 0)),
      0,
    );
    const peakRequestedCount = points.reduce(
      (max, point) => Math.max(max, Number(point.requestedCount || 0)),
      0,
    );
    return {
      currentJoinedCount: Number(current?.joinedCount || 0),
      currentRequestedCount: Number(current?.requestedCount || 0),
      currentTotalAttributed:
        Number(current?.joinedCount || 0) + Number(current?.requestedCount || 0),
      peakJoinedCount,
      peakRequestedCount,
      peakTotalAttributed: peakJoinedCount + peakRequestedCount,
      drawdownFromPeak: Number(current?.drawdownFromPeak || 0),
      drawdownPercent: Number(current?.drawdownPercent || 0),
      hasHighDropoff: Number(current?.drawdownPercent || 0) >= 15,
    };
  }

  private async persistInviteLinkSnapshots(params: {
    workspaceId: string;
    channelId: string;
    syncedAt: Date;
    links: Array<{
      id: string;
      telegramChannelId: string;
      adCampaignId: string | null;
      joinedCount: number;
      requestedCount: number;
      isRevoked: boolean;
    }>;
  }) {
    if (!params.links.length) return;
    if (this.telegramInviteLinkSnapshotStorageState === 'missing') return;
    try {
      await this.prisma.telegramInviteLinkSnapshot.createMany({
        data: params.links.map((link) => ({
          workspaceId: params.workspaceId,
          telegramChannelId: params.channelId,
          inviteLinkId: link.id,
          adCampaignId: link.adCampaignId ?? null,
          syncedAt: params.syncedAt,
          joinedCount: Number(link.joinedCount || 0),
          requestedCount: Number(link.requestedCount || 0),
          isRevoked: Boolean(link.isRevoked),
        })),
        skipDuplicates: true,
      });
      this.telegramInviteLinkSnapshotStorageState = 'available';
    } catch (error) {
      if (!this.isInviteLinkSnapshotStorageMissing(error)) throw error;
      this.telegramInviteLinkSnapshotStorageState = 'missing';
      const repaired =
        await this.ensureTelegramInviteLinkSnapshotStorageAvailable();
      if (!repaired) {
        this.logger.warn(
          'TelegramInviteLinkSnapshot table is missing; invite-link history snapshots are skipped until migrations are applied.',
        );
        return;
      }
      await this.prisma.telegramInviteLinkSnapshot.createMany({
        data: params.links.map((link) => ({
          workspaceId: params.workspaceId,
          telegramChannelId: params.channelId,
          inviteLinkId: link.id,
          adCampaignId: link.adCampaignId ?? null,
          syncedAt: params.syncedAt,
          joinedCount: Number(link.joinedCount || 0),
          requestedCount: Number(link.requestedCount || 0),
          isRevoked: Boolean(link.isRevoked),
        })),
        skipDuplicates: true,
      });
      this.telegramInviteLinkSnapshotStorageState = 'available';
    }
  }

  async reattributeWorkspaceInviteLinks(workspaceId: string) {
    const maps = await this.buildInviteAttributionMaps(workspaceId);
    const links = await this.prisma.telegramInviteLink.findMany({
      where: { workspaceId },
      select: {
        id: true,
        creatorTelegramUserId: true,
        creatorUsername: true,
        creatorFirstName: true,
        creatorLastName: true,
        creatorPhotoUrl: true,
      },
    });
    await this.prisma.$transaction(
      links.map((link) => {
        const attribution = attributeInviteLinkCreator(
          {
            creatorTelegramUserId: link.creatorTelegramUserId,
            creatorUsername: link.creatorUsername,
            creatorFirstName: link.creatorFirstName,
            creatorLastName: link.creatorLastName,
            creatorPhotoUrl: link.creatorPhotoUrl,
          },
          maps,
        );
        return this.prisma.telegramInviteLink.update({
          where: { id: link.id },
          data: {
            creatorMemberId: attribution.creatorMemberId,
            creatorMatchSource: attribution.creatorMatchSource,
            creatorUsername: attribution.creatorUsername,
          },
        });
      }),
    );
  }

  private async syncChannelInviteLinks(params: {
    workspaceId: string;
    channelId: string;
    account: {
      id: string;
      label: string;
      username: string | null;
      firstName: string | null;
      phoneMasked?: string | null;
      apiId: string;
      apiHashEncrypted: string;
      apiHashIv: string;
      apiHashAuthTag: string;
      sessionEncrypted: string | null;
      sessionIv: string | null;
      sessionAuthTag: string | null;
    };
    channelReference: {
      username?: string | null;
      telegramChatId?: string | null;
      inviteLink?: string | null;
      telegramAccessHash?: string | null;
    };
    prefetchedRemote?: TelegramInviteLinksResult | null;
    onProgress?: BulkProgressCallback;
    progressStep?: { current: number; total: number };
  }) {
    const remote =
      params.prefetchedRemote ??
      (await this.mtprotoClient.getAllChannelInviteLinks({
        ...this.accountCredentials(params.account),
        channel: params.channelReference,
      }));
    const progressStep = params.progressStep ?? { current: 2, total: 8 };
    const maps = await this.buildInviteAttributionMaps(params.workspaceId);
    let importedCount = 0;
    let updatedCount = 0;
    let matchedMembersCount = 0;
    let unresolvedCreatorsCount = 0;
    const affectedCampaignIds = new Set<string>();
    const persistedLinks: Array<{
      id: string;
      telegramChannelId: string;
      adCampaignId: string | null;
      joinedCount: number;
      requestedCount: number;
      isRevoked: boolean;
    }> = [];
    const syncedAt = new Date();
    const totalLinks = remote.links.length;

    await this.notifyInviteLinksProgress(
      params.onProgress,
      progressStep.current,
      progressStep.total,
      {
        phase: 'saving_invite_links',
        message:
          totalLinks > 0
            ? `Saving invite links 0/${totalLinks}`
            : 'Saving invite links',
        stageCurrent: 0,
        stageTotal: totalLinks,
        warnings: remote.warnings,
      },
    );

    for (const [index, link] of remote.links.entries()) {
      const persisted = await this.persistInviteLinkFromRemote({
        workspaceId: params.workspaceId,
        channelId: params.channelId,
        link,
        maps,
        processedCount: index + 1,
        totalLinks,
        warnings: remote.warnings,
        onProgress: params.onProgress,
        progressStep,
      });
      if (persisted.matchedMember) matchedMembersCount += 1;
      if (persisted.unresolved) unresolvedCreatorsCount += 1;
      if (persisted.existing) {
        updatedCount += 1;
        if (persisted.existing.adCampaignId) {
          affectedCampaignIds.add(persisted.existing.adCampaignId);
        }
      } else {
        importedCount += 1;
      }
      if (persisted.upserted.adCampaignId) {
        affectedCampaignIds.add(persisted.upserted.adCampaignId);
      }
      persistedLinks.push({
        id: persisted.upserted.id,
        telegramChannelId: persisted.upserted.telegramChannelId,
        adCampaignId: persisted.upserted.adCampaignId ?? null,
        joinedCount: persisted.upserted.joinedCount,
        requestedCount: persisted.upserted.requestedCount,
        isRevoked: persisted.upserted.isRevoked,
      });
    }

    await this.persistInviteLinkSnapshots({
      workspaceId: params.workspaceId,
      channelId: params.channelId,
      syncedAt,
      links: persistedLinks,
    });

    return this.finalizeInviteLinkSync({
      workspaceId: params.workspaceId,
      channelId: params.channelId,
      account: params.account,
      remote,
      importedCount,
      updatedCount,
      matchedMembersCount,
      unresolvedCreatorsCount,
      affectedCampaignIds,
      onProgress: params.onProgress,
      progressStep,
    });
  }

  private isRequestedCountUnsupportedPrismaError(error: unknown) {
    const message =
      error instanceof Error ? error.message : String(error || '');
    return (
      /Unknown arg(?:ument)? [`'"]requestedCount[`'"]/i.test(message) ||
      /column [`'"](?:TelegramInviteLink\.)?requestedCount\b.*does not exist(?: in the current database)?/i.test(
        message,
      ) ||
      /column [`'"]requestedCount of relation TelegramInviteLink[`'"] does not exist/i.test(
        message,
      )
    );
  }

  private isInviteLinkSnapshotStorageMissing(error: unknown) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
    if (error.code === 'P2021') return true;
    if (error.code !== 'P2010') return false;

    const originalCode =
      (
        error.meta as
          | {
              driverAdapterError?: {
                cause?: { originalCode?: string };
              };
            }
          | undefined
      )?.driverAdapterError?.cause?.originalCode ?? null;

    return originalCode === '42P01';
  }

  private async ensureTelegramInviteLinkSnapshotStorageAvailable() {
    if (this.telegramInviteLinkSnapshotStorageState === 'available') {
      return true;
    }
    if (this.ensureTelegramInviteLinkSnapshotStoragePromise) {
      return this.ensureTelegramInviteLinkSnapshotStoragePromise;
    }
    this.ensureTelegramInviteLinkSnapshotStoragePromise = (async () => {
      if (typeof this.prisma.$executeRawUnsafe !== 'function') {
        return false;
      }
      await this.prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "TelegramInviteLinkSnapshot" (
          "id" TEXT NOT NULL,
          "workspaceId" TEXT NOT NULL,
          "telegramChannelId" TEXT NOT NULL,
          "inviteLinkId" TEXT NOT NULL,
          "adCampaignId" TEXT,
          "syncedAt" TIMESTAMP(3) NOT NULL,
          "joinedCount" INTEGER NOT NULL DEFAULT 0,
          "requestedCount" INTEGER NOT NULL DEFAULT 0,
          "isRevoked" BOOLEAN NOT NULL DEFAULT false,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "TelegramInviteLinkSnapshot_pkey" PRIMARY KEY ("id")
        )
      `);
      await this.prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "TelegramInviteLinkSnapshot_inviteLinkId_syncedAt_key"
        ON "TelegramInviteLinkSnapshot"("inviteLinkId", "syncedAt")
      `);
      await this.prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "TelegramInviteLinkSnapshot_workspaceId_telegramChannelId_syncedAt_idx"
        ON "TelegramInviteLinkSnapshot"("workspaceId", "telegramChannelId", "syncedAt")
      `);
      await this.prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "TelegramInviteLinkSnapshot_workspaceId_adCampaignId_syncedAt_idx"
        ON "TelegramInviteLinkSnapshot"("workspaceId", "adCampaignId", "syncedAt")
      `);
      await this.prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "TelegramInviteLinkSnapshot_workspaceId_inviteLinkId_syncedAt_idx"
        ON "TelegramInviteLinkSnapshot"("workspaceId", "inviteLinkId", "syncedAt")
      `);
      await this.prisma.$executeRawUnsafe(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'TelegramInviteLinkSnapshot_workspaceId_fkey'
          ) THEN
            ALTER TABLE "TelegramInviteLinkSnapshot"
            ADD CONSTRAINT "TelegramInviteLinkSnapshot_workspaceId_fkey"
            FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'TelegramInviteLinkSnapshot_telegramChannelId_fkey'
          ) THEN
            ALTER TABLE "TelegramInviteLinkSnapshot"
            ADD CONSTRAINT "TelegramInviteLinkSnapshot_telegramChannelId_fkey"
            FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'TelegramInviteLinkSnapshot_inviteLinkId_fkey'
          ) THEN
            ALTER TABLE "TelegramInviteLinkSnapshot"
            ADD CONSTRAINT "TelegramInviteLinkSnapshot_inviteLinkId_fkey"
            FOREIGN KEY ("inviteLinkId") REFERENCES "TelegramInviteLink"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'TelegramInviteLinkSnapshot_adCampaignId_fkey'
          ) THEN
            ALTER TABLE "TelegramInviteLinkSnapshot"
            ADD CONSTRAINT "TelegramInviteLinkSnapshot_adCampaignId_fkey"
            FOREIGN KEY ("adCampaignId") REFERENCES "AdCampaign"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
          END IF;
        END
        $$;
      `);
      this.telegramInviteLinkSnapshotStorageState = 'available';
      this.logger.warn(
        'TelegramInviteLinkSnapshot table was missing in the database and was created automatically for compatibility.',
      );
      return true;
    })();
    try {
      return await this.ensureTelegramInviteLinkSnapshotStoragePromise;
    } finally {
      this.ensureTelegramInviteLinkSnapshotStoragePromise = null;
    }
  }

  private inviteLinkSyntheticHistoryPoint(params: {
    syncedAt?: Date | null;
    joinedCount?: number | null;
    requestedCount?: number | null;
    isRevoked?: boolean | null;
  }) {
    return {
      syncedAt: params.syncedAt ?? new Date(),
      joinedCount: Number(params.joinedCount ?? 0),
      requestedCount: Number(params.requestedCount ?? 0),
      isRevoked: Boolean(params.isRevoked),
    };
  }

  private async readInviteLinkSnapshotsOrEmpty(params: {
    where: Prisma.TelegramInviteLinkSnapshotWhereInput;
    orderBy:
      | Prisma.TelegramInviteLinkSnapshotOrderByWithRelationInput
      | Prisma.TelegramInviteLinkSnapshotOrderByWithRelationInput[];
    take: number;
  }) {
    if (this.telegramInviteLinkSnapshotStorageState === 'missing') {
      return [];
    }
    try {
      const rows = await this.prisma.telegramInviteLinkSnapshot.findMany({
        where: params.where,
        orderBy: params.orderBy,
        take: params.take,
      });
      this.telegramInviteLinkSnapshotStorageState = 'available';
      return rows;
    } catch (error) {
      if (!this.isInviteLinkSnapshotStorageMissing(error)) throw error;
      this.telegramInviteLinkSnapshotStorageState = 'missing';
      const repaired =
        await this.ensureTelegramInviteLinkSnapshotStorageAvailable();
      if (!repaired) return [];
      const rows = await this.prisma.telegramInviteLinkSnapshot.findMany({
        where: params.where,
        orderBy: params.orderBy,
        take: params.take,
      });
      this.telegramInviteLinkSnapshotStorageState = 'available';
      return rows;
    }
  }

  private requestedCountCompatibilityReason(error: unknown) {
    const message =
      error instanceof Error ? error.message : String(error || '');
    if (/Unknown arg(?:ument)? [`'"]requestedCount[`'"]/i.test(message)) {
      return 'outdated_prisma_client';
    }
    if (
      /column [`'"](?:TelegramInviteLink\.)?requestedCount\b.*does not exist(?: in the current database)?/i.test(
        message,
      ) ||
      /column [`'"]requestedCount of relation TelegramInviteLink[`'"] does not exist/i.test(
        message,
      )
    ) {
      return 'database_column_missing';
    }
    return 'unknown';
  }

  private supportsTelegramInviteLinkRequestedCount() {
    if (this.telegramInviteLinkRequestedCountSupported != null) {
      return this.telegramInviteLinkRequestedCountSupported;
    }
    const inviteLinkModel = Prisma.dmmf.datamodel.models.find(
      (model) => model.name === 'TelegramInviteLink',
    );
    this.telegramInviteLinkRequestedCountSupported = Boolean(
      inviteLinkModel?.fields.some((field) => field.name === 'requestedCount'),
    );
    return this.telegramInviteLinkRequestedCountSupported;
  }

  private async ensureTelegramInviteLinkRequestedCountColumnAvailable() {
    if (!this.supportsTelegramInviteLinkRequestedCount()) {
      return false;
    }
    if (this.telegramInviteLinkRequestedCountColumnAvailable === true) {
      return true;
    }
    if (this.ensureTelegramInviteLinkRequestedCountColumnPromise) {
      return this.ensureTelegramInviteLinkRequestedCountColumnPromise;
    }
    this.ensureTelegramInviteLinkRequestedCountColumnPromise = (async () => {
      if (typeof this.prisma.$executeRawUnsafe !== 'function') {
        return false;
      }
      await this.prisma.$executeRawUnsafe(`
        ALTER TABLE "TelegramInviteLink"
        ADD COLUMN IF NOT EXISTS "requestedCount" INTEGER NOT NULL DEFAULT 0
      `);
      this.telegramInviteLinkRequestedCountColumnAvailable = true;
      this.logger.warn(
        'TelegramInviteLink.requestedCount column was missing and was created automatically for compatibility.',
      );
      return true;
    })();
    try {
      await this.ensureTelegramInviteLinkRequestedCountColumnPromise;
    } finally {
      this.ensureTelegramInviteLinkRequestedCountColumnPromise = null;
    }
    return Boolean(this.telegramInviteLinkRequestedCountColumnAvailable);
  }

  private canWriteTelegramInviteLinkRequestedCount() {
    return (
      this.supportsTelegramInviteLinkRequestedCount() &&
      this.telegramInviteLinkRequestedCountColumnAvailable !== false
    );
  }

  private inviteLinkReadSelect(includeRequestedCount: boolean) {
    if (!includeRequestedCount) {
      return this.inviteLinkReadSelectWithoutRequestedCount;
    }
    return {
      ...this.inviteLinkReadSelectWithoutRequestedCount,
      requestedCount: true,
    } as const;
  }

  private normalizeInviteLinkRequestedCount<T extends object>(
    link: T,
  ): T & { requestedCount: number } {
    const value = link as T & { requestedCount?: number | null };
    return {
      ...link,
      requestedCount: Number(value.requestedCount ?? 0),
    };
  }

  private normalizeInviteLinksRequestedCount<T extends object>(
    links: T[],
  ): Array<T & { requestedCount: number }> {
    return links.map((link) => this.normalizeInviteLinkRequestedCount(link));
  }

  private inviteLinkRawWriteClient() {
    return this.prisma as PrismaService & {
      $queryRaw<T = unknown>(
        query: TemplateStringsArray | Prisma.Sql,
        ...values: unknown[]
      ): Promise<T>;
      $executeRaw?(
        query: TemplateStringsArray | Prisma.Sql,
        ...values: unknown[]
      ): Promise<number>;
    };
  }

  private inviteLinkLegacyColumnValue(column: string, value: unknown) {
    if (column === 'creatorMatchSource') {
      return value == null
        ? Prisma.sql`NULL`
        : Prisma.sql`CAST(${String(value)} AS "TelegramInviteLinkCreatorMatchSource")`;
    }
    return Prisma.sql`${value as never}`;
  }

  private async persistInviteLinkWithoutRequestedCountRaw(params: {
    create: Record<string, unknown>;
    update: Record<string, unknown>;
    existingId?: string;
  }) {
    const db = this.inviteLinkRawWriteClient();
    const timestamp = new Date();

    if (typeof db.$executeRaw !== 'function') {
      if (params.existingId) {
        return this.prisma.telegramInviteLink.update({
          where: { id: params.existingId },
          data: {
            ...(params.update as Prisma.TelegramInviteLinkUncheckedUpdateInput),
            updatedAt: timestamp,
          },
          select: this.inviteLinkSyncUpsertSelect,
        });
      }

      return this.prisma.telegramInviteLink.create({
        data: {
          id: randomUUID(),
          ...(params.create as Prisma.TelegramInviteLinkUncheckedCreateInput),
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        select: this.inviteLinkSyncUpsertSelect,
      });
    }

    if (params.existingId) {
      const updateData = {
        ...params.update,
        updatedAt: timestamp,
      };
      const assignments = Object.entries(updateData).map(([column, value]) =>
        Prisma.sql`${Prisma.raw(`"${column}"`)} = ${this.inviteLinkLegacyColumnValue(column, value)}`,
      );

      await db.$executeRaw(Prisma.sql`
        UPDATE "TelegramInviteLink"
        SET ${Prisma.join(assignments, ', ')}
        WHERE "id" = ${params.existingId}
      `);
    } else {
      const insertData = {
        id: randomUUID(),
        ...params.create,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const columns = Object.keys(insertData).map((column) => Prisma.raw(`"${column}"`));
      const values = Object.entries(insertData).map(([column, value]) =>
        this.inviteLinkLegacyColumnValue(column, value),
      );

      await db.$executeRaw(Prisma.sql`
        INSERT INTO "TelegramInviteLink" (${Prisma.join(columns, ', ')})
        VALUES (${Prisma.join(values, ', ')})
      `);
    }

    const persisted = await this.prisma.telegramInviteLink.findFirst({
      where: {
        workspaceId: String(params.create.workspaceId),
        telegramChannelId: String(params.create.telegramChannelId),
        url: String(params.create.url),
      },
      select: this.inviteLinkSyncUpsertSelect,
    });
    if (!persisted) {
      throw new InternalServerErrorException(
        'Invite link was written via legacy path but could not be reloaded.',
      );
    }
    return persisted;
  }

  private async findInviteLinksWithRequestedCountFallback(params: {
    workspaceId: string;
    where: Prisma.TelegramInviteLinkWhereInput;
    orderBy?:
      | Prisma.TelegramInviteLinkOrderByWithRelationInput
      | Prisma.TelegramInviteLinkOrderByWithRelationInput[];
  }) {
    const run = async (includeRequestedCount: boolean) => {
      const links = await this.prisma.telegramInviteLink.findMany({
        where: params.where,
        orderBy: params.orderBy,
        select: this.inviteLinkReadSelect(includeRequestedCount),
      });
      return this.normalizeInviteLinksRequestedCount(links);
    };

    if (this.telegramInviteLinkRequestedCountColumnAvailable === false) {
      return run(false);
    }

    try {
      return await run(this.supportsTelegramInviteLinkRequestedCount());
    } catch (error) {
      const reason = this.requestedCountCompatibilityReason(error);
      if (reason !== 'database_column_missing') {
        throw error;
      }
      this.telegramInviteLinkRequestedCountColumnAvailable = false;
      const repaired =
        await this.ensureTelegramInviteLinkRequestedCountColumnAvailable();
      return repaired ? run(true) : run(false);
    }
  }

  private async updateInviteLinkWithRequestedCountFallback(params: {
    where: Prisma.TelegramInviteLinkWhereUniqueInput;
    data: Prisma.TelegramInviteLinkUncheckedUpdateInput;
  }) {
    const run = async (includeRequestedCount: boolean) => {
      const link = await this.prisma.telegramInviteLink.update({
        where: params.where,
        data: params.data,
        select: this.inviteLinkReadSelect(includeRequestedCount),
      });
      return this.normalizeInviteLinkRequestedCount(link);
    };

    if (this.telegramInviteLinkRequestedCountColumnAvailable === false) {
      return run(false);
    }

    try {
      return await run(this.supportsTelegramInviteLinkRequestedCount());
    } catch (error) {
      const reason = this.requestedCountCompatibilityReason(error);
      if (reason !== 'database_column_missing') {
        throw error;
      }
      this.telegramInviteLinkRequestedCountColumnAvailable = false;
      const repaired =
        await this.ensureTelegramInviteLinkRequestedCountColumnAvailable();
      return repaired ? run(true) : run(false);
    }
  }

  private async persistInviteLinkWithoutRequestedCount(params: {
    workspaceId: string;
    channelId: string;
    url: string;
    create: Record<string, unknown>;
    update: Record<string, unknown>;
    existingId?: string;
  }) {
    const { requestedCount: _ignoredCreate, ...createWithoutRequestedCount } =
      params.create;
    const { requestedCount: _ignoredUpdate, ...updateWithoutRequestedCount } =
      params.update;

    this.logger.warn(
      `Invite-link sync is using legacy persistence without requestedCount for channel=${params.channelId} url=${params.url} existing=${Boolean(params.existingId)}`,
    );

    if (params.existingId) {
      return this.persistInviteLinkWithoutRequestedCountRaw({
        create: createWithoutRequestedCount,
        update: updateWithoutRequestedCount,
        existingId: params.existingId,
      });
    }

    return this.persistInviteLinkWithoutRequestedCountRaw({
      create: createWithoutRequestedCount,
      update: updateWithoutRequestedCount,
    });
  }

  private async upsertInviteLinkWithRequestedCountFallback(params: {
    workspaceId: string;
    channelId: string;
    url: string;
    create: Record<string, unknown>;
    update: Record<string, unknown>;
    existingId?: string;
  }) {
    if (!this.canWriteTelegramInviteLinkRequestedCount()) {
      return this.persistInviteLinkWithoutRequestedCount(params);
    }

    try {
      return await this.prisma.telegramInviteLink.upsert({
        where: {
          workspaceId_telegramChannelId_url: {
            workspaceId: params.workspaceId,
            telegramChannelId: params.channelId,
            url: params.url,
          },
        },
        create: params.create as never,
        update: params.update as never,
        select: this.inviteLinkSyncUpsertSelect,
      });
    } catch (error) {
      if (!this.isRequestedCountUnsupportedPrismaError(error)) {
        throw error;
      }

      const reason = this.requestedCountCompatibilityReason(error);
      if (reason === 'database_column_missing') {
        this.telegramInviteLinkRequestedCountColumnAvailable = false;
        const repaired =
          await this.ensureTelegramInviteLinkRequestedCountColumnAvailable();
        if (repaired) {
          return this.prisma.telegramInviteLink.upsert({
            where: {
              workspaceId_telegramChannelId_url: {
                workspaceId: params.workspaceId,
                telegramChannelId: params.channelId,
                url: params.url,
              },
            },
            create: params.create as never,
            update: params.update as never,
            select: this.inviteLinkSyncUpsertSelect,
          });
        }
        return this.persistInviteLinkWithoutRequestedCount(params);
      }

      // Dev watch can serve a still-running process with an outdated Prisma client,
      // and local/dev databases can lag behind the checked-in Prisma schema.
      // Retry without the new field instead of failing the stream.
      this.logger.warn(
        `Invite-link sync is retrying without requestedCount for channel=${params.channelId} url=${params.url} reason=${reason} runtimeSupportsRequestedCount=${this.supportsTelegramInviteLinkRequestedCount()} dbColumnAvailable=${this.telegramInviteLinkRequestedCountColumnAvailable !== false}`,
      );

      return this.prisma.telegramInviteLink.upsert({
        where: {
          workspaceId_telegramChannelId_url: {
            workspaceId: params.workspaceId,
            telegramChannelId: params.channelId,
            url: params.url,
          },
        },
        create: (({ requestedCount: _ignored, ...rest }) => rest)(
          params.create,
        ) as never,
        update: (({ requestedCount: _ignored, ...rest }) => rest)(
          params.update,
        ) as never,
        select: this.inviteLinkSyncUpsertSelect,
      });
    }
  }

  private renderManagedPostText(
    text: string,
    imageUrls: string[],
    longTextMode: 'IMAGES_THEN_TEXT' | 'CAPTION_THEN_TEXT' = 'IMAGES_THEN_TEXT',
  ): ManagedPostPublishRender {
    const html = telegramMarkupToHtml(text);
    const [plainText] = HTMLParser.parse(html);
    let captionHtml = html;
    let followupHtmlParts: string[] = [];
    let textHtmlParts = [html];
    let publishMode = imageUrls.length ? 'IMAGE_WITH_CAPTION' : 'TEXT_ONLY';

    if (imageUrls.length && plainText.length > TELEGRAM_CAPTION_LIMIT) {
      publishMode = longTextMode;
      if (longTextMode === 'CAPTION_THEN_TEXT') {
        const [caption, remainder] = this.splitTelegramMarkupOnce(
          text,
          TELEGRAM_CAPTION_LIMIT,
        );
        captionHtml = telegramMarkupToHtml(caption);
        followupHtmlParts = this.splitTelegramMarkup(
          remainder,
          TELEGRAM_TEXT_MESSAGE_LIMIT,
        ).map((part) => telegramMarkupToHtml(part));
      } else {
        captionHtml = '';
        followupHtmlParts = this.splitTelegramMarkup(
          text,
          TELEGRAM_TEXT_MESSAGE_LIMIT,
        ).map((part) => telegramMarkupToHtml(part));
      }
    } else if (
      !imageUrls.length &&
      plainText.length > TELEGRAM_TEXT_MESSAGE_LIMIT
    ) {
      publishMode = 'TEXT_PARTS';
      textHtmlParts = this.splitTelegramMarkup(
        text,
        TELEGRAM_TEXT_MESSAGE_LIMIT,
      ).map((part) => telegramMarkupToHtml(part));
    }

    return {
      html,
      captionHtml,
      followupHtmlParts,
      textHtmlParts,
      publishMode,
    };
  }

  private sameImageUrls(left: string[], right: string[]) {
    return (
      left.length === right.length &&
      left.every((value, index) => value === right[index])
    );
  }

  private managedPostRevisionData(
    post: ManagedPostRevisionSource,
    reason: string,
  ) {
    return {
      telegramManagedPostId: post.id,
      workspaceId: post.workspaceId,
      telegramChannelId: post.telegramChannelId,
      title: post.title,
      text: post.text,
      imageUrls: [...post.imageUrls],
      status: post.status,
      scheduledAt: post.scheduledAt,
      publishedAt: post.publishedAt,
      telegramMessageIds: [...post.telegramMessageIds],
      telegramMessageUrls: [...post.telegramMessageUrls],
      telegramRemoteStatus: post.telegramRemoteStatus,
      lastTelegramSyncedAt: post.lastTelegramSyncedAt,
      lastTelegramSyncNote: post.lastTelegramSyncNote,
      sourceType: post.sourceType,
      sourceId: post.sourceId,
      publishMode: post.publishMode,
      lastError: post.lastError,
      assignedMemberId: post.assignedMemberId,
      icon: post.icon,
      groupId: post.groupId,
      groupPosition: post.groupPosition,
      sidebarPosition: post.sidebarPosition,
      reason,
    };
  }

  private managedPostRevisionDelegate(
    client: Prisma.TransactionClient | PrismaService,
  ) {
    return (client as PrismaService & {
      telegramManagedPostRevision: {
        create: (args: { data: ReturnType<typeof this.managedPostRevisionData> }) => Promise<unknown>;
        deleteMany: (args: { where: Record<string, unknown> }) => Promise<unknown>;
        findMany: (args: Record<string, unknown>) => Promise<unknown>;
        findFirst: (args: Record<string, unknown>) => Promise<unknown>;
      };
    }).telegramManagedPostRevision;
  }

  private managedPostRevisionQueryClient(
    client: Prisma.TransactionClient | PrismaService,
  ) {
    return client as Prisma.TransactionClient & {
      $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]): Promise<T>;
      $executeRaw(query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]): Promise<number>;
    };
  }

  private isManagedPostRevisionTableMissing(error: unknown) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
    if (error.code === 'P2021') return true;
    if (error.code !== 'P2010') return false;
    const originalCode =
      (
        error.meta as
          | {
              driverAdapterError?: {
                cause?: { originalCode?: string };
              };
            }
          | undefined
      )?.driverAdapterError?.cause?.originalCode ?? null;
    return originalCode === '42P01';
  }

  private async hasManagedPostRevisionStorage() {
    if (this.managedPostRevisionStorageState === 'available') return true;
    if (this.managedPostRevisionStorageState === 'missing') return false;
    try {
      const rows = await this.prisma.$queryRaw<Array<{ exists: string | null }>>(
        Prisma.sql`
          SELECT to_regclass('"TelegramManagedPostRevision"')::text AS "exists"
        `,
      );
      const exists = Boolean(rows[0]?.exists);
      this.managedPostRevisionStorageState = exists ? 'available' : 'missing';
      return exists;
    } catch (error) {
      if (this.isManagedPostRevisionTableMissing(error)) {
        this.managedPostRevisionStorageState = 'missing';
        return false;
      }
      throw error;
    }
  }

  private async insertManagedPostRevisionRaw(
    client: Prisma.TransactionClient | PrismaService,
    data: ReturnType<typeof this.managedPostRevisionData>,
  ) {
    const db = this.managedPostRevisionQueryClient(client);
    const revisionId = randomUUID();
    try {
      await db.$executeRaw(Prisma.sql`
        INSERT INTO "TelegramManagedPostRevision" (
          "id",
          "telegramManagedPostId",
          "workspaceId",
          "telegramChannelId",
          "title",
          "text",
          "imageUrls",
          "status",
          "scheduledAt",
          "publishedAt",
          "telegramMessageIds",
          "telegramMessageUrls",
          "telegramRemoteStatus",
          "lastTelegramSyncedAt",
          "lastTelegramSyncNote",
          "sourceType",
          "sourceId",
          "publishMode",
          "lastError",
          "assignedMemberId",
          "icon",
          "groupId",
          "groupPosition",
          "sidebarPosition",
          "reason"
        ) VALUES (
          ${revisionId},
          ${data.telegramManagedPostId},
          ${data.workspaceId},
          ${data.telegramChannelId},
          ${data.title},
          ${data.text},
          ${data.imageUrls},
          CAST(${data.status} AS "TelegramManagedPostStatus"),
          ${data.scheduledAt},
          ${data.publishedAt},
          ${data.telegramMessageIds},
          ${data.telegramMessageUrls},
          CAST(${data.telegramRemoteStatus} AS "TelegramManagedPostRemoteStatus"),
          ${data.lastTelegramSyncedAt},
          ${data.lastTelegramSyncNote},
          ${data.sourceType ? Prisma.sql`CAST(${data.sourceType} AS "TelegramSourceType")` : Prisma.sql`NULL`},
          ${data.sourceId},
          ${data.publishMode},
          ${data.lastError},
          ${data.assignedMemberId},
          ${data.icon},
          ${data.groupId},
          ${data.groupPosition},
          ${data.sidebarPosition},
          ${data.reason}
        )
      `);
    } catch (error) {
      if (this.isManagedPostRevisionTableMissing(error)) {
        this.managedPostRevisionStorageState = 'missing';
        return false;
      }
      throw error;
    }
    this.managedPostRevisionStorageState = 'available';
    return true;
  }

  private async listManagedPostRevisions(
    client: Prisma.TransactionClient | PrismaService,
    where: { telegramManagedPostId: string; workspaceId: string },
  ) {
    const delegate = this.managedPostRevisionDelegate(client);
    if (delegate) {
      try {
        return (await delegate.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: 30,
        })) as ManagedPostRevisionRecord[];
      } catch (error) {
        if (this.isManagedPostRevisionTableMissing(error)) {
          this.managedPostRevisionStorageState = 'missing';
          return [];
        }
        throw error;
      }
    }
    const db = this.managedPostRevisionQueryClient(client);
    try {
      return await db.$queryRaw<ManagedPostRevisionRecord[]>(Prisma.sql`
        SELECT *
        FROM "TelegramManagedPostRevision"
        WHERE "telegramManagedPostId" = ${where.telegramManagedPostId}
          AND "workspaceId" = ${where.workspaceId}
        ORDER BY "createdAt" DESC
        LIMIT 30
      `);
    } catch (error) {
      if (this.isManagedPostRevisionTableMissing(error)) {
        this.managedPostRevisionStorageState = 'missing';
        return [];
      }
      throw error;
    }
  }

  private async findManagedPostRevision(
    client: Prisma.TransactionClient | PrismaService,
    where: {
      id: string;
      telegramManagedPostId: string;
      workspaceId: string;
      telegramChannelId: string;
    },
  ) {
    const delegate = this.managedPostRevisionDelegate(client);
    if (delegate) {
      try {
        return (await delegate.findFirst({
          where,
        })) as ManagedPostRevisionRecord | null;
      } catch (error) {
        if (this.isManagedPostRevisionTableMissing(error)) {
          this.managedPostRevisionStorageState = 'missing';
          return null;
        }
        throw error;
      }
    }
    const db = this.managedPostRevisionQueryClient(client);
    let rows: ManagedPostRevisionRecord[];
    try {
      rows = await db.$queryRaw<ManagedPostRevisionRecord[]>(Prisma.sql`
        SELECT *
        FROM "TelegramManagedPostRevision"
        WHERE "id" = ${where.id}
          AND "telegramManagedPostId" = ${where.telegramManagedPostId}
          AND "workspaceId" = ${where.workspaceId}
          AND "telegramChannelId" = ${where.telegramChannelId}
        LIMIT 1
      `);
    } catch (error) {
      if (this.isManagedPostRevisionTableMissing(error)) {
        this.managedPostRevisionStorageState = 'missing';
        return null;
      }
      throw error;
    }
    return rows[0] ?? null;
  }

  private async deleteExpiredManagedPostRevisions(
    client: Prisma.TransactionClient | PrismaService,
    postId: string,
  ) {
    const cutoff = new Date(Date.now() - this.managedPostRevisionRetentionMs);
    const delegate = this.managedPostRevisionDelegate(client);
    if (delegate) {
      try {
        await delegate.deleteMany({
          where: {
            telegramManagedPostId: postId,
            createdAt: { lt: cutoff },
          },
        });
      } catch (error) {
        if (this.isManagedPostRevisionTableMissing(error)) {
          this.managedPostRevisionStorageState = 'missing';
          return;
        }
        throw error;
      }
      return;
    }
    const db = this.managedPostRevisionQueryClient(client);
    try {
      await db.$executeRaw(Prisma.sql`
        DELETE FROM "TelegramManagedPostRevision"
        WHERE "telegramManagedPostId" = ${postId}
          AND "createdAt" < ${cutoff}
      `);
    } catch (error) {
      if (this.isManagedPostRevisionTableMissing(error)) {
        this.managedPostRevisionStorageState = 'missing';
        return;
      }
      throw error;
    }
  }

  private async createManagedPostRevision(
    client: Prisma.TransactionClient | PrismaService,
    post: ManagedPostRevisionSource,
    reason: string,
  ) {
    const storageAvailable = await this.hasManagedPostRevisionStorage();
    if (!storageAvailable) return;
    const data = this.managedPostRevisionData(post, reason);
    const delegate = this.managedPostRevisionDelegate(client);
    if (delegate) {
      try {
        await delegate.create({ data });
      } catch (error) {
        if (this.isManagedPostRevisionTableMissing(error)) {
          this.managedPostRevisionStorageState = 'missing';
          return;
        }
        throw error;
      }
    } else {
      const inserted = await this.insertManagedPostRevisionRaw(client, data);
      if (!inserted) return;
    }
    await this.deleteExpiredManagedPostRevisions(client, post.id);
  }

  private async editManagedPostTextInTelegram(params: {
    workspaceId: string;
    channelId: string;
    post: {
      id: string;
      status: TelegramManagedPostStatus;
      text: string | null;
      imageUrls: string[];
      publishMode: string | null;
      sourceId: string | null;
      sourceType: TelegramSourceType | null;
      scheduledAt: Date | null;
      telegramMessageIds: string[];
      telegramMessageUrls: string[];
    };
    channel: {
      id: string;
      workspaceId: string;
      username: string | null;
      telegramChatId: string | null;
      inviteLink?: string | null;
      telegramAccessHash?: string | null;
    };
    nextText: string;
  }) {
    const { workspaceId, channelId, post, channel, nextText } = params;
    if (
      post.status !== TelegramManagedPostStatus.PUBLISHED &&
      post.status !== TelegramManagedPostStatus.SCHEDULED
    ) {
      return null;
    }

    const effectiveMessageIds = post.telegramMessageIds.length
      ? [...post.telegramMessageIds]
      : [
          ...new Set(
            post.telegramMessageUrls.flatMap((url) => {
              const parsed = parseTelegramPostUrl(url);
              return parsed ? [parsed.messageId] : [];
            }),
          ),
        ];
    if (!effectiveMessageIds.length) {
      throw new BadRequestException(
        'This Telegram post cannot be updated because no Telegram message link is attached yet.',
      );
    }

    const sources = await this.sourceAccessService.sourcesForChannel(
      workspaceId,
      channelId,
    );
    const source =
      (post.sourceId && post.sourceType
        ? sources.find(
            (item) =>
              item.sourceId === post.sourceId &&
              item.sourceType === post.sourceType &&
              item.permissions.canEditMessages,
          )
        : undefined) ??
      sources.find(
        (item) =>
          item.sourceType === TelegramSourceType.MTPROTO &&
          item.permissions.canEditMessages,
      ) ??
      sources.find(
        (item) =>
          item.sourceType === TelegramSourceType.BOT &&
          item.permissions.canEditMessages,
      );
    if (!source) {
      throw new BadRequestException(
        'No connected Telegram source has permission to edit this post.',
      );
    }

    const channelReference = this.mtprotoChannelReference(channel);
    if (!channelReference.telegramChatId && !channelReference.username)
      throw new BadRequestException('Channel has no Telegram reference');

    const resolvedText = await this.resolveInternalPostLinksForPublish(
      workspaceId,
      post.id,
      nextText,
      post.status === TelegramManagedPostStatus.SCHEDULED
        ? post.scheduledAt || undefined
        : undefined,
    );
    const rendered = this.renderManagedPostText(
      resolvedText,
      post.imageUrls,
      post.publishMode === 'CAPTION_THEN_TEXT'
        ? 'CAPTION_THEN_TEXT'
        : 'IMAGES_THEN_TEXT',
    );
    const expectedMessageCount = post.imageUrls.length
      ? post.imageUrls.length + rendered.followupHtmlParts.length
      : rendered.textHtmlParts.length;
    if (expectedMessageCount !== effectiveMessageIds.length) {
      throw new BadRequestException(
        'Text update would change the number of Telegram messages. Keep the same message count or republish the post.',
      );
    }

    if (source.sourceType === TelegramSourceType.MTPROTO) {
      const account = await this.connectedAccount(
        workspaceId,
        channelId,
        source.sourceId,
      );
      const editResult = await this.mtprotoClient.editPostText({
        ...this.accountCredentials(account),
        channel: channelReference,
        messageIds: effectiveMessageIds,
        imageCount: post.imageUrls.length,
        publishMode: rendered.publishMode,
        captionHtml: rendered.captionHtml,
        followupHtmlParts: rendered.followupHtmlParts,
        textHtmlParts: rendered.textHtmlParts,
      });
      return {
        sourceId: source.sourceId,
        sourceType: source.sourceType,
        telegramMessageIds: effectiveMessageIds,
        publishMode: rendered.publishMode,
        lastTelegramSyncedAt: new Date(),
        lastTelegramSyncNote: this.telegramTextEditNote(editResult),
      };
    }

    const bot = await this.prisma.telegramBotIntegration.findFirst({
      where: { id: source.sourceId, workspaceId, isActive: true },
    });
    if (!bot) throw new BadRequestException('Telegram bot is not connected');
    const token = this.encryptionService.decrypt({
      encrypted: bot.botTokenEncrypted,
      iv: bot.botTokenIv,
      authTag: bot.botTokenAuthTag,
    });
    const chatId = this.botChatId(channel);
    if (!chatId) {
      throw new BadRequestException('Channel has no Telegram chat id');
    }
    let updatedCount = 0;
    let unchangedCount = 0;
    const call = async (method: string, body: Record<string, unknown>) => {
      const response = await fetch(
        `https://api.telegram.org/bot${token}/${method}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, ...body }),
        },
      );
      const payload = (await response.json()) as {
        ok?: boolean;
        description?: string;
      };
      if (!response.ok || !payload.ok) {
        if (this.isBotMessageNotModified(payload.description)) {
          unchangedCount += 1;
          return false;
        }
        throw new BadRequestException(
          payload.description || 'Telegram Bot API edit failed',
        );
      }
      updatedCount += 1;
      return true;
    };
    const toBotFormattedText = (html: string) => {
      const [text, entities] = HTMLParser.parse(
        telegramHtmlToMtprotoHtml(html),
      );
      return {
        text,
        entities: entities
          .map((entity) => this.toBotMessageEntity(entity))
          .filter((entity): entity is BotMessageEntity => Boolean(entity)),
      };
    };
    if (post.imageUrls.length) {
      const caption = toBotFormattedText(rendered.captionHtml);
      await call('editMessageCaption', {
        message_id: Number(effectiveMessageIds[0]),
        caption: caption.text,
        caption_entities: caption.entities,
      });
      for (let index = 0; index < rendered.followupHtmlParts.length; index += 1) {
        const message = toBotFormattedText(rendered.followupHtmlParts[index]);
        await call('editMessageText', {
          message_id: Number(effectiveMessageIds[post.imageUrls.length + index]),
          text: message.text,
          entities: message.entities,
        });
      }
    } else {
      for (let index = 0; index < rendered.textHtmlParts.length; index += 1) {
        const message = toBotFormattedText(rendered.textHtmlParts[index]);
        await call('editMessageText', {
          message_id: Number(effectiveMessageIds[index]),
          text: message.text,
          entities: message.entities,
        });
      }
    }

    return {
      sourceId: source.sourceId,
      sourceType: source.sourceType,
      telegramMessageIds: effectiveMessageIds,
      publishMode: rendered.publishMode,
      lastTelegramSyncedAt: new Date(),
      lastTelegramSyncNote: this.telegramTextEditNote({
        updatedCount,
        unchangedCount,
      }),
    };
  }

  private async postSyncLimitForChannel(channelId: string) {
    const existingPosts = await this.prisma.telegramPost.count({
      where: { telegramChannelId: channelId },
    });
    return existingPosts > 0
      ? this.defaultPostSyncLimit
      : this.initialPostBackfillLimit;
  }

  private async runInitialImportBackfill(params: {
    userId: string;
    workspaceId: string;
    channelId: string;
    accountId: string;
  }) {
    try {
      const historical = await this.syncHistorical(
        params.userId,
        params.channelId,
        {
          telegramUserAccountId: params.accountId,
          syncInviteLinks: true,
          syncPosts: true,
          postLimit: this.initialPostBackfillLimit,
        },
      );
      const postsMetricsSync = await this.syncPostsMetricsForWorkspace(
        params.workspaceId,
        params.channelId,
        {
          telegramUserAccountId: params.accountId,
          postLimit: this.initialPostBackfillLimit,
        },
      );
      const olderPostsBackfill =
        await this.syncOlderPostsMetricsBackfillForWorkspace(
          params.workspaceId,
          params.channelId,
          {
            telegramUserAccountId: params.accountId,
            maxPages: this.olderPostBackfillMaxPages,
          },
        );
      const channelStatsSync = await this.syncBroadcastStatsForWorkspace(
        params.workspaceId,
        params.channelId,
        params.accountId,
      );
      return {
        success: true,
        historical,
        postsMetricsSync,
        olderPostsBackfill,
        channelStatsSync,
      };
    } catch (error) {
      this.logger.warn(
        `Initial Telegram import backfill skipped for channel=${params.channelId}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : 'unknown error',
      };
    }
  }

  private async firstConnectedAccount(workspaceId: string) {
    const account = await this.prisma.telegramUserAccountIntegration.findFirst({
      where: {
        workspaceId,
        isActive: true,
        status: TelegramUserAccountStatus.connected,
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!account) {
      throw new BadRequestException(
        'Connect an active Telegram user account before importing public channels',
      );
    }
    return account;
  }

  private async findMatchingChannels(
    workspaceId: string,
    username: string | null,
    telegramChatId: string | null,
  ) {
    if (!username && !telegramChatId) return [];
    const normalizedChatId = this.normalizeChatId(telegramChatId);
    const candidates = await this.prisma.telegramChannel.findMany({
      where: {
        workspaceId,
        OR: [
          ...(username ? [{ username: { not: null } }] : []),
          ...(telegramChatId ? [{ telegramChatId: { not: null } }] : []),
        ],
      },
      include: { adminLinks: true },
      orderBy: { createdAt: 'asc' },
    });
    return candidates.filter((channel) => {
      const sameUsername =
        username && this.normalizeUsername(channel.username) === username;
      const sameChatId =
        normalizedChatId &&
        this.normalizeChatId(channel.telegramChatId) === normalizedChatId;
      return Boolean(sameUsername || sameChatId);
    });
  }

  private async upsertImportedPerson(
    workspaceId: string,
    info: {
      title: string;
      username: string | null;
      description?: string | null;
      photoUrl?: string | null;
    },
  ) {
    const existing = info.username
      ? await this.prisma.advertisingSource.findFirst({
          where: {
            workspaceId,
            type: { not: 'telegram_channel' },
            telegramUsername: info.username,
          },
        })
      : null;
    const data = {
      workspaceId,
      name: info.title,
      type: 'direct' as const,
      url: info.username ? `https://t.me/${info.username}` : undefined,
      telegramUsername: info.username || undefined,
      description: info.description || undefined,
      imageUrl: info.photoUrl || undefined,
      subscribersCount: 0,
    };
    const row = existing
      ? await this.prisma.advertisingSource.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.advertisingSource.create({ data });
    return {
      id: row.id,
      selectionId: `source:${row.id}`,
      kind: 'person',
      title: row.name,
      telegramUrl: row.url,
      username: row.telegramUsername,
      contactInfo: row.contactInfo,
      notes: row.notes,
      imageUrl: row.imageUrl,
      subscribersCount: 0,
      channelTags: Array.isArray(row.channelTags) ? row.channelTags : [],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private pickCanonicalChannel(
    channels: Array<{ id: string; adminLinks?: unknown[]; createdAt: Date }>,
  ) {
    return [...channels].sort((left, right) => {
      const leftAdmin = (left.adminLinks?.length || 0) > 0 ? 0 : 1;
      const rightAdmin = (right.adminLinks?.length || 0) > 0 ? 0 : 1;
      if (leftAdmin !== rightAdmin) return leftAdmin - rightAdmin;
      return left.createdAt.getTime() - right.createdAt.getTime();
    })[0];
  }

  private async mergeDuplicateChannels(
    tx: any,
    workspaceId: string,
    canonicalId: string,
    duplicateIds: string[],
  ) {
    if (!duplicateIds.length) return;
    const adminLinks = await tx.telegramChannelAdminLink.findMany({
      where: { workspaceId, telegramChannelId: { in: duplicateIds } },
      select: { telegramUserAccountIntegrationId: true, source: true },
    });
    if (adminLinks.length) {
      await tx.telegramChannelAdminLink.createMany({
        data: adminLinks.map((link: any) => ({
          workspaceId,
          telegramChannelId: canonicalId,
          telegramUserAccountIntegrationId:
            link.telegramUserAccountIntegrationId,
          source: link.source || 'mtproto',
        })),
        skipDuplicates: true,
      });
    }

    const placements = await tx.adCampaignTelegramChannelPlacement.findMany({
      where: { telegramChannelId: { in: duplicateIds } },
      select: { adCampaignId: true },
    });
    if (placements.length) {
      await tx.adCampaignTelegramChannelPlacement.createMany({
        data: placements.map((placement: any) => ({
          adCampaignId: placement.adCampaignId,
          telegramChannelId: canonicalId,
        })),
        skipDuplicates: true,
      });
    }

    await tx.telegramChannelAdminLink.deleteMany({
      where: { workspaceId, telegramChannelId: { in: duplicateIds } },
    });
    await tx.adCampaignTelegramChannelPlacement.deleteMany({
      where: { telegramChannelId: { in: duplicateIds } },
    });
    await tx.adCampaign.updateMany({
      where: { workspaceId, telegramChannelId: { in: duplicateIds } },
      data: { telegramChannelId: canonicalId },
    });
    await tx.telegramInviteLink.updateMany({
      where: { workspaceId, telegramChannelId: { in: duplicateIds } },
      data: { telegramChannelId: canonicalId },
    });
    await tx.promo.updateMany({
      where: { workspaceId, telegramChannelId: { in: duplicateIds } },
      data: { telegramChannelId: canonicalId },
    });
    await tx.telegramChannel.updateMany({
      where: { workspaceId, id: { in: duplicateIds } },
      data: { isActive: false },
    });
  }

  async findAll(userId: string) {
    const workspaceId = await this.workspace(userId);
    const loadChannels = () =>
      this.prisma.telegramChannel.findMany({
        where: { workspaceId, isActive: true },
        include: {
          assignedMember: WorkspaceService.assignedMemberInclude,
          createdByUser: WorkspaceService.createdByUserInclude,
          adAnalyses: {
            orderBy: { analyzedAt: 'desc' },
            take: 1,
            include: {
              assignedMember: WorkspaceService.assignedMemberInclude,
            },
          },
          _count: { select: { adAnalyses: true } },
          adminLinks: { include: { telegramUserAccountIntegration: true } },
          sourceAccesses: { select: { id: true, canPostMessages: true } },
          audienceSnapshots: {
            orderBy: { collectedAt: 'desc' },
            take: 1,
            select: {
              subscribersCount: true,
              activeSubscribersEstimate: true,
              viewRate: true,
              dataQuality: true,
              dataQualityReason: true,
              hasExternalTrafficAnomaly: true,
              hasSubscriberBasePollution: true,
              postsWindow: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    let channels;
    try {
      channels = await loadChannels();
    } catch (error) {
      if (!this.isMissingTelegramChannelSyncScopeColumn(error)) throw error;
      this.telegramChannelSyncScopeColumnsAvailable = false;
      await this.ensureTelegramChannelSyncScopeColumnsAvailable();
      channels = await loadChannels();
    }

    if (!channels.length) return channels;

    const channelIds = channels.map((channel) => channel.id);
    const [campaigns, inviteLinks, timePostsByChannel] = await Promise.all([
      this.prisma.adCampaign.findMany({
        where: {
          workspaceId,
          telegramChannelId: { in: channelIds },
          excludeFromAnalytics: false,
        },
        include: {
          inviteLinks: { select: { joinedCount: true, requestedCount: true } },
        },
      }),
      this.prisma.telegramInviteLink.findMany({
        where: { workspaceId, telegramChannelId: { in: channelIds } },
        select: {
          id: true,
          telegramChannelId: true,
          joinedCount: true,
          requestedCount: true,
        },
      }),
      this.timePostsByChannelIds(channelIds),
    ]);

    const campaignsByChannel = new Map<string, typeof campaigns>();
    for (const campaign of campaigns) {
      const items = campaignsByChannel.get(campaign.telegramChannelId) ?? [];
      items.push(campaign);
      campaignsByChannel.set(campaign.telegramChannelId, items);
    }
    const inviteLinksByChannel = new Map<string, typeof inviteLinks>();
    for (const link of inviteLinks) {
      const items = inviteLinksByChannel.get(link.telegramChannelId) ?? [];
      items.push(link);
      inviteLinksByChannel.set(link.telegramChannelId, items);
    }

    return channels.map((channel) => {
      const {
        sourceAccesses,
        audienceSnapshots,
        adAnalyses,
        _count,
        ...channelData
      } = channel;
      const snapshot = audienceSnapshots[0];
      const audience = {
        subscribersCount:
          snapshot?.subscribersCount ?? channel.currentSubscribersCount ?? null,
        activeSubscribersEstimate: snapshot?.activeSubscribersEstimate ?? null,
        paidActiveSubscribersEstimate:
          snapshot?.activeSubscribersEstimate ?? null,
        viewRate: snapshot?.viewRate ?? null,
        dataQuality: snapshot?.dataQuality ?? null,
        dataQualityReason: snapshot?.dataQualityReason ?? null,
        dataQualityWarning: null,
        rawViewRate: null,
        subscriberBaseQuality: null,
        hasExternalTrafficAnomaly: snapshot?.hasExternalTrafficAnomaly ?? false,
        hasSubscriberBasePollution:
          snapshot?.hasSubscriberBasePollution ?? false,
        postsWindow: snapshot?.postsWindow ?? channel.activeSubscribersWindow,
      };
      const channelCampaigns = campaignsByChannel.get(channel.id) ?? [];
      const channelInviteLinks = inviteLinksByChannel.get(channel.id) ?? [];
      const selectedInviteLinks = new Map(
        channelInviteLinks.map((link) => [
          link.id,
          inviteLinkAttributedSubscribers(link),
        ]),
      );
      const totalAdSpend = channelCampaigns.reduce(
        (sum, campaign) => sum + Number(campaign.priceInPrimaryCurrency || 0),
        0,
      );
      const totalJoinedSubscribers = channelCampaigns.reduce(
        (sum, campaign) => {
          const selectedLinkId = String(
            campaign.telegramInviteLinkId || '',
          ).trim();
          if (selectedLinkId && selectedInviteLinks.has(selectedLinkId)) {
            return sum + Number(selectedInviteLinks.get(selectedLinkId) || 0);
          }
          const campaignJoined = Number(campaign.joinedCount || 0);
          const linkedJoined = sumInviteLinkAttributedSubscribers(
            campaign.inviteLinks,
          );
          return (
            sum +
            Math.max(
              campaignJoined,
              linkedJoined,
              Number(campaign.newSubscribers || 0),
            )
          );
        },
        0,
      );
      const paidFromCampaigns = channelCampaigns.reduce(
        (sum, campaign) => sum + Number(campaign.activeSubscribersFromAd || 0),
        0,
      );
      const paidActiveSubscribersEstimate =
        paidFromCampaigns || audience.paidActiveSubscribersEstimate || 0;
      const average = (values: Array<number | null>) => {
        const present = values.filter(
          (value): value is number => value != null && Number.isFinite(value),
        );
        return present.length
          ? present.reduce((sum, value) => sum + value, 0) / present.length
          : null;
      };
      const avgCpa =
        totalJoinedSubscribers > 0
          ? totalAdSpend / totalJoinedSubscribers
          : null;
      const targetFrom =
        channel.targetCpaFrom == null ? null : Number(channel.targetCpaFrom);
      const targetTo =
        channel.targetCpa == null ? null : Number(channel.targetCpa);
      const acceptableFrom =
        channel.acceptableCpaFrom == null
          ? null
          : Number(channel.acceptableCpaFrom);
      const acceptableTo =
        channel.acceptableCpa == null ? null : Number(channel.acceptableCpa);
      const stopFrom =
        channel.stopCpaFrom == null
          ? channel.stopCpa == null
            ? null
            : Number(channel.stopCpa)
          : Number(channel.stopCpaFrom);
      const inRange = (value: number, from: number | null, to: number | null) =>
        (from != null || to != null) &&
        (from == null || value >= from) &&
        (to == null || value <= to);
      const kpiStatus =
        avgCpa == null
          ? 'unknown'
          : inRange(avgCpa, targetFrom, targetTo)
            ? 'good'
            : inRange(avgCpa, acceptableFrom, acceptableTo)
              ? 'acceptable'
              : inRange(avgCpa, stopFrom, null)
                ? 'bad'
                : 'unknown';

      return {
        ...channelData,
        timePosts: timePostsByChannel.get(channel.id) ?? [],
        preview: {
          audience,
          sourcesCount: sourceAccesses.length || channel.adminLinks.length,
          canPostMessages: sourceAccesses.some(
            (source) => source.canPostMessages,
          ),
          adAnalysis: {
            latest: adAnalyses[0] ?? null,
            historyCount: _count.adAnalyses,
            metrics: adAnalyses[0]
              ? {
                  avgViews: adAnalyses[0].avgViews,
                  avgReactions: adAnalyses[0].avgReactions,
                  avgForwards: adAnalyses[0].avgForwards,
                  postsCount: adAnalyses[0].postsCount,
                  cpm: adAnalyses[0].cpm,
                }
              : undefined,
          },
          financialSummary: {
            totalAdSpend,
            campaignsCount: channelCampaigns.length,
            totalJoinedSubscribers,
            avgCpa,
            activeSubscribersEstimate: audience.activeSubscribersEstimate,
            paidActiveSubscribersEstimate,
            activeCpa:
              paidActiveSubscribersEstimate > 0
                ? totalAdSpend / paidActiveSubscribersEstimate
                : null,
            avgActiveRate: average(
              channelCampaigns.map((campaign) => campaign.activeRate),
            ),
            avgRetention7d: average(
              channelCampaigns.map((campaign) => campaign.retention7d),
            ),
            dataQuality: audience.dataQuality,
            dataQualityReason: audience.dataQualityReason,
            dataQualityWarning: null,
            hasExternalTrafficAnomaly: audience.hasExternalTrafficAnomaly,
            hasSubscriberBasePollution: audience.hasSubscriberBasePollution,
            kpiStatus,
            kpiLabel:
              kpiStatus === 'good'
                ? 'Good'
                : kpiStatus === 'acceptable'
                  ? 'Acceptable'
                  : kpiStatus === 'bad'
                    ? 'Stop'
                    : '-',
          },
        },
      };
    });
  }

  async findOne(userId: string, id: string) {
    const workspaceId = await this.workspace(userId);
    const loadChannel = () =>
      this.prisma.telegramChannel.findFirst({
        where: { id, workspaceId },
        include: {
          adminLinks: { include: { telegramUserAccountIntegration: true } },
          assignedMember: WorkspaceService.assignedMemberInclude,
          createdByUser: WorkspaceService.createdByUserInclude,
        },
      });
    let channel;
    let timePostsByChannel;
    try {
      [channel, timePostsByChannel] = await Promise.all([
        loadChannel(),
        this.timePostsByChannelIds([id]),
      ]);
    } catch (error) {
      if (!this.isMissingTelegramChannelSyncScopeColumn(error)) throw error;
      this.telegramChannelSyncScopeColumnsAvailable = false;
      await this.ensureTelegramChannelSyncScopeColumnsAvailable();
      [channel, timePostsByChannel] = await Promise.all([
        loadChannel(),
        this.timePostsByChannelIds([id]),
      ]);
    }
    if (!channel) throw new NotFoundException('Telegram channel not found');
    return {
      ...channel,
      timePosts: timePostsByChannel.get(channel.id) ?? [],
    };
  }

  async channelSources(userId: string, channelId: string) {
    const workspaceId = await this.workspace(userId);
    await this.findOne(userId, channelId);
    return this.sourceAccessService.sourcesForChannel(workspaceId, channelId);
  }

  async analyticsSources(userId: string, channelId: string) {
    const workspaceId = await this.workspace(userId);
    await this.findOne(userId, channelId);
    return this.sourceAccessService.analyticsSources(workspaceId, channelId);
  }

  async create(userId: string, dto: CreateTelegramChannelDto) {
    const { workspaceId, assignedMemberId } =
      await this.workspaceService.resolveAssignedMemberId(
        userId,
        dto.assignedMemberId,
      );
    return this.prisma.telegramChannel.create({
      data: {
        workspaceId,
        ...dto,
        username: this.normalizeUsername(dto.username),
        assignedMemberId,
        createdByUserId: userId,
      },
      include: {
        assignedMember: WorkspaceService.assignedMemberInclude,
        createdByUser: WorkspaceService.createdByUserInclude,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateTelegramChannelDto) {
    const workspaceId = await this.workspace(userId);
    await this.findOne(userId, id);
    const assignedMemberId =
      dto.assignedMemberId === undefined
        ? undefined
        : (
            await this.workspaceService.resolveAssignedMemberId(
              userId,
              dto.assignedMemberId,
            )
          ).assignedMemberId;
    const { timePosts: _timePosts, ...channelUpdateData } = dto;
    const normalizedTimePosts = dto.timePosts?.map((item, index) => ({
      id: randomUUID(),
      title: String(item.title || '').trim(),
      time: item.time,
      position: index,
      iconId: item.iconId ? String(item.iconId).trim() || null : null,
    }));
    if (normalizedTimePosts) {
      const iconIds = normalizedTimePosts
        .map((item) => item.iconId)
        .filter((iconId): iconId is string => Boolean(iconId));
      if (iconIds.length) {
        const icons = await this.prisma.icon.findMany({
          where: { workspaceId, id: { in: iconIds } },
          select: { id: true },
        });
        if (icons.length !== new Set(iconIds).size) {
          throw new BadRequestException('One or more time post icons are invalid');
        }
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.telegramChannel.update({
        where: { id },
        data: {
          ...channelUpdateData,
          username:
            dto.username === undefined
              ? undefined
              : this.normalizeUsername(dto.username),
          dataQualityNotes:
            dto.dataQualityNotes === undefined
              ? undefined
              : String(dto.dataQualityNotes || '').trim() || null,
          assignedMemberId,
        },
      });
      if (normalizedTimePosts !== undefined) {
        try {
          await tx.$executeRaw(
            Prisma.sql`DELETE FROM "TelegramChannelTimePost" WHERE "telegramChannelId" = ${id}`,
          );
          if (normalizedTimePosts.length) {
            await tx.$executeRaw(Prisma.sql`
              INSERT INTO "TelegramChannelTimePost" (
                "id",
                "telegramChannelId",
                "iconId",
                "title",
                "time",
                "position",
                "createdAt",
                "updatedAt"
              ) VALUES ${Prisma.join(
                normalizedTimePosts.map((item) => Prisma.sql`(
                  ${item.id},
                  ${id},
                  ${item.iconId},
                  ${item.title},
                  ${item.time},
                  ${item.position},
                  NOW(),
                  NOW()
                )`),
              )}
            `);
          }
        } catch (error) {
          if (this.isMissingTimePostsTable(error)) {
            throw new InternalServerErrorException(
              'Time posts storage is not available yet. Apply the latest database migration and try again.',
            );
          }
          throw error;
        }
      }
    });

    return this.findOne(userId, id);
  }

  private async calculateAdAnalysisMetrics(
    workspaceId: string,
    channelId: string,
    postLimit = 20,
    price?: number | null,
  ) {
    const posts = await this.prisma.telegramPost.findMany({
      where: {
        workspaceId,
        telegramChannelId: channelId,
        excludeFromAnalytics: false,
      },
      orderBy: { postDate: 'desc' },
      take: Math.max(1, Math.min(200, postLimit)),
      select: {
        viewsCount: true,
        reactionsCount: true,
        forwardsCount: true,
      },
    });
    const average = (values: Array<number | null>) => {
      const present = values.filter((value): value is number => value != null);
      return present.length
        ? present.reduce((sum, value) => sum + value, 0) / present.length
        : null;
    };
    const avgViews = average(posts.map((post) => post.viewsCount));
    const avgReactions = average(posts.map((post) => post.reactionsCount));
    const avgForwards = average(posts.map((post) => post.forwardsCount));
    return {
      postsCount: posts.length,
      avgViews,
      avgReactions,
      avgForwards,
      cpm:
        price != null && avgViews != null && avgViews > 0
          ? (price / avgViews) * 1000
          : null,
    };
  }

  private readonly postGroupBaseInclude = {
    createdByMember: WorkspaceService.assignedMemberInclude,
    telegramChannel: true,
  } as const;

  private async postGroupForWorkspace(workspaceId: string, groupId: string) {
    const group = await this.prisma.postGroup.findFirst({
      where: { id: groupId, workspaceId },
      include: {
        ...this.postGroupBaseInclude,
        posts: {
          orderBy: [{ groupPosition: 'asc' }, { createdAt: 'asc' }],
          include: this.managedPostInclude,
        },
      },
    });
    if (!group) throw new NotFoundException('Post group not found');
    return {
      ...group,
      statusSummary: postGroupStatusSummary(
        group.posts.map((post) => post.status),
      ),
    };
  }

  private async normalizePostGroupPositions(
    tx: Prisma.TransactionClient,
    groupId: string,
  ) {
    const posts = await tx.telegramManagedPost.findMany({
      where: { groupId },
      orderBy: [{ groupPosition: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    await Promise.all(
      posts.map((post, groupPosition) =>
        tx.telegramManagedPost.update({
          where: { id: post.id },
          data: { groupPosition },
        }),
      ),
    );
  }

  async postGroups(userId: string, query: PostGroupsQueryDto) {
    const workspaceId = await this.workspace(userId);
    if (query.telegramChannelId) {
      await this.findOne(userId, query.telegramChannelId);
    }
    const groups = await this.prisma.postGroup.findMany({
      where: {
        workspaceId,
        telegramChannelId: query.telegramChannelId,
        title: query.search?.trim()
          ? { contains: query.search.trim(), mode: 'insensitive' }
          : undefined,
      },
      include: {
        ...this.postGroupBaseInclude,
        posts: { select: { status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return groups.map(({ posts, ...group }) => ({
      ...group,
      postsCount: posts.length,
      statusSummary: postGroupStatusSummary(posts.map((post) => post.status)),
    }));
  }

  async postGroup(userId: string, groupId: string) {
    const workspaceId = await this.workspace(userId);
    return this.postGroupForWorkspace(workspaceId, groupId);
  }

  async createPostGroup(userId: string, dto: CreatePostGroupDto) {
    const membership =
      await this.workspaceService.resolveWorkspaceMembershipForUser(userId);
    const channel = await this.prisma.telegramChannel.findFirst({
      where: {
        id: dto.telegramChannelId,
        workspaceId: membership.workspaceId,
        isActive: true,
      },
      select: { id: true },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    const title = dto.title.trim();
    if (!title) throw new BadRequestException('Title is required');
    const postIds = [...new Set(dto.postIds ?? [])];
    if (postIds.length !== (dto.postIds?.length ?? 0)) {
      throw new BadRequestException('postIds must not contain duplicates');
    }
    const previousGroupIds = await this.prisma.$transaction(async (tx) => {
      const posts = postIds.length
        ? await tx.telegramManagedPost.findMany({
            where: {
              id: { in: postIds },
              workspaceId: membership.workspaceId,
              telegramChannelId: channel.id,
            },
            select: { id: true, groupId: true },
          })
        : [];
      if (posts.length !== postIds.length) {
        throw new BadRequestException(
          'Every post must belong to the selected channel and workspace',
        );
      }
      const group = await tx.postGroup.create({
        data: {
          workspaceId: membership.workspaceId,
          telegramChannelId: channel.id,
          title,
          description: dto.description?.trim() || null,
          icon: dto.icon?.trim() || null,
          createdByMemberId: membership.id,
        },
      });
      await Promise.all(
        postIds.map((postId, groupPosition) =>
          tx.telegramManagedPost.update({
            where: { id: postId },
            data: { groupId: group.id, groupPosition },
          }),
        ),
      );
      const oldGroupIds = [
        ...new Set(
          posts
            .map((post) => post.groupId)
            .filter((id): id is string => Boolean(id) && id !== group.id),
        ),
      ];
      for (const oldGroupId of oldGroupIds) {
        await this.normalizePostGroupPositions(tx, oldGroupId);
      }
      return { groupId: group.id, oldGroupIds };
    });
    return this.postGroupForWorkspace(
      membership.workspaceId,
      previousGroupIds.groupId,
    );
  }

  async updatePostGroup(
    userId: string,
    groupId: string,
    dto: UpdatePostGroupDto,
  ) {
    const workspaceId = await this.workspace(userId);
    await this.postGroupForWorkspace(workspaceId, groupId);
    if (dto.title !== undefined && !dto.title.trim()) {
      throw new BadRequestException('Title is required');
    }
    await this.prisma.postGroup.update({
      where: { id: groupId },
      data: {
        title: dto.title?.trim(),
        description:
          dto.description === undefined
            ? undefined
            : dto.description?.trim() || null,
        icon: dto.icon === undefined ? undefined : dto.icon?.trim() || null,
      },
    });
    return this.postGroupForWorkspace(workspaceId, groupId);
  }

  async deletePostGroup(userId: string, groupId: string) {
    const workspaceId = await this.workspace(userId);
    await this.postGroupForWorkspace(workspaceId, groupId);
    return this.prisma.$transaction(async (tx) => {
      await tx.telegramManagedPost.updateMany({
        where: { groupId, workspaceId },
        data: { groupId: null, groupPosition: null },
      });
      return tx.postGroup.delete({ where: { id: groupId } });
    });
  }

  async addPostsToGroup(userId: string, groupId: string, dto: PostIdsDto) {
    const workspaceId = await this.workspace(userId);
    const group = await this.prisma.postGroup.findFirst({
      where: { id: groupId, workspaceId },
    });
    if (!group) throw new NotFoundException('Post group not found');
    const postIds = [...new Set(dto.postIds)];
    if (postIds.length !== dto.postIds.length) {
      throw new BadRequestException('postIds must not contain duplicates');
    }
    await this.prisma.$transaction(async (tx) => {
      const posts = await tx.telegramManagedPost.findMany({
        where: {
          id: { in: postIds },
          workspaceId,
          telegramChannelId: group.telegramChannelId,
        },
        select: { id: true, groupId: true },
      });
      if (posts.length !== postIds.length) {
        throw new BadRequestException(
          'Every post must belong to the group channel and workspace',
        );
      }
      const existingCount = await tx.telegramManagedPost.count({
        where: { groupId },
      });
      const attach = posts.filter((post) => post.groupId !== groupId);
      await Promise.all(
        attach.map((post, index) =>
          tx.telegramManagedPost.update({
            where: { id: post.id },
            data: {
              groupId,
              groupPosition: existingCount + index,
            },
          }),
        ),
      );
      const oldGroupIds = [
        ...new Set(
          attach
            .map((post) => post.groupId)
            .filter((id): id is string => Boolean(id) && id !== groupId),
        ),
      ];
      for (const oldGroupId of oldGroupIds) {
        await this.normalizePostGroupPositions(tx, oldGroupId);
      }
    });
    return this.postGroupForWorkspace(workspaceId, groupId);
  }

  async removePostFromGroup(userId: string, groupId: string, postId: string) {
    const workspaceId = await this.workspace(userId);
    const post = await this.prisma.telegramManagedPost.findFirst({
      where: { id: postId, groupId, workspaceId },
      select: { id: true },
    });
    if (!post) throw new NotFoundException('Group post not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.telegramManagedPost.update({
        where: { id: postId },
        data: { groupId: null, groupPosition: null },
      });
      await this.normalizePostGroupPositions(tx, groupId);
    });
    return this.postGroupForWorkspace(workspaceId, groupId);
  }

  async reorderPostGroup(
    userId: string,
    groupId: string,
    dto: ReorderPostGroupDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const posts = await this.prisma.telegramManagedPost.findMany({
      where: { groupId, workspaceId },
      select: { id: true },
    });
    const group = await this.prisma.postGroup.findFirst({
      where: { id: groupId, workspaceId },
      select: { id: true },
    });
    if (!group) throw new NotFoundException('Post group not found');
    validateCompletePostOrder(
      posts.map((post) => post.id),
      dto.orderedPostIds,
    );
    await this.prisma.$transaction(
      dto.orderedPostIds.map((postId, groupPosition) =>
        this.prisma.telegramManagedPost.update({
          where: { id: postId },
          data: { groupPosition },
        }),
      ),
    );
    return this.postGroupForWorkspace(workspaceId, groupId);
  }

  async managedPosts(userId: string, channelId: string) {
    const workspaceId = await this.workspace(userId);
    await this.findOne(userId, channelId);
    await this.promoteDueScheduledManagedPosts(workspaceId, channelId);
    return this.prisma.telegramManagedPost.findMany({
      where: { workspaceId, telegramChannelId: channelId },
      orderBy: { createdAt: 'desc' },
      include: this.managedPostInclude,
    });
  }

  private async promoteDueScheduledManagedPosts(
    workspaceId: string,
    channelId?: string,
  ) {
    const duePosts = await this.prisma.telegramManagedPost.findMany({
      where: {
        workspaceId,
        status: TelegramManagedPostStatus.SCHEDULED,
        scheduledAt: { lte: new Date() },
        ...(channelId ? { telegramChannelId: channelId } : {}),
      },
      select: {
        id: true,
        scheduledAt: true,
        publishedAt: true,
        telegramMessageIds: true,
        telegramMessageUrls: true,
        imageUrls: true,
        telegramChannel: {
          select: { username: true, telegramChatId: true },
        },
      },
    });
    if (!duePosts.length) return;
    const now = new Date();
    await Promise.all(
      duePosts.map((post) => {
        const urls =
          post.telegramMessageUrls.length > 0
            ? post.telegramMessageUrls
            : this.telegramMessageUrlsForPost(
                post.telegramChannel,
                post.telegramMessageIds,
                post.imageUrls.length,
              );
        const isLinked = urls.length > 0;
        return this.prisma.telegramManagedPost.update({
          where: { id: post.id },
          data: {
            status: TelegramManagedPostStatus.PUBLISHED,
            telegramRemoteStatus: isLinked
              ? TelegramManagedPostRemoteStatus.PUBLISHED
              : TelegramManagedPostRemoteStatus.UNKNOWN,
            publishedAt: post.publishedAt ?? post.scheduledAt ?? now,
            scheduledAt: null,
            telegramMessageUrls: urls,
            lastError: null,
            lastTelegramSyncedAt: now,
            lastTelegramSyncNote:
              'Scheduled time passed. Marked as published locally.',
          },
        });
      }),
    );
  }

  async syncManagedPosts(
    userId: string,
    channelId: string,
    onProgress?: BulkProgressCallback,
  ) {
    const workspaceId = await this.workspace(userId);
    const channel = await this.findOne(userId, channelId);
    const posts = await this.prisma.telegramManagedPost.findMany({
      where: {
        workspaceId,
        telegramChannelId: channelId,
        OR: [
          {
            status: {
              in: [
                TelegramManagedPostStatus.SCHEDULED,
                TelegramManagedPostStatus.PUBLISHED,
                TelegramManagedPostStatus.FAILED,
              ],
            },
            telegramMessageIds: { isEmpty: false },
          },
          { telegramMessageUrls: { isEmpty: false } },
          { status: TelegramManagedPostStatus.SCHEDULED },
        ],
      },
    });
    const emptyResult = {
      checked: 0,
      updated: 0,
      publishedEarly: 0,
      movedToDraft: 0,
      broken: 0,
      missing: 0,
    };
    if (!posts.length) return emptyResult;
    const account = await this.connectedAccount(workspaceId, channelId);
    const channelReference = this.mtprotoChannelReference(channel);
    if (!channelReference.telegramChatId && !channelReference.username)
      throw new BadRequestException('Channel has no Telegram reference');
    const idsFromUrls = posts.flatMap((post) =>
      post.telegramMessageUrls.flatMap((url) => {
        const parsed = parseTelegramPostUrl(url);
        return parsed ? [parsed.messageId] : [];
      }),
    );
    const publishedMessageIds = [
      ...new Set([
        ...posts.flatMap((post) => post.telegramMessageIds),
        ...idsFromUrls,
      ]),
    ];
    const scheduledMessageIds = [
      ...new Set(
        posts
          .filter((post) => post.status === 'SCHEDULED')
          .flatMap((post) => post.telegramMessageIds),
      ),
    ];
    const remote = await this.mtprotoClient.getManagedPostMessages({
      ...this.accountCredentials(account),
      channel: channelReference,
      publishedMessageIds,
      scheduledMessageIds,
    });
    const publishedById = new Map(
      remote.published.map((message) => [message.id, message]),
    );
    const scheduledById = new Map(
      remote.scheduled.map((message) => [message.id, message]),
    );
    const validLinkTargets =
      await this.prisma.telegramManagedPost.findMany({
        where: {
          workspaceId,
          status: TelegramManagedPostStatus.PUBLISHED,
          telegramRemoteStatus: TelegramManagedPostRemoteStatus.PUBLISHED,
          telegramMessageUrls: { isEmpty: false },
        },
        select: { id: true, telegramMessageUrls: true },
      });
    const internalIdByUrl = new Map(
      validLinkTargets.flatMap((post) =>
        post.telegramMessageUrls.map((url) => [url, post.id] as const),
      ),
    );
    const restoreInternalLinks = (markup: string) => {
      let restored = markup;
      for (const [url, postId] of internalIdByUrl) {
        restored = restored.replaceAll(`](${url})`, `](tg-post:${postId})`);
      }
      return restored;
    };
    const result = { ...emptyResult, checked: posts.length };
    let current = 0;
    for (const post of posts) {
      current += 1;
      const postIds = [
        ...new Set([
          ...post.telegramMessageIds,
          ...post.telegramMessageUrls.flatMap((url) => {
            const parsed = parseTelegramPostUrl(url);
            return parsed ? [parsed.messageId] : [];
          }),
        ]),
      ];
      const scheduledMessages = postIds
        .map((id) => scheduledById.get(id))
        .filter((message): message is NonNullable<typeof message> =>
          Boolean(message),
        );
      let publishedMessages = postIds
        .map((id) => publishedById.get(id))
        .filter((message): message is NonNullable<typeof message> =>
          Boolean(message),
        );
      publishedMessages = this.appendFollowupTextMessageForImagesThenText(
        post.publishMode,
        publishedMessages,
        remote.recentPublished,
      );
      const currentRemoteText = restoreInternalLinks(
        publishedMessages
          .map((message) => telegramHtmlToManagedMarkup(message.html))
          .filter(Boolean)
          .join('\n\n'),
      );
      const currentRemoteVisibleText = publishedMessages
        .map((message) => message.text || '')
        .filter(Boolean)
        .join('\n\n');
      const exactCurrentTextMatch =
        Boolean(post.text?.trim()) &&
        this.normalizedPlainText(currentRemoteVisibleText) ===
          this.normalizedPlainText(post.text || '');
      const currentTitleMatch = currentRemoteVisibleText
        ? this.textMatchesTitle(post.title, currentRemoteVisibleText)
        : false;
      const shouldReconcilePublishedMessage =
        post.status === TelegramManagedPostStatus.PUBLISHED &&
        (!publishedMessages.length ||
          !exactCurrentTextMatch);
      if (shouldReconcilePublishedMessage) {
        const reconciled = this.findMatchingRecentPublishedMessage(
          {
            title: post.title,
            text: post.text,
            publishMode: post.publishMode,
          },
          remote.recentPublished,
        );
        if (reconciled) {
          publishedMessages = reconciled.messageIds
            .map(
              (id) =>
                publishedById.get(id) ??
                remote.recentPublished.find((message) => message.id === id),
            )
            .filter((message): message is NonNullable<typeof message> =>
              Boolean(message),
            );
          publishedMessages = this.appendFollowupTextMessageForImagesThenText(
            post.publishMode,
            publishedMessages,
            remote.recentPublished,
          );
        } else if (post.status === TelegramManagedPostStatus.PUBLISHED) {
          publishedMessages = [];
        }
      }
      if (
        post.status === TelegramManagedPostStatus.PUBLISHED &&
        post.publishMode === 'IMAGES_THEN_TEXT' &&
        publishedMessages.length === 1 &&
        !publishedMessages[0].hasMedia &&
        publishedMessages[0].date
      ) {
        const previousMedia = remote.recentPublished.find(
          (message) =>
            message.hasMedia &&
            message.date === publishedMessages[0].date &&
            Number(message.id) < Number(publishedMessages[0].id),
        );
        if (previousMedia) {
          publishedMessages = [previousMedia, publishedMessages[0]];
        }
      }
      const messages = scheduledMessages.length
        ? scheduledMessages
        : publishedMessages;
      if (!messages.length) {
        if (post.status === 'SCHEDULED') {
          result.updated += 1;
          result.movedToDraft += 1;
          await this.prisma.$transaction(async (tx) => {
            await this.createManagedPostRevision(tx, post, 'before_sync_missing');
            await tx.telegramManagedPost.update({
              where: { id: post.id },
              data: {
                status: TelegramManagedPostStatus.DRAFT,
                telegramRemoteStatus: TelegramManagedPostRemoteStatus.MISSING,
                publishedAt: null,
                scheduledAt: null,
                telegramMessageIds: [],
                telegramMessageUrls: [],
                lastError: null,
                lastTelegramSyncedAt: new Date(),
                lastTelegramSyncNote:
                  'Scheduled Telegram message was not found during sync. Post was moved back to draft.',
              },
            });
          });
          await onProgress?.(
            ({
              id: post.id,
              postId: post.id,
              index: current,
              total: posts.length,
              action: 'DRAFT',
              success: true,
              status: 'success',
              message: `${post.title}: scheduled message not found, moved back to draft`,
            } as unknown) as BulkActionResultItem,
            current,
            posts.length,
          );
        } else if (post.status === 'PUBLISHED') {
          result.updated += 1;
          result.broken += 1;
          await this.prisma.$transaction(async (tx) => {
            await this.createManagedPostRevision(tx, post, 'before_sync_broken');
            await tx.telegramManagedPost.update({
              where: { id: post.id },
              data: {
                status: TelegramManagedPostStatus.PUBLISHED,
                telegramRemoteStatus: TelegramManagedPostRemoteStatus.BROKEN,
                lastError: 'Telegram post link is broken.',
                lastTelegramSyncedAt: new Date(),
                lastTelegramSyncNote:
                  'Published Telegram post was not found during sync. Post was kept published and marked as broken.',
              },
            });
          });
          await onProgress?.(
            ({
              id: post.id,
              postId: post.id,
              index: current,
              total: posts.length,
              action: 'FAILED',
              success: false,
              status: 'error',
              message: `${post.title}: Telegram link check failed, post kept published`,
            } as unknown) as BulkActionResultItem,
            current,
            posts.length,
          );
        }
        continue;
      }
      const becamePublished =
        post.status !== TelegramManagedPostStatus.PUBLISHED &&
        !scheduledMessages.length &&
        publishedMessages.length > 0;
      const actualMessageIds =
        publishedMessages.length
          ? publishedMessages.map((message) => message.id)
          : postIds;
      const isScheduledRemote = scheduledMessages.length > 0;
      const remoteUrls = isScheduledRemote
        ? []
        : this.telegramMessageUrlsForPost(
            channel,
            actualMessageIds,
            post.imageUrls.length,
          );
      const hasRemoteMedia = messages.some((message) => message.hasMedia);
      const mediaNote =
        hasRemoteMedia && !post.imageUrls.length
          ? 'Telegram media changed, but media download is not implemented.'
          : null;
      await this.prisma.$transaction(async (tx) => {
        await this.createManagedPostRevision(
          tx,
          post,
          becamePublished ? 'before_sync_publish_transition' : 'before_sync_update',
        );
        await tx.telegramManagedPost.update({
          where: { id: post.id },
          data: {
            status: becamePublished ? 'PUBLISHED' : post.status,
            telegramRemoteStatus: isScheduledRemote
              ? TelegramManagedPostRemoteStatus.SCHEDULED
              : TelegramManagedPostRemoteStatus.PUBLISHED,
            publishedAt: becamePublished
              ? new Date(messages[0].date || Date.now())
              : post.publishedAt,
            scheduledAt: isScheduledRemote
              ? new Date(messages[0].date || post.scheduledAt || Date.now())
              : null,
            telegramMessageIds: actualMessageIds,
            telegramMessageUrls: remoteUrls,
            lastError: null,
            lastTelegramSyncedAt: new Date(),
            lastTelegramSyncNote: becamePublished
              ? 'Post was published in Telegram before the scheduled time.'
              : mediaNote,
          },
        });
      });
      result.updated += 1;
      if (becamePublished) result.publishedEarly += 1;
      await onProgress?.(
        ({
          id: post.id,
          postId: post.id,
          index: current,
          total: posts.length,
          action: becamePublished ? 'PUBLISHED' : 'SCHEDULED',
          success: true,
          status: 'success',
          message: becamePublished
            ? `${post.title}: published earlier in Telegram`
            : `${post.title}: synced from Telegram`,
        } as unknown) as BulkActionResultItem,
        current,
        posts.length,
      );
    }
    this.invalidateTelegramChannelReadCache(userId, workspaceId);
    return result;
  }

  async setManagedPostTelegramUrl(
    userId: string,
    channelId: string,
    postId: string,
    telegramUrl: string,
  ) {
    const workspaceId = await this.workspace(userId);
    const [post, channel] = await Promise.all([
      this.prisma.telegramManagedPost.findFirst({
      where: { id: postId, workspaceId, telegramChannelId: channelId },
      select: { id: true },
      }),
      this.prisma.telegramChannel.findFirst({
        where: { id: channelId, workspaceId },
      }),
    ]);
    if (!post || !channel) throw new NotFoundException('Managed post not found');
    const normalizedInput = telegramUrl.trim();
    const currentPost = await this.prisma.telegramManagedPost.findFirst({
      where: { id: postId, workspaceId, telegramChannelId: channelId },
    });
    if (!currentPost)
      throw new NotFoundException('Managed post not found');
    if (!normalizedInput) {
      return this.prisma.$transaction(async (tx) => {
        await this.createManagedPostRevision(tx, currentPost, 'before_manual_link');
        return tx.telegramManagedPost.update({
          where: { id: postId },
          data: {
            status: TelegramManagedPostStatus.DRAFT,
            telegramRemoteStatus: TelegramManagedPostRemoteStatus.NONE,
            telegramMessageIds: [],
            telegramMessageUrls: [],
            publishedAt: null,
            scheduledAt: null,
            sourceType: null,
            sourceId: null,
            publishMode: null,
            lastError: null,
            lastTelegramSyncedAt: new Date(),
            lastTelegramSyncNote:
              'Telegram link was removed manually. Post returned to draft.',
          },
          include: this.managedPostInclude,
        });
      });
    }
    const parsed = parseTelegramPostUrl(normalizedInput);
    if (!parsed) {
      throw new BadRequestException('Enter a valid https://t.me/... post URL');
    }
    const channelUsername = this.normalizeUsername(channel.username);
    const channelChatId = this.normalizeChatId(channel.telegramChatId);
    if (
      (parsed.kind === 'public' && parsed.username !== channelUsername) ||
      (parsed.kind === 'private' && parsed.chatId !== channelChatId)
    ) {
      throw new BadRequestException('Telegram link belongs to another channel');
    }
    const normalizedTelegramUrl = buildStableTelegramPostUrl({
      telegramChatId: channel.telegramChatId,
      messageId: parsed.messageId,
    });
    if (!normalizedTelegramUrl) {
      throw new BadRequestException(
        'Channel has no stable Telegram channel ID. Sync or re-import the channel first.',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      await this.createManagedPostRevision(tx, currentPost, 'before_manual_link');
      return tx.telegramManagedPost.update({
        where: { id: postId },
        data: {
          status: TelegramManagedPostStatus.PUBLISHED,
          telegramRemoteStatus: TelegramManagedPostRemoteStatus.PUBLISHED,
          telegramMessageIds: [parsed.messageId],
          telegramMessageUrls: [normalizedTelegramUrl],
          publishedAt:
            currentPost.publishedAt ?? currentPost.scheduledAt ?? new Date(),
          scheduledAt: null,
          lastError: null,
          lastTelegramSyncedAt: new Date(),
          lastTelegramSyncNote:
            'Telegram link was manually attached without remote sync.',
        },
        include: this.managedPostInclude,
      });
    });
  }

  async managedPostLinkTargets(
    userId: string,
    channelId: string,
    query: ManagedPostLinkTargetsQueryDto,
  ) {
    const workspaceId = await this.workspace(userId);
    await this.findOne(userId, channelId);
    await this.promoteDueScheduledManagedPosts(workspaceId, channelId);
    const search = query.search?.trim();
    const scheduledBefore =
      query.usage === 'schedule' && query.scheduledAt
        ? new Date(query.scheduledAt)
        : null;
    const editingTargets = query.usage === 'edit';
    const posts = await this.prisma.telegramManagedPost.findMany({
      where: {
        workspaceId,
        telegramChannelId: channelId,
        ...(editingTargets
          ? {}
          : {
              lastError: null,
              OR: [
                {
                  status: TelegramManagedPostStatus.PUBLISHED,
                  telegramRemoteStatus:
                    TelegramManagedPostRemoteStatus.PUBLISHED,
                  telegramMessageIds: { isEmpty: false },
                },
                ...(scheduledBefore
                  ? [
                      {
                        status: TelegramManagedPostStatus.SCHEDULED,
                        telegramRemoteStatus:
                          TelegramManagedPostRemoteStatus.SCHEDULED,
                        scheduledAt: { lt: scheduledBefore },
                        telegramMessageIds: { isEmpty: false },
                      },
                    ]
                  : []),
              ],
            }),
        ...(query.groupId ? { groupId: query.groupId } : {}),
        ...(query.excludePostId ? { id: { not: query.excludePostId } } : {}),
        ...(search
          ? { title: { contains: search, mode: Prisma.QueryMode.insensitive } }
          : {}),
      },
      select: {
        id: true,
        title: true,
        icon: true,
        status: true,
        telegramRemoteStatus: true,
        lastError: true,
        groupId: true,
        publishedAt: true,
        scheduledAt: true,
        imageUrls: true,
        telegramMessageIds: true,
        telegramMessageUrls: true,
        telegramChannelId: true,
        group: { select: { title: true } },
        telegramChannel: {
          select: { title: true, username: true, telegramChatId: true },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { title: 'asc' }],
      take: query.limit ?? 30,
    });
    return posts.map((post) => {
      const primaryId = this.primaryTelegramMessageId({
        messageIds: post.telegramMessageIds,
        imageCount: post.imageUrls.length,
      });
      const primaryTelegramMessageUrl = primaryId
        ? this.telegramMessageUrl(post.telegramChannel, primaryId)
        : null;
      return {
        id: post.id,
        title: post.title,
        icon: post.icon,
        status: post.status,
        telegramRemoteStatus: post.telegramRemoteStatus,
        groupId: post.groupId,
        groupTitle: post.group?.title ?? null,
        telegramChannelId: post.telegramChannelId,
        telegramChannelTitle: post.telegramChannel.title,
        publishedAt: post.publishedAt,
        primaryTelegramMessageUrl:
          post.telegramMessageUrls[0] ?? primaryTelegramMessageUrl,
      };
    });
  }

  private async resolveInternalPostLinksForPublish(
    workspaceId: string,
    currentPostId: string,
    text: string,
    currentScheduleAt?: Date,
  ) {
    const targetIds = extractInternalPostLinkIds(text);
    if (!targetIds.length) return text;
    if (targetIds.includes(currentPostId)) {
      throw new BadRequestException(
        'Cannot publish post because it contains an internal link to itself.',
      );
    }
    const targets = await this.prisma.telegramManagedPost.findMany({
      where: { workspaceId, id: { in: targetIds } },
      select: {
        id: true,
        title: true,
        status: true,
        telegramRemoteStatus: true,
        lastError: true,
        scheduledAt: true,
        imageUrls: true,
        telegramMessageIds: true,
        telegramMessageUrls: true,
        telegramChannel: {
          select: { username: true, telegramChatId: true },
        },
      },
    });
    const targetsById = new Map(targets.map((target) => [target.id, target]));
    const unresolved = targetIds.flatMap((targetId) => {
      const target = targetsById.get(targetId);
      if (!target) return [`${targetId}: post was not found`];
      const targetImageCount = target.imageUrls?.length ?? 0;
      const generatedPrimaryMessageId = this.primaryTelegramMessageId({
        messageIds: target.telegramMessageIds,
        imageCount: targetImageCount,
      });
      const generatedStablePrimaryUrl = generatedPrimaryMessageId
        ? this.telegramMessageUrl(target.telegramChannel, generatedPrimaryMessageId)
        : null;
      const isScheduledRemoteTarget =
        target.status === TelegramManagedPostStatus.SCHEDULED &&
        target.telegramRemoteStatus === TelegramManagedPostRemoteStatus.SCHEDULED &&
        !target.lastError;
      const treatedAsPublished =
        target.status === TelegramManagedPostStatus.PUBLISHED ||
        (target.status === TelegramManagedPostStatus.SCHEDULED &&
          !currentScheduleAt &&
          Boolean(target.scheduledAt) &&
          target.scheduledAt!.getTime() < Date.now());
      if (
        currentScheduleAt &&
        isScheduledRemoteTarget
      ) {
        if (
          !target.scheduledAt ||
          target.scheduledAt.getTime() >= currentScheduleAt.getTime()
        ) {
          return [
            `"${target.title}" (${target.id}) must be scheduled before the post that links to it`,
          ];
        }
        if (
          !generatedPrimaryMessageId ||
          !generatedStablePrimaryUrl
        ) {
          return [
            `Target channel has no stable Telegram channel ID. Sync or re-import the channel.`,
          ];
        }
        return [];
      }
      if (!treatedAsPublished) {
        return [
          `"${target.title}" (${target.id}) is not published or has a broken Telegram link`,
        ];
      }
      if (
        (!treatedAsPublished &&
          target.telegramRemoteStatus !==
            TelegramManagedPostRemoteStatus.PUBLISHED) ||
        target.lastError ||
        !generatedStablePrimaryUrl
      ) {
        return [
          !generatedStablePrimaryUrl
            ? 'Target channel has no stable Telegram channel ID. Sync or re-import the channel.'
            : `"${target.title}" (${target.id}) is not published or has a broken Telegram link`,
        ];
      }
      return [];
    });
    if (unresolved.length) {
      throw new BadRequestException(
        `Cannot publish post because some internal post links are unresolved: ${unresolved.join('; ')}.`,
      );
    }
    const urlsByPostId = new Map<string, string>();
    for (const target of targets) {
      const targetImageCount = target.imageUrls?.length ?? 0;
      const primaryId = this.primaryTelegramMessageId({
        messageIds: target.telegramMessageIds,
        imageCount: targetImageCount,
      });
      const url = primaryId
        ? this.telegramMessageUrl(target.telegramChannel, primaryId)
        : null;
      if (url) urlsByPostId.set(target.id, url);
    }
    return replaceInternalPostLinks(text, urlsByPostId);
  }

  async reorderManagedPostSidebar(
    userId: string,
    channelId: string,
    dto: ReorderManagedPostSidebarDto,
  ) {
    const workspaceId = await this.workspace(userId);
    await this.findOne(userId, channelId);
    const [groups, posts] = await Promise.all([
      this.prisma.postGroup.findMany({
        where: { workspaceId, telegramChannelId: channelId },
        select: { id: true },
      }),
      this.prisma.telegramManagedPost.findMany({
        where: { workspaceId, telegramChannelId: channelId, groupId: null },
        select: { id: true },
      }),
    ]);
    const expected = [
      ...groups.map((group) => `group:${group.id}`),
      ...posts.map((post) => `post:${post.id}`),
    ];
    if (
      dto.orderedItems.length !== expected.length ||
      new Set(dto.orderedItems).size !== dto.orderedItems.length ||
      dto.orderedItems.some((item) => !expected.includes(item))
    ) {
      throw new BadRequestException(
        'orderedItems must contain every group and ungrouped post exactly once',
      );
    }
    await this.prisma.$transaction(
      dto.orderedItems.map((item, sidebarPosition) => {
        const [type, id] = item.split(':', 2);
        return type === 'group'
          ? this.prisma.postGroup.update({
              where: { id },
              data: { sidebarPosition },
            })
          : this.prisma.telegramManagedPost.update({
              where: { id },
              data: { sidebarPosition },
            });
      }),
    );
    return { success: true };
  }

  async createManagedPost(
    userId: string,
    channelId: string,
    dto: CreateTelegramManagedPostDto,
  ) {
    if (dto.assignedMemberId === null) {
      throw new BadRequestException('Assigned member is required');
    }
    const { workspaceId, assignedMemberId } =
      await this.workspaceService.resolveAssignedMemberId(
        userId,
        dto.assignedMemberId,
      );
    if (!assignedMemberId) {
      throw new BadRequestException('Assigned member is required');
    }
    await this.findOne(userId, channelId);
    const title = dto.title.trim();
    if (!title) throw new BadRequestException('Title is required');
    return this.prisma.telegramManagedPost.create({
      data: {
        workspaceId,
        telegramChannelId: channelId,
        title,
        text: dto.text ?? null,
        imageUrls: dto.imageUrls ?? [],
        assignedMemberId,
        icon: dto.icon?.trim() || null,
      },
      include: this.managedPostInclude,
    });
  }

  async managedPostHistory(userId: string, channelId: string, postId: string) {
    const workspaceId = await this.workspace(userId);
    await this.findOne(userId, channelId);
    const post = await this.prisma.telegramManagedPost.findFirst({
      where: { id: postId, workspaceId, telegramChannelId: channelId },
      select: { id: true },
    });
    if (!post) throw new NotFoundException('Managed post not found');
    return this.listManagedPostRevisions(this.prisma, {
      telegramManagedPostId: postId,
      workspaceId,
    });
  }

  async restoreManagedPostRevision(
    userId: string,
    channelId: string,
    postId: string,
    revisionId: string,
  ) {
    const workspaceId = await this.workspace(userId);
    await this.findOne(userId, channelId);
    const [post, revision] = (await Promise.all([
      this.prisma.telegramManagedPost.findFirst({
        where: { id: postId, workspaceId, telegramChannelId: channelId },
      }),
      this.findManagedPostRevision(this.prisma, {
        id: revisionId,
        telegramManagedPostId: postId,
        workspaceId,
        telegramChannelId: channelId,
      }),
    ])) as [ManagedPostRevisionSource | null, ManagedPostRevisionRecord | null];
    if (!post) throw new NotFoundException('Managed post not found');
    if (!revision) throw new NotFoundException('Post revision not found');
    return this.prisma.$transaction(async (tx) => {
      await this.createManagedPostRevision(tx, post, 'before_restore');
      return tx.telegramManagedPost.update({
        where: { id: postId },
        data: {
          title: revision.title,
          text: revision.text,
          imageUrls: revision.imageUrls,
          assignedMemberId: revision.assignedMemberId,
          icon: revision.icon,
          groupId: revision.groupId,
          groupPosition: revision.groupPosition,
          sidebarPosition: revision.sidebarPosition,
          status: TelegramManagedPostStatus.DRAFT,
          telegramRemoteStatus: TelegramManagedPostRemoteStatus.NONE,
          scheduledAt: null,
          publishedAt: null,
          telegramMessageIds: [],
          telegramMessageUrls: [],
          sourceType: null,
          sourceId: null,
          publishMode: null,
          lastError: null,
          lastTelegramSyncedAt: new Date(),
          lastTelegramSyncNote: `Restored from backup created at ${revision.createdAt.toISOString()}.`,
        },
        include: this.managedPostInclude,
      });
    });
  }

  async updateManagedPost(
    userId: string,
    channelId: string,
    postId: string,
    dto: UpdateTelegramManagedPostDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const post = await this.prisma.telegramManagedPost.findFirst({
      where: { id: postId, workspaceId, telegramChannelId: channelId },
    });
    if (!post) throw new NotFoundException('Post draft not found');
    if (dto.title !== undefined && !dto.title.trim())
      throw new BadRequestException('Title is required');
    if (dto.assignedMemberId === null)
      throw new BadRequestException('Assigned member is required');
    if (
      (post.status === TelegramManagedPostStatus.PUBLISHED ||
        post.status === TelegramManagedPostStatus.SCHEDULED) &&
      dto.imageUrls !== undefined &&
      !this.sameImageUrls(dto.imageUrls, post.imageUrls)
    ) {
      throw new BadRequestException(
        'Images cannot be edited after the post is sent or scheduled. Update only the text.',
      );
    }
    let assignedMemberId: string | undefined;
    if (dto.assignedMemberId !== undefined) {
      const resolved = await this.workspaceService.resolveAssignedMemberId(
        userId,
        dto.assignedMemberId,
      );
      if (!resolved.assignedMemberId) {
        throw new BadRequestException('Assigned member is required');
      }
      assignedMemberId = resolved.assignedMemberId;
    }
    const nextText = dto.text ?? post.text ?? '';
    const canEditPublishedTelegramText =
      post.status === TelegramManagedPostStatus.PUBLISHED &&
      post.telegramRemoteStatus === TelegramManagedPostRemoteStatus.PUBLISHED;
    const channel =
      dto.text !== undefined && canEditPublishedTelegramText
        ? await this.prisma.telegramChannel.findFirst({
            where: { id: channelId, workspaceId },
            select: {
              id: true,
              workspaceId: true,
              username: true,
              telegramChatId: true,
              inviteLink: true,
            },
          })
        : null;
    const telegramEdit =
      dto.text !== undefined &&
      canEditPublishedTelegramText &&
      channel
        ? await this.editManagedPostTextInTelegram({
            workspaceId,
            channelId,
            post,
            channel,
            nextText,
          })
        : null;
    return this.prisma.$transaction(async (tx) => {
      await this.createManagedPostRevision(tx, post, 'before_update');
      return tx.telegramManagedPost.update({
        where: { id: postId },
        data: {
          title: dto.title?.trim(),
          text: dto.text,
          imageUrls: dto.imageUrls,
          assignedMemberId,
          icon: dto.icon === undefined ? undefined : dto.icon?.trim() || null,
          lastError: null,
          sourceId: telegramEdit?.sourceId,
          sourceType: telegramEdit?.sourceType,
          telegramMessageIds: telegramEdit?.telegramMessageIds,
          publishMode: telegramEdit?.publishMode,
          lastTelegramSyncedAt: telegramEdit?.lastTelegramSyncedAt,
          lastTelegramSyncNote: telegramEdit?.lastTelegramSyncNote,
        },
        include: this.managedPostInclude,
      });
    });
  }

  private async publishManagedPost(
    workspaceId: string,
    channelId: string,
    postId: string,
    scheduleAt?: Date,
    longTextMode: 'IMAGES_THEN_TEXT' | 'CAPTION_THEN_TEXT' = 'IMAGES_THEN_TEXT',
  ) {
    const [post, channel, sources] = await Promise.all([
      this.prisma.telegramManagedPost.findFirst({
        where: { id: postId, workspaceId, telegramChannelId: channelId },
      }),
      this.prisma.telegramChannel.findFirst({
        where: { id: channelId, workspaceId, isActive: true },
      }),
      this.sourceAccessService.sourcesForChannel(workspaceId, channelId),
    ]);
    if (!post || !channel)
      throw new NotFoundException('Post or channel not found');
    if (!post.text?.trim() && !post.imageUrls.length)
      throw new BadRequestException('Text or at least one image is required');
    await this.createManagedPostRevision(
      this.prisma,
      post,
      scheduleAt ? 'before_schedule' : 'before_publish',
    );
    const existingScheduledSource =
      scheduleAt && post.status === 'SCHEDULED' && post.sourceId
        ? sources.find(
            (item) =>
              item.sourceType === TelegramSourceType.MTPROTO &&
              item.sourceId === post.sourceId &&
              item.permissions.canPostMessages,
          )
        : undefined;
    const mtprotoSource =
      existingScheduledSource ??
      sources.find(
        (item) =>
          item.sourceType === TelegramSourceType.MTPROTO &&
          item.permissions.canPostMessages,
      );
    const source =
      mtprotoSource ??
      sources.find(
        (item) =>
          item.sourceType === TelegramSourceType.BOT &&
          item.permissions.canPostMessages,
      );
    if (!source) {
      throw new BadRequestException(
        'No connected source has posting permission',
      );
    }
    if (scheduleAt && source.sourceType !== TelegramSourceType.MTPROTO)
      throw new BadRequestException(
        'Scheduling requires a connected MTProto source with posting permission',
      );
    const channelReference = this.mtprotoChannelReference(channel);
    if (!channelReference.telegramChatId && !channelReference.username)
      throw new BadRequestException('Channel has no Telegram reference');
    let previousScheduledMessageCancelled = false;
    try {
      const resolvedText = await this.resolveInternalPostLinksForPublish(
        workspaceId,
        post.id,
        post.text || '',
        scheduleAt,
      );
      const {
        html,
        captionHtml,
        followupHtmlParts,
        textHtmlParts,
        publishMode,
      } = this.renderManagedPostText(resolvedText, post.imageUrls, longTextMode);
      let ids: string[];
      if (source.sourceType === TelegramSourceType.MTPROTO) {
        const account = await this.connectedAccount(
          workspaceId,
          channelId,
          source.sourceId,
        );
        if (
          scheduleAt &&
          post.status === 'SCHEDULED' &&
          post.telegramMessageIds.length
        ) {
          await this.mtprotoClient.deleteScheduledPost({
            ...this.accountCredentials(account),
            channel: channelReference,
            messageIds: post.telegramMessageIds,
          });
          previousScheduledMessageCancelled = true;
        }
        ids = await this.mtprotoClient.publishPost({
          ...this.accountCredentials(account),
          channel: channelReference,
          html,
          textHtmlParts,
          captionHtml,
          followupHtmlParts,
          imageUrls: post.imageUrls,
          scheduleAt,
        });
      } else {
        const bot = await this.prisma.telegramBotIntegration.findFirst({
          where: { id: source.sourceId, workspaceId, isActive: true },
        });
        if (!bot)
          throw new BadRequestException('Telegram bot is not connected');
        const token = this.encryptionService.decrypt({
          encrypted: bot.botTokenEncrypted,
          iv: bot.botTokenIv,
          authTag: bot.botTokenAuthTag,
        });
        const chatId = this.botChatId(channel);
        if (!chatId) {
          throw new BadRequestException('Channel has no Telegram chat id');
        }
        const call = async (method: string, body: Record<string, unknown>) => {
          const response = await fetch(
            `https://api.telegram.org/bot${token}/${method}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: chatId, ...body }),
            },
          );
          const payload = (await response.json()) as {
            ok?: boolean;
            description?: string;
            result?: any;
          };
          if (!response.ok || !payload.ok)
            throw new BadRequestException(
              payload.description || 'Telegram Bot API publish failed',
            );
          return payload.result;
        };
        const toBotFormattedText = (html: string) => {
          const [text, entities] = HTMLParser.parse(
            telegramHtmlToMtprotoHtml(html),
          );
          return {
            text,
            entities: entities
              .map((entity) => this.toBotMessageEntity(entity))
              .filter((entity): entity is BotMessageEntity => Boolean(entity)),
          };
        };
        if (post.imageUrls.length > 1) {
          const caption = toBotFormattedText(captionHtml);
          const result = (await call('sendMediaGroup', {
            media: post.imageUrls.map((media, index) => ({
              type: 'photo',
              media,
              ...(index === 0 && captionHtml
                ? {
                    caption: caption.text,
                    caption_entities: caption.entities,
                  }
                : {}),
            })),
          })) as Array<{ message_id: number }>;
          ids = result.map((message) => String(message.message_id));
          for (const followupHtml of followupHtmlParts) {
            const followup = toBotFormattedText(followupHtml);
            const textResult = (await call('sendMessage', {
              text: followup.text,
              entities: followup.entities,
            })) as { message_id: number };
            ids.push(String(textResult.message_id));
          }
        } else if (post.imageUrls.length === 1) {
          const caption = toBotFormattedText(captionHtml);
          const result = (await call('sendPhoto', {
            photo: post.imageUrls[0],
            caption: caption.text,
            caption_entities: caption.entities,
          })) as { message_id: number };
          ids = [String(result.message_id)];
          for (const followupHtml of followupHtmlParts) {
            const followup = toBotFormattedText(followupHtml);
            const textResult = (await call('sendMessage', {
              text: followup.text,
              entities: followup.entities,
            })) as { message_id: number };
            ids.push(String(textResult.message_id));
          }
        } else {
          ids = [];
          for (const textHtml of textHtmlParts) {
            const message = toBotFormattedText(textHtml);
            const result = (await call('sendMessage', {
              text: message.text,
              entities: message.entities,
            })) as { message_id: number };
            ids.push(String(result.message_id));
          }
        }
      }
      const publishedUrls = this.telegramMessageUrlsForPost(
        channel,
        ids,
        post.imageUrls.length,
      );
      return this.prisma.telegramManagedPost.update({
        where: { id: post.id },
        data: {
          status: scheduleAt ? 'SCHEDULED' : 'PUBLISHED',
          telegramRemoteStatus: scheduleAt
            ? TelegramManagedPostRemoteStatus.SCHEDULED
            : TelegramManagedPostRemoteStatus.PUBLISHED,
          scheduledAt: scheduleAt ?? null,
          publishedAt: scheduleAt ? null : new Date(),
          telegramMessageIds: ids,
          telegramMessageUrls: publishedUrls,
          sourceType: source.sourceType,
          sourceId: source.sourceId,
          publishMode,
          lastError: null,
          lastTelegramSyncedAt: new Date(),
          lastTelegramSyncNote: null,
        },
        include: this.managedPostInclude,
      });
    } catch (error) {
      const rawMessage =
        error instanceof Error ? error.message : 'Telegram publish failed';
      const publicMessage = /MEDIA_INVALID/i.test(rawMessage)
        ? 'Telegram rejected one of the images. Remove it, upload it again, and retry.'
        : /AUTH_KEY|SESSION|AUTH_KEY_UNREGISTERED/i.test(rawMessage)
          ? 'The connected Telegram account session is no longer valid. Reconnect the account and retry.'
          : rawMessage;
      await this.prisma.telegramManagedPost.update({
        where: { id: post.id },
        data: {
          status: 'FAILED',
          telegramRemoteStatus: previousScheduledMessageCancelled
            ? TelegramManagedPostRemoteStatus.MISSING
            : TelegramManagedPostRemoteStatus.UNKNOWN,
          lastError: publicMessage,
          telegramMessageIds: previousScheduledMessageCancelled
            ? []
            : undefined,
          telegramMessageUrls: previousScheduledMessageCancelled
            ? []
            : undefined,
          sourceType: previousScheduledMessageCancelled ? null : undefined,
          sourceId: previousScheduledMessageCancelled ? null : undefined,
        },
      });
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(publicMessage);
    }
  }

  async publishManagedPostNow(
    userId: string,
    channelId: string,
    postId: string,
    dto: PublishTelegramManagedPostDto,
  ) {
    const workspaceId = await this.workspace(userId);
    return this.publishManagedPost(
      workspaceId,
      channelId,
      postId,
      undefined,
      (dto.longTextMode as 'IMAGES_THEN_TEXT' | 'CAPTION_THEN_TEXT') ||
        'IMAGES_THEN_TEXT',
    );
  }

  async scheduleManagedPost(
    userId: string,
    channelId: string,
    postId: string,
    dto: ScheduleTelegramManagedPostDto,
  ) {
    const scheduledAt = new Date(dto.scheduledAt);
    if (scheduledAt.getTime() <= Date.now())
      throw new BadRequestException('Schedule date must be in the future');
    const workspaceId = await this.workspace(userId);
    return this.publishManagedPost(
      workspaceId,
      channelId,
      postId,
      scheduledAt,
      (dto.longTextMode as 'IMAGES_THEN_TEXT' | 'CAPTION_THEN_TEXT') ||
        'IMAGES_THEN_TEXT',
    );
  }

  private async cancelScheduledManagedPost(
    workspaceId: string,
    post: {
      telegramChannelId: string;
      sourceType: TelegramSourceType | null;
      sourceId: string | null;
      telegramMessageIds: string[];
      telegramChannel: {
        username: string | null;
        telegramChatId: string | null;
      };
    },
  ) {
    if (!post.telegramMessageIds.length) return;
    if (post.sourceType !== TelegramSourceType.MTPROTO || !post.sourceId) {
      throw new BadRequestException(
        'Scheduled post has no MTProto source and cannot be cancelled safely',
      );
    }
    const account = await this.connectedAccount(
      workspaceId,
      post.telegramChannelId,
      post.sourceId,
    );
    const channelReference = this.mtprotoChannelReference(post.telegramChannel);
    if (!channelReference.telegramChatId && !channelReference.username)
      throw new BadRequestException(
        'Scheduled post channel has no Telegram reference',
      );
    await this.mtprotoClient.deleteScheduledPost({
      ...this.accountCredentials(account),
      channel: channelReference,
      messageIds: post.telegramMessageIds,
    });
  }

  private skippedBulkItem(
    post: {
      id: string;
      title: string;
      status: TelegramManagedPostStatus;
      scheduledAt?: Date | null;
    },
    index: number,
    total: number,
    reason: string,
  ): BulkActionResultItem {
    return {
      postId: post.id,
      title: post.title,
      index,
      total,
      previousStatus: post.status,
      newStatus: post.status,
      scheduledAt: post.scheduledAt?.toISOString() ?? null,
      action: 'SKIPPED',
      success: false,
      skipped: true,
      message: `Post ${index}/${total} skipped: ${reason}`,
    };
  }

  private async appendBulkResult(
    results: BulkActionResultItem[],
    item: BulkActionResultItem,
    onProgress?: BulkProgressCallback,
  ) {
    results.push(item);
    await onProgress?.(item, results.length, item.total);
  }

  async publishPostGroup(
    userId: string,
    groupId: string,
    dto: PublishPostGroupDto,
    onProgress?: BulkProgressCallback,
  ): Promise<BulkActionResult> {
    const workspaceId = await this.workspace(userId);
    const group = await this.prisma.postGroup.findFirst({
      where: { id: groupId, workspaceId },
      include: {
        posts: {
          orderBy: [{ groupPosition: 'asc' }, { createdAt: 'asc' }],
          include: { telegramChannel: true },
        },
      },
    });
    if (!group) throw new NotFoundException('Post group not found');
    if (!group.posts.length)
      throw new BadRequestException('Post group is empty');
    const includeScheduled = dto.includeScheduled ?? true;
    const includeFailed = dto.includeFailed ?? true;
    const republishPublished = dto.republishPublished ?? false;
    const total = group.posts.length;
    const results: BulkActionResultItem[] = [];

    for (const [offset, post] of group.posts.entries()) {
      const index = offset + 1;
      const skipReason = publishGroupPostSkipReason(post.status, {
        includeScheduled,
        includeFailed,
        republishPublished,
      });
      if (skipReason) {
        await this.appendBulkResult(
          results,
          this.skippedBulkItem(post, index, total, skipReason),
          onProgress,
        );
        continue;
      }

      const previousStatus = post.status;
      try {
        if (previousStatus === TelegramManagedPostStatus.SCHEDULED) {
          await this.cancelScheduledManagedPost(workspaceId, post);
          await this.prisma.telegramManagedPost.update({
            where: { id: post.id },
            data: {
              status: TelegramManagedPostStatus.DRAFT,
              telegramRemoteStatus: TelegramManagedPostRemoteStatus.NONE,
              scheduledAt: null,
              telegramMessageIds: [],
              telegramMessageUrls: [],
              sourceType: null,
              sourceId: null,
              lastError: null,
            },
          });
        }
        const published = await this.publishManagedPost(
          workspaceId,
          group.telegramChannelId,
          post.id,
          undefined,
          post.publishMode === 'CAPTION_THEN_TEXT'
            ? 'CAPTION_THEN_TEXT'
            : 'IMAGES_THEN_TEXT',
        );
        await this.appendBulkResult(
          results,
          {
            postId: post.id,
            title: post.title,
            index,
            total,
            previousStatus,
            newStatus: published.status,
            scheduledAt: null,
            action: 'PUBLISHED',
            success: true,
            message: `Post ${index}/${total} published`,
          },
          onProgress,
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Could not publish post';
        await this.prisma.telegramManagedPost.update({
          where: { id: post.id },
          data: {
            status: TelegramManagedPostStatus.FAILED,
            lastError: message,
          },
        });
        await this.appendBulkResult(
          results,
          {
            postId: post.id,
            title: post.title,
            index,
            total,
            previousStatus,
            newStatus: TelegramManagedPostStatus.FAILED,
            scheduledAt: null,
            action: 'FAILED',
            success: false,
            message: `Post ${index}/${total} failed: ${message}`,
            error: message,
          },
          onProgress,
        );
      }
    }
    return {
      groupId,
      action: 'PUBLISH_ALL',
      ...bulkActionCounts(results),
      results,
    };
  }

  async resetPostGroupToDrafts(
    userId: string,
    groupId: string,
    onProgress?: BulkProgressCallback,
  ): Promise<BulkActionResult> {
    const workspaceId = await this.workspace(userId);
    const group = await this.prisma.postGroup.findFirst({
      where: { id: groupId, workspaceId },
      include: {
        posts: {
          orderBy: [{ groupPosition: 'asc' }, { createdAt: 'asc' }],
          include: { telegramChannel: true },
        },
      },
    });
    if (!group) throw new NotFoundException('Post group not found');
    if (!group.posts.length)
      throw new BadRequestException('Post group is empty');
    const total = group.posts.length;
    const results: BulkActionResultItem[] = [];

    for (const [offset, post] of group.posts.entries()) {
      const index = offset + 1;
      const previousStatus = post.status;
      if (previousStatus === TelegramManagedPostStatus.DRAFT) {
        await this.appendBulkResult(
          results,
          this.skippedBulkItem(post, index, total, 'already a draft'),
          onProgress,
        );
        continue;
      }
      try {
        if (previousStatus === TelegramManagedPostStatus.SCHEDULED) {
          await this.cancelScheduledManagedPost(workspaceId, post);
        }
        await this.prisma.telegramManagedPost.update({
          where: { id: post.id },
          data: {
            status: TelegramManagedPostStatus.DRAFT,
            telegramRemoteStatus: TelegramManagedPostRemoteStatus.NONE,
            scheduledAt: null,
            publishedAt: null,
            telegramMessageIds: [],
            telegramMessageUrls: [],
            sourceType: null,
            sourceId: null,
            publishMode: null,
            lastError: null,
          },
        });
        await this.appendBulkResult(
          results,
          {
            postId: post.id,
            title: post.title,
            index,
            total,
            previousStatus,
            newStatus: TelegramManagedPostStatus.DRAFT,
            scheduledAt: null,
            action: 'CONVERTED_TO_DRAFT',
            success: true,
            message: `Post ${index}/${total} converted to draft`,
          },
          onProgress,
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Could not reset post';
        await this.appendBulkResult(
          results,
          {
            postId: post.id,
            title: post.title,
            index,
            total,
            previousStatus,
            newStatus: previousStatus,
            scheduledAt: post.scheduledAt?.toISOString() ?? null,
            action: 'FAILED',
            success: false,
            message: `Post ${index}/${total} failed: ${message}`,
            error: message,
          },
          onProgress,
        );
      }
    }
    return {
      groupId,
      action: 'RESET_GROUP_TO_DRAFT',
      ...bulkActionCounts(results),
      results,
    };
  }

  async schedulePostGroupSequence(
    userId: string,
    groupId: string,
    dto: SchedulePostGroupSequenceDto,
    onProgress?: BulkProgressCallback,
  ): Promise<BulkActionResult> {
    const workspaceId = await this.workspace(userId);
    const group = await this.prisma.postGroup.findFirst({
      where: { id: groupId, workspaceId },
      include: {
        posts: {
          orderBy: [{ groupPosition: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
    if (!group) throw new NotFoundException('Post group not found');
    if (!group.posts.length)
      throw new BadRequestException('Post group is empty');
    const overwriteExistingScheduled = dto.overwriteExistingScheduled ?? false;
    const includeFailed = dto.includeFailed ?? true;
    const includeDraftsOnly = dto.includeDraftsOnly ?? false;
    const timezone = dto.timezone?.trim() || 'UTC';
    const scheduleOptions = {
      includeDraftsOnly,
      overwriteExistingScheduled,
      includeFailed,
    };
    const selectedPosts = group.posts.filter(
      (post) => !scheduleGroupPostSkipReason(post.status, scheduleOptions),
    );
    const dates = scheduleSequenceDates(
      dto.startDate.slice(0, 10),
      dto.time,
      dto.intervalDays,
      selectedPosts.length,
      timezone,
    );
    if (dates.some((date) => date.getTime() <= Date.now())) {
      throw new BadRequestException(
        'Every schedule date must be in the future',
      );
    }
    const scheduleByPostId = new Map(
      selectedPosts.map((post, index) => [post.id, dates[index]]),
    );
    const total = group.posts.length;
    const results: BulkActionResultItem[] = [];

    for (const [offset, post] of group.posts.entries()) {
      const index = offset + 1;
      const scheduledAt = scheduleByPostId.get(post.id);
      if (!scheduledAt) {
        const reason =
          scheduleGroupPostSkipReason(post.status, scheduleOptions) ||
          'post is not selected';
        await this.appendBulkResult(
          results,
          this.skippedBulkItem(post, index, total, reason),
          onProgress,
        );
        continue;
      }
      const previousStatus = post.status;
      try {
        const scheduled = await this.publishManagedPost(
          workspaceId,
          group.telegramChannelId,
          post.id,
          scheduledAt,
          post.publishMode === 'CAPTION_THEN_TEXT'
            ? 'CAPTION_THEN_TEXT'
            : 'IMAGES_THEN_TEXT',
        );
        await this.appendBulkResult(
          results,
          {
            postId: post.id,
            title: post.title,
            index,
            total,
            previousStatus,
            newStatus: scheduled.status,
            scheduledAt: scheduled.scheduledAt?.toISOString() ?? null,
            action: 'SCHEDULED',
            success: true,
            message: `Post ${index}/${total} scheduled for ${scheduledAt.toISOString()} (${timezone})`,
          },
          onProgress,
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Could not schedule post';
        await this.appendBulkResult(
          results,
          {
            postId: post.id,
            title: post.title,
            index,
            total,
            previousStatus,
            newStatus: TelegramManagedPostStatus.FAILED,
            scheduledAt: scheduledAt.toISOString(),
            action: 'FAILED',
            success: false,
            message: `Post ${index}/${total} failed: ${message}`,
            error: message,
          },
          onProgress,
        );
      }
    }
    return {
      groupId,
      action: 'SCHEDULE_SEQUENCE',
      ...bulkActionCounts(results),
      results,
    };
  }

  private async moveManagedPostInternal(
    workspaceId: string,
    postId: string,
    targetTelegramChannelId: string,
    keepGroup: boolean,
  ) {
    const post = await this.prisma.telegramManagedPost.findFirst({
      where: { id: postId, workspaceId },
      include: { telegramChannel: true },
    });
    if (!post) throw new NotFoundException('Post not found');
    const previousStatus = post.status;
    const transition = movedPostState(previousStatus);
    let cancellationError: string | null = null;

    if (
      previousStatus === TelegramManagedPostStatus.SCHEDULED &&
      post.telegramMessageIds.length
    ) {
      try {
        await this.cancelScheduledManagedPost(workspaceId, post);
      } catch (error) {
        cancellationError =
          error instanceof Error
            ? error.message
            : 'Could not cancel the old scheduled message';
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.telegramManagedPost.update({
        where: { id: post.id },
        data: {
          telegramChannelId: targetTelegramChannelId,
          ...movedPostDatabaseState(
            previousStatus,
            post.scheduledAt,
            keepGroup,
            cancellationError,
          ),
        },
      });
      if (!keepGroup && post.groupId) {
        await this.normalizePostGroupPositions(tx, post.groupId);
      }
    });

    if (cancellationError) {
      const failedPost = await this.prisma.telegramManagedPost.findUnique({
        where: { id: post.id },
        include: this.managedPostInclude,
      });
      return {
        post: failedPost,
        result: {
          postId: post.id,
          title: post.title,
          previousStatus,
          newStatus: TelegramManagedPostStatus.FAILED,
          scheduledAt: post.scheduledAt?.toISOString() ?? null,
          action: 'SCHEDULE_CANCEL_FAILED',
          success: false,
          error: cancellationError,
        },
      };
    }

    if (
      previousStatus === TelegramManagedPostStatus.SCHEDULED &&
      post.scheduledAt
    ) {
      try {
        const scheduledPost = await this.publishManagedPost(
          workspaceId,
          targetTelegramChannelId,
          post.id,
          post.scheduledAt,
          post.publishMode === 'CAPTION_THEN_TEXT'
            ? 'CAPTION_THEN_TEXT'
            : 'IMAGES_THEN_TEXT',
        );
        return {
          post: scheduledPost,
          result: {
            postId: post.id,
            title: post.title,
            previousStatus,
            newStatus: scheduledPost.status,
            scheduledAt: scheduledPost.scheduledAt?.toISOString() ?? null,
            action: transition.action,
            success: true,
          },
        };
      } catch (error) {
        const failedPost = await this.prisma.telegramManagedPost.findUnique({
          where: { id: post.id },
          include: this.managedPostInclude,
        });
        return {
          post: failedPost,
          result: {
            postId: post.id,
            title: post.title,
            previousStatus,
            newStatus: failedPost?.status ?? TelegramManagedPostStatus.FAILED,
            scheduledAt: failedPost?.scheduledAt?.toISOString() ?? null,
            action: 'RESCHEDULE_FAILED',
            success: false,
            error:
              error instanceof Error
                ? error.message
                : 'Could not schedule post in target channel',
          },
        };
      }
    }

    const movedPost = await this.prisma.telegramManagedPost.findUnique({
      where: { id: post.id },
      include: this.managedPostInclude,
    });
    return {
      post: movedPost,
      result: {
        postId: post.id,
        title: post.title,
        previousStatus,
        newStatus: transition.status,
        scheduledAt: null,
        action: transition.action,
        success: true,
      },
    };
  }

  private moveBulkResultItem(
    result: {
      postId: string;
      title: string;
      previousStatus: TelegramManagedPostStatus;
      newStatus: TelegramManagedPostStatus;
      scheduledAt?: string | null;
      success: boolean;
      error?: string;
    },
    index: number,
    total: number,
  ): BulkActionResultItem {
    const action: BulkActionResultItem['action'] = result.success
      ? result.previousStatus === TelegramManagedPostStatus.PUBLISHED ||
        result.previousStatus === TelegramManagedPostStatus.FAILED ||
        result.previousStatus === TelegramManagedPostStatus.PUBLISHING
        ? 'CONVERTED_TO_DRAFT'
        : 'MOVED'
      : 'FAILED';
    const message = result.success
      ? action === 'CONVERTED_TO_DRAFT'
        ? `Post ${index}/${total} moved and converted to draft`
        : `Post ${index}/${total} moved`
      : `Post ${index}/${total} failed: ${result.error || 'Could not move post'}`;
    return {
      postId: result.postId,
      title: result.title,
      index,
      total,
      previousStatus: result.previousStatus,
      newStatus: result.newStatus,
      scheduledAt: result.scheduledAt ?? null,
      action,
      success: result.success,
      message,
      error: result.error,
    };
  }

  async moveManagedPost(
    userId: string,
    channelId: string,
    postId: string,
    dto: MovePostChannelDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const [post, targetChannel] = await Promise.all([
      this.prisma.telegramManagedPost.findFirst({
        where: { id: postId, workspaceId, telegramChannelId: channelId },
        select: { id: true },
      }),
      this.prisma.telegramChannel.findFirst({
        where: {
          id: dto.targetTelegramChannelId,
          workspaceId,
          isActive: true,
        },
        select: { id: true },
      }),
    ]);
    if (!post) throw new NotFoundException('Post not found');
    if (!targetChannel)
      throw new NotFoundException('Target Telegram channel not found');
    if (channelId === targetChannel.id) {
      throw new BadRequestException('Post already belongs to target channel');
    }
    const moved = await this.moveManagedPostInternal(
      workspaceId,
      postId,
      targetChannel.id,
      false,
    );
    const results = [this.moveBulkResultItem(moved.result, 1, 1)];
    return {
      post: moved.post,
      postId,
      action: 'MOVE_POST_CHANNEL' as const,
      ...bulkActionCounts(results),
      results,
    };
  }

  async movePostGroup(
    userId: string,
    groupId: string,
    dto: MovePostChannelDto,
    onProgress?: BulkProgressCallback,
  ) {
    const workspaceId = await this.workspace(userId);
    const [group, targetChannel] = await Promise.all([
      this.prisma.postGroup.findFirst({
        where: { id: groupId, workspaceId },
        include: {
          posts: {
            orderBy: [{ groupPosition: 'asc' }, { createdAt: 'asc' }],
            select: { id: true },
          },
        },
      }),
      this.prisma.telegramChannel.findFirst({
        where: {
          id: dto.targetTelegramChannelId,
          workspaceId,
          isActive: true,
        },
        select: { id: true },
      }),
    ]);
    if (!group) throw new NotFoundException('Post group not found');
    if (!targetChannel)
      throw new NotFoundException('Target Telegram channel not found');
    if (group.telegramChannelId === targetChannel.id) {
      throw new BadRequestException('Group already belongs to target channel');
    }
    const originalChannelId = group.telegramChannelId;

    const rawResults: Array<{
      postId: string;
      title: string;
      previousStatus: TelegramManagedPostStatus;
      newStatus: TelegramManagedPostStatus;
      scheduledAt?: string | null;
      success: boolean;
      error?: string;
    }> = [];
    const movedPostIds: string[] = [];
    for (const [index, post] of group.posts.entries()) {
      const moved = await this.moveManagedPostInternal(
        workspaceId,
        post.id,
        targetChannel.id,
        true,
      );
      rawResults.push(moved.result);
      await onProgress?.(
        this.moveBulkResultItem(moved.result, index + 1, group.posts.length),
        index + 1,
        group.posts.length,
      );
      if (moved.result.success) {
        movedPostIds.push(post.id);
        continue;
      }

      const rollbackFailures: string[] = [];
      for (const movedPostId of movedPostIds.reverse()) {
        try {
          const rolledBack = await this.moveManagedPostInternal(
            workspaceId,
            movedPostId,
            originalChannelId,
            true,
          );
          if (!rolledBack.result.success) {
            rollbackFailures.push(
              `${rolledBack.result.title}: ${rolledBack.result.error || 'rollback failed'}`,
            );
          }
        } catch (error) {
          rollbackFailures.push(
            `${movedPostId}: ${error instanceof Error ? error.message : 'rollback failed'}`,
          );
        }
      }

      const moveError = moved.result.error || 'Could not move post';
      if (rollbackFailures.length) {
        throw new InternalServerErrorException(
          `Could not move group. ${moveError}. Rollback also failed for: ${rollbackFailures.join('; ')}`,
        );
      }
      throw new BadRequestException(
        `Could not move group. ${moveError}. The group was left in the original channel.`,
      );
    }
    await this.prisma.postGroup.update({
      where: { id: group.id },
      data: { telegramChannelId: targetChannel.id },
    });
    const results = rawResults.map((result, index) =>
      this.moveBulkResultItem(result, index + 1, rawResults.length),
    );
    return {
      group: await this.postGroupForWorkspace(workspaceId, group.id),
      groupId,
      action: 'MOVE_GROUP_CHANNEL' as const,
      ...bulkActionCounts(results),
      results,
    };
  }

  private splitTelegramMarkup(rawText: string, maxPlainLength: number) {
    const parts: string[] = [];
    let remaining = rawText.trim();
    while (remaining) {
      const [current, next] = this.splitTelegramMarkupOnce(
        remaining,
        maxPlainLength,
      );
      parts.push(current);
      if (!next) break;
      remaining = next;
    }
    return parts;
  }

  private splitTelegramMarkupOnce(
    rawText: string,
    maxPlainLength: number,
  ): [string, string] {
    const html = telegramMarkupToHtml(rawText);
    const [plain] = HTMLParser.parse(html);
    if (plain.length <= maxPlainLength) return [rawText.trim(), ''];
    const boundaries = new Set<number>();
    for (const match of rawText.matchAll(/\n\s*\n/g)) {
      boundaries.add((match.index || 0) + match[0].length);
    }
    for (const match of rawText.matchAll(/[.!?…](?:["'»”)]*)\s+/g)) {
      boundaries.add((match.index || 0) + match[0].length);
    }
    for (const match of rawText.matchAll(/\n/g)) {
      boundaries.add((match.index || 0) + 1);
    }
    for (const match of rawText.matchAll(/\s+/g)) {
      boundaries.add((match.index || 0) + match[0].length);
    }
    const splitAt = [...boundaries]
      .sort((a, b) => b - a)
      .find((position) => {
        const candidate = rawText.slice(0, position).trimEnd();
        if (!candidate || !this.hasBalancedTelegramMarkup(candidate)) {
          return false;
        }
        const [plain] = HTMLParser.parse(telegramMarkupToHtml(candidate));
        return plain.length <= maxPlainLength;
      });
    const fallbackAt =
      splitAt ?? this.findHardTelegramMarkupSplit(rawText, maxPlainLength);
    if (!fallbackAt) return [rawText.trim(), ''];
    const currentRaw = rawText.slice(0, fallbackAt).trimEnd();
    const remainderRaw = rawText.slice(fallbackAt).trimStart();
    return [currentRaw, remainderRaw];
  }

  private findHardTelegramMarkupSplit(rawText: string, maxPlainLength: number) {
    for (
      let position = Math.min(rawText.length, maxPlainLength);
      position > 0;
      position -= 1
    ) {
      const candidate = rawText.slice(0, position).trimEnd();
      if (!candidate || !this.hasBalancedTelegramMarkup(candidate)) continue;
      const [plain] = HTMLParser.parse(telegramMarkupToHtml(candidate));
      if (plain.length <= maxPlainLength) return position;
    }
    return 0;
  }

  private toBotMessageEntity(entity: {
    className?: string;
    offset?: number;
    length?: number;
    url?: string;
    language?: string;
    documentId?: unknown;
  }): BotMessageEntity | null {
    const offset = entity.offset ?? 0;
    const length = entity.length ?? 0;
    const base = { offset, length };
    switch (entity.className) {
      case 'MessageEntityBold':
        return { ...base, type: 'bold' };
      case 'MessageEntityItalic':
        return { ...base, type: 'italic' };
      case 'MessageEntityUnderline':
        return { ...base, type: 'underline' };
      case 'MessageEntityStrike':
        return { ...base, type: 'strikethrough' };
      case 'MessageEntitySpoiler':
        return { ...base, type: 'spoiler' };
      case 'MessageEntityCode':
        return { ...base, type: 'code' };
      case 'MessageEntityPre':
        return {
          ...base,
          type: 'pre',
          ...(entity.language ? { language: entity.language } : {}),
        };
      case 'MessageEntityTextUrl':
        return entity.url
          ? { ...base, type: 'text_link', url: entity.url }
          : null;
      case 'MessageEntityBlockquote':
        return { ...base, type: 'blockquote' };
      case 'MessageEntityCustomEmoji':
        return entity.documentId
          ? {
              ...base,
              type: 'custom_emoji',
              custom_emoji_id: String(entity.documentId),
            }
          : null;
      default:
        return null;
    }
  }

  private hasBalancedTelegramMarkup(value: string) {
    if ((value.match(/```/g) || []).length % 2 !== 0) return false;
    const withoutFenced = value.replace(/```[\s\S]*?```/g, '');
    if ((withoutFenced.match(/`/g) || []).length % 2 !== 0) return false;
    return ['**', '__', '++', '~~', '||'].every((marker) => {
      let count = 0;
      let cursor = 0;
      while ((cursor = withoutFenced.indexOf(marker, cursor)) !== -1) {
        count += 1;
        cursor += marker.length;
      }
      return count % 2 === 0;
    });
  }

  async deleteManagedPost(userId: string, channelId: string, postId: string) {
    const workspaceId = await this.workspace(userId);
    const post = await this.prisma.telegramManagedPost.findFirst({
      where: { id: postId, workspaceId, telegramChannelId: channelId },
      include: { telegramChannel: true },
    });
    if (!post) throw new NotFoundException('Post draft not found');
    if (post.status === 'SCHEDULED' && post.telegramMessageIds.length) {
      if (post.sourceType !== TelegramSourceType.MTPROTO || !post.sourceId) {
        throw new BadRequestException(
          'Scheduled post has no MTProto source and cannot be cancelled safely',
        );
      }
      const account = await this.connectedAccount(
        workspaceId,
        channelId,
        post.sourceId,
      );
      const channelReference = this.mtprotoChannelReference(post.telegramChannel);
      if (!channelReference.telegramChatId && !channelReference.username)
        throw new BadRequestException('Channel has no Telegram reference');
      await this.mtprotoClient.deleteScheduledPost({
        ...this.accountCredentials(account),
        channel: channelReference,
        messageIds: post.telegramMessageIds,
      });
    }
    return this.prisma.$transaction(async (tx) => {
      await this.createManagedPostRevision(tx, post, 'before_delete');
      return tx.telegramManagedPost.delete({ where: { id: postId } });
    });
  }

  async adAnalyses(userId: string, channelId: string) {
    const workspaceId = await this.workspace(userId);
    await this.findOne(userId, channelId);
    return this.prisma.telegramChannelAdAnalysis.findMany({
      where: { workspaceId, telegramChannelId: channelId },
      include: {
        assignedMember: WorkspaceService.assignedMemberInclude,
      },
      orderBy: { analyzedAt: 'desc' },
    });
  }

  async createAdAnalysis(
    userId: string,
    channelId: string,
    dto: CreateTelegramChannelAdAnalysisDto,
  ) {
    const { workspaceId, assignedMemberId } =
      await this.workspaceService.resolveAssignedMemberId(
        userId,
        dto.assignedMemberId,
      );
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId, isActive: true },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');

    let warning: string | null = null;
    if (channel.username || channel.telegramChatId) {
      try {
        const account = await this.connectedAccount(
          workspaceId,
          channelId,
          await this.bestMtprotoAccountId(
            workspaceId,
            channelId,
            TelegramChannelDataType.POSTS,
          ),
        );
        await this.syncPublicChannelInfo(workspaceId, channelId, account);
        await this.syncPostsMetricsForWorkspace(workspaceId, channelId, {
          telegramUserAccountId: account.id,
          postLimit: dto.postLimit ?? 20,
        });
      } catch (error) {
        warning =
          error instanceof Error
            ? error.message
            : 'Telegram post metrics sync failed';
        this.logger.warn(
          `Ad analysis continues without fresh sync for channel=${channelId}: ${warning}`,
        );
      }
    }

    const metrics = await this.calculateAdAnalysisMetrics(
      workspaceId,
      channelId,
      dto.postLimit,
      dto.price,
    );
    const analysis = await this.prisma.telegramChannelAdAnalysis.create({
      data: {
        workspaceId,
        telegramChannelId: channelId,
        assignedMemberId,
        analyzedAt: new Date(dto.analyzedAt),
        status: dto.status,
        verdict: dto.verdict?.trim() || null,
        price: dto.price,
        currency: (dto.currency || 'USD').trim().toUpperCase(),
        reasonTags: dto.reasonTags ?? [],
        reasonSummary: dto.reasonSummary?.trim() || null,
        notes: dto.notes?.trim() || null,
        nextReviewAt: dto.nextReviewAt ? new Date(dto.nextReviewAt) : null,
        ...metrics,
      },
      include: {
        assignedMember: WorkspaceService.assignedMemberInclude,
      },
    });
    return { ...analysis, warning };
  }

  async updateAdAnalysis(
    userId: string,
    channelId: string,
    analysisId: string,
    dto: UpdateTelegramChannelAdAnalysisDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const existing = await this.prisma.telegramChannelAdAnalysis.findFirst({
      where: { id: analysisId, workspaceId, telegramChannelId: channelId },
    });
    if (!existing) throw new NotFoundException('Ad analysis not found');
    const assignedMemberId =
      dto.assignedMemberId === undefined
        ? undefined
        : (
            await this.workspaceService.resolveAssignedMemberId(
              userId,
              dto.assignedMemberId,
            )
          ).assignedMemberId;
    const price =
      dto.price === undefined
        ? existing.price == null
          ? null
          : Number(existing.price)
        : dto.price;
    const metrics = await this.calculateAdAnalysisMetrics(
      workspaceId,
      channelId,
      dto.postLimit,
      price,
    );
    return this.prisma.telegramChannelAdAnalysis.update({
      where: { id: analysisId },
      data: {
        assignedMemberId,
        analyzedAt: dto.analyzedAt ? new Date(dto.analyzedAt) : undefined,
        status: dto.status,
        verdict:
          dto.verdict === undefined ? undefined : dto.verdict.trim() || null,
        price: dto.price,
        currency: dto.currency?.trim().toUpperCase(),
        reasonTags: dto.reasonTags,
        reasonSummary:
          dto.reasonSummary === undefined
            ? undefined
            : dto.reasonSummary.trim() || null,
        notes: dto.notes === undefined ? undefined : dto.notes.trim() || null,
        nextReviewAt:
          dto.nextReviewAt === undefined
            ? undefined
            : new Date(dto.nextReviewAt),
        ...metrics,
      },
      include: {
        assignedMember: WorkspaceService.assignedMemberInclude,
      },
    });
  }

  async deleteAdAnalysis(
    userId: string,
    channelId: string,
    analysisId: string,
  ) {
    const workspaceId = await this.workspace(userId);
    const existing = await this.prisma.telegramChannelAdAnalysis.findFirst({
      where: { id: analysisId, workspaceId, telegramChannelId: channelId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Ad analysis not found');
    return this.prisma.telegramChannelAdAnalysis.delete({
      where: { id: analysisId },
    });
  }

  async audience(userId: string, channelId: string) {
    await this.findOne(userId, channelId);
    return this.analyticsService.getActiveAudienceEstimate(channelId);
  }

  async createAudienceSnapshot(
    userId: string,
    channelId: string,
    source = 'manual',
  ) {
    await this.findOne(userId, channelId);
    return this.analyticsService.createAudienceSnapshot(channelId, source);
  }

  async audienceSnapshots(userId: string, channelId: string, limit = 50) {
    const workspaceId = await this.workspace(userId);
    await this.findOne(userId, channelId);
    const safeLimit = Math.max(1, Math.min(200, limit));
    const rows = await this.prisma.telegramChannelAudienceSnapshot.findMany({
      where: { workspaceId, telegramChannelId: channelId },
      orderBy: { collectedAt: 'desc' },
      take: safeLimit,
    });
    return rows.reverse();
  }

  async financialSummary(userId: string, channelId: string) {
    await this.findOne(userId, channelId);
    return this.analyticsService.getChannelFinancialSummary(channelId);
  }

  async updatePostManualMetrics(
    userId: string,
    channelId: string,
    postId: string,
    dto: UpdateTelegramPostManualMetricsDto,
  ) {
    const workspaceId = await this.workspace(userId);
    await this.findOne(userId, channelId);
    const post = await this.prisma.telegramPost.findFirst({
      where: { id: postId, workspaceId, telegramChannelId: channelId },
    });
    if (!post) throw new NotFoundException('Telegram post not found');
    return this.prisma.telegramPost.update({
      where: { id: post.id },
      data: {
        manualOwnViews: dto.manualOwnViews,
        manualOwnReactions: dto.manualOwnReactions,
        excludeFromAnalytics: dto.excludeFromAnalytics,
      },
    });
  }

  async importChannel(
    userId: string,
    dto: ImportTelegramChannelDto,
    onProgress?: BulkProgressCallback,
  ) {
    const workspaceId = await this.workspace(userId);
    const account = await this.firstConnectedAccount(workspaceId);
    const rawInput = dto.input ?? dto.username;
    const importInput = parseTelegramImportInput(rawInput || '');
    const steps = this.importProgressSteps(importInput.type);
    this.logger.log(
      `Importing Telegram source: inputType=${importInput.type} account=${account.id} invite=${importInput.type === 'invite' ? this.maskInviteHash(importInput.inviteHash) : 'n/a'}`,
    );

    await this.notifyImportProgress(onProgress, steps, 0);
    if (importInput.type === 'invite') {
      await this.notifyImportProgress(onProgress, steps, 1);
    }
    await this.notifyImportProgress(
      onProgress,
      steps,
      importInput.type === 'invite' ? 2 : 1,
    );
    const info = this.ensureImportableChannelEntity(
      await this.resolveImportEntity(account, importInput),
      importInput.type,
    );
    const username = this.normalizeUsername(info.username);
    if (info.kind === 'person') {
      return this.upsertImportedPerson(workspaceId, {
        title: info.title,
        username,
        description: info.description,
        photoUrl: info.photoUrl,
      });
    }
    const telegramChatId = info.telegramChatId || null;
    const matchingChannels = await this.findMatchingChannels(
      workspaceId,
      username,
      telegramChatId,
    );
    const existing = this.pickCanonicalChannel(matchingChannels);
    const payload = {
      ...this.channelIdentityPatch({
        ...info,
        inviteLink:
          importInput.type === 'invite'
            ? canonicalTelegramInviteLink(importInput.inviteHash)
            : info.inviteLink || undefined,
      }),
      sourceType: 'telegram',
      lastPublicSyncedAt: new Date(),
    };
    await this.notifyImportProgress(
      onProgress,
      steps,
      importInput.type === 'invite' ? 3 : 2,
    );
    const channel = await this.prisma.$transaction(async (tx) => {
      if (!existing) {
        return tx.telegramChannel.create({
          data: {
            workspaceId,
            ...payload,
          },
        });
      }
      const duplicateIds = matchingChannels
        .filter((candidate) => candidate.id !== existing.id)
        .map((candidate) => candidate.id);
      await this.mergeDuplicateChannels(
        tx,
        workspaceId,
        existing.id,
        duplicateIds,
      );
      return tx.telegramChannel.update({
        where: { id: existing.id },
        data: { ...payload, isActive: true },
      });
    });
    await this.sourceAccessService.recordDataSource({
      workspaceId,
      channelId: channel.id,
      sourceId: account.id,
      sourceType: TelegramSourceType.MTPROTO,
      dataType: TelegramChannelDataType.CHANNEL_INFO,
      status: TelegramDataSourceStatus.SUCCESS,
      sourceDisplayName: this.sourceDisplayName(account),
      metadata: {
        source: 'channel_import',
        inputType: importInput.type,
        joinedByInvite: Boolean(info.joinedByInvite),
      },
    });
    await this.notifyImportProgress(
      onProgress,
      steps,
      importInput.type === 'invite' ? 4 : 3,
    );
    const importedChannel = await this.findOne(userId, channel.id);
    const initialSync = await this.runInitialImportBackfill({
      userId,
      workspaceId,
      channelId: channel.id,
      accountId: account.id,
    });
    this.logger.log(
      `Imported Telegram entity: kind=${info.kind} chatId=${info.telegramChatId} joinedByInvite=${Boolean(info.joinedByInvite)} backfillSuccess=${Boolean(initialSync?.success)}`,
    );
    return { ...importedChannel, initialSync };
  }

  async remove(userId: string, id: string) {
    const workspaceId = await this.workspace(userId);
    await this.findOne(userId, id);
    return this.prisma.$transaction(async (tx) => {
      const campaigns = await tx.adCampaign.findMany({
        where: { workspaceId, telegramChannelId: id },
        select: { id: true },
      });
      const campaignIds = campaigns.map((campaign) => campaign.id);
      if (campaignIds.length) {
        await tx.transaction.deleteMany({
          where: { workspaceId, adCampaignId: { in: campaignIds } },
        });
      }
      await tx.promo.deleteMany({
        where: { workspaceId, telegramChannelId: id },
      });
      await tx.telegramInviteLink.deleteMany({
        where: { workspaceId, telegramChannelId: id },
      });
      await tx.adCampaign.deleteMany({
        where: { workspaceId, telegramChannelId: id },
      });
      await tx.telegramChannel.delete({ where: { id } });
      return { success: true };
    });
  }

  async syncNow(
    userId: string,
    channelId: string,
    dto: SyncNowDto = {},
    onProgress?: BulkProgressCallback,
  ) {
    const startedAt = Date.now();
    const workspaceId = await this.workspace(userId);
    const channel = await this.findOne(userId, channelId);
    const selection = this.resolveSyncSelection(
      channel as Partial<TelegramChannelSyncSelection>,
      dto,
    );
    if (!this.syncSelectionHasAnyEnabled(selection)) {
      throw new BadRequestException('Select at least one sync section');
    }
    if (dto.saveSelection) {
      await this.prisma.telegramChannel.update({
        where: { id: channelId },
        data: selection,
      });
    }
    const totalSteps = this.syncSelectionTotalSteps(selection);
    const account = await this.connectedAccount(
      workspaceId,
      channelId,
      dto.telegramUserAccountId ||
        (await this.bestMtprotoAccountId(
          workspaceId,
          channelId,
          TelegramChannelDataType.STATS,
        )),
    );
    this.applicationLogger.info({
      kind: 'integration',
      source: TelegramChannelsService.name,
      event: 'telegram.sync.started',
      message: `Telegram sync started for channel ${channelId}.`,
      workspaceId,
      userId,
      metadata: {
        channelId,
        sourceAccountId: account.id,
        selection,
      },
    });
    const steps: SyncStepResult[] = [];
    let progressStep = 0;
    const nextProgressStep = () => {
      progressStep += 1;
      return progressStep;
    };
    const postLimit = dto.postLimit || (await this.postSyncLimitForChannel(channelId));
    let publicInfo: any = null;
    let historical: any = null;
    let postsMetricsSync: any = null;
    let olderPostsBackfill: any = null;
    let channelStatsSync: any = null;
    let managedPostsSync: any = null;
    let audienceSnapshot: any = null;

    if (selection.syncIncludePublicInfo) {
      const currentStep = nextProgressStep();
      await this.notifyTaskProgress(
        onProgress,
        currentStep,
        totalSteps,
        'Refreshing public channel info',
      );
      const publicInfoStartedAt = Date.now();
      try {
        publicInfo = await this.syncPublicChannelInfo(
          workspaceId,
          channelId,
          account,
        );
        steps.push(
          this.syncStepSuccess(
            'channel_info',
            publicInfoStartedAt,
            'Channel info refreshed',
            { subscribersCount: publicInfo?.subscribersCount ?? null },
          ),
        );
      } catch (error) {
        steps.push(
          this.syncStepFailure(
            'channel_info',
            publicInfoStartedAt,
            error,
            'CHANNEL_INFO_FAILED',
            'Failed to refresh channel info',
          ),
        );
        throw error;
      }
    }
    if (
      selection.syncIncludeInviteLinks ||
      selection.syncIncludeHistoricalPosts
    ) {
      const currentStep = nextProgressStep();
      await this.notifyTaskProgress(
        onProgress,
        currentStep,
        totalSteps,
        'Importing posts and invite links',
      );
      const historicalStartedAt = Date.now();
      try {
        historical = await this.syncHistorical(
          userId,
          channelId,
          {
            telegramUserAccountId: account.id,
            syncInviteLinks: selection.syncIncludeInviteLinks,
            syncPosts: selection.syncIncludeHistoricalPosts,
            postLimit,
          },
          onProgress,
          { current: currentStep, total: totalSteps },
        );
        const historicalMetadata = {
          importedInviteLinks: historical?.imported ?? 0,
          updatedInviteLinks: historical?.updated ?? 0,
          postsUpdated: historical?.postsUpdated ?? 0,
          inviteLinksScope: historical?.inviteLinksScope ?? null,
          inviteLinksExpectedTotal: historical?.inviteLinksExpectedTotal ?? null,
          inviteLinksFetchedTotal: historical?.inviteLinksFetchedTotal ?? 0,
          inviteLinksMissingTotal: historical?.inviteLinksMissingTotal ?? 0,
          inviteLinkWarnings: historical?.inviteLinkWarnings ?? [],
        };
        const historicalMessage =
          selection.syncIncludeInviteLinks &&
          selection.syncIncludeHistoricalPosts
            ? 'Posts and invite links synced'
            : selection.syncIncludeInviteLinks
              ? 'Invite links synced'
              : 'Historical posts synced';
        steps.push(
          historical?.inviteLinksScope === 'PARTIAL_ADMINS'
            ? this.syncStepPartial(
                'historical_posts',
                historicalStartedAt,
                'Posts synced, but invite-link sync completed partially',
                historicalMetadata,
              )
            : this.syncStepSuccess(
                'historical_posts',
                historicalStartedAt,
                historicalMessage,
                historicalMetadata,
              ),
        );
      } catch (error) {
        steps.push(
          this.syncStepFailure(
            'historical_posts',
            historicalStartedAt,
            error,
            'HISTORICAL_SYNC_FAILED',
            'Failed to sync historical Telegram data',
          ),
        );
        throw error;
      }
    }
    if (selection.syncIncludePostMetrics) {
      const currentStep = nextProgressStep();
      await this.notifyTaskProgress(
        onProgress,
        currentStep,
        totalSteps,
        'Updating post metrics',
      );
      const postsMetricsStartedAt = Date.now();
      try {
        postsMetricsSync = await this.syncPostsMetrics(
          userId,
          channelId,
          {
            telegramUserAccountId: account.id,
            postLimit,
          },
          onProgress,
          { current: currentStep, total: totalSteps },
        );
        steps.push(
          this.syncStepSuccess(
            'post_metrics',
            postsMetricsStartedAt,
            'Post metrics synced',
            { syncedPosts: postsMetricsSync?.syncedPosts ?? 0 },
          ),
        );
      } catch (error) {
        steps.push(
          this.syncStepFailure(
            'post_metrics',
            postsMetricsStartedAt,
            error,
            'POST_METRICS_FAILED',
            'Failed to sync post metrics',
          ),
        );
        throw error;
      }
    }
    if (selection.syncIncludeOlderPosts) {
      const currentStep = nextProgressStep();
      await this.notifyTaskProgress(
        onProgress,
        currentStep,
        totalSteps,
        'Backfilling older post metrics',
      );
      const olderPostsStartedAt = Date.now();
      olderPostsBackfill =
        await this.syncOlderPostsMetricsBackfillForWorkspace(
          workspaceId,
          channelId,
          {
            telegramUserAccountId: account.id,
            maxPages:
              postLimit === this.initialPostBackfillLimit
                ? this.olderPostBackfillMaxPages
                : 1,
          },
        );
      steps.push(
        olderPostsBackfill?.syncedPosts
          ? this.syncStepSuccess(
              'older_post_backfill',
              olderPostsStartedAt,
              'Older post metrics backfilled',
              {
                syncedPosts: olderPostsBackfill.syncedPosts,
                pagesFetched: olderPostsBackfill.pagesFetched ?? 0,
              },
            )
          : this.syncStepSkipped(
              'older_post_backfill',
              olderPostsStartedAt,
              'No older posts were available for backfill',
            ),
      );
    }
    if (selection.syncIncludeChannelStats) {
      const currentStep = nextProgressStep();
      await this.notifyTaskProgress(
        onProgress,
        currentStep,
        totalSteps,
        'Syncing channel stats',
      );
      const statsStartedAt = Date.now();
      try {
        channelStatsSync = await this.syncBroadcastStats(userId, channelId, {
          telegramUserAccountId: account.id,
        });
        const statsStatus =
          channelStatsSync?.success === true
            ? 'success'
            : channelStatsSync?.snapshot?.normalizedStats?.status === 'available'
              ? 'success'
              : 'skipped';
        steps.push(
          statsStatus === 'success'
            ? this.syncStepSuccess(
                'broadcast_stats',
                statsStartedAt,
                'Broadcast stats synced',
                { pointsUpserted: channelStatsSync?.pointsUpserted ?? 0 },
              )
            : this.syncStepSkipped(
                'broadcast_stats',
                statsStartedAt,
                'Broadcast stats unavailable for this channel/source',
                {
                  normalizedStatus:
                    channelStatsSync?.snapshot?.normalizedStats?.status ?? null,
                },
              ),
        );
      } catch (error) {
        steps.push(
          this.syncStepFailure(
            'broadcast_stats',
            statsStartedAt,
            error,
            'BROADCAST_STATS_FAILED',
            'Failed to sync broadcast stats',
          ),
        );
      }
    }
    if (selection.syncIncludeManagedPosts) {
      const currentStep = nextProgressStep();
      await this.notifyTaskProgress(
        onProgress,
        currentStep,
        totalSteps,
        'Syncing managed posts',
      );
      const managedPostsStartedAt = Date.now();
      try {
        managedPostsSync = await this.syncManagedPosts(userId, channelId);
        steps.push(
          this.syncStepSuccess(
            'managed_posts',
            managedPostsStartedAt,
            'Managed posts synced',
            { syncedPosts: managedPostsSync?.posts?.length ?? 0 },
          ),
        );
      } catch (error) {
        steps.push(
          this.syncStepSkipped(
            'managed_posts',
            managedPostsStartedAt,
            error instanceof Error
              ? error.message
              : 'Managed post sync is not available',
          ),
        );
      }
    }
    if (selection.syncIncludeAudienceSnapshot) {
      const currentStep = nextProgressStep();
      await this.notifyTaskProgress(
        onProgress,
        currentStep,
        totalSteps,
        'Saving audience snapshot',
      );
      const audienceStartedAt = Date.now();
      audienceSnapshot = await this.createAudienceSnapshotSafely(channelId, 'sync');
      steps.push(
        audienceSnapshot
          ? this.syncStepSuccess(
              'audience_snapshot',
              audienceStartedAt,
              'Audience snapshot saved',
            )
          : this.syncStepSkipped(
              'audience_snapshot',
              audienceStartedAt,
              'Audience snapshot was skipped',
            ),
      );
    }
    await this.notifyTaskProgress(
      onProgress,
      nextProgressStep(),
      totalSteps,
      'Finalizing sync status',
    );
    const requiredStepNames = new Set<string>();
    if (selection.syncIncludePublicInfo) requiredStepNames.add('channel_info');
    if (
      selection.syncIncludeInviteLinks ||
      selection.syncIncludeHistoricalPosts
    ) {
      requiredStepNames.add('historical_posts');
    }
    if (selection.syncIncludePostMetrics) requiredStepNames.add('post_metrics');
    const requiredSteps = steps.filter((step) => requiredStepNames.has(step.step));
    const hasRequiredFailure = requiredSteps.some((step) => step.status === 'failed');
    const hasRequiredPartial = requiredSteps.some((step) => step.status === 'partial');
    const hasOptionalFailure = steps.some((step) => step.status === 'failed');
    const hasOptionalPartial = steps.some((step) => step.status === 'partial');
    const overallStatus = hasRequiredFailure
      ? 'failed'
      : hasRequiredPartial || hasOptionalFailure || hasOptionalPartial
        ? 'partial'
        : 'success';
    const result = {
      status: overallStatus,
      source: 'mtproto',
      steps,
      publicInfo,
      historical,
      postsMetricsSync,
      olderPostsBackfill,
      channelStatsSync,
      managedPostsSync,
      audienceSnapshot,
    } satisfies SyncOperationResult & Record<string, unknown>;
    this.applicationLogger.info({
      level:
        overallStatus === 'failed'
          ? 'error'
          : overallStatus === 'partial'
            ? 'warn'
            : 'info',
      kind: 'integration',
      source: TelegramChannelsService.name,
      event:
        overallStatus === 'failed'
          ? 'telegram.sync.failed'
          : overallStatus === 'partial'
            ? 'telegram.sync.partial'
            : 'telegram.sync.completed',
      message: `Telegram sync finished with status ${overallStatus}.`,
      workspaceId,
      userId,
      durationMs: Date.now() - startedAt,
      metadata: { channelId, sourceAccountId: account.id, steps },
    });
    this.invalidateTelegramChannelReadCache(userId, workspaceId);
    return result;
  }

  async deepSync(userId: string, channelId: string, dto: DeepSyncDto) {
    const workspaceId = await this.workspace(userId);
    const account = await this.connectedAccount(
      workspaceId,
      channelId,
      dto.telegramUserAccountId ||
        (await this.bestMtprotoAccountId(
          workspaceId,
          channelId,
          TelegramChannelDataType.STATS,
        )),
    );
    const publicInfo = await this.syncPublicChannelInfo(
      workspaceId,
      channelId,
      account,
    );
    const historical = await this.syncHistorical(userId, channelId, {
      telegramUserAccountId: account.id,
      syncInviteLinks: true,
      syncPosts: true,
      postLimit: dto.postLimit || this.initialPostBackfillLimit,
    });
    const postsMetricsSync = await this.syncPostsMetrics(userId, channelId, {
      telegramUserAccountId: account.id,
      postLimit: dto.postLimit || this.initialPostBackfillLimit,
    });
    const olderPostsBackfill =
      await this.syncOlderPostsMetricsBackfillForWorkspace(
        workspaceId,
        channelId,
        {
          telegramUserAccountId: account.id,
          maxPages: this.olderPostBackfillMaxPages,
        },
      );
    const channelStatsSync = await this.syncBroadcastStats(userId, channelId, {
      telegramUserAccountId: account.id,
    });
    const audienceSnapshot = await this.createAudienceSnapshotSafely(
      channelId,
      'sync',
    );
    const result = {
      message: 'Deep MTProto sync completed',
      source: 'mtproto',
      publicInfo,
      historical,
      postsMetricsSync,
      olderPostsBackfill,
      channelStatsSync,
      audienceSnapshot,
    };
    this.invalidateTelegramChannelReadCache(userId, workspaceId);
    return result;
  }

  private async syncPublicChannelInfo(
    workspaceId: string,
    channelId: string,
    account: {
      id: string;
      apiId: string;
      apiHashEncrypted: string;
      apiHashIv: string;
      apiHashAuthTag: string;
      sessionEncrypted: string | null;
      sessionIv: string | null;
      sessionAuthTag: string | null;
      label: string;
      username: string | null;
      firstName: string | null;
      phoneMasked: string | null;
    },
  ) {
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId, isActive: true },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    const channelReference = this.mtprotoChannelReference(channel);
    if (!channelReference.telegramChatId && !channelReference.username)
      throw new BadRequestException('Channel must have username or chatId');
    const info = await this.mtprotoClient.getPublicChannelInfo({
      ...this.accountCredentials(account),
      channel: channelReference,
    });
    if (info.kind !== 'channel') {
      return {
        updated: false,
        reason: 'Resolved Telegram entity is not a channel',
      };
    }
    const updated = await this.prisma.telegramChannel.update({
      where: { id: channelId },
      data: {
        ...this.channelIdentityPatch(info),
        lastPublicSyncedAt: new Date(),
      },
    });
    await this.sourceAccessService.recordDataSource({
      workspaceId,
      channelId,
      sourceId: account.id,
      sourceType: TelegramSourceType.MTPROTO,
      dataType: TelegramChannelDataType.CHANNEL_INFO,
      status: TelegramDataSourceStatus.SUCCESS,
      sourceDisplayName: this.sourceDisplayName(account),
      metadata: {
        source: 'sync_public_channel_info',
        subscribersCount: updated.currentSubscribersCount,
      },
    });
    return {
      updated: true,
      title: updated.title,
      subscribersCount: updated.currentSubscribersCount,
      username: updated.username,
    };
  }

  async syncHistorical(
    userId: string,
    channelId: string,
    dto: HistoricalSyncDto,
    onProgress?: BulkProgressCallback,
    progressStep = { current: 2, total: 8 },
  ) {
    const workspaceId = await this.workspace(userId);
    const channel = await this.findOne(userId, channelId);
    const account = await this.connectedAccount(
      workspaceId,
      channelId,
      dto.telegramUserAccountId,
    );
    const channelReference = this.mtprotoChannelReference(channel);
    if (!channelReference.telegramChatId && !channelReference.username)
      throw new BadRequestException('Channel must have username or chatId');
    const liveInviteLinkSync = dto.syncInviteLinks
      ? {
          maps: await this.buildInviteAttributionMaps(workspaceId),
          importedCount: 0,
          updatedCount: 0,
          matchedMembersCount: 0,
          unresolvedCreatorsCount: 0,
          affectedCampaignIds: new Set<string>(),
          processedUrls: new Set<string>(),
        }
      : null;
    const historical = await this.mtprotoClient.getChannelHistorical({
      ...this.accountCredentials(account),
      channel: channelReference,
      postLimit: dto.postLimit || this.defaultPostSyncLimit,
      onInviteLinksProgress: async (item) => {
        await this.notifyInviteLinksProgress(
          onProgress,
          progressStep.current,
          progressStep.total,
          item,
        );
      },
      onInviteLinkLoaded: liveInviteLinkSync
        ? async (link, loadedCount, expectedTotal, warnings) => {
            if (liveInviteLinkSync.processedUrls.has(link.url)) return;
            liveInviteLinkSync.processedUrls.add(link.url);
            const persisted = await this.persistInviteLinkFromRemote({
              workspaceId,
              channelId,
              link,
              maps: liveInviteLinkSync.maps,
              processedCount: loadedCount,
              totalLinks: Math.max(expectedTotal, loadedCount),
              warnings,
              onProgress,
              progressStep,
            });
            if (persisted.matchedMember) liveInviteLinkSync.matchedMembersCount += 1;
            if (persisted.unresolved) {
              liveInviteLinkSync.unresolvedCreatorsCount += 1;
            }
            if (persisted.existing) {
              liveInviteLinkSync.updatedCount += 1;
              if (persisted.existing.adCampaignId) {
                liveInviteLinkSync.affectedCampaignIds.add(
                  persisted.existing.adCampaignId,
                );
              }
            } else {
              liveInviteLinkSync.importedCount += 1;
            }
            if (persisted.upserted.adCampaignId) {
              liveInviteLinkSync.affectedCampaignIds.add(
                persisted.upserted.adCampaignId,
              );
            }
          }
        : undefined,
    });
    await this.notifyDetailedTaskProgress(
      onProgress,
      progressStep.current,
      progressStep.total,
      'Telegram history loaded, saving channel details',
    );
    if (historical.channel) {
      await this.persistResolvedChannelIdentity(
        workspaceId,
        channelId,
        historical.channel,
      );
    }
    let imported = 0;
    let updated = 0;
    let inviteResult:
      | Awaited<ReturnType<TelegramChannelsService['syncChannelInviteLinks']>>
      | null = null;
    if (dto.syncInviteLinks) {
      await this.notifyDetailedTaskProgress(
        onProgress,
        progressStep.current,
        progressStep.total,
        'Matching invite link creators and saving invite links',
      );
      const remote = historical?.inviteLinksDetailed
        ? {
            scope: historical.inviteLinksScope ?? 'ALL_ADMINS',
            expectedTotalLinks:
              historical.inviteLinksExpectedTotal ??
              historical.inviteLinksDetailed.length,
            admins: [],
            links: historical.inviteLinksDetailed,
            warnings: historical.inviteLinkWarnings ?? [],
          }
        : null;
      if (remote && liveInviteLinkSync) {
        for (const [index, link] of remote.links.entries()) {
          if (liveInviteLinkSync.processedUrls.has(link.url)) continue;
          liveInviteLinkSync.processedUrls.add(link.url);
          const persisted = await this.persistInviteLinkFromRemote({
            workspaceId,
            channelId,
            link,
            maps: liveInviteLinkSync.maps,
            processedCount: index + 1,
            totalLinks: remote.links.length,
            warnings: remote.warnings,
            onProgress,
            progressStep,
          });
          if (persisted.matchedMember) liveInviteLinkSync.matchedMembersCount += 1;
          if (persisted.unresolved) {
            liveInviteLinkSync.unresolvedCreatorsCount += 1;
          }
          if (persisted.existing) {
            liveInviteLinkSync.updatedCount += 1;
            if (persisted.existing.adCampaignId) {
              liveInviteLinkSync.affectedCampaignIds.add(
                persisted.existing.adCampaignId,
              );
            }
          } else {
            liveInviteLinkSync.importedCount += 1;
          }
          if (persisted.upserted.adCampaignId) {
            liveInviteLinkSync.affectedCampaignIds.add(
              persisted.upserted.adCampaignId,
            );
          }
        }
        inviteResult = await this.finalizeInviteLinkSync({
          workspaceId,
          channelId,
          account,
          remote,
          importedCount: liveInviteLinkSync.importedCount,
          updatedCount: liveInviteLinkSync.updatedCount,
          matchedMembersCount: liveInviteLinkSync.matchedMembersCount,
          unresolvedCreatorsCount: liveInviteLinkSync.unresolvedCreatorsCount,
          affectedCampaignIds: liveInviteLinkSync.affectedCampaignIds,
          onProgress,
          progressStep,
        });
      } else {
        inviteResult = await this.syncChannelInviteLinks({
          workspaceId,
          channelId,
          account,
          channelReference,
          prefetchedRemote: remote,
          onProgress,
          progressStep,
        });
      }
      imported = inviteResult.imported;
      updated = inviteResult.updated;
    }
    let postsUpdated = 0;
    if (dto.syncPosts) {
      await this.notifyDetailedTaskProgress(
        onProgress,
        progressStep.current,
        progressStep.total,
        `Updating ${historical.dailyStats?.length ?? 0} historical daily stats`,
      );
      for (const row of historical.dailyStats || []) {
        const date = new Date(`${row.date}T00:00:00.000Z`);
        await this.prisma.telegramChannelDailyStats.upsert({
          where: {
            telegramChannelId_date: { telegramChannelId: channelId, date },
          },
          create: {
            telegramChannelId: channelId,
            date,
            viewsCount: row.viewsCount,
            reactionsCount: row.reactionsCount,
            forwardsCount: row.forwardsCount,
          },
          update: {
            viewsCount: row.viewsCount,
            reactionsCount: row.reactionsCount,
            forwardsCount: row.forwardsCount,
          },
        });
        postsUpdated += 1;
      }
      await this.sourceAccessService.recordDataSource({
        workspaceId,
        channelId,
        sourceId: account.id,
        sourceType: TelegramSourceType.MTPROTO,
        dataType: TelegramChannelDataType.POSTS,
        status: TelegramDataSourceStatus.SUCCESS,
        sourceDisplayName: this.sourceDisplayName(account),
        metadata: { postsUpdated },
      });
    }
    const audienceSnapshot =
      dto.syncPosts || dto.syncInviteLinks
        ? await this.createAudienceSnapshotSafely(channelId, 'sync')
        : null;
    const result = {
      message: 'Historical MTProto sync completed',
      source: 'mtproto',
      imported,
      updated,
      postsUpdated,
      inviteLinksScope: inviteResult?.scope ?? historical?.inviteLinksScope ?? null,
      inviteLinksExpectedTotal:
        inviteResult?.expectedTotalLinks ??
        historical?.inviteLinksExpectedTotal ??
        null,
      inviteLinksFetchedTotal:
        inviteResult?.fetchedTotalLinks ??
        historical?.inviteLinksDetailed?.length ??
        0,
      inviteLinksMissingTotal:
        inviteResult?.missingTotalLinks ??
        Math.max(
          0,
          (historical?.inviteLinksExpectedTotal ?? 0) -
            (historical?.inviteLinksDetailed?.length ?? 0),
        ),
      inviteLinkWarnings:
        inviteResult?.warnings ?? historical?.inviteLinkWarnings ?? [],
      audienceSnapshot,
    };
    this.invalidateTelegramChannelReadCache(userId, workspaceId);
    return result;
  }

  async syncPostsMetrics(
    userId: string,
    channelId: string,
    dto: { telegramUserAccountId?: string; postLimit?: number },
    onProgress?: BulkProgressCallback,
    progressStep = { current: 3, total: 8 },
  ) {
    const workspaceId = await this.workspace(userId);
    const result = await this.syncPostsMetricsForWorkspace(
      workspaceId,
      channelId,
      dto,
      onProgress,
      progressStep,
    );
    this.invalidateTelegramChannelReadCache(userId, workspaceId);
    return result;
  }

  async syncPostsMetricsForWorkspace(
    workspaceId: string,
    channelId: string,
    dto: { telegramUserAccountId?: string; postLimit?: number },
    onProgress?: BulkProgressCallback,
    progressStep = { current: 3, total: 8 },
  ) {
    const startedAt = Date.now();
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId, isActive: true },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    const account = await this.connectedAccount(
      workspaceId,
      channelId,
      dto.telegramUserAccountId,
    );
    const channelReference = this.mtprotoChannelReference(channel);
    if (!channelReference.telegramChatId && !channelReference.username)
      throw new BadRequestException('Channel must have username or chatId');
    try {
      const metrics = await this.mtprotoClient.getChannelPostsMetrics({
        ...this.accountCredentials(account),
        channel: channelReference,
        postLimit: dto.postLimit || this.defaultPostSyncLimit,
      });
      await this.notifyDetailedTaskProgress(
        onProgress,
        progressStep.current,
        progressStep.total,
        `Downloaded ${metrics.length} posts, saving metrics to the database`,
      );
      await this.persistPostMetrics(
        workspaceId,
        channel.id,
        metrics,
        onProgress,
        progressStep,
      );
      for (const dataType of [
        TelegramChannelDataType.POSTS,
        TelegramChannelDataType.VIEWS,
        TelegramChannelDataType.REACTIONS,
      ]) {
        await this.sourceAccessService.recordDataSource({
          workspaceId,
          channelId,
          sourceId: account.id,
          sourceType: TelegramSourceType.MTPROTO,
          dataType,
          status: TelegramDataSourceStatus.SUCCESS,
          sourceDisplayName: this.sourceDisplayName(account),
          metadata: { syncedPosts: metrics.length },
        });
      }
      const audienceSnapshot = await this.createAudienceSnapshotSafely(
        channelId,
        'sync',
      );
      const result = {
        source: 'mtproto',
        syncedPosts: metrics.length,
        audienceSnapshot,
      };
      this.applicationLogger.info({
        kind: 'integration',
        source: TelegramChannelsService.name,
        event: 'telegram.post_metrics_sync.completed',
        message: `Post metrics synced for channel ${channelId}.`,
        workspaceId,
        durationMs: Date.now() - startedAt,
        metadata: {
          channelId,
          sourceAccountId: account.id,
          syncedPosts: metrics.length,
        },
      });
      return result;
    } catch (error) {
      this.logger.error(
        `MTProto post metrics sync failed for channel=${channelId}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      this.applicationLogger.writeStructured({
        level: 'error',
        kind: 'integration',
        source: TelegramChannelsService.name,
        event: 'telegram.post_metrics_sync.failed',
        message:
          error instanceof Error ? error.message : 'Failed to sync channel post metrics',
        workspaceId,
        durationMs: Date.now() - startedAt,
        errorName: error instanceof Error ? error.name : 'Error',
        stack: error instanceof Error ? error.stack || null : null,
        metadata: { channelId, sourceAccountId: account.id },
      });
      throw new InternalServerErrorException(
        'Failed to sync channel post metrics',
      );
    }
  }

  private async persistPostMetrics(
    workspaceId: string,
    channelId: string,
    metrics: any[],
    onProgress?: BulkProgressCallback,
    progressStep = { current: 3, total: 8 },
  ) {
    const affectedDays = new Set<string>();
    for (const [index, post] of metrics.entries()) {
      if (index > 0 && index % 100 === 0) {
        await this.notifyDetailedTaskProgress(
          onProgress,
          progressStep.current,
          progressStep.total,
          `Saved ${index}/${metrics.length} post metrics`,
        );
      }
      const upserted = await this.prisma.telegramPost.upsert({
        where: {
          telegramChannelId_telegramMessageId: {
            telegramChannelId: channelId,
            telegramMessageId: post.telegramMessageId,
          },
        },
        create: {
          workspaceId,
          telegramChannelId: channelId,
          telegramMessageId: post.telegramMessageId,
          postDate: post.postDate,
          text: post.text,
          formattedText: post.formattedText,
          hasMedia: post.hasMedia,
          mediaKind: post.mediaKind,
          viewsCount: post.viewsCount,
          forwardsCount: post.forwardsCount,
          reactionsCount: post.reactionsCount,
          commentsCount: post.commentsCount,
          reactions: post.reactions,
          rawMessage: post.rawMessage,
        },
        update: {
          postDate: post.postDate,
          text: post.text,
          formattedText: post.formattedText,
          hasMedia: post.hasMedia,
          mediaKind: post.mediaKind,
          viewsCount: post.viewsCount,
          forwardsCount: post.forwardsCount,
          reactionsCount: post.reactionsCount,
          commentsCount: post.commentsCount,
          reactions: post.reactions,
          rawMessage: post.rawMessage,
        },
      });
      await this.prisma.telegramPostMetricSnapshot.create({
        data: {
          telegramPostId: upserted.id,
          viewsCount: post.viewsCount,
          forwardsCount: post.forwardsCount,
          reactionsCount: post.reactionsCount,
          commentsCount: post.commentsCount,
          reactions: post.reactions,
        },
      });
      affectedDays.add(post.postDate.toISOString().slice(0, 10));
    }
    await this.notifyDetailedTaskProgress(
      onProgress,
      progressStep.current,
      progressStep.total,
      `Recalculating daily stats for ${affectedDays.size} affected days`,
    );
    await this.recalculateDailyStatsFromPosts(channelId, [...affectedDays]);
    return { affectedDays: affectedDays.size };
  }

  async telegramPostMedia(
    userId: string,
    channelId: string,
    postId: string,
  ) {
    const workspaceId = await this.workspace(userId);
    const [channel, post] = await Promise.all([
      this.prisma.telegramChannel.findFirst({
        where: { id: channelId, workspaceId, isActive: true },
      }),
      this.prisma.telegramPost.findFirst({
        where: { id: postId, telegramChannelId: channelId, workspaceId },
        select: { telegramMessageId: true, hasMedia: true },
      }),
    ]);
    if (!channel || !post) throw new NotFoundException('Telegram post not found');
    if (!post.hasMedia) throw new NotFoundException('Post has no media');
    const account = await this.connectedAccount(workspaceId, channelId);
    const channelReference = this.mtprotoChannelReference(channel);
    if (!channelReference.telegramChatId && !channelReference.username)
      throw new BadRequestException('Channel has no Telegram reference');
    const media = await this.mtprotoClient.downloadChannelMessageMedia({
      ...this.accountCredentials(account),
      channel: channelReference,
      messageId: post.telegramMessageId,
    });
    if (!media) throw new NotFoundException('Telegram post media not found');
    return media;
  }

  private oldestMessageId(metrics: Array<{ telegramMessageId: string }>) {
    return metrics.reduce<string | null>((oldest, post) => {
      const current = this.toFiniteMessageId(post.telegramMessageId);
      const previous = this.toFiniteMessageId(oldest);
      if (current == null) return oldest;
      if (previous == null || current < previous) return post.telegramMessageId;
      return oldest;
    }, null);
  }

  private toFiniteMessageId(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private exportValue(value: unknown): string | number | boolean | Date | null {
    if (value == null) return null;
    if (value instanceof Date) return value;
    if (typeof value === 'bigint') return value.toString();
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value;
    }
    if (
      typeof value === 'object' &&
      'toNumber' in value &&
      typeof (value as any).toNumber === 'function'
    ) {
      return (value as any).toNumber();
    }
    return JSON.stringify(value);
  }

  private dateOnly(value: Date | null | undefined) {
    return value ? value.toISOString().slice(0, 10) : null;
  }

  private safeSheetName(value: string) {
    return value.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet';
  }

  private safeFileName(value: string) {
    return (
      value
        .trim()
        .replace(/^@/, '')
        .replace(/[^a-zA-Z0-9а-яА-ЯёЁ._-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 80) || 'telegram-channel'
    );
  }

  private addKeyValueSheet(
    workbook: ExcelJS.Workbook,
    name: string,
    rows: Array<[string, unknown]>,
  ) {
    const sheet = workbook.addWorksheet(this.safeSheetName(name));
    sheet.columns = [
      { header: 'Field', key: 'field', width: 36 },
      { header: 'Value', key: 'value', width: 90 },
    ];
    rows.forEach(([field, value]) =>
      sheet.addRow({ field, value: this.exportValue(value) }),
    );
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    return sheet;
  }

  private addTableSheet(
    workbook: ExcelJS.Workbook,
    name: string,
    columns: Array<{ header: string; key: string; width?: number }>,
    rows: Array<Record<string, unknown>>,
  ) {
    const sheet = workbook.addWorksheet(this.safeSheetName(name));
    sheet.columns = columns.map((column) => ({
      header: column.header,
      key: column.key,
      width: column.width || 18,
    }));
    rows.forEach((row) => {
      const normalized: Record<string, unknown> = {};
      for (const column of columns) {
        normalized[column.key] = this.exportValue(row[column.key]);
      }
      sheet.addRow(normalized);
    });
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: Math.max(columns.length, 1) },
    };
    return sheet;
  }

  private addPromoImages(
    workbook: ExcelJS.Workbook,
    sheet: ExcelJS.Worksheet,
    promos: Array<{ imageData?: string | null }>,
  ) {
    promos.forEach((promo, index) => {
      const imageData = String(promo.imageData || '');
      const match = imageData.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
      if (!match) return;
      const extension =
        match[1] === 'jpg' ? 'jpeg' : (match[1] as 'png' | 'jpeg');
      try {
        const imageId = workbook.addImage({ base64: imageData, extension });
        const row = index + 2;
        sheet.getRow(row).height = 90;
        sheet.addImage(imageId, {
          tl: { col: 6, row: row - 1 },
          ext: { width: 120, height: 80 },
        });
      } catch {
        // Invalid user-uploaded image data should not break the whole export.
      }
    });
  }

  async exportChannelWorkbook(userId: string, channelId: string) {
    const workspaceId = await this.workspace(userId);
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId, isActive: true },
      include: {
        adminLinks: { include: { telegramUserAccountIntegration: true } },
        dataSources: true,
        sourceAccesses: true,
      },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');

    const [
      audience,
      financialSummary,
      firstPost,
      lastPost,
      firstDaily,
      lastDaily,
      firstStatsPoint,
      lastStatsPoint,
      firstAudienceSnapshot,
      lastAudienceSnapshot,
      posts,
      postSnapshots,
      dailyStats,
      statsPoints,
      statsSnapshots,
      audienceSnapshots,
      inviteLinks,
      promos,
      campaigns,
    ] = await Promise.all([
      this.analyticsService.getActiveAudienceEstimate(channel.id),
      this.analyticsService.getChannelFinancialSummary(channel.id),
      this.prisma.telegramPost.findFirst({
        where: { workspaceId, telegramChannelId: channel.id },
        orderBy: { postDate: 'asc' },
      }),
      this.prisma.telegramPost.findFirst({
        where: { workspaceId, telegramChannelId: channel.id },
        orderBy: { postDate: 'desc' },
      }),
      this.prisma.telegramChannelDailyStats.findFirst({
        where: { telegramChannelId: channel.id },
        orderBy: { date: 'asc' },
      }),
      this.prisma.telegramChannelDailyStats.findFirst({
        where: { telegramChannelId: channel.id },
        orderBy: { date: 'desc' },
      }),
      this.prisma.telegramChannelStatsPoint.findFirst({
        where: { workspaceId, telegramChannelId: channel.id },
        orderBy: { date: 'asc' },
      }),
      this.prisma.telegramChannelStatsPoint.findFirst({
        where: { workspaceId, telegramChannelId: channel.id },
        orderBy: { date: 'desc' },
      }),
      this.prisma.telegramChannelAudienceSnapshot.findFirst({
        where: { workspaceId, telegramChannelId: channel.id },
        orderBy: { collectedAt: 'asc' },
      }),
      this.prisma.telegramChannelAudienceSnapshot.findFirst({
        where: { workspaceId, telegramChannelId: channel.id },
        orderBy: { collectedAt: 'desc' },
      }),
      this.prisma.telegramPost.findMany({
        where: { workspaceId, telegramChannelId: channel.id },
        orderBy: { postDate: 'asc' },
      }),
      this.prisma.telegramPostMetricSnapshot.findMany({
        where: {
          telegramPost: { workspaceId, telegramChannelId: channel.id },
        },
        include: { telegramPost: { select: { telegramMessageId: true } } },
        orderBy: { collectedAt: 'asc' },
      }),
      this.prisma.telegramChannelDailyStats.findMany({
        where: { telegramChannelId: channel.id },
        orderBy: { date: 'asc' },
      }),
      this.prisma.telegramChannelStatsPoint.findMany({
        where: { workspaceId, telegramChannelId: channel.id },
        orderBy: [{ metric: 'asc' }, { series: 'asc' }, { date: 'asc' }],
      }),
      this.prisma.telegramChannelStatsSnapshot.findMany({
        where: { workspaceId, telegramChannelId: channel.id },
        orderBy: { snapshotDate: 'asc' },
      }),
      this.prisma.telegramChannelAudienceSnapshot.findMany({
        where: { workspaceId, telegramChannelId: channel.id },
        orderBy: { collectedAt: 'asc' },
      }),
      this.findInviteLinksWithRequestedCountFallback({
        workspaceId,
        where: { workspaceId, telegramChannelId: channel.id },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.promo.findMany({
        where: { workspaceId, telegramChannelId: channel.id },
        orderBy: { createdAt: 'asc' },
      }),
      (this.prisma.adCampaign as any).findMany({
        where: { workspaceId, telegramChannelId: channel.id },
        include: {
          promo: true,
          account: true,
          expenseTransaction: {
            include: { account: true, categoryRef: true, member: true },
          },
          inviteLinks: true,
          advertisingChannels: { include: { advertisingSource: true } },
          advertisingTelegramChannels: { include: { telegramChannel: true } },
          hypothesisLinks: { include: { hypothesis: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const telegramDates = [
      firstPost?.postDate,
      lastPost?.postDate,
      firstDaily?.date,
      lastDaily?.date,
      firstStatsPoint?.date,
      lastStatsPoint?.date,
      firstAudienceSnapshot?.collectedAt,
      lastAudienceSnapshot?.collectedAt,
    ].filter(Boolean) as Date[];
    const tgFrom =
      telegramDates.length > 0
        ? new Date(Math.min(...telegramDates.map((date) => date.getTime())))
        : null;
    const tgTo =
      telegramDates.length > 0
        ? new Date(Math.max(...telegramDates.map((date) => date.getTime())))
        : null;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Telegram System';
    workbook.created = new Date();
    workbook.modified = new Date();

    this.addKeyValueSheet(workbook, 'Overview', [
      ['Channel', channel.title],
      ['Username', channel.username ? `@${channel.username}` : null],
      ['Telegram chat id', channel.telegramChatId],
      ['System period from', channel.createdAt],
      ['System period to', new Date()],
      ['Telegram data period from', tgFrom],
      ['Telegram data period to', tgTo],
      [
        'Period note',
        `Channel is in system from ${this.dateOnly(channel.createdAt) || '-'}; Telegram data in this export from ${this.dateOnly(tgFrom) || '-'} to ${this.dateOnly(tgTo) || '-'}.`,
      ],
      ['Exported at', new Date()],
      ['Posts exported', posts.length],
      ['Promos exported', promos.length],
      ['Campaigns exported', campaigns.length],
      ['Invite links exported', inviteLinks.length],
    ]);

    this.addKeyValueSheet(workbook, 'Channel Settings', [
      ['ID', channel.id],
      ['Title', channel.title],
      ['Description', channel.description],
      ['Language', channel.language],
      ['Niche', channel.niche],
      ['Invite link', channel.inviteLink],
      ['Photo URL', channel.photoUrl],
      ['Source type', channel.sourceType],
      ['Current subscribers', channel.currentSubscribersCount],
      ['Seed subscribers', channel.seedSubscribersCount],
      ['Known fake subscribers', channel.knownFakeSubscribersCount],
      ['Own views per post', channel.ownViewsPerPost],
      ['Own reactions per post', channel.ownReactionsPerPost],
      ['Active subscribers window', channel.activeSubscribersWindow],
      ['Subscriber base quality', channel.subscriberBaseQuality],
      ['Data quality notes', channel.dataQualityNotes],
      ['Target CPA from', channel.targetCpaFrom],
      ['Target CPA to', channel.targetCpa],
      ['Acceptable CPA from', channel.acceptableCpaFrom],
      ['Acceptable CPA to', channel.acceptableCpa],
      ['Stop CPA from', channel.stopCpaFrom],
      ['Stop CPA to', channel.stopCpa],
      ['Last public sync', channel.lastPublicSyncedAt],
      ['Created at', channel.createdAt],
      ['Updated at', channel.updatedAt],
    ]);

    this.addKeyValueSheet(workbook, 'Calculated Metrics', [
      ...Object.entries(audience).map(
        ([key, value]) => [`audience.${key}`, value] as [string, unknown],
      ),
      ...Object.entries(financialSummary).map(
        ([key, value]) => [`finance.${key}`, value] as [string, unknown],
      ),
    ]);

    this.addTableSheet(
      workbook,
      'Posts',
      [
        { header: 'Post date', key: 'postDate', width: 22 },
        { header: 'Message ID', key: 'telegramMessageId', width: 16 },
        { header: 'Text', key: 'text', width: 80 },
        { header: 'Views', key: 'viewsCount' },
        { header: 'Forwards', key: 'forwardsCount' },
        { header: 'Reactions', key: 'reactionsCount' },
        { header: 'Comments', key: 'commentsCount' },
        { header: 'Channel own views per post', key: 'channelOwnViews' },
        { header: 'Manual own views', key: 'manualOwnViews' },
        { header: 'Adjusted views', key: 'adjustedViews' },
        {
          header: 'Channel own reactions per post',
          key: 'channelOwnReactions',
        },
        { header: 'Manual own reactions', key: 'manualOwnReactions' },
        { header: 'Adjusted reactions', key: 'adjustedReactions' },
        { header: 'Exclude from analytics', key: 'excludeFromAnalytics' },
        { header: 'Reactions JSON', key: 'reactions', width: 50 },
        { header: 'Raw message JSON', key: 'rawMessage', width: 80 },
      ],
      posts.map((post) => ({
        ...post,
        channelOwnViews: channel.ownViewsPerPost,
        channelOwnReactions: channel.ownReactionsPerPost,
        adjustedViews: Math.max(
          0,
          Number(post.viewsCount || 0) -
            Number(channel.ownViewsPerPost || 0) -
            Number(post.manualOwnViews || 0),
        ),
        adjustedReactions: Math.max(
          0,
          Number(post.reactionsCount || 0) -
            Number(channel.ownReactionsPerPost || 0) -
            Number(post.manualOwnReactions || 0),
        ),
      })),
    );

    this.addTableSheet(
      workbook,
      'Post Metric Snapshots',
      [
        { header: 'Collected at', key: 'collectedAt', width: 22 },
        { header: 'Message ID', key: 'telegramMessageId' },
        { header: 'Views', key: 'viewsCount' },
        { header: 'Forwards', key: 'forwardsCount' },
        { header: 'Reactions', key: 'reactionsCount' },
        { header: 'Comments', key: 'commentsCount' },
        { header: 'Reactions JSON', key: 'reactions', width: 60 },
      ],
      postSnapshots.map((snapshot: any) => ({
        ...snapshot,
        telegramMessageId: snapshot.telegramPost?.telegramMessageId,
      })),
    );

    this.addTableSheet(
      workbook,
      'Daily Stats',
      [
        { header: 'Date', key: 'date', width: 16 },
        { header: 'Subscribers', key: 'subscribersCount' },
        { header: 'Joined', key: 'joinedCount' },
        { header: 'Left', key: 'leftCount' },
        { header: 'Net growth', key: 'netGrowthCount' },
        { header: 'Views', key: 'viewsCount' },
        { header: 'Reactions', key: 'reactionsCount' },
        { header: 'Forwards', key: 'forwardsCount' },
        { header: 'Created at', key: 'createdAt', width: 22 },
      ],
      dailyStats,
    );

    this.addTableSheet(
      workbook,
      'Stats Points',
      [
        { header: 'Date', key: 'date', width: 16 },
        { header: 'Metric', key: 'metric' },
        { header: 'Series', key: 'series' },
        { header: 'Series label', key: 'seriesLabel' },
        { header: 'Graph type', key: 'graphType' },
        { header: 'Value', key: 'value' },
        { header: 'Latest synced at', key: 'latestSyncedAt', width: 22 },
      ],
      statsPoints,
    );

    this.addTableSheet(
      workbook,
      'Stats Snapshots',
      [
        { header: 'Snapshot date', key: 'snapshotDate', width: 16 },
        { header: 'Synced at', key: 'syncedAt', width: 22 },
        { header: 'Available fields', key: 'availableFields', width: 40 },
        { header: 'Warnings', key: 'warnings', width: 40 },
        { header: 'Normalized stats JSON', key: 'normalizedStats', width: 80 },
        { header: 'Raw stats JSON', key: 'rawStats', width: 80 },
      ],
      statsSnapshots,
    );

    this.addTableSheet(
      workbook,
      'Audience Snapshots',
      [
        { header: 'Collected at', key: 'collectedAt', width: 22 },
        { header: 'Subscribers', key: 'subscribersCount' },
        { header: 'Effective subscribers', key: 'effectiveSubscribersCount' },
        { header: 'Active subscribers', key: 'activeSubscribersEstimate' },
        {
          header: 'Capped active subscribers',
          key: 'cappedActiveSubscribersEstimate',
        },
        { header: 'View rate', key: 'viewRate' },
        { header: 'Raw view rate', key: 'rawViewRate' },
        { header: 'Capped view rate', key: 'cappedViewRate' },
        { header: 'Avg views raw', key: 'avgViewsRaw' },
        { header: 'Avg views adjusted', key: 'avgViewsAdjusted' },
        { header: 'Avg reactions raw', key: 'avgReactionsRaw' },
        { header: 'Avg reactions adjusted', key: 'avgReactionsAdjusted' },
        { header: 'Data quality', key: 'dataQuality' },
        { header: 'Data quality reason', key: 'dataQualityReason' },
        {
          header: 'External traffic anomaly',
          key: 'hasExternalTrafficAnomaly',
        },
        {
          header: 'Subscriber base pollution',
          key: 'hasSubscriberBasePollution',
        },
        { header: 'Posts window', key: 'postsWindow' },
        { header: 'Source', key: 'source' },
      ],
      audienceSnapshots,
    );

    this.addTableSheet(
      workbook,
      'Invite Links',
      [
        { header: 'Name', key: 'name', width: 24 },
        { header: 'URL', key: 'url', width: 60 },
        { header: 'Campaign', key: 'campaignTitle', width: 30 },
        { header: 'Joined', key: 'joinedCount' },
        { header: 'Revoked', key: 'isRevoked' },
        { header: 'Expire date', key: 'expireDate', width: 22 },
        { header: 'Member limit', key: 'memberLimit' },
        { header: 'Creates join request', key: 'createsJoinRequest' },
        { header: 'Last synced at', key: 'lastSyncedAt', width: 22 },
        { header: 'Created at', key: 'createdAt', width: 22 },
      ],
      inviteLinks.map((link: any) => ({
        ...link,
        campaignTitle: link.adCampaign?.title,
      })),
    );

    const promosSheet = this.addTableSheet(
      workbook,
      'Creatives',
      [
        { header: 'Title', key: 'title', width: 28 },
        { header: 'Status', key: 'status' },
        { header: 'Angle', key: 'angle', width: 28 },
        { header: 'Text', key: 'text', width: 90 },
        { header: 'Image data or URL', key: 'imageData', width: 60 },
        { header: 'Created at', key: 'createdAt', width: 22 },
        { header: 'Image preview', key: 'imagePreview', width: 20 },
      ],
      promos.map((promo) => ({ ...promo, imagePreview: '' })),
    );
    this.addPromoImages(workbook, promosSheet, promos);

    this.addTableSheet(
      workbook,
      'Campaigns',
      [
        { header: 'Title', key: 'title', width: 30 },
        { header: 'Status', key: 'status' },
        { header: 'Promo', key: 'promoTitle', width: 24 },
        { header: 'Advertising sources', key: 'advertisingSources', width: 50 },
        { header: 'Hypotheses', key: 'hypotheses', width: 40 },
        { header: 'Price', key: 'price' },
        { header: 'Currency', key: 'currency' },
        { header: 'Price in primary currency', key: 'priceInPrimaryCurrency' },
        { header: 'Exchange rate to primary', key: 'exchangeRateToPrimary' },
        { header: 'Placement date', key: 'placementDate', width: 18 },
        { header: 'Started at', key: 'startedAt', width: 18 },
        { header: 'Ended at', key: 'endedAt', width: 18 },
        { header: 'Joined', key: 'joinedCount' },
        { header: 'Left', key: 'leftCount' },
        { header: 'Net growth', key: 'netGrowthCount' },
        { header: 'CPA', key: 'cpa' },
        { header: 'CPM', key: 'cpm' },
        {
          header: 'Active subscribers from ad',
          key: 'activeSubscribersFromAd',
        },
        { header: 'Active CPA', key: 'activeCpa' },
        { header: 'Active rate', key: 'activeRate' },
        {
          header: 'Capped active subscribers',
          key: 'cappedActiveSubscribersFromAd',
        },
        { header: 'Capped active CPA', key: 'cappedActiveCpa' },
        { header: 'Retention 7d', key: 'retention7d' },
        { header: 'CPA status', key: 'cpaStatus' },
        { header: 'Active CPA status', key: 'activeCpaStatus' },
        { header: 'Overall status', key: 'overallStatus' },
        { header: 'Data quality', key: 'adDataQuality' },
        { header: 'Data quality reason', key: 'adDataQualityReason' },
        { header: 'View anomaly', key: 'hasViewAnomaly' },
        {
          header: 'Subscriber base pollution',
          key: 'hasSubscriberBasePollution',
        },
        { header: 'Source post URL', key: 'sourcePostUrl', width: 44 },
        { header: 'Source post views', key: 'sourcePostViews' },
        { header: 'Notes', key: 'notes', width: 60 },
        { header: 'Analytics notes', key: 'analyticsNotes', width: 60 },
        { header: 'Expense transaction ID', key: 'expenseTransactionId' },
        { header: 'Expense account', key: 'expenseAccount' },
        { header: 'Created at', key: 'createdAt', width: 22 },
      ],
      campaigns.map((campaign: any) => ({
        ...campaign,
        promoTitle: campaign.promo?.title,
        advertisingSources: [
          ...(campaign.advertisingChannels || []).map(
            (item: any) => item.advertisingSource?.name,
          ),
          ...(campaign.advertisingTelegramChannels || []).map(
            (item: any) => item.telegramChannel?.title,
          ),
        ]
          .filter(Boolean)
          .join(', '),
        hypotheses: (campaign.hypothesisLinks || [])
          .map((item: any) => item.hypothesis?.name)
          .filter(Boolean)
          .join(', '),
        expenseTransactionId: campaign.expenseTransaction?.id,
        expenseAccount: campaign.expenseTransaction?.account?.name,
      })),
    );

    this.addTableSheet(
      workbook,
      'Finance Transactions',
      [
        { header: 'Date', key: 'date', width: 18 },
        { header: 'Campaign', key: 'campaignTitle', width: 30 },
        { header: 'Type', key: 'type' },
        { header: 'Amount', key: 'amount' },
        { header: 'Currency', key: 'currency' },
        {
          header: 'Amount in primary currency',
          key: 'amountInPrimaryCurrency',
        },
        { header: 'Exchange rate to primary', key: 'exchangeRateToPrimary' },
        { header: 'Account', key: 'accountName' },
        { header: 'Category', key: 'categoryName' },
        { header: 'Member', key: 'memberName' },
        { header: 'Description', key: 'description', width: 60 },
      ],
      campaigns
        .filter((campaign: any) => campaign.expenseTransaction)
        .map((campaign: any) => ({
          ...campaign.expenseTransaction,
          campaignTitle: campaign.title,
          accountName: campaign.expenseTransaction.account?.name,
          categoryName:
            campaign.expenseTransaction.categoryRef?.name ||
            campaign.expenseTransaction.category,
          memberName: campaign.expenseTransaction.member?.name,
        })),
    );

    this.addTableSheet(
      workbook,
      'Data Sources',
      [
        { header: 'Type', key: 'dataType' },
        { header: 'Source type', key: 'sourceType' },
        { header: 'Source display name', key: 'sourceDisplayName', width: 30 },
        { header: 'Status', key: 'status' },
        { header: 'Last synced at', key: 'lastSyncedAt', width: 22 },
        { header: 'Error', key: 'errorMessage', width: 50 },
        { header: 'Metadata JSON', key: 'metadata', width: 70 },
      ],
      channel.dataSources,
    );

    this.addTableSheet(
      workbook,
      'Source Access',
      [
        { header: 'Source type', key: 'sourceType' },
        { header: 'Source display name', key: 'sourceDisplayName', width: 30 },
        { header: 'Role', key: 'role' },
        { header: 'Can view stats', key: 'canViewStats' },
        { header: 'Can view members', key: 'canViewMembers' },
        { header: 'Can view invite links', key: 'canViewInviteLinks' },
        { header: 'Can post messages', key: 'canPostMessages' },
        { header: 'Last checked at', key: 'lastCheckedAt', width: 22 },
      ],
      channel.sourceAccesses,
    );

    this.addTableSheet(
      workbook,
      'Admin Links',
      [
        { header: 'Source', key: 'source' },
        { header: 'Account label', key: 'accountLabel', width: 24 },
        { header: 'Username', key: 'username' },
        { header: 'First name', key: 'firstName' },
        { header: 'Created at', key: 'createdAt', width: 22 },
      ],
      channel.adminLinks.map((link: any) => ({
        ...link,
        accountLabel: link.telegramUserAccountIntegration?.label,
        username: link.telegramUserAccountIntegration?.username,
        firstName: link.telegramUserAccountIntegration?.firstName,
      })),
    );

    const rawBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.isBuffer(rawBuffer)
      ? rawBuffer
      : Buffer.from(rawBuffer as ArrayBuffer);
    const filename = `${this.safeFileName(channel.username || channel.title)}_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
    return { buffer, filename };
  }

  private async syncOlderPostsMetricsBackfillForWorkspace(
    workspaceId: string,
    channelId: string,
    dto: { telegramUserAccountId?: string; maxPages?: number },
  ) {
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId, isActive: true },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    const account = await this.connectedAccount(
      workspaceId,
      channelId,
      dto.telegramUserAccountId,
    );
    const channelReference = this.mtprotoChannelReference(channel);
    if (!channelReference.telegramChatId && !channelReference.username)
      throw new BadRequestException('Channel must have username or chatId');

    const oldestStored = await this.prisma.telegramPost.findFirst({
      where: { telegramChannelId: channel.id },
      orderBy: [{ postDate: 'asc' }, { telegramMessageId: 'asc' }],
      select: { telegramMessageId: true, postDate: true },
    });
    if (!oldestStored?.telegramMessageId) {
      return { source: 'mtproto', syncedPosts: 0, pagesFetched: 0 };
    }
    let beforeMessageId = oldestStored.telegramMessageId;
    const backfillStart = oldestStored;

    let syncedPosts = 0;
    let pagesFetched = 0;
    const maxPages = Math.max(1, dto.maxPages || 1);
    for (let page = 0; page < maxPages; page += 1) {
      const metrics = await this.mtprotoClient.getChannelPostsMetrics({
        ...this.accountCredentials(account),
        channel: channelReference,
        postLimit: this.initialPostBackfillLimit,
        beforeMessageId,
      });
      if (!metrics.length) break;
      await this.persistPostMetrics(workspaceId, channel.id, metrics);
      syncedPosts += metrics.length;
      pagesFetched += 1;

      const nextBeforeMessageId = this.oldestMessageId(metrics);
      const next = this.toFiniteMessageId(nextBeforeMessageId);
      const current = this.toFiniteMessageId(beforeMessageId);
      if (
        !nextBeforeMessageId ||
        next == null ||
        current == null ||
        next >= current
      )
        break;
      beforeMessageId = nextBeforeMessageId;
    }

    if (syncedPosts > 0) {
      await this.sourceAccessService.recordDataSource({
        workspaceId,
        channelId,
        sourceId: account.id,
        sourceType: TelegramSourceType.MTPROTO,
        dataType: TelegramChannelDataType.POSTS,
        status: TelegramDataSourceStatus.SUCCESS,
        sourceDisplayName: this.sourceDisplayName(account),
        metadata: { olderSyncedPosts: syncedPosts, pagesFetched },
      });
    }

    return {
      source: 'mtproto',
      syncedPosts,
      pagesFetched,
      fromMessageId: backfillStart.telegramMessageId,
      fromDate: backfillStart.postDate,
      nextBeforeMessageId: beforeMessageId,
    };
  }

  private async recalculateDailyStatsFromPosts(
    channelId: string,
    dates: string[],
  ) {
    for (const value of dates) {
      const date = new Date(`${value}T00:00:00.000Z`);
      const nextDate = new Date(date.getTime() + 24 * 3600 * 1000);
      const aggregate = await this.prisma.telegramPost.aggregate({
        where: {
          telegramChannelId: channelId,
          postDate: { gte: date, lt: nextDate },
        },
        _sum: { viewsCount: true, reactionsCount: true, forwardsCount: true },
      });
      await this.prisma.telegramChannelDailyStats.upsert({
        where: {
          telegramChannelId_date: { telegramChannelId: channelId, date },
        },
        create: {
          telegramChannelId: channelId,
          date,
          viewsCount: aggregate._sum.viewsCount ?? 0,
          reactionsCount: aggregate._sum.reactionsCount ?? 0,
          forwardsCount: aggregate._sum.forwardsCount ?? 0,
        },
        update: {
          viewsCount: aggregate._sum.viewsCount ?? 0,
          reactionsCount: aggregate._sum.reactionsCount ?? 0,
          forwardsCount: aggregate._sum.forwardsCount ?? 0,
        },
      });
    }
  }

  async syncBroadcastStats(
    userId: string,
    channelId: string,
    dto: { telegramUserAccountId?: string },
  ) {
    const workspaceId = await this.workspace(userId);
    const account = await this.connectedAccount(
      workspaceId,
      channelId,
      dto.telegramUserAccountId,
    );
    const result = await this.syncBroadcastStatsForWorkspace(
      workspaceId,
      channelId,
      account.id,
    );
    this.invalidateTelegramChannelReadCache(userId, workspaceId);
    return result;
  }

  async syncBroadcastStatsForWorkspace(
    workspaceId: string,
    channelId: string,
    accountId: string,
  ) {
    const startedAt = Date.now();
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId, isActive: true },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    const account = await this.connectedAccount(
      workspaceId,
      channelId,
      accountId,
    );
    const channelReference = this.mtprotoChannelReference(channel);
    if (!channelReference.telegramChatId && !channelReference.username)
      throw new BadRequestException('Channel must have username or chatId');
    const stats = await this.mtprotoClient.getBroadcastStats({
      ...this.accountCredentials(account),
      channel: channelReference,
    });
    const currentSubscribersCount = channel.currentSubscribersCount ?? 0;
    const statsUnavailableBecauseChannelIsTooSmall =
      stats.normalized.status !== 'available' &&
      currentSubscribersCount > 0 &&
      currentSubscribersCount < TELEGRAM_BROADCAST_STATS_MIN_SUBSCRIBERS;
    const statsDataSourceStatus =
      stats.normalized.status === 'available'
        ? TelegramDataSourceStatus.SUCCESS
        : statsUnavailableBecauseChannelIsTooSmall
          ? TelegramDataSourceStatus.SKIPPED
          : TelegramDataSourceStatus.FAILED;
    const statsUnavailableMessage = statsUnavailableBecauseChannelIsTooSmall
      ? `Stats are not available yet: Telegram usually opens channel analytics after ${TELEGRAM_BROADCAST_STATS_MIN_SUBSCRIBERS}+ subscribers. Current subscribers: ${currentSubscribersCount}.`
      : Array.isArray(stats.warnings)
        ? stats.warnings.join('; ')
        : 'Stats unavailable from this source';
    const syncedAt = new Date();
    const snapshotDate = this.toUtcDay(syncedAt);
    const snapshot = await this.prisma.telegramChannelStatsSnapshot.upsert({
      where: {
        telegramChannelId_snapshotDate: {
          telegramChannelId: channel.id,
          snapshotDate,
        },
      },
      create: {
        workspaceId,
        telegramChannelId: channel.id,
        syncedAt,
        snapshotDate,
        rawStats: stats.raw as any,
        normalizedStats: stats.normalized as any,
        availableFields: stats.availableFields,
        warnings: stats.warnings,
      },
      update: {
        syncedAt,
        rawStats: stats.raw as any,
        normalizedStats: stats.normalized as any,
        availableFields: stats.availableFields,
        warnings: stats.warnings,
      },
    });
    const points = this.extractBroadcastStatsPoints(
      workspaceId,
      channel.id,
      syncedAt,
      stats.normalized,
    );
    await this.prisma.$transaction(
      points.map((point) =>
        this.prisma.telegramChannelStatsPoint.upsert({
          where: {
            telegramChannelId_metric_series_date: {
              telegramChannelId: point.telegramChannelId,
              metric: point.metric,
              series: point.series,
              date: point.date,
            },
          },
          create: point,
          update: {
            seriesLabel: point.seriesLabel,
            color: point.color,
            graphType: point.graphType,
            value: point.value,
            latestSyncedAt: point.latestSyncedAt,
          },
        }),
      ),
    );
    await this.sourceAccessService.recordDataSource({
      workspaceId,
      channelId,
      sourceId: account.id,
      sourceType: TelegramSourceType.MTPROTO,
      dataType: TelegramChannelDataType.STATS,
      status: statsDataSourceStatus,
      sourceDisplayName: this.sourceDisplayName(account),
      errorMessage:
        stats.normalized.status === 'available' ? null : statsUnavailableMessage,
      metadata: {
        availableFields: stats.availableFields,
        warnings: stats.warnings,
      },
    });
    const audienceSnapshot = await this.createAudienceSnapshotSafely(
      channelId,
      'sync',
    );
    const result = {
      source: 'mtproto',
      success: stats.normalized.status === 'available',
      snapshot,
      pointsUpserted: points.length,
      audienceSnapshot,
    };
    this.applicationLogger.info({
      level: result.success ? 'info' : 'warn',
      kind: 'integration',
      source: TelegramChannelsService.name,
      event: result.success
        ? 'telegram.broadcast_stats_sync.completed'
        : 'telegram.broadcast_stats_sync.skipped',
      message: result.success
        ? `Broadcast stats synced for channel ${channelId}.`
        : `Broadcast stats unavailable for channel ${channelId}.`,
      workspaceId,
      durationMs: Date.now() - startedAt,
      metadata: {
        channelId,
        sourceAccountId: account.id,
        pointsUpserted: points.length,
        normalizedStatus: stats.normalized.status,
        warnings: stats.warnings,
      },
    });
    return result;
  }

  private extractBroadcastStatsPoints(
    workspaceId: string,
    telegramChannelId: string,
    syncedAt: Date,
    normalizedStats: any,
  ) {
    const points: any[] = [];
    for (const [metric, graph] of Object.entries(
      normalizedStats?.graphs || {},
    )) {
      if ((graph as any)?.status !== 'available') continue;
      const payload = (graph as any).data;
      if (!Array.isArray(payload?.columns)) continue;
      const columns = payload.columns.filter((column: unknown) =>
        Array.isArray(column),
      );
      const dates = columns.find((column: any[]) => column[0] === 'x');
      if (!dates) continue;
      for (const values of columns.filter(
        (column: any[]) => column[0] !== 'x',
      )) {
        for (let index = 1; index < dates.length; index += 1) {
          const timestamp = Number(dates[index]);
          const value = Number(values[index]);
          if (!Number.isFinite(timestamp) || !Number.isFinite(value)) continue;
          points.push({
            workspaceId,
            telegramChannelId,
            metric,
            series: String(values[0]),
            seriesLabel: String(payload.names?.[values[0]] || values[0]),
            color: payload.colors?.[values[0]] || null,
            graphType: String(payload.types?.[values[0]] || 'line'),
            date: this.toUtcDay(
              new Date(
                timestamp < 100_000_000_000 ? timestamp * 1000 : timestamp,
              ),
            ),
            value,
            latestSyncedAt: syncedAt,
          });
        }
      }
    }
    return points;
  }

  async channelStatsSnapshots(userId: string, channelId: string, limit = 20) {
    const workspaceId = await this.workspace(userId);
    await this.findOne(userId, channelId);
    return this.prisma.telegramChannelStatsSnapshot.findMany({
      where: { workspaceId, telegramChannelId: channelId },
      orderBy: { syncedAt: 'desc' },
      take: Math.max(1, Math.min(100, limit)),
    });
  }

  async inviteLinks(userId: string, channelId: string) {
    const workspaceId = await this.workspace(userId);
    await this.findOne(userId, channelId);
    return this.findInviteLinksWithRequestedCountFallback({
      workspaceId,
      where: { workspaceId, telegramChannelId: channelId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async inviteLinkHistory(
    userId: string,
    channelId: string,
    inviteLinkId: string,
    limit = 120,
  ) {
    const workspaceId = await this.workspace(userId);
    await this.findOne(userId, channelId);
    const inviteLink = await this.prisma.telegramInviteLink.findFirst({
      where: {
        id: inviteLinkId,
        workspaceId,
        telegramChannelId: channelId,
      },
      select: this.inviteLinkReadSelect(true),
    });
    if (!inviteLink) {
      throw new NotFoundException('Invite link not found');
    }
    const rows = await this.readInviteLinkSnapshotsOrEmpty({
      where: {
        workspaceId,
        telegramChannelId: channelId,
        inviteLinkId,
      },
      orderBy: { syncedAt: 'desc' },
      take: Math.max(2, Math.min(365, limit)),
    });
    const points = this.inviteLinkHistoryPoints(
      rows.length
        ? [...rows].reverse()
        : [
            this.inviteLinkSyntheticHistoryPoint({
              syncedAt:
                inviteLink.lastSyncedAt ?? inviteLink.updatedAt ?? inviteLink.createdAt,
              joinedCount: inviteLink.joinedCount,
              requestedCount: (inviteLink as { requestedCount?: number | null })
                .requestedCount,
              isRevoked: inviteLink.isRevoked,
            }),
          ],
    );
    return {
      inviteLink: this.normalizeInviteLinkRequestedCount(inviteLink),
      points,
      summary: this.inviteLinkHistorySummary(points),
    };
  }

  async promosByChannel(userId: string, channelId: string) {
    const workspaceId = await this.workspace(userId);
    await this.findOne(userId, channelId);
    return this.prisma.promo.findMany({
      where: { workspaceId, telegramChannelId: channelId },
      include: {
        icon: true,
        telegramChannel: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async posts(userId: string, channelId: string, limit = 50, offset = 0) {
    const workspaceId = await this.workspace(userId);
    await this.findOne(userId, channelId);
    const safeLimit = Math.max(1, Math.min(200, limit));
    const safeOffset = Math.max(0, offset);
    const where = { workspaceId, telegramChannelId: channelId };
    const [items, total] = await Promise.all([
      this.prisma.telegramPost.findMany({
        where,
        orderBy: { postDate: 'desc' },
        skip: safeOffset,
        take: safeLimit,
      }),
      this.prisma.telegramPost.count({ where }),
    ]);
    return {
      source: 'mtproto',
      items,
      total,
      limit: safeLimit,
      offset: safeOffset,
    };
  }

  async analytics(
    userId: string,
    channelId: string,
    from?: string,
    to?: string,
  ) {
    const workspaceId = await this.workspace(userId);
    const channel = await this.findOne(userId, channelId);
    const fromDate = from
      ? new Date(from)
      : new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const toDate = to ? new Date(to) : new Date();
    const [
      dailyStats,
      inviteLinks,
      campaigns,
      recentPosts,
      channelStatsSnapshot,
      channelStatsPoints,
    ] = await Promise.all([
      this.prisma.telegramChannelDailyStats.findMany({
        where: {
          telegramChannelId: channelId,
          date: { gte: fromDate, lte: toDate },
        },
        orderBy: { date: 'asc' },
      }),
      this.findInviteLinksWithRequestedCountFallback({
        workspaceId,
        where: { workspaceId, telegramChannelId: channelId },
      }),
      this.prisma.adCampaign.findMany({
        where: { workspaceId, telegramChannelId: channelId },
        include: {
          telegramChannel: true,
          promo: {
            include: {
              icon: true,
              telegramChannel: true,
              assignedMember: WorkspaceService.assignedMemberInclude,
            },
          },
          inviteLinks: {
            select: {
              id: true,
              telegramChannelId: true,
              adCampaignId: true,
              name: true,
              url: true,
              joinedCount: true,
              requestedCount: true,
              isRevoked: true,
              creatorTelegramUserId: true,
              creatorUsername: true,
              creatorFirstName: true,
              creatorLastName: true,
              creatorPhotoUrl: true,
              creatorMatchSource: true,
              creatorMember: {
                select: {
                  id: true,
                  role: true,
                  telegramUsername: true,
                  avatarIcon: true,
                  user: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },
          advertisingTelegramChannels: {
            include: {
              telegramChannel: true,
            },
          },
          advertisingChannels: { include: { advertisingSource: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.telegramPost.findMany({
        where: { workspaceId, telegramChannelId: channelId },
        orderBy: { postDate: 'desc' },
        take: 100,
      }),
      this.prisma.telegramChannelStatsSnapshot.findFirst({
        where: { workspaceId, telegramChannelId: channelId },
        orderBy: { syncedAt: 'desc' },
      }),
      this.prisma.telegramChannelStatsPoint.findMany({
        where: {
          workspaceId,
          telegramChannelId: channelId,
          date: { gte: fromDate, lte: toDate },
        },
        orderBy: [{ date: 'asc' }, { metric: 'asc' }, { series: 'asc' }],
      }),
    ]);
    const campaignsWithMetrics = campaigns.map((campaign) => {
      const joinedCount = sumInviteLinkAttributedSubscribers(
        Array.isArray(campaign.inviteLinks) ? campaign.inviteLinks : [],
      );
      const fallbackJoinedCount = Number(campaign.joinedCount ?? campaign.newSubscribers ?? 0);
      const effectiveJoinedCount =
        joinedCount > 0 ? joinedCount : fallbackJoinedCount;
      const activeSubscribersFromAd = Number(
        campaign.cappedActiveSubscribersFromAd ??
          campaign.activeSubscribersFromAd ??
          0,
      );
      return {
        ...campaign,
        joinedCount: effectiveJoinedCount,
        leftCount: null,
        netGrowthCount: null,
        cpa:
          effectiveJoinedCount > 0
            ? Number(campaign.price) / effectiveJoinedCount
            : null,
        analytics: {
          joinedCount: effectiveJoinedCount,
          leftCount: null,
          netGrowth: effectiveJoinedCount,
          costPerJoinedSubscriber:
            effectiveJoinedCount > 0
              ? Number(campaign.price) / effectiveJoinedCount
              : null,
          costPerNetSubscriber:
            effectiveJoinedCount > 0
              ? Number(campaign.price) / effectiveJoinedCount
              : null,
        },
        activeSubscribersFromAd,
        attributionSource: 'mtproto_invite_link_usage',
      };
    });
    const inviteLinksJoinedTotal =
      sumInviteLinkAttributedSubscribers(inviteLinks);
    return {
      source: 'mtproto',
      channel,
      summary: {
        subscribersCurrent: channel.currentSubscribersCount ?? null,
        joinedHistoricalByLinks: inviteLinksJoinedTotal,
        joinedToday: null,
        leftToday: null,
        netGrowthToday: null,
        leftTotal: null,
        netGrowth: null,
        inviteLinksCount: inviteLinks.length,
        campaignsCount: campaigns.length,
        postsTotal: recentPosts.length,
        viewsTotal: recentPosts.reduce(
          (sum, post) => sum + Number(post.viewsCount || 0),
          0,
        ),
        forwardsTotal: recentPosts.reduce(
          (sum, post) => sum + Number(post.forwardsCount || 0),
          0,
        ),
        reactionsTotal: recentPosts.reduce(
          (sum, post) => sum + Number(post.reactionsCount || 0),
          0,
        ),
      },
      dailyStats,
      inviteLinks,
      campaigns: campaignsWithMetrics,
      recentPosts,
      recentEvents: [],
      channelStatsSnapshot,
      channelStatsPoints,
    };
  }

  async attachInviteLinkCampaign(
    userId: string,
    inviteLinkId: string,
    dto: AttachCampaignDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const [link, campaign] = await Promise.all([
      this.prisma.telegramInviteLink.findFirst({
        where: { id: inviteLinkId, workspaceId },
        select: {
          id: true,
          telegramChannelId: true,
          adCampaignId: true,
        },
      }),
      this.prisma.adCampaign.findFirst({
        where: { id: dto.adCampaignId, workspaceId },
      }),
    ]);
    if (!link) throw new NotFoundException('Invite link not found');
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (campaign.telegramChannelId !== link.telegramChannelId) {
      throw new BadRequestException(
        'Campaign and invite link must belong to the same channel',
      );
    }
    const updated = await this.updateInviteLinkWithRequestedCountFallback({
      where: { id: link.id },
      data: { adCampaignId: campaign.id, lastSyncedAt: new Date() },
    });
    await this.recalculateCampaignMetricsById(campaign.id);
    return updated;
  }

  async detachInviteLinkCampaign(userId: string, inviteLinkId: string) {
    const workspaceId = await this.workspace(userId);
    const link = await this.prisma.telegramInviteLink.findFirst({
      where: { id: inviteLinkId, workspaceId },
      select: {
        id: true,
        adCampaignId: true,
      },
    });
    if (!link) throw new NotFoundException('Invite link not found');
    const updated = await this.updateInviteLinkWithRequestedCountFallback({
      where: { id: link.id },
      data: { adCampaignId: null, lastSyncedAt: new Date() },
    });
    if (link.adCampaignId)
      await this.recalculateCampaignMetricsById(link.adCampaignId);
    return updated;
  }

  async recalculateCampaignMetricsById(campaignId: string) {
    const campaign = await this.prisma.adCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) return null;
    const links = await this.prisma.telegramInviteLink.findMany({
      where: { adCampaignId: campaignId },
      select: { joinedCount: true, requestedCount: true },
    });
    const joinedCount = sumInviteLinkAttributedSubscribers(links);
    return this.prisma.adCampaign.update({
      where: { id: campaignId },
      data: {
        joinedCount,
        leftCount: null,
        netGrowthCount: null,
        cpa:
          joinedCount > 0
            ? Number(campaign.priceInPrimaryCurrency) / joinedCount
            : null,
      },
    });
  }
}
