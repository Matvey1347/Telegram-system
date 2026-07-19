import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Api, TelegramClient } from 'telegram';
import { Logger as GramJsLogger, LogLevel } from 'telegram/extensions/Logger';
import { HTMLParser } from 'telegram/extensions/html';
import { normalizeTelegramChannelId } from './telegram-post-url';
import { CustomFile } from 'telegram/client/uploads';
import { StringSession } from 'telegram/sessions';
import { telegramHtmlToMtprotoHtml } from './telegram-markup';
import {
  MatchScore,
  canonicalTelegramInviteLink,
  normalizeTelegramUsername,
  resolveTelegramTitleCandidates,
  type ResolvedTelegramEntity,
  type TelegramTitleCandidate,
} from './telegram-import.helpers';
import type { TelegramChannelSyncProgressItem } from '@telegram-system/shared';

type ApiCredentials = { apiId: string; apiHash: string };
type SessionParams = ApiCredentials & { session?: string };
type BroadcastStatsGraphField =
  | 'followers_graph'
  | 'growth_graph'
  | 'views_graph'
  | 'shares_graph'
  | 'languages_graph'
  | 'mute_graph'
  | 'views_by_source_graph'
  | 'new_followers_by_source_graph'
  | 'reactions_by_emotion_graph';
type ImportableTelegramEntity = Api.User | Api.Channel | Api.Chat;
type TelegramChannelAccessMode =
  | 'PUBLIC'
  | 'PRIVATE'
  | 'PRIVATE_INVITE'
  | 'PRIVATE_JOIN_REQUEST'
  | 'UNKNOWN';
type StoredTelegramChannelReference = {
  username?: string | null;
  telegramChatId?: string | null;
  inviteLink?: string | null;
  telegramAccessHash?: string | null;
};
type ResolvedStoredTelegramChannel = {
  entity: ImportableTelegramEntity;
  peer: Api.TypeInputPeer;
  channel: ResolvedTelegramEntity & {
    telegramAccessHash: string | null;
    accessMode: TelegramChannelAccessMode;
    requiresJoinRequest: boolean;
    inviteLink: string | null;
    resolvedBy: 'dialog-id' | 'stored-peer' | 'username' | 'invite-link';
  };
};
export type TelegramInviteLinksResult = {
  scope: 'ALL_ADMINS' | 'PARTIAL_ADMINS';
  expectedTotalLinks: number;
  admins: Array<{
    telegramUserId: string;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    photoUrl: string | null;
    activeLinksCount: number;
    revokedLinksCount: number;
  }>;
  links: Array<{
    url: string;
    title: string | null;
    telegramCreatorUserId: string;
    creatorUsername: string | null;
    creatorFirstName: string | null;
    creatorLastName: string | null;
    creatorPhotoUrl: string | null;
    createdAt: Date | null;
    startDate: Date | null;
    expireDate: Date | null;
    usageLimit: number | null;
    usage: number;
    requested: number;
    requestNeeded: boolean;
    permanent: boolean;
    revoked: boolean;
  }>;
  warnings: string[];
};

type InviteAdminSummary = TelegramInviteLinksResult['admins'][number];
type ExportedInvitePayload = {
  link?: unknown;
  adminId?: unknown;
  title?: unknown;
  date?: unknown;
  startDate?: unknown;
  expireDate?: unknown;
  usageLimit?: unknown;
  usage?: unknown;
  requested?: unknown;
  requestNeeded?: unknown;
  permanent?: unknown;
  revoked?: unknown;
  invite?: unknown;
  newInvite?: unknown;
};
type InviteLinksProgressCallback = (
  item: TelegramChannelSyncProgressItem,
) => void | Promise<void>;
type InviteLinkLoadedCallback = (
  link: TelegramInviteLinksResult['links'][number],
  loadedCount: number,
  expectedTotal: number,
  warnings: string[],
) => void | Promise<void>;
type TelegramLongLike =
  | bigint
  | number
  | string
  | {
      toString(): string;
      constructor?: { name?: string };
    };

@Injectable()
export class TelegramMtprotoClient {
  private readonly logger = new Logger(TelegramMtprotoClient.name);
  private readonly maxPostBackfillLimit = 10_000;
  private readonly inviteLinksPageSize = 100;
  private readonly maxInviteLinkPages = 200;
  private readonly defaultTelegramPaletteSize = 7;
  private readonly maxPublishImageBytes = 10 * 1024 * 1024;
  private readonly telegramResolveTimeoutMs = 20_000;
  private readonly telegramMetadataTimeoutMs = 10_000;
  private readonly broadcastStatsGraphFields: Array<{
    normalized: BroadcastStatsGraphField;
    raw: string[];
  }> = [
    { normalized: 'followers_graph', raw: ['followersGraph'] },
    { normalized: 'growth_graph', raw: ['growthGraph'] },
    { normalized: 'views_graph', raw: ['viewsGraph', 'interactionsGraph'] },
    { normalized: 'shares_graph', raw: ['sharesGraph', 'interactionsGraph'] },
    { normalized: 'languages_graph', raw: ['languagesGraph'] },
    { normalized: 'mute_graph', raw: ['muteGraph'] },
    { normalized: 'views_by_source_graph', raw: ['viewsBySourceGraph'] },
    {
      normalized: 'new_followers_by_source_graph',
      raw: ['newFollowersBySourceGraph'],
    },
    {
      normalized: 'reactions_by_emotion_graph',
      raw: ['reactionsByEmotionGraph'],
    },
  ];

  private toFiniteNumber(value: unknown): number | null {
    if (value == null) return null;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    if (typeof value === 'object') {
      const candidate = (value as any).value ?? (value as any).low ?? null;
      if (candidate != null) return this.toFiniteNumber(candidate);
    }
    return null;
  }

  private toTelegramDate(value: unknown): Date | null {
    if (value instanceof Date) return value;
    const numeric = this.toFiniteNumber(value);
    if (numeric == null) return null;
    // Telegram date fields are often unix seconds; detect and normalize.
    const millis = numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private normalizeChatId(value?: string | null) {
    return normalizeTelegramChannelId(value);
  }

  private unwrapExportedChatInvite(invite: unknown): ExportedInvitePayload | null {
    if (!invite || typeof invite !== 'object') {
      return null;
    }

    const raw = invite as ExportedInvitePayload;

    if (typeof raw.link === 'string' && raw.link.trim()) {
      return raw;
    }

    const nestedCandidates = [raw.newInvite, raw.invite];
    for (const candidate of nestedCandidates) {
      if (
        candidate &&
        typeof candidate === 'object' &&
        typeof (candidate as { link?: unknown }).link === 'string' &&
        String((candidate as { link?: unknown }).link || '').trim()
      ) {
        return candidate as ExportedInvitePayload;
      }
    }

    return raw;
  }

  private toBigInt(value: unknown) {
    const normalized = this.normalizeChatId(
      typeof value === 'string' ? value : this.toFiniteNumber(value)?.toString(),
    );
    if (!normalized) return null;
    try {
      return BigInt(normalized);
    } catch {
      return null;
    }
  }

  private isTelegramLongLike(value: unknown): value is TelegramLongLike {
    if (value == null) return false;
    if (typeof value === 'bigint') return true;
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'string') return value.trim().length > 0;
    return (
      typeof value === 'object' &&
      typeof (value as { toString?: unknown }).toString === 'function'
    );
  }

  private telegramLongToString(value: unknown) {
    if (!this.isTelegramLongLike(value)) return null;
    const rendered = value.toString().trim();
    return rendered ? rendered : null;
  }

  private entityAccessHashValue(entity: ImportableTelegramEntity) {
    const raw = (entity as { accessHash?: unknown }).accessHash;
    return this.isTelegramLongLike(raw) ? raw : null;
  }

  private entityAccessHash(entity: ImportableTelegramEntity) {
    return this.telegramLongToString(this.entityAccessHashValue(entity));
  }

  private userSnapshotCompleteness(user: Api.User) {
    return {
      hasAccessHash: Boolean(this.entityAccessHashValue(user)),
      isMin: Boolean(user.min),
      hasUsername: Boolean(normalizeTelegramUsername(user.username)),
      hasName: Boolean(user.firstName || user.lastName),
      hasPhoto: Boolean(user.photo),
      isDeleted: Boolean(user.deleted),
    };
  }

  private choosePreferredUser(current: Api.User | null, incoming: Api.User) {
    if (!current) return incoming;
    const currentScore = this.userSnapshotCompleteness(current);
    const incomingScore = this.userSnapshotCompleteness(incoming);

    if (currentScore.hasAccessHash !== incomingScore.hasAccessHash) {
      return incomingScore.hasAccessHash ? incoming : current;
    }
    if (currentScore.isMin !== incomingScore.isMin) {
      return incomingScore.isMin ? current : incoming;
    }
    if (currentScore.isDeleted !== incomingScore.isDeleted) {
      return incomingScore.isDeleted ? current : incoming;
    }
    if (currentScore.hasUsername !== incomingScore.hasUsername) {
      return incomingScore.hasUsername ? incoming : current;
    }
    if (currentScore.hasName !== incomingScore.hasName) {
      return incomingScore.hasName ? incoming : current;
    }
    if (currentScore.hasPhoto !== incomingScore.hasPhoto) {
      return incomingScore.hasPhoto ? incoming : current;
    }
    return current;
  }

  private rememberKnownUser(
    knownUsers: Map<string, Api.User>,
    user: Api.User,
    source: string,
  ) {
    const userId = String(user.id);
    const previous = knownUsers.get(userId) ?? null;
    const preferred = this.choosePreferredUser(previous, user);
    knownUsers.set(userId, preferred);

    if (preferred !== previous || !previous) {
      this.logInviteSyncEvent('log', {
        phase: 'invite_admin_catalog',
        source,
        adminId: userId,
        username: normalizeTelegramUsername(preferred.username),
        userClass: preferred.className,
        min: Boolean(preferred.min),
        bot: Boolean(preferred.bot),
        deleted: Boolean(preferred.deleted),
        self: Boolean(preferred.self),
        hasAccessHash: Boolean(this.entityAccessHashValue(preferred)),
        accessHashType:
          typeof (preferred as { accessHash?: unknown }).accessHash,
        accessHashCtor:
          ((preferred as { accessHash?: { constructor?: { name?: string } } })
            .accessHash?.constructor?.name as string | undefined) ?? null,
      });
    }
  }

  private isImportableTelegramEntity(
    entity: unknown,
  ): entity is ImportableTelegramEntity {
    return (
      entity instanceof Api.User ||
      entity instanceof Api.Channel ||
      entity instanceof Api.Chat
    );
  }

  private asImportableTelegramEntity(
    entity: unknown,
    context: string,
  ): ImportableTelegramEntity {
    if (this.isImportableTelegramEntity(entity)) {
      return entity;
    }
    throw new BadRequestException(
      `Telegram ${context} could not be resolved to a supported entity.`,
    );
  }

  private isInputUser(entity: unknown): entity is Api.TypeInputUser {
    return (
      entity instanceof Api.InputUser ||
      entity instanceof Api.InputUserFromMessage ||
      entity instanceof Api.InputUserSelf
    );
  }

  private inferAccessMode(params: {
    username?: string | null;
    inviteLink?: string | null;
    requiresJoinRequest?: boolean;
  }): TelegramChannelAccessMode {
    if (params.username) return 'PUBLIC';
    if (params.requiresJoinRequest) return 'PRIVATE_JOIN_REQUEST';
    if (params.inviteLink) return 'PRIVATE_INVITE';
    return 'PRIVATE';
  }

  private extractNameColor(user: Api.User) {
    const rawCandidates = [
      (user as any)?.color?.color,
      (user as any)?.color?.colorId,
      (user as any)?.profileColor?.color,
      (user as any)?.profileColor?.colorId,
      (user as any)?.color,
      (user as any)?.profileColor,
    ];
    for (const raw of rawCandidates) {
      const numeric = this.toFiniteNumber(raw);
      if (numeric != null) return numeric;
    }

    // Telegram may omit explicit color fields for some accounts/sessions.
    // Fallback to a deterministic Telegram-like default bucket from user id.
    const userIdNum = this.toFiniteNumber((user as any)?.id);
    if (userIdNum != null) {
      return Math.abs(userIdNum) % this.defaultTelegramPaletteSize;
    }
    return 0;
  }

  private async createClient({ apiId, apiHash, session }: SessionParams) {
    const startedAt = this.now();
    this.logger.log(
      `Connecting MTProto client: apiId=${apiId} session=${this.sessionFingerprint(session)}`,
    );
    const client = new TelegramClient(
      new StringSession(session || ''),
      Number(apiId),
      apiHash,
      {
        autoReconnect: false,
        baseLogger: new GramJsLogger(LogLevel.NONE),
        connectionRetries: 3,
        reconnectRetries: 0,
      },
    );
    await client.connect();
    this.logger.log(
      `MTProto client connected in ${this.elapsed(startedAt)}: apiId=${apiId}`,
    );
    return client;
  }

  private async closeClient(client: TelegramClient) {
    try {
      const startedAt = this.now();
      await client.destroy();
      this.logger.log(`MTProto client destroyed in ${this.elapsed(startedAt)}`);
    } catch {
      try {
        const startedAt = this.now();
        await client.disconnect();
        this.logger.log(
          `MTProto client disconnected in ${this.elapsed(startedAt)}`,
        );
      } catch {
        // Best-effort cleanup for short-lived MTProto clients.
      }
    }
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    label: string,
  ) {
    return await Promise.race<T>([
      promise,
      new Promise<T>((_, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        timer.unref?.();
      }),
    ]);
  }

  private now() {
    return Date.now();
  }

  private elapsed(startedAt: number) {
    return `${this.now() - startedAt}ms`;
  }

  private maskInviteHash(value?: string | null) {
    const hash = String(value || '').trim().replace(/^\+/, '');
    if (!hash) return 'n/a';
    if (hash.length <= 6) return `${hash.slice(0, 2)}***`;
    return `${hash.slice(0, 4)}***${hash.slice(-2)}`;
  }

  private sessionFingerprint(session?: string | null) {
    const raw = String(session || '').trim();
    if (!raw) return 'empty';
    if (raw.length <= 10) return `${raw.slice(0, 3)}***`;
    return `${raw.slice(0, 5)}***${raw.slice(-4)}`;
  }

  private errorSummary(error: unknown) {
    if (!error || typeof error !== 'object') {
      return { message: String(error || 'unknown error') };
    }
    return {
      name: (error as any).name || null,
      message: (error as any).message || null,
      errorMessage: (error as any).errorMessage || null,
      errorCode: (error as any).errorCode || null,
      code: (error as any).code || null,
      seconds: this.toFiniteNumber((error as any).seconds),
      newDc: this.toFiniteNumber((error as any).newDc),
      stack: typeof (error as any).stack === 'string' ? (error as any).stack : null,
    };
  }

  private parseMtprotoHtml(html: string) {
    const [text, entities] = HTMLParser.parse(telegramHtmlToMtprotoHtml(html));
    return { text, entities };
  }

  private isMessageNotModifiedError(error: unknown) {
    const message = String(
      (error as { errorMessage?: string | null })?.errorMessage ||
        (error as { message?: string | null })?.message ||
        '',
    ).toUpperCase();
    return message.includes('MESSAGE_NOT_MODIFIED');
  }

  private async sendTextMessageWithEntities(
    client: TelegramClient,
    entity: unknown,
    html: string,
    schedule?: number,
  ) {
    const { text, entities } = this.parseMtprotoHtml(html);
    if (!text) return null;
    const peer = await client.getInputEntity(entity as never);
    const request = new Api.messages.SendMessage({
      peer,
      message: text,
      entities,
      scheduleDate: schedule,
    });
    const result = await client.invoke(request);
    return (client as unknown as {
      _getResponseMessage: (
        request: Api.messages.SendMessage,
        result: unknown,
        inputChat: unknown,
      ) => Api.Message | undefined;
    })._getResponseMessage(request, result, peer);
  }

  private async editMessageWithEntities(
    client: TelegramClient,
    peerRef: unknown,
    messageId: string | number,
    html: string,
  ) {
    const { text, entities } = this.parseMtprotoHtml(html);
    try {
      await client.invoke(
        new Api.messages.EditMessage({
          peer: await client.getInputEntity(peerRef as never),
          id: Number(messageId),
          message: text,
          entities,
        }),
      );
      return true;
    } catch (error) {
      if (this.isMessageNotModifiedError(error)) {
        return false;
      }
      throw error;
    }
  }

  private toJsonSafe(value: unknown): unknown {
    if (
      value == null ||
      typeof value === 'string' ||
      typeof value === 'boolean'
    ) {
      return value;
    }
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'bigint') return value.toString();
    if (value instanceof Date) return value.toISOString();
    if (Buffer.isBuffer(value)) return value.toString('base64');
    if (Array.isArray(value)) return value.map((item) => this.toJsonSafe(item));
    if (typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value)) {
        if (typeof item !== 'function') result[key] = this.toJsonSafe(item);
      }
      return result;
    }
    return null;
  }

  private parseGraphJson(value: unknown) {
    if (typeof value !== 'string') return value ?? null;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  }

  private graphTimestampToDate(value: unknown) {
    const timestamp = this.toFiniteNumber(value);
    if (timestamp == null) return null;
    return this.toTelegramDate(
      timestamp < 100_000_000_000 ? timestamp * 1000 : timestamp,
    );
  }

  private extractGraphStatsPeriod(
    graphs: Partial<Record<BroadcastStatsGraphField, unknown>>,
  ) {
    let minDate: Date | null = null;
    let maxDate: Date | null = null;

    for (const graph of Object.values(graphs)) {
      if ((graph as any)?.status !== 'available') continue;
      const columns = (graph as any)?.data?.columns;
      if (!Array.isArray(columns)) continue;
      const dates = columns.find(
        (column: unknown) => Array.isArray(column) && column[0] === 'x',
      );
      if (!Array.isArray(dates)) continue;
      for (const value of dates.slice(1)) {
        const date = this.graphTimestampToDate(value);
        if (!date) continue;
        if (!minDate || date < minDate) minDate = date;
        if (!maxDate || date > maxDate) maxDate = date;
      }
    }

    if (!minDate || !maxDate) return null;
    return {
      minDate: minDate.toISOString(),
      maxDate: maxDate.toISOString(),
      source: 'graphs',
    };
  }

  private async normalizeStatsGraph(
    client: TelegramClient,
    field: BroadcastStatsGraphField,
    graph: unknown,
    warnings: string[],
    statsDcId?: number | null,
  ) {
    let resolvedGraph = graph;
    if (resolvedGraph instanceof Api.StatsGraphAsync) {
      const token = resolvedGraph.token;
      try {
        const response = await this.invokeWithStatsDcMigration(
          client,
          () => new Api.stats.LoadAsyncGraph({ token }),
          statsDcId,
        );
        resolvedGraph = response.result;
        if (response.migrated) {
          warnings.push(
            `${field}: async graph request was retried on Telegram stats DC ${response.dcId}`,
          );
        }
      } catch (error) {
        warnings.push(
          `${field}: async graph could not be loaded (${this.getTelegramErrorCode(error)})`,
        );
        return { status: 'pending', token };
      }
    }

    if (resolvedGraph instanceof Api.StatsGraphAsync) {
      warnings.push(`${field}: async graph is still pending`);
      return { status: 'pending', token: resolvedGraph.token };
    }
    if (resolvedGraph instanceof Api.StatsGraphError) {
      warnings.push(`${field}: ${resolvedGraph.error}`);
      return { status: 'error', error: resolvedGraph.error };
    }
    if (resolvedGraph instanceof Api.StatsGraph) {
      return {
        status: 'available',
        data: this.parseGraphJson(resolvedGraph.json?.data),
        zoomToken: resolvedGraph.zoomToken || null,
      };
    }
    if (resolvedGraph == null) {
      warnings.push(`${field}: graph was not returned`);
      return { status: 'unavailable' };
    }

    warnings.push(`${field}: unknown graph response`);
    return { status: 'unavailable', raw: this.toJsonSafe(resolvedGraph) };
  }

  private getErrorProperty(error: unknown, property: string) {
    if (!error || typeof error !== 'object') return null;
    return (error as Record<string, unknown>)[property];
  }

  private getTelegramErrorCode(error: unknown) {
    return String(
      this.getErrorProperty(error, 'errorMessage') ||
        this.getErrorProperty(error, 'message') ||
        'UNKNOWN_ERROR',
    );
  }

  private getMigrationDc(error: unknown) {
    const newDc = this.toFiniteNumber(this.getErrorProperty(error, 'newDc'));
    if (newDc != null) return newDc;

    const errorCode = this.getTelegramErrorCode(error);
    const match = errorCode.match(/(?:^|_)MIGRATE_(\d+)(?:\b|$)/);
    return match ? this.toFiniteNumber(match[1]) : null;
  }

  private async invokeWithStatsDcMigration<R extends Api.AnyRequest>(
    client: TelegramClient,
    requestFactory: () => R,
    statsDcId?: number | null,
  ): Promise<{
    result: R['__response'];
    dcId: number | null;
    migrated: boolean;
  }> {
    const initialDcId = statsDcId ?? null;
    try {
      return {
        result: await client.invoke(requestFactory(), initialDcId ?? undefined),
        dcId: initialDcId,
        migrated: false,
      };
    } catch (error) {
      const migrationDc = this.getMigrationDc(error);
      if (migrationDc == null || migrationDc === initialDcId) throw error;
      return {
        result: await client.invoke(requestFactory(), migrationDc),
        dcId: migrationDc,
        migrated: true,
      };
    }
  }

  private async getBroadcastStatsDc(
    client: TelegramClient,
    entity: unknown,
  ): Promise<number | null> {
    try {
      const full = await client.invoke(
        new Api.channels.GetFullChannel({ channel: entity as any }),
      );
      return this.toFiniteNumber((full as any)?.fullChat?.statsDc);
    } catch {
      return null;
    }
  }

  private telegramPublicPhotoUrl(username: string | null) {
    return username ? `https://t.me/i/userpic/320/${username}.jpg` : null;
  }

  private async profilePhotoDataUrl(client: TelegramClient, entity: unknown) {
    try {
      const photo = await this.withTimeout(
        client.downloadProfilePhoto(entity as any, {
          isBig: true,
        }),
        this.telegramMetadataTimeoutMs,
        'Telegram profile photo download',
      );
      if (!Buffer.isBuffer(photo) || photo.length === 0) return null;
      return `data:image/jpeg;base64,${photo.toString('base64')}`;
    } catch {
      return null;
    }
  }

  private normalizeBroadcastStatsError(error: unknown) {
    const errorCode = this.getTelegramErrorCode(error);
    const migrationDc = this.getMigrationDc(error);
    const floodWaitSeconds = this.toFiniteNumber(
      this.getErrorProperty(error, 'seconds'),
    );
    if (floodWaitSeconds != null || errorCode.includes('FLOOD_WAIT')) {
      return {
        status: 'flood_wait',
        errorCode,
        floodWaitSeconds,
        warnings: [
          floodWaitSeconds != null
            ? `Telegram rate limit: retry after ${floodWaitSeconds} seconds`
            : `Telegram rate limit: ${errorCode}`,
        ],
      };
    }
    if (migrationDc != null) {
      return {
        status: 'dc_migrate_required',
        errorCode,
        floodWaitSeconds: null,
        dcId: migrationDc,
        warnings: [
          `Telegram asked to retry broadcast stats on DC ${migrationDc}: ${errorCode}`,
        ],
      };
    }
    if (
      errorCode.includes('CHAT_ADMIN_REQUIRED') ||
      errorCode.includes('CHANNEL_PRIVATE') ||
      errorCode.includes('RIGHT_FORBIDDEN')
    ) {
      return {
        status: 'no_admin_rights',
        errorCode,
        floodWaitSeconds: null,
        warnings: [
          `Broadcast stats require channel admin rights: ${errorCode}`,
        ],
      };
    }
    if (
      errorCode.includes('STATS') ||
      errorCode.includes('CHANNEL_INVALID') ||
      errorCode.includes('BROADCAST_REQUIRED')
    ) {
      return {
        status: 'unavailable',
        errorCode,
        floodWaitSeconds: null,
        warnings: [
          `Broadcast stats are unavailable for this channel: ${errorCode}`,
        ],
      };
    }
    return {
      status: 'unavailable',
      errorCode,
      floodWaitSeconds: null,
      warnings: [`Broadcast stats sync failed: ${errorCode}`],
    };
  }

  private saveSession(client: TelegramClient): string {
    const saved = client.session.save();
    return typeof saved === 'string' ? saved : '';
  }

  private entityIdToString(entity: { id?: unknown }) {
    if (typeof entity.id === 'bigint') return entity.id.toString();
    if (entity.id == null) return '';
    return String(entity.id);
  }

  private entityKind(entity: ImportableTelegramEntity): 'channel' | 'person' {
    return entity instanceof Api.User ? 'person' : 'channel';
  }

  private entityTitle(entity: ImportableTelegramEntity) {
    if (entity instanceof Api.User) {
      return [entity.firstName, entity.lastName].filter(Boolean).join(' ').trim();
    }
    return String(entity.title || '').trim();
  }

  private inviteErrorCode(error: unknown) {
    const candidate = error as {
      errorMessage?: string;
      message?: string;
      errorCode?: string;
    };
    const raw =
      candidate?.errorMessage ||
      candidate?.errorCode ||
      candidate?.message ||
      '';
    const match = String(raw).match(/[A-Z_]+/);
    return match?.[0] || '';
  }

  private mapInviteError(error: unknown): never {
    const code = this.inviteErrorCode(error);
    switch (code) {
      case 'INVITE_HASH_INVALID':
        throw new BadRequestException('Telegram invite link is invalid.');
      case 'INVITE_HASH_EXPIRED':
        throw new BadRequestException('Telegram invite link has expired.');
      case 'INVITE_REQUEST_SENT':
        throw new ConflictException(
          'Join request was sent. Wait for approval and retry the import.',
        );
      case 'CHANNELS_TOO_MUCH':
        throw new ForbiddenException(
          'The connected Telegram account has reached its channel limit.',
        );
      default:
        throw error;
    }
  }

  private async describeEntity(
    client: TelegramClient,
    entity: ImportableTelegramEntity,
    fallbackRef: string,
    rawExtra?: Record<string, unknown>,
  ): Promise<ResolvedTelegramEntity & { raw: Record<string, unknown> }> {
    const startedAt = this.now();
    this.logger.log(
      `Describing Telegram entity: kind=${this.entityKind(entity)} id=${this.entityIdToString(entity) || 'n/a'} fallback=${fallbackRef}`,
    );
    let fullChannel: unknown = null;
    if (!(entity instanceof Api.User)) {
      try {
        const fullStartedAt = this.now();
        const full = await this.withTimeout(
          client.invoke(new Api.channels.GetFullChannel({ channel: entity })),
          this.telegramMetadataTimeoutMs,
          'Telegram full channel lookup',
        );
        fullChannel = (full as { fullChat?: unknown }).fullChat || null;
        this.logger.log(
          `Telegram full channel lookup completed in ${this.elapsed(fullStartedAt)}: id=${this.entityIdToString(entity) || 'n/a'}`,
        );
      } catch {
        fullChannel = null;
        this.logger.warn(
          `Telegram full channel lookup failed or timed out for id=${this.entityIdToString(entity) || 'n/a'}`,
        );
      }
    }

    const username = normalizeTelegramUsername(
      (entity as { username?: string | null }).username,
    );
    const requiresJoinRequest = Boolean(
      rawExtra?.requiresJoinRequest ||
        (entity as { joinToSend?: boolean }).joinToSend ||
        (fullChannel as { requestsPending?: unknown } | null)?.requestsPending ||
        (fullChannel as { joinRequestsEnabled?: unknown } | null)
          ?.joinRequestsEnabled,
    );
    const inviteLink =
      typeof rawExtra?.inviteLink === 'string' && rawExtra.inviteLink.trim()
        ? rawExtra.inviteLink.trim()
        : null;
    const telegramAccessHash = this.entityAccessHash(entity);
    const firstName = entity instanceof Api.User ? String(entity.firstName || '') || null : null;
    const lastName = entity instanceof Api.User ? String(entity.lastName || '') || null : null;
    const participantsCount =
      this.toFiniteNumber(
        (fullChannel as { participantsCount?: unknown } | null)?.participantsCount,
      ) ??
      this.toFiniteNumber(
        (entity as { participantsCount?: unknown }).participantsCount,
      );
    const photoUrl =
      (await this.profilePhotoDataUrl(client, entity)) ||
      this.telegramPublicPhotoUrl(username);
    this.logger.log(
      `Telegram entity described in ${this.elapsed(startedAt)}: kind=${this.entityKind(entity)} id=${this.entityIdToString(entity) || 'n/a'} username=${username || 'n/a'}`,
    );
    return {
      kind: this.entityKind(entity),
      telegramChatId: this.entityIdToString(entity),
      title: this.entityTitle(entity) || username || fallbackRef,
      username,
      description:
        ((fullChannel as { about?: string | null } | null)?.about as string | null) ||
        null,
      participantsCount,
      photoUrl,
      telegramAccessHash,
      accessMode: this.inferAccessMode({
        username,
        inviteLink,
        requiresJoinRequest,
      }),
      requiresJoinRequest,
      inviteLink,
      raw: {
        ...(rawExtra || {}),
        entity: this.toJsonSafe({
          id: this.entityIdToString(entity),
          title: this.entityTitle(entity),
          firstName,
          lastName,
          username,
          accessHash: telegramAccessHash,
          participantsCount: (entity as { participantsCount?: unknown }).participantsCount,
        }),
        fullChannel: this.toJsonSafe({
          about: (fullChannel as { about?: unknown } | null)?.about,
          participantsCount:
            (fullChannel as { participantsCount?: unknown } | null)?.participantsCount,
        }),
      },
    };
  }

  private searchResultCandidates(result: unknown): ImportableTelegramEntity[] {
    const users = Array.isArray((result as { users?: unknown[] } | null)?.users)
      ? (result as { users: unknown[] }).users
      : [];
    const chats = Array.isArray((result as { chats?: unknown[] } | null)?.chats)
      ? (result as { chats: unknown[] }).chats
      : [];
    return [...chats, ...users].filter((entity) =>
      this.isImportableTelegramEntity(entity),
    ) as ImportableTelegramEntity[];
  }

  private dedupeTitleCandidates(
    candidates: Array<TelegramTitleCandidate<ImportableTelegramEntity>>,
  ) {
    const seen = new Set<string>();
    return candidates.filter((candidate) => {
      const key = `${candidate.kind}:${candidate.entityId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private async titleCandidates(
    client: TelegramClient,
    titleQuery: string,
  ) {
    const dialogs = await client.getDialogs({ limit: 300 });
    const dialogCandidates = dialogs
      .map((dialog: unknown) => {
        const row = dialog as { title?: string; entity?: unknown };
        if (!this.isImportableTelegramEntity(row.entity)) return null;
        return {
          entity: row.entity,
          entityId: this.entityIdToString(row.entity),
          kind: this.entityKind(row.entity),
          title: String(row.title || this.entityTitle(row.entity)).trim(),
          username: normalizeTelegramUsername(
            (row.entity as { username?: string | null }).username,
          ),
          source: 'dialogs' as const,
        };
      })
      .filter(Boolean) as Array<TelegramTitleCandidate<ImportableTelegramEntity>>;

    const searchResult = await client.invoke(
      new Api.contacts.Search({ q: titleQuery, limit: 50 }),
    );
    const searchCandidates = this.searchResultCandidates(searchResult).map(
      (entity) => ({
        entity,
        entityId: this.entityIdToString(entity),
        kind: this.entityKind(entity),
        title: this.entityTitle(entity),
        username: normalizeTelegramUsername(
          (entity as { username?: string | null }).username,
        ),
        source: 'search' as const,
      }),
    );

    return this.dedupeTitleCandidates([
      ...dialogCandidates,
      ...searchCandidates,
    ]);
  }

  private suggestionsMessage(
    titleQuery: string,
    suggestions: Array<{ title: string; username: string | null }>,
  ) {
    if (!suggestions.length) {
      return 'Private channels that are not accessible to the connected Telegram account require an invite link.';
    }
    const rendered = suggestions
      .slice(0, 5)
      .map((item) => (item.username ? `${item.title} (@${item.username})` : item.title))
      .join(', ');
    return `Channel "${titleQuery}" was not found. Possible matches: ${rendered}.`;
  }

  private async dialogCandidates(client: TelegramClient) {
    const dialogs = await client.getDialogs({ limit: 300 });
    return dialogs
      .map((dialog: unknown) => {
        const row = dialog as { title?: string; entity?: unknown };
        if (!this.isImportableTelegramEntity(row.entity)) return null;
        return {
          title: String(row.title || this.entityTitle(row.entity)).trim(),
          entity: row.entity,
        };
      })
      .filter(Boolean) as Array<{
      title: string;
      entity: ImportableTelegramEntity;
    }>;
  }

  private async findDialogEntityByChatId(
    client: TelegramClient,
    telegramChatId?: string | null,
  ) {
    const normalizedChatId = this.normalizeChatId(telegramChatId);
    if (!normalizedChatId) return null;
    const dialogs = await this.dialogCandidates(client);
    return (
      dialogs.find(
        (dialog) =>
          this.normalizeChatId(this.entityIdToString(dialog.entity)) ===
          normalizedChatId,
      )?.entity || null
    );
  }

  private storedInputPeer(channel: StoredTelegramChannelReference) {
    const channelId = this.toBigInt(channel.telegramChatId);
    const accessHash = this.toBigInt(channel.telegramAccessHash);
    if (!channelId || accessHash == null) return null;
    return new Api.InputPeerChannel({
      channelId: channelId as any,
      accessHash: accessHash as any,
    });
  }

  private async tryResolveEntity(
    client: TelegramClient,
    ref: unknown,
  ): Promise<ImportableTelegramEntity | null> {
    if (ref == null) return null;
    try {
      const entity = await client.getEntity(ref as never);
      return this.isImportableTelegramEntity(entity)
        ? (entity as ImportableTelegramEntity)
        : null;
    } catch {
      return null;
    }
  }

  private async tryResolvePeer(
    client: TelegramClient,
    ref: unknown,
  ): Promise<Api.TypeInputPeer | null> {
    if (ref == null) return null;
    try {
      return await client.getInputEntity(ref as never);
    } catch {
      return null;
    }
  }

  private async resolveStoredChannel(
    client: TelegramClient,
    channel: StoredTelegramChannelReference,
  ): Promise<ResolvedStoredTelegramChannel> {
    const dialogEntity = await this.findDialogEntityByChatId(
      client,
      channel.telegramChatId,
    );
    if (dialogEntity) {
      const described = await this.describeEntity(
        client,
        dialogEntity,
        channel.username || channel.telegramChatId || 'Telegram channel',
        {
          inviteLink: channel.inviteLink || null,
        },
      );
      const peer = await this.tryResolvePeer(client, dialogEntity);
      if (peer) {
        return {
          entity: dialogEntity,
          peer,
          channel: {
            ...described,
            telegramAccessHash:
              described.telegramAccessHash || channel.telegramAccessHash || null,
            inviteLink: described.inviteLink || channel.inviteLink || null,
            accessMode:
              (described.accessMode as TelegramChannelAccessMode | undefined) ||
              this.inferAccessMode({
                username: described.username,
                inviteLink: described.inviteLink || channel.inviteLink || null,
                requiresJoinRequest: described.requiresJoinRequest,
              }),
            requiresJoinRequest: Boolean(described.requiresJoinRequest),
            resolvedBy: 'dialog-id',
          },
        };
      }
    }

    const storedPeer = this.storedInputPeer(channel);
    if (storedPeer) {
      const entity = await this.tryResolveEntity(client, storedPeer);
      if (entity) {
        const described = await this.describeEntity(
          client,
          entity,
          channel.username || channel.telegramChatId || 'Telegram channel',
          {
            inviteLink: channel.inviteLink || null,
          },
        );
        return {
          entity,
          peer: storedPeer,
          channel: {
            ...described,
            telegramAccessHash:
              described.telegramAccessHash || channel.telegramAccessHash || null,
            inviteLink: described.inviteLink || channel.inviteLink || null,
            accessMode:
              (described.accessMode as TelegramChannelAccessMode | undefined) ||
              this.inferAccessMode({
                username: described.username,
                inviteLink: described.inviteLink || channel.inviteLink || null,
                requiresJoinRequest: described.requiresJoinRequest,
              }),
            requiresJoinRequest: Boolean(described.requiresJoinRequest),
            resolvedBy: 'stored-peer',
          },
        };
      }
    }

    const username = normalizeTelegramUsername(channel.username);
    if (username) {
      const entity = await this.tryResolveEntity(client, `@${username}`);
      if (entity) {
        const peer = await this.tryResolvePeer(client, entity);
        if (peer) {
          const described = await this.describeEntity(client, entity, `@${username}`, {
            inviteLink: channel.inviteLink || null,
          });
          return {
            entity,
            peer,
            channel: {
              ...described,
              telegramAccessHash:
                described.telegramAccessHash || channel.telegramAccessHash || null,
              inviteLink: described.inviteLink || channel.inviteLink || null,
              accessMode:
                (described.accessMode as TelegramChannelAccessMode | undefined) ||
                this.inferAccessMode({
                  username: described.username,
                  inviteLink: described.inviteLink || channel.inviteLink || null,
                  requiresJoinRequest: described.requiresJoinRequest,
                }),
              requiresJoinRequest: Boolean(described.requiresJoinRequest),
              resolvedBy: 'username',
            },
          };
        }
      }
    }

    const inviteHash = String(channel.inviteLink || '').match(
      /(?:joinchat\/|\+)([A-Za-z0-9_-]+)/i,
    )?.[1];
    if (inviteHash) {
      const resolved = await this.resolveInviteLinkInfo(
        client,
        channel.inviteLink || 'Telegram channel',
        inviteHash,
      );
      const entity = await this.tryResolveEntity(
        client,
        this.storedInputPeer({
          telegramChatId: resolved.telegramChatId,
          telegramAccessHash: resolved.telegramAccessHash || null,
        }) || `@${resolved.username}`,
      );
      const peer =
        (entity ? await this.tryResolvePeer(client, entity) : null) ||
        (resolved.telegramAccessHash
          ? this.storedInputPeer({
              telegramChatId: resolved.telegramChatId,
              telegramAccessHash: resolved.telegramAccessHash,
            })
          : null);
      if (entity && peer) {
        return {
          entity,
          peer,
          channel: {
            ...resolved,
            telegramAccessHash: resolved.telegramAccessHash || null,
            accessMode:
              (resolved.accessMode as TelegramChannelAccessMode | undefined) ||
              this.inferAccessMode({
                username: resolved.username,
                inviteLink: resolved.inviteLink || channel.inviteLink || null,
                requiresJoinRequest: resolved.requiresJoinRequest,
              }),
            requiresJoinRequest: Boolean(resolved.requiresJoinRequest),
            inviteLink: resolved.inviteLink || channel.inviteLink || null,
            resolvedBy: 'invite-link',
          },
        };
      }
    }

    throw new BadRequestException(
      'Could not resolve the Telegram channel for this connected account.',
    );
  }

  private async importEntityFromInviteUpdates(
    client: TelegramClient,
    updates: unknown,
    fallbackRef: string,
    inviteLink: string,
    joinedByInvite: boolean,
  ) {
    const candidates = this.searchResultCandidates(updates);
    const entity =
      candidates.find(
        (candidate) =>
          candidate instanceof Api.Channel || candidate instanceof Api.Chat,
      ) || candidates[0];
    if (!entity) {
      throw new BadRequestException(
        'Could not resolve a real Telegram channel from the invite link.',
      );
    }
    const described = await this.describeEntity(client, entity, fallbackRef, {
      inviteLink,
      joinedByInvite,
    });
    return {
      ...described,
      inviteLink,
      joinedByInvite,
    };
  }

  private async findInviteAlreadyEntity(
    client: TelegramClient,
    invite: Api.ChatInviteAlready,
    fallbackRef: string,
    inviteLink: string,
  ) {
    const entity = await client.getEntity(invite.chat);
    if (!this.isImportableTelegramEntity(entity)) {
      throw new BadRequestException(
        'Could not resolve a real Telegram channel from the invite link.',
      );
    }
    const described = await this.describeEntity(client, entity, fallbackRef, {
      invite: this.toJsonSafe(invite),
    });
    return {
      ...described,
      inviteLink,
      joinedByInvite: false,
    };
  }

  private async resolveInviteParticipantConflict(
    client: TelegramClient,
    inviteLink: string,
    previewTitle: string,
  ) {
    const normalizedTitle = previewTitle.normalize('NFKC').trim();
    const dialogs = await this.dialogCandidates(client);
    const exactDialogs = dialogs.filter(
      (dialog) => dialog.title.normalize('NFKC').trim() === normalizedTitle,
    );
    if (exactDialogs.length !== 1) {
      throw new BadRequestException(
        'Could not resolve a real Telegram channel from the invite link.',
      );
    }
    const described = await this.describeEntity(
      client,
      exactDialogs[0].entity,
      previewTitle,
      { matchedBy: 'invite-participant-conflict' },
    );
    return {
      ...described,
      inviteLink,
      joinedByInvite: false,
    };
  }

  private async resolveInviteLinkInfo(
    client: TelegramClient,
    fallbackRef: string,
    inviteHash: string,
  ) {
    const inviteLink = canonicalTelegramInviteLink(inviteHash);
    const maskedInvite = this.maskInviteHash(inviteHash);
    this.logger.log(
      `Resolving Telegram invite link: invite=${maskedInvite} fallback=${fallbackRef}`,
    );
    let invite: Api.TypeChatInvite;
    try {
      const checkStartedAt = this.now();
      this.logger.log(`Checking Telegram invite: invite=${maskedInvite}`);
      invite = await this.withTimeout(
        client.invoke(new Api.messages.CheckChatInvite({ hash: inviteHash })),
        this.telegramResolveTimeoutMs,
        'Telegram invite check',
      );
      this.logger.log(
        `Telegram invite check completed in ${this.elapsed(checkStartedAt)}: invite=${maskedInvite} result=${invite?.constructor?.name || 'unknown'}`,
      );
    } catch (error) {
      this.logger.error(
        `Telegram invite check failed: invite=${maskedInvite}`,
        JSON.stringify(this.errorSummary(error)),
      );
      this.mapInviteError(error);
    }

    if (invite instanceof Api.ChatInviteAlready) {
      this.logger.log(
        `Telegram invite already joined: invite=${maskedInvite}`,
      );
      return this.findInviteAlreadyEntity(client, invite, fallbackRef, inviteLink);
    }

    const previewTitle = String((invite as { title?: string }).title || fallbackRef);
    try {
      const importStartedAt = this.now();
      this.logger.log(
        `Importing Telegram invite: invite=${maskedInvite} previewTitle=${previewTitle}`,
      );
      const updates = await this.withTimeout(
        client.invoke(new Api.messages.ImportChatInvite({ hash: inviteHash })),
        this.telegramResolveTimeoutMs,
        'Telegram invite import',
      );
      this.logger.log(
        `Telegram invite import completed in ${this.elapsed(importStartedAt)}: invite=${maskedInvite} updatesType=${(updates as any)?.constructor?.name || typeof updates}`,
      );
      return this.importEntityFromInviteUpdates(
        client,
        updates,
        previewTitle,
        inviteLink,
        true,
      );
    } catch (error) {
      this.logger.error(
        `Telegram invite import failed: invite=${maskedInvite} previewTitle=${previewTitle}`,
        JSON.stringify(this.errorSummary(error)),
      );
      const code = this.inviteErrorCode(error);
      if (code === 'USER_ALREADY_PARTICIPANT') {
        return this.resolveInviteParticipantConflict(
          client,
          inviteLink,
          previewTitle,
        );
      }
      this.mapInviteError(error);
    }
  }

  private async resolveTitleInfo(
    client: TelegramClient,
    titleQuery: string,
  ) {
    const candidates = await this.titleCandidates(client, titleQuery);
    const resolved = resolveTelegramTitleCandidates(titleQuery, candidates);
    if (!resolved.resolved) {
      throw new BadRequestException(
        this.suggestionsMessage(titleQuery, resolved.suggestions),
      );
    }
    return this.describeEntity(client, resolved.resolved.entity, titleQuery, {
      matchedBy:
        resolved.resolved.score === MatchScore.EXACT_USERNAME
          ? 'exact-username'
          : 'exact-title',
    });
  }

  private async getSelfUserWithDetails(
    client: TelegramClient,
    fallback?: Api.User,
  ) {
    try {
      const full = await client.invoke(
        new Api.users.GetFullUser({ id: new Api.InputUserSelf() }),
      );
      const users = ((full as any)?.users || []) as any[];
      const meId = fallback ? String((fallback as any).id) : null;
      const exact = meId ? users.find((u) => String(u?.id) === meId) : null;
      const candidate = (exact || users[0] || fallback) as Api.User | undefined;
      return candidate || fallback || null;
    } catch {
      return fallback || null;
    }
  }

  async startLogin(apiId: string, apiHash: string, phone: string) {
    const client = await this.createClient({ apiId, apiHash });
    try {
      const sent = await client.sendCode(
        { apiId: Number(apiId), apiHash },
        phone,
      );
      return {
        phoneCodeHash: sent.phoneCodeHash,
        isCodeViaApp: sent.isCodeViaApp,
        tempSession: this.saveSession(client),
      };
    } finally {
      await this.closeClient(client);
    }
  }

  async signInWithCode(params: {
    apiId: string;
    apiHash: string;
    phone: string;
    phoneCodeHash: string;
    code: string;
    tempSession?: string;
  }) {
    const client = await this.createClient({
      apiId: params.apiId,
      apiHash: params.apiHash,
      session: params.tempSession,
    });
    try {
      try {
        const result = await client.invoke(
          new Api.auth.SignIn({
            phoneNumber: params.phone,
            phoneCodeHash: params.phoneCodeHash,
            phoneCode: params.code,
          }),
        );

        if (result instanceof Api.auth.AuthorizationSignUpRequired) {
          throw new Error(
            'This phone requires sign up and is not supported in this flow yet.',
          );
        }
        const authUser = result.user as Api.User;
        const user =
          (await this.getSelfUserWithDetails(client, authUser)) || authUser;
        return {
          session: this.saveSession(client),
          me: {
            id: String(user.id),
            username: user.username || null,
            firstName: user.firstName || null,
            lastName: user.lastName || null,
            photoUrl: user.username
              ? `https://t.me/i/userpic/320/${user.username}.jpg`
              : null,
            nameColor: this.extractNameColor(user),
          },
          needsPassword: false,
          tempSession: this.saveSession(client),
        };
      } catch (error: any) {
        if (error?.errorMessage === 'SESSION_PASSWORD_NEEDED') {
          return {
            session: '',
            me: null,
            needsPassword: true,
            tempSession: this.saveSession(client),
          };
        }
        throw error;
      }
    } finally {
      await this.closeClient(client);
    }
  }

  async signInWithPassword(params: {
    apiId: string;
    apiHash: string;
    password: string;
    tempSession?: string;
  }) {
    const client = await this.createClient({
      apiId: params.apiId,
      apiHash: params.apiHash,
      session: params.tempSession,
    });
    try {
      const authUser = (await client.signInWithPassword(
        { apiId: Number(params.apiId), apiHash: params.apiHash },
        {
          password: async () => params.password,
          onError: (err) => {
            throw err;
          },
        },
      )) as Api.User;
      const user =
        (await this.getSelfUserWithDetails(client, authUser)) || authUser;

      return {
        session: this.saveSession(client),
        me: {
          id: String(user.id),
          username: user.username || null,
          firstName: user.firstName || null,
          lastName: user.lastName || null,
          photoUrl: user.username
            ? `https://t.me/i/userpic/320/${user.username}.jpg`
            : null,
          nameColor: this.extractNameColor(user),
        },
      };
    } finally {
      await this.closeClient(client);
    }
  }

  async getMe(params: { apiId: string; apiHash: string; session: string }) {
    const client = await this.createClient(params);
    try {
      const meRaw = await client.getMe();
      const me = (await this.getSelfUserWithDetails(client, meRaw)) || meRaw;
      let photoUrl: string | null = null;
      if (me.username) {
        photoUrl = `https://t.me/i/userpic/320/${me.username}.jpg`;
      }
      return {
        id: String(me.id),
        username: me.username || null,
        firstName: me.firstName || null,
        lastName: me.lastName || null,
        photoUrl,
        nameColor: this.extractNameColor(me),
      };
    } finally {
      await this.closeClient(client);
    }
  }

  async getAdminChannels(params: {
    apiId: string;
    apiHash: string;
    session: string;
  }) {
    const client = await this.createClient(params);
    try {
      const dialogs = await client.getDialogs({ limit: 200 });
      return dialogs
        .filter((d: any) => {
          if (!d?.isChannel) return false;
          const entity = d.entity;
          return !!(entity?.creator || entity?.adminRights);
        })
        .map((d: any) => ({
          id: String(d.id),
          title: d.title || 'Untitled',
          username: d.entity?.username || null,
          isCreator: !!d.entity?.creator,
          adminRights: this.toJsonSafe(d.entity?.adminRights) as Record<
            string,
            unknown
          > | null,
        }));
    } finally {
      await this.closeClient(client);
    }
  }

  async getPublicChannelInfo(params: {
    apiId: string;
    apiHash: string;
    session: string;
    channelRef?: string;
    channel?: StoredTelegramChannelReference;
    inviteHash?: string;
  }) {
    const startedAt = this.now();
    this.logger.log(
      `Starting Telegram public channel lookup: ref=${params.channelRef || params.channel?.telegramChatId || params.channel?.username || 'n/a'} invite=${this.maskInviteHash(params.inviteHash)}`,
    );
    const client = await this.createClient(params);
    try {
      if (params.inviteHash) {
        const resolved = await this.resolveInviteLinkInfo(
          client,
          params.channelRef || params.channel?.inviteLink || 'Telegram channel',
          params.inviteHash,
        );
        this.logger.log(
          `Telegram invite-based lookup finished in ${this.elapsed(startedAt)}: ref=${params.channelRef || params.channel?.telegramChatId || 'n/a'} chatId=${resolved.telegramChatId || 'n/a'}`,
        );
        return resolved;
      }

      if (params.channel) {
        const resolved = await this.resolveStoredChannel(client, params.channel);
        this.logger.log(
          `Telegram stored-channel lookup finished in ${this.elapsed(startedAt)}: chatId=${resolved.channel.telegramChatId || 'n/a'} via=${resolved.channel.resolvedBy}`,
        );
        return resolved.channel;
      }

      const entityStartedAt = this.now();
      const entity = await this.withTimeout(
        client.getEntity(params.channelRef as string),
        this.telegramResolveTimeoutMs,
        'Telegram entity lookup',
      );
      this.logger.log(
        `Telegram entity lookup completed in ${this.elapsed(entityStartedAt)}: ref=${params.channelRef} type=${entity?.constructor?.name || 'unknown'}`,
      );
      if (!this.isImportableTelegramEntity(entity)) {
        throw new BadRequestException(
          `Cannot find any entity corresponding to "${params.channelRef}"`,
        );
      }
      const described = await this.describeEntity(
        client,
        entity,
        params.channelRef || 'Telegram channel',
      );
      this.logger.log(
        `Telegram public channel lookup finished in ${this.elapsed(startedAt)}: ref=${params.channelRef} chatId=${described.telegramChatId || 'n/a'}`,
      );
      return described;
    } finally {
      await this.closeClient(client);
    }
  }

  async findAccessibleChannelInfoByTitle(params: {
    apiId: string;
    apiHash: string;
    session: string;
    titleQuery: string;
  }) {
    const client = await this.createClient(params);
    try {
      return this.resolveTitleInfo(client, params.titleQuery);
    } finally {
      await this.closeClient(client);
    }
  }

  async getChannelHistorical(params: {
    apiId: string;
    apiHash: string;
    session: string;
    channelRef?: string;
    channel?: StoredTelegramChannelReference;
    postLimit?: number;
    onInviteLinksProgress?: InviteLinksProgressCallback;
    onInviteLinkLoaded?: InviteLinkLoadedCallback;
  }) {
    const client = await this.createClient(params);
    try {
      const resolved = params.channel
        ? await this.resolveStoredChannel(client, params.channel)
        : null;
      const entity = resolved
        ? resolved.entity
        : await client.getEntity(params.channelRef as string);
      const limit = Math.max(
        1,
        Math.min(this.maxPostBackfillLimit, params.postLimit || 100),
      );
      const posts = await client.getMessages(entity, { limit });
      const dailyMap = new Map<
        string,
        {
          date: string;
          viewsCount: number;
          reactionsCount: number;
          forwardsCount: number;
        }
      >();
      for (const post of posts as any[]) {
        if (!post?.date) continue;
        const day = new Date(post.date);
        const date = new Date(day.getFullYear(), day.getMonth(), day.getDate())
          .toISOString()
          .slice(0, 10);
        const existing = dailyMap.get(date) || {
          date,
          viewsCount: 0,
          reactionsCount: 0,
          forwardsCount: 0,
        };
        const reactionsCount = Array.isArray(post.reactions?.results)
          ? post.reactions.results.reduce(
              (sum: number, row: any) => sum + Number(row?.count || 0),
              0,
            )
          : 0;
        existing.viewsCount += Number(post.views || 0);
        existing.forwardsCount += Number(post.forwards || 0);
        existing.reactionsCount += reactionsCount;
        dailyMap.set(date, existing);
      }

      const inviteLinksResult = await this.getAllChannelInviteLinksInternal(
        client,
        this.asImportableTelegramEntity(entity, 'channel'),
        params.onInviteLinksProgress,
        params.onInviteLinkLoaded,
      );
      const inviteLinks = inviteLinksResult.links.map((inv) => ({
        url: inv.url,
        name: inv.title,
        joinedCount: inv.usage,
        isRevoked: inv.revoked,
      }));

      return {
        channel: resolved?.channel,
        inviteLinks,
        inviteLinksDetailed: inviteLinksResult.links,
        inviteLinkWarnings: inviteLinksResult.warnings,
        inviteLinksScope: inviteLinksResult.scope,
        inviteLinksExpectedTotal: inviteLinksResult.expectedTotalLinks,
        dailyStats: Array.from(dailyMap.values()).sort((a, b) =>
          a.date.localeCompare(b.date),
        ),
      };
    } finally {
      await this.closeClient(client);
    }
  }

  async getBroadcastStats(params: {
    apiId: string;
    apiHash: string;
    session: string;
    channelRef?: string;
    channel?: StoredTelegramChannelReference;
  }) {
    let client: TelegramClient | null = null;
    try {
      client = await this.createClient(params);
      const resolved = params.channel
        ? await this.resolveStoredChannel(client, params.channel)
        : null;
      const entity = resolved
        ? resolved.entity
        : await client.getEntity(params.channelRef as string);
      const warnings: string[] = [];
      const preferredStatsDcId = await this.getBroadcastStatsDc(client, entity);
      const statsResponse = await this.invokeWithStatsDcMigration(
        client,
        () => new Api.stats.GetBroadcastStats({ channel: entity as any }),
        preferredStatsDcId,
      );
      const rawStats = statsResponse.result;
      const statsDcId = statsResponse.dcId;
      if (statsResponse.migrated) {
        warnings.push(
          `Broadcast stats request was retried on Telegram stats DC ${statsDcId}`,
        );
      }
      const rawStatsRecord = rawStats as unknown as Record<string, unknown>;
      const graphs: Partial<Record<BroadcastStatsGraphField, unknown>> = {};
      const availableFields: string[] = [];

      for (const field of this.broadcastStatsGraphFields) {
        const normalizedGraph = await this.normalizeStatsGraph(
          client,
          field.normalized,
          field.raw
            .map((rawField) => rawStatsRecord[rawField])
            .find((graph) => graph != null),
          warnings,
          statsDcId,
        );
        graphs[field.normalized] = normalizedGraph;
        if (normalizedGraph.status === 'available') {
          availableFields.push(field.normalized);
        }
      }
      const graphPeriod = this.extractGraphStatsPeriod(graphs);

      return {
        raw: this.toJsonSafe(rawStats),
        normalized: {
          status: 'available',
          period: graphPeriod || this.toJsonSafe(rawStats.period),
          raw_period: this.toJsonSafe(rawStats.period),
          followers: this.toJsonSafe(rawStats.followers),
          views_per_post: this.toJsonSafe(rawStats.viewsPerPost),
          shares_per_post: this.toJsonSafe(rawStats.sharesPerPost),
          reactions_per_post: this.toJsonSafe(rawStats.reactionsPerPost),
          enabled_notifications: this.toJsonSafe(rawStats.enabledNotifications),
          graphs,
        },
        availableFields,
        warnings,
      };
    } catch (error) {
      const normalizedError = this.normalizeBroadcastStatsError(error);
      return {
        raw: { error: this.toJsonSafe(normalizedError) },
        normalized: normalizedError,
        availableFields: [],
        warnings: normalizedError.warnings,
      };
    } finally {
      if (client) await this.closeClient(client);
    }
  }

  private async getInviteAdminPhotoUrl(
    client: TelegramClient,
    user: Api.User,
  ) {
    return (
      (await this.profilePhotoDataUrl(client, user)) ||
      this.telegramPublicPhotoUrl(normalizeTelegramUsername(user.username))
    );
  }

  private inviteAdminUserId(row: unknown) {
    const record = row as Record<string, unknown> | null;
    const value = record?.adminId ?? record?.userId ?? null;
    if (typeof value === 'bigint') return value.toString();
    if (value == null) return null;
    return String(value);
  }

  private inviteAdminCounts(row: unknown) {
    const record = row as Record<string, unknown> | null;
    return {
      active: Math.max(0, this.toFiniteNumber(record?.invitesCount) ?? 0),
      revoked: Math.max(
        0,
        this.toFiniteNumber(record?.revokedInvitesCount) ?? 0,
      ),
    };
  }

  private logInviteSyncEvent(
    level: 'log' | 'warn' | 'error',
    payload: Record<string, unknown>,
  ) {
    this.logger[level](JSON.stringify(payload));
  }

  private async loadChannelInviteAdminsDirectory(
    client: TelegramClient,
    entity: ImportableTelegramEntity,
    warnings: string[],
  ) {
    const usersById = new Map<string, Api.User>();
    let offset = 0;
    const limit = 200;

    for (let page = 0; page < 10; page += 1) {
      try {
        const response = (await this.withTimeout(
          client.invoke(
            new Api.channels.GetParticipants({
              channel: entity as any,
              filter: new Api.ChannelParticipantsAdmins(),
              offset,
              limit,
              hash: BigInt(0) as any,
            }),
          ),
          this.telegramResolveTimeoutMs,
          'Telegram channel admins request',
        )) as any;
        const users = Array.isArray(response?.users) ? response.users : [];
        for (const user of users) {
          if (user instanceof Api.User) {
            usersById.set(String(user.id), user);
          }
        }
        const participants = Array.isArray(response?.participants)
          ? response.participants
          : [];
        if (!participants.length || participants.length < limit) {
          break;
        }
        offset += participants.length;
      } catch (error) {
        warnings.push(
          `Telegram admin directory lookup failed: ${this.getTelegramErrorCode(error)}`,
        );
        break;
      }
    }

    return usersById;
  }

  private async resolveInviteAdminInputUser(params: {
    client: TelegramClient;
    user: Api.User;
    selfUserId: string | null;
    channelTelegramId?: string | null;
    connectedTelegramUserId?: string | null;
  }) {
    if (
      params.selfUserId &&
      String(params.user.id) === params.selfUserId
    ) {
      return new Api.InputUserSelf();
    }

    const directAccessHash = this.entityAccessHashValue(params.user);
    if (directAccessHash) {
      try {
        const inputUser = new Api.InputUser({
          userId: params.user.id,
          accessHash: directAccessHash as any,
        });
        this.logInviteSyncEvent('log', {
          phase: 'resolve_invite_admin',
          channelTelegramId: params.channelTelegramId ?? null,
          connectedTelegramUserId: params.connectedTelegramUserId ?? null,
          adminId: String(params.user.id),
          strategy: 'direct_access_hash',
          inputUserClass: inputUser.className,
        });
        return inputUser;
      } catch {
        // Fall through to GramJS entity resolution.
      }
    }

    const attemptErrors: Array<{ strategy: string; errorCode: string }> = [];
    const resolutionCandidates: unknown[] = [params.user];
    const username = normalizeTelegramUsername(params.user.username);
    if (username) {
      resolutionCandidates.push(`@${username}`);
    }
    resolutionCandidates.push(
      new Api.PeerUser({
        userId: String(params.user.id) as any,
      }),
    );

    for (const candidate of resolutionCandidates) {
      const strategy =
        typeof candidate === 'string'
          ? 'username'
          : candidate instanceof Api.User
            ? 'user_object'
            : candidate instanceof Api.PeerUser
              ? 'peer_user'
              : 'unknown';
      try {
        const resolved = await this.withTimeout(
          params.client.getInputEntity(candidate as never),
          this.telegramResolveTimeoutMs,
          'Telegram admin entity resolution',
        );
        if (this.isInputUser(resolved)) {
          this.logInviteSyncEvent('log', {
            phase: 'resolve_invite_admin',
            channelTelegramId: params.channelTelegramId ?? null,
            connectedTelegramUserId: params.connectedTelegramUserId ?? null,
            adminId: String(params.user.id),
            strategy,
            inputUserClass: (resolved as { className?: string }).className ?? null,
          });
          return resolved;
        }
      } catch (error) {
        attemptErrors.push({
          strategy,
          errorCode: this.getTelegramErrorCode(error),
        });
      }
    }

    this.logInviteSyncEvent('warn', {
      phase: 'resolve_invite_admin',
      channelTelegramId: params.channelTelegramId ?? null,
      connectedTelegramUserId: params.connectedTelegramUserId ?? null,
      adminId: String(params.user.id),
      errors: attemptErrors,
    });

    throw new BadRequestException(
      `Telegram admin ${String(params.user.id)} could not be resolved as an input user.`,
    );
  }

  private async fetchInviteLinksPage(params: {
    client: TelegramClient;
    peer: ImportableTelegramEntity;
    adminId: Api.TypeInputUser;
    revoked: boolean;
    offsetDate: number;
    offsetLink: string;
  }) {
    return this.withTimeout(
      params.client.invoke(
        new Api.messages.GetExportedChatInvites({
          peer: params.peer as any,
          adminId: params.adminId,
          offsetDate: params.offsetDate,
          offsetLink: params.offsetLink,
          limit: this.inviteLinksPageSize,
          revoked: params.revoked,
        }),
      ),
      this.telegramResolveTimeoutMs,
      'Telegram exported chat invites request',
    );
  }

  private async collectInviteLinksForAdmin(params: {
    client: TelegramClient;
    peer: ImportableTelegramEntity;
    adminId: Api.TypeInputUser;
    adminUser: Api.User;
    knownUsers: Map<string, Api.User>;
    revoked: boolean;
    warnings: string[];
    onInviteLinkLoaded?: (
      link: TelegramInviteLinksResult['links'][number],
    ) => void | Promise<void>;
  }) {
    const links: TelegramInviteLinksResult['links'] = [];
    const seenUrls = new Set<string>();
    let offsetDate = 0;
    let offsetLink = '';
    let previousCursor = '';
    let pagesLoaded = 0;
    const photoUrlCache = new Map<string, string | null>();

    const creatorSnapshot = async (creator: Api.User | null, fallback: Api.User) => {
      const user = creator ?? fallback;
      const userId = String(user.id);
      if (!photoUrlCache.has(userId)) {
        photoUrlCache.set(
          userId,
          await this.getInviteAdminPhotoUrl(params.client, user),
        );
      }
      return {
        telegramCreatorUserId: userId,
        creatorUsername: normalizeTelegramUsername(user.username),
        creatorFirstName: user.firstName || null,
        creatorLastName: user.lastName || null,
        creatorPhotoUrl: photoUrlCache.get(userId) ?? null,
      };
    };

    for (let page = 0; page < this.maxInviteLinkPages; page += 1) {
      const response = (await this.fetchInviteLinksPage({
        client: params.client,
        peer: params.peer,
        adminId: params.adminId,
        revoked: params.revoked,
        offsetDate,
        offsetLink,
      })) as any;
      pagesLoaded += 1;
      const responseUsers = Array.isArray(response?.users) ? response.users : [];
      for (const user of responseUsers) {
        if (user instanceof Api.User) {
          this.rememberKnownUser(
            params.knownUsers,
            user,
            `GetExportedChatInvites:${params.revoked ? 'revoked' : 'active'}`,
          );
        }
      }
      const invites = Array.isArray(response?.invites) ? response.invites : [];
      if (!invites.length) break;

      for (const invite of invites) {
        const resolvedInvite = this.unwrapExportedChatInvite(invite);
        const url = String(resolvedInvite?.link || '').trim();
        if (!url || seenUrls.has(url)) continue;
        seenUrls.add(url);
        const creatorTelegramUserId =
          this.toBigInt(resolvedInvite?.adminId)?.toString() ??
          String(params.adminUser.id);
        const creatorUser =
          params.knownUsers.get(creatorTelegramUserId) ?? params.adminUser;
        const snapshot = await creatorSnapshot(creatorUser, params.adminUser);
        links.push({
          url,
          title:
            typeof resolvedInvite?.title === 'string' &&
            resolvedInvite.title.trim()
              ? resolvedInvite.title
              : null,
          ...snapshot,
          createdAt: this.toTelegramDate(resolvedInvite?.date),
          startDate: this.toTelegramDate(resolvedInvite?.startDate),
          expireDate: this.toTelegramDate(resolvedInvite?.expireDate),
          usageLimit: this.toFiniteNumber(resolvedInvite?.usageLimit),
          usage: this.toFiniteNumber(resolvedInvite?.usage) ?? 0,
          requested: this.toFiniteNumber(resolvedInvite?.requested) ?? 0,
          requestNeeded: Boolean(resolvedInvite?.requestNeeded),
          permanent: Boolean(resolvedInvite?.permanent),
          revoked: Boolean(resolvedInvite?.revoked),
        });
        await params.onInviteLinkLoaded?.(links[links.length - 1]!);
      }

      const lastInvite = invites[invites.length - 1];
      const nextOffsetDate = this.toFiniteNumber(lastInvite?.date) ?? 0;
      const nextOffsetLink = String(lastInvite?.link || '');
      const nextCursor = `${nextOffsetDate}:${nextOffsetLink}`;
      if (!nextOffsetLink || invites.length < this.inviteLinksPageSize) break;
      if (nextCursor === previousCursor) {
        params.warnings.push(
          `Invite-link pagination stopped early for admin ${String(params.adminUser.id)} because Telegram returned the same cursor twice.`,
        );
        break;
      }
      previousCursor = nextCursor;
      offsetDate = nextOffsetDate;
      offsetLink = nextOffsetLink;
    }

    return { links, pagesLoaded };
  }

  private async getAllChannelInviteLinksInternal(
    client: TelegramClient,
    entity: ImportableTelegramEntity,
    onProgress?: InviteLinksProgressCallback,
    onInviteLinkLoaded?: InviteLinkLoadedCallback,
  ): Promise<TelegramInviteLinksResult> {
    const warnings: string[] = [];
    const channelTelegramId = this.entityIdToString(entity) || 'unknown';
    const selfUser = await this.getSelfUserWithDetails(
      client,
      (await this.withTimeout(
        client.getMe(),
        this.telegramResolveTimeoutMs,
        'Telegram self lookup',
      )) as Api.User,
    );
    const connectedTelegramUserId = selfUser ? String(selfUser.id) : null;
    await onProgress?.({
      phase: 'discovering_invite_admins',
      message: 'Discovering invite-link creators',
    });
    const adminsResult = (await this.withTimeout(
      client.invoke(new Api.messages.GetAdminsWithInvites({ peer: entity as any })),
      this.telegramResolveTimeoutMs,
      'Telegram admins with invites request',
    )) as any;
    const knownUsers = new Map<string, Api.User>();
    const users = Array.isArray(adminsResult?.users) ? adminsResult.users : [];
    for (const user of users) {
      if (user instanceof Api.User) {
        this.rememberKnownUser(knownUsers, user, 'GetAdminsWithInvites');
      }
    }
    if (selfUser) {
      this.rememberKnownUser(knownUsers, selfUser, 'getMe/GetFullUser');
    }
    const adminDirectoryUsers = await this.loadChannelInviteAdminsDirectory(
      client,
      entity,
      warnings,
    );
    for (const [userId, user] of adminDirectoryUsers.entries()) {
      this.rememberKnownUser(knownUsers, user, 'GetParticipants');
    }

    const adminRows = Array.isArray(adminsResult?.admins)
      ? adminsResult.admins
      : [];
    const expectedTotalLinks = adminRows.reduce((sum: number, row: unknown) => {
      const counts = this.inviteAdminCounts(row);
      return sum + counts.active + counts.revoked;
    }, 0);
    this.logInviteSyncEvent('log', {
      phase: 'discovering_invite_admins',
      channelTelegramId,
      connectedTelegramUserId,
      adminRows: adminRows.length,
      expectedTotalLinks,
    });
    await onProgress?.({
      phase: 'loading_invite_links',
      message:
        expectedTotalLinks > 0
          ? `Loading invite links 0/${expectedTotalLinks}`
          : 'Loading invite links',
      stageCurrent: 0,
      stageTotal: expectedTotalLinks,
    });

    const summaries: InviteAdminSummary[] = [];
    const linksByUrl = new Map<string, TelegramInviteLinksResult['links'][number]>();
    const failedAdminWarningPattern =
      /^Admin .+ invite-link sync failed: /;
    const fallbackAdminUser =
      selfUser ?? knownUsers.values().next().value ?? null;
    let failedAdmins = 0;
    let attemptedAdmins = 0;
    let loadedLinksCount = 0;

    for (const row of adminRows) {
      const adminUserId = this.inviteAdminUserId(row);
      const counts = this.inviteAdminCounts(row);
      const shouldFetch = counts.active > 0 || counts.revoked > 0;
      const adminUser = adminUserId ? knownUsers.get(adminUserId) ?? null : null;

      if (adminUser) {
        summaries.push({
          telegramUserId: adminUserId!,
          username: normalizeTelegramUsername(adminUser.username),
          firstName: adminUser.firstName || null,
          lastName: adminUser.lastName || null,
          photoUrl: await this.getInviteAdminPhotoUrl(client, adminUser),
          activeLinksCount: counts.active,
          revokedLinksCount: counts.revoked,
        });
      }

      if (!shouldFetch) continue;
      attemptedAdmins += 1;
      if (!adminUserId || !adminUser) {
        failedAdmins += 1;
        warnings.push(
          `Admin ${adminUserId || 'unknown'} could not be resolved from Telegram users payload.`,
        );
        continue;
      }

      try {
        this.logInviteSyncEvent('log', {
          phase: 'loading_invite_links',
          channelTelegramId,
          connectedTelegramUserId,
          adminId: adminUserId,
          username: normalizeTelegramUsername(adminUser.username),
          userClass: adminUser.className,
          min: Boolean(adminUser.min),
          bot: Boolean(adminUser.bot),
          deleted: Boolean(adminUser.deleted),
          self: Boolean(adminUser.self),
          hasAccessHash: Boolean(this.entityAccessHashValue(adminUser)),
          accessHashType: typeof (adminUser as { accessHash?: unknown }).accessHash,
          accessHashCtor:
            ((adminUser as { accessHash?: { constructor?: { name?: string } } })
              .accessHash?.constructor?.name as string | undefined) ?? null,
          expectedActiveLinks: counts.active,
          expectedRevokedLinks: counts.revoked,
        });
        const inputUser = await this.resolveInviteAdminInputUser({
          client,
          user: adminUser,
          selfUserId: connectedTelegramUserId,
          channelTelegramId,
          connectedTelegramUserId,
        });
        this.logInviteSyncEvent('log', {
          phase: 'loading_invite_links',
          channelTelegramId,
          connectedTelegramUserId,
          adminId: adminUserId,
          resolutionStrategy:
            inputUser instanceof Api.InputUserSelf
              ? 'self'
              : inputUser instanceof Api.InputUser
                ? 'direct_input_user'
                : ((inputUser as { className?: string }).className ?? 'unknown'),
          inputUserClass:
            (inputUser as { className?: string }).className ?? null,
        });
        const [activeLinks, revokedLinks] = await Promise.all([
          this.collectInviteLinksForAdmin({
            client,
            peer: entity,
            adminId: inputUser,
            adminUser,
            knownUsers,
            revoked: false,
            warnings,
            onInviteLinkLoaded: async (link) => {
              loadedLinksCount += 1;
              await onProgress?.({
                phase: 'loading_invite_links',
                message: `Loading invite links ${loadedLinksCount}/${expectedTotalLinks}`,
                stageCurrent: loadedLinksCount,
                stageTotal: expectedTotalLinks,
              });
              await onInviteLinkLoaded?.(
                link,
                loadedLinksCount,
                expectedTotalLinks,
                warnings,
              );
            },
          }),
          this.collectInviteLinksForAdmin({
            client,
            peer: entity,
            adminId: inputUser,
            adminUser,
            knownUsers,
            revoked: true,
            warnings,
            onInviteLinkLoaded: async (link) => {
              loadedLinksCount += 1;
              await onProgress?.({
                phase: 'loading_invite_links',
                message: `Loading invite links ${loadedLinksCount}/${expectedTotalLinks}`,
                stageCurrent: loadedLinksCount,
                stageTotal: expectedTotalLinks,
              });
              await onInviteLinkLoaded?.(
                link,
                loadedLinksCount,
                expectedTotalLinks,
                warnings,
              );
            },
          }),
        ]);
        for (const link of [...activeLinks.links, ...revokedLinks.links]) {
          linksByUrl.set(link.url, link);
        }
        this.logInviteSyncEvent('log', {
          phase: 'loading_invite_links',
          channelTelegramId,
          connectedTelegramUserId,
          adminId: adminUserId,
          activePagesLoaded: activeLinks.pagesLoaded,
          revokedPagesLoaded: revokedLinks.pagesLoaded,
          activeLinksLoaded: activeLinks.links.length,
          revokedLinksLoaded: revokedLinks.links.length,
          loadedLinks: activeLinks.links.length + revokedLinks.links.length,
          totalUniqueLinks: linksByUrl.size,
        });
      } catch (error) {
        failedAdmins += 1;
        const errorCode = this.getTelegramErrorCode(error);
        warnings.push(
          `Admin ${adminUserId} invite-link sync failed: ${errorCode}`,
        );
        this.logInviteSyncEvent('warn', {
          phase: 'loading_invite_links',
          channelTelegramId,
          connectedTelegramUserId,
          adminId: adminUserId,
          errorCode,
        });
      }
    }

    const shouldTryGlobalFallback =
      expectedTotalLinks > linksByUrl.size &&
      (failedAdmins > 0 || linksByUrl.size === 0) &&
      fallbackAdminUser;
    if (shouldTryGlobalFallback) {
      this.logInviteSyncEvent('warn', {
        phase: 'loading_invite_links',
        channelTelegramId,
        connectedTelegramUserId,
        reason: 'global_input_user_empty_fallback',
        loadedLinksCount,
        expectedTotalLinks,
        failedAdmins,
      });
      try {
        const [activeLinks, revokedLinks] = await Promise.all([
          this.collectInviteLinksForAdmin({
            client,
            peer: entity,
            adminId: new Api.InputUserEmpty(),
            adminUser: fallbackAdminUser,
            knownUsers,
            revoked: false,
            warnings,
            onInviteLinkLoaded: async (link) => {
              if (linksByUrl.has(link.url)) return;
              loadedLinksCount += 1;
              await onProgress?.({
                phase: 'loading_invite_links',
                message: `Loading invite links ${Math.min(loadedLinksCount, expectedTotalLinks)}/${expectedTotalLinks}`,
                stageCurrent: Math.min(loadedLinksCount, expectedTotalLinks),
                stageTotal: expectedTotalLinks,
              });
              await onInviteLinkLoaded?.(
                link,
                Math.min(loadedLinksCount, expectedTotalLinks),
                expectedTotalLinks,
                warnings,
              );
            },
          }),
          this.collectInviteLinksForAdmin({
            client,
            peer: entity,
            adminId: new Api.InputUserEmpty(),
            adminUser: fallbackAdminUser,
            knownUsers,
            revoked: true,
            warnings,
            onInviteLinkLoaded: async (link) => {
              if (linksByUrl.has(link.url)) return;
              loadedLinksCount += 1;
              await onProgress?.({
                phase: 'loading_invite_links',
                message: `Loading invite links ${Math.min(loadedLinksCount, expectedTotalLinks)}/${expectedTotalLinks}`,
                stageCurrent: Math.min(loadedLinksCount, expectedTotalLinks),
                stageTotal: expectedTotalLinks,
              });
              await onInviteLinkLoaded?.(
                link,
                Math.min(loadedLinksCount, expectedTotalLinks),
                expectedTotalLinks,
                warnings,
              );
            },
          }),
        ]);
        for (const link of [...activeLinks.links, ...revokedLinks.links]) {
          linksByUrl.set(link.url, link);
        }
        if (linksByUrl.size >= expectedTotalLinks) {
          failedAdmins = 0;
          for (let index = warnings.length - 1; index >= 0; index -= 1) {
            if (failedAdminWarningPattern.test(warnings[index] || '')) {
              warnings.splice(index, 1);
            }
          }
        }
        this.logInviteSyncEvent('log', {
          phase: 'loading_invite_links',
          channelTelegramId,
          connectedTelegramUserId,
          fallback: 'global_input_user_empty',
          activePagesLoaded: activeLinks.pagesLoaded,
          revokedPagesLoaded: revokedLinks.pagesLoaded,
          loadedLinks: activeLinks.links.length + revokedLinks.links.length,
          totalUniqueLinks: linksByUrl.size,
        });
      } catch (error) {
        const errorCode = this.getTelegramErrorCode(error);
        warnings.push(`Global invite-link fallback failed: ${errorCode}`);
        this.logInviteSyncEvent('warn', {
          phase: 'loading_invite_links',
          channelTelegramId,
          connectedTelegramUserId,
          fallback: 'global_input_user_empty',
          errorCode,
        });
      }
    }

    if (attemptedAdmins > 0 && failedAdmins >= attemptedAdmins) {
      throw new BadRequestException(
        'Telegram invite-link sync failed for every expected administrator.',
      );
    }

    return {
      scope: failedAdmins > 0 ? 'PARTIAL_ADMINS' : 'ALL_ADMINS',
      expectedTotalLinks,
      admins: summaries,
      links: [...linksByUrl.values()],
      warnings,
    };
  }

  async getAllChannelInviteLinks(params: {
    apiId: string;
    apiHash: string;
    session: string;
    channelRef?: string;
    channel?: StoredTelegramChannelReference;
    onProgress?: InviteLinksProgressCallback;
  }) {
    const client = await this.createClient(params);
    try {
      const resolved = params.channel
        ? await this.resolveStoredChannel(client, params.channel)
        : null;
      const entity = resolved
        ? resolved.entity
        : await client.getEntity(params.channelRef as string);
      return this.getAllChannelInviteLinksInternal(
        client,
        this.asImportableTelegramEntity(entity, 'channel'),
        params.onProgress,
      );
    } finally {
      await this.closeClient(client);
    }
  }

  async publishPost(params: {
    apiId: string;
    apiHash: string;
    session: string;
    channelRef?: string;
    channel?: StoredTelegramChannelReference;
    html: string;
    textHtmlParts?: string[];
    captionHtml?: string;
    followupHtmlParts?: string[];
    imageUrls: string[];
    scheduleAt?: Date | null;
  }) {
    const client = await this.createClient(params);
    try {
      const resolved = params.channel
        ? await this.resolveStoredChannel(client, params.channel)
        : null;
      const entity = resolved
        ? resolved.entity
        : await client.getEntity(params.channelRef as string);
      const schedule = params.scheduleAt
        ? Math.floor(params.scheduleAt.getTime() / 1000)
        : undefined;
      const messageIds: string[] = [];
      if (params.imageUrls.length) {
        const caption = this.parseMtprotoHtml(
          params.captionHtml ?? params.html,
        );
        const files = await Promise.all(
          params.imageUrls.map((url, index) =>
            this.downloadPublishImage(url, index),
          ),
        );
        const result = await client.sendFile(entity, {
          file: files.length === 1 ? files[0] : files,
          caption: caption.text,
          formattingEntities: caption.entities,
          parseMode: false,
          scheduleDate: schedule,
        });
        const messages = Array.isArray(result) ? result : [result];
        for (const message of messages) {
          if (message?.id != null) messageIds.push(String(message.id));
        }
        for (const followupHtml of params.followupHtmlParts ?? []) {
          const textMessage = await this.sendTextMessageWithEntities(
            client,
            entity,
            followupHtml,
            schedule,
          );
          if (textMessage?.id != null) messageIds.push(String(textMessage.id));
        }
      } else {
        for (const textHtml of params.textHtmlParts ?? [params.html]) {
          const message = await this.sendTextMessageWithEntities(
            client,
            entity,
            textHtml,
            schedule,
          );
          if (message?.id != null) messageIds.push(String(message.id));
        }
      }
      return messageIds;
    } finally {
      await this.closeClient(client);
    }
  }

  async editPostText(params: {
    apiId: string;
    apiHash: string;
    session: string;
    channelRef?: string;
    channel?: StoredTelegramChannelReference;
    messageIds: string[];
    imageCount: number;
    publishMode: string | null | undefined;
    captionHtml?: string;
    followupHtmlParts?: string[];
    textHtmlParts?: string[];
  }) {
    const client = await this.createClient(params);
    let updatedCount = 0;
    let unchangedCount = 0;
    try {
      const resolved = params.channel
        ? await this.resolveStoredChannel(client, params.channel)
        : null;
      const peerRef = resolved?.entity || params.channelRef;
      const mediaMessageIds = params.messageIds.slice(0, params.imageCount);
      const followupMessageIds = params.messageIds.slice(params.imageCount);

      if (params.imageCount > 0) {
        const captionUpdated = await this.editMessageWithEntities(
          client,
          peerRef,
          mediaMessageIds[0],
          params.captionHtml ?? '',
        );
        if (captionUpdated) updatedCount += 1;
        else unchangedCount += 1;
        for (let index = 0; index < followupMessageIds.length; index += 1) {
          const messageUpdated = await this.editMessageWithEntities(
            client,
            peerRef,
            followupMessageIds[index],
            params.followupHtmlParts?.[index] ?? '',
          );
          if (messageUpdated) updatedCount += 1;
          else unchangedCount += 1;
        }
        return { updatedCount, unchangedCount };
      }

      for (let index = 0; index < params.messageIds.length; index += 1) {
        const messageUpdated = await this.editMessageWithEntities(
          client,
          peerRef,
          params.messageIds[index],
          params.textHtmlParts?.[index] ?? '',
        );
        if (messageUpdated) updatedCount += 1;
        else unchangedCount += 1;
      }
      return { updatedCount, unchangedCount };
    } finally {
      await this.closeClient(client);
    }
  }

  private async downloadPublishImage(url: string, index: number) {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new Error(`Image ${index + 1} has an invalid URL`);
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error(`Image ${index + 1} must use an HTTP or HTTPS URL`);
    }

    let response: Response;
    try {
      response = await fetch(parsedUrl, {
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new Error(
        `Could not download image ${index + 1} before publishing`,
      );
    }
    if (!response.ok) {
      throw new Error(
        `Could not download image ${index + 1} (HTTP ${response.status})`,
      );
    }

    const contentType = (response.headers.get('content-type') || '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    if (!contentType.startsWith('image/')) {
      throw new Error(`File ${index + 1} is not a valid image`);
    }
    const declaredSize = Number(response.headers.get('content-length') || 0);
    if (declaredSize > this.maxPublishImageBytes) {
      throw new Error(`Image ${index + 1} is larger than 10 MB`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) throw new Error(`Image ${index + 1} is empty`);
    if (buffer.length > this.maxPublishImageBytes) {
      throw new Error(`Image ${index + 1} is larger than 10 MB`);
    }

    const extensionByType: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'image/bmp': 'bmp',
    };
    const extension = extensionByType[contentType] || 'jpg';
    return new CustomFile(
      `telegram-post-${index + 1}.${extension}`,
      buffer.length,
      '',
      buffer,
    );
  }

  async deleteScheduledPost(params: {
    apiId: string;
    apiHash: string;
    session: string;
    channelRef?: string;
    channel?: StoredTelegramChannelReference;
    messageIds: string[];
  }) {
    const client = await this.createClient(params);
    try {
      const resolved = params.channel
        ? await this.resolveStoredChannel(client, params.channel)
        : null;
      const peer =
        resolved?.peer || (await client.getInputEntity(params.channelRef as string));
      await client.invoke(
        new Api.messages.DeleteScheduledMessages({
          peer,
          id: params.messageIds.map(Number).filter(Number.isFinite),
        }),
      );
    } finally {
      await this.closeClient(client);
    }
  }

  async getManagedPostMessages(params: {
    apiId: string;
    apiHash: string;
    session: string;
    channelRef?: string;
    channel?: StoredTelegramChannelReference;
    publishedMessageIds: string[];
    scheduledMessageIds: string[];
  }) {
    const client = await this.createClient(params);
    try {
      const resolved = params.channel
        ? await this.resolveStoredChannel(client, params.channel)
        : null;
      const entity = resolved
        ? resolved.entity
        : await client.getEntity(params.channelRef as string);
      const peer =
        resolved?.peer || (await client.getInputEntity(params.channelRef as string));
      const publishedIds = params.publishedMessageIds
        .map(Number)
        .filter(Number.isFinite);
      const scheduledIds = params.scheduledMessageIds
        .map(Number)
        .filter(Number.isFinite);
      const published = publishedIds.length
        ? await client.getMessages(entity, { ids: publishedIds })
        : [];
      const recentPublished = await client.getMessages(entity, { limit: 200 });
      const scheduledResult = scheduledIds.length
        ? await client.invoke(
            new Api.messages.GetScheduledMessages({
              peer,
              id: scheduledIds,
            }),
          )
        : null;
      const scheduled = Array.isArray((scheduledResult as any)?.messages)
        ? (scheduledResult as any).messages
        : [];
      const serialize = (message: any, isScheduled: boolean) => ({
        id: String(message.id),
        text: String(message.message || ''),
        html: HTMLParser.unparse(
          String(message.message || ''),
          message.entities || [],
        ),
        date: this.toTelegramDate(message.date)?.toISOString() ?? null,
        isScheduled,
        hasMedia: Boolean(message.media),
        mediaKind: message.media?.className
          ? String(message.media.className)
          : null,
        groupedId: message.groupedId != null ? String(message.groupedId) : null,
      });
      return {
        published: (published as any[])
          .filter((message) => message?.id && message?.date)
          .map((message) => serialize(message, false)),
        recentPublished: (recentPublished as any[])
          .filter((message) => message?.id && message?.date)
          .map((message) => serialize(message, false)),
        scheduled: (scheduled as any[])
          .filter((message) => message?.id && message?.date)
          .map((message) => serialize(message, true)),
      };
    } finally {
      await this.closeClient(client);
    }
  }

  async getChannelPostsMetrics(params: {
    apiId: string;
    apiHash: string;
    session: string;
    channelRef?: string;
    channel?: StoredTelegramChannelReference;
    postLimit?: number;
    beforeMessageId?: string | number | null;
  }) {
    const client = await this.createClient(params);
    try {
      const resolved = params.channel
        ? await this.resolveStoredChannel(client, params.channel)
        : null;
      const entity = resolved
        ? resolved.entity
        : await client.getEntity(params.channelRef as string);
      const limit = Math.max(
        1,
        Math.min(this.maxPostBackfillLimit, params.postLimit || 100),
      );
      const offsetId =
        this.toFiniteNumber(params.beforeMessageId) != null
          ? Number(this.toFiniteNumber(params.beforeMessageId))
          : 0;
      const messages = await client.getMessages(entity, { limit, offsetId });

      return (messages as any[])
        .filter((message) => message?.id && message?.date)
        .map((message) => {
          const postDate = this.toTelegramDate(message.date);
          if (!postDate) return null;
          const reactionRows = Array.isArray(message?.reactions?.results)
            ? message.reactions.results
            : [];
          const reactions = reactionRows
            .map((row: any) => {
              const count = this.toFiniteNumber(row?.count) ?? 0;
              const rawReaction = row?.reaction;
              const reaction =
                typeof rawReaction === 'string'
                  ? rawReaction
                  : rawReaction?.emoticon ||
                    rawReaction?.emoticonId ||
                    String(rawReaction || '');
              return { reaction, count };
            })
            .filter(
              (row: { reaction: string; count: number }) => !!row.reaction,
            );
          const reactionsCount = reactions.reduce(
            (sum: number, row: { reaction: string; count: number }) =>
              sum + row.count,
            0,
          );

          return {
            telegramMessageId: String(message.id),
            postDate,
            text: message.message || null,
            formattedText: HTMLParser.unparse(
              String(message.message || ''),
              message.entities || [],
            ),
            hasMedia: Boolean(message.media),
            mediaKind: message.media?.className
              ? String(message.media.className)
              : null,
            viewsCount: this.toFiniteNumber(message.views),
            forwardsCount: this.toFiniteNumber(message.forwards),
            reactionsCount,
            commentsCount: this.toFiniteNumber(message?.replies?.replies) ?? 0,
            reactions,
            rawMessage: message,
          };
        })
        .filter((row): row is NonNullable<typeof row> => !!row);
    } finally {
      await this.closeClient(client);
    }
  }

  async downloadChannelMessageMedia(params: {
    apiId: string;
    apiHash: string;
    session: string;
    channelRef?: string;
    channel?: StoredTelegramChannelReference;
    messageId: string;
  }) {
    const client = await this.createClient(params);
    try {
      const resolved = params.channel
        ? await this.resolveStoredChannel(client, params.channel)
        : null;
      const entity = resolved
        ? resolved.entity
        : await client.getEntity(params.channelRef as string);
      const messages = await client.getMessages(entity, {
        ids: [Number(params.messageId)],
      });
      const message = (messages as any[]).find(
        (item) => item?.id && item?.media,
      );
      if (!message) return null;
      const downloaded = await client.downloadMedia(message, {});
      if (!Buffer.isBuffer(downloaded)) return null;
      const className = String(message.media?.className || '');
      const mimeType = String(
        message.media?.document?.mimeType ||
          (className.includes('Photo') ? 'image/jpeg' : 'application/octet-stream'),
      );
      return { buffer: downloaded, mimeType };
    } finally {
      await this.closeClient(client);
    }
  }
}
