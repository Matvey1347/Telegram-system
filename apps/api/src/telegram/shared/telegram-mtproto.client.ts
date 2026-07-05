import { Injectable } from '@nestjs/common';
import { Api, TelegramClient } from 'telegram';
import { Logger as GramJsLogger, LogLevel } from 'telegram/extensions/Logger';
import { HTMLParser } from 'telegram/extensions/html';
import { CustomFile } from 'telegram/client/uploads';
import { StringSession } from 'telegram/sessions';
import { telegramHtmlToMtprotoHtml } from './telegram-markup';

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

@Injectable()
export class TelegramMtprotoClient {
  private readonly maxPostBackfillLimit = 10_000;
  private readonly defaultTelegramPaletteSize = 7;
  private readonly maxPublishImageBytes = 10 * 1024 * 1024;
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
    return client;
  }

  private async closeClient(client: TelegramClient) {
    try {
      await client.destroy();
    } catch {
      try {
        await client.disconnect();
      } catch {
        // Best-effort cleanup for short-lived MTProto clients.
      }
    }
  }

  private parseMtprotoHtml(html: string) {
    const [text, entities] = HTMLParser.parse(telegramHtmlToMtprotoHtml(html));
    return { text, entities };
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
      noWebpage: true,
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
      const photo = await client.downloadProfilePhoto(entity as any, {
        isBig: true,
      });
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
    channelRef: string;
  }) {
    const client = await this.createClient(params);
    try {
      const entity = (await client.getEntity(params.channelRef)) as any;
      let fullChannel: any = null;
      try {
        const full = await client.invoke(
          new Api.channels.GetFullChannel({ channel: entity }),
        );
        fullChannel = (full as any)?.fullChat || null;
      } catch {
        fullChannel = null;
      }

      const username = entity?.username
        ? String(entity.username).replace(/^@/, '').toLowerCase()
        : null;
      const firstName = entity?.firstName ? String(entity.firstName) : null;
      const lastName = entity?.lastName ? String(entity.lastName) : null;
      const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
      const participantsCount =
        this.toFiniteNumber(fullChannel?.participantsCount) ??
        this.toFiniteNumber(entity?.participantsCount);
      const photoUrl =
        (await this.profilePhotoDataUrl(client, entity)) ||
        this.telegramPublicPhotoUrl(username);
      return {
        kind: entity instanceof Api.User ? 'person' : 'channel',
        telegramChatId: entity?.id != null ? String(entity.id) : '',
        title: entity?.title || fullName || username || params.channelRef,
        username,
        description: fullChannel?.about || null,
        participantsCount,
        photoUrl,
        raw: {
          entity: this.toJsonSafe({
            id: entity?.id,
            title: entity?.title,
            firstName,
            lastName,
            username: entity?.username,
            participantsCount: entity?.participantsCount,
          }),
          fullChannel: this.toJsonSafe({
            about: fullChannel?.about,
            participantsCount: fullChannel?.participantsCount,
          }),
        },
      };
    } finally {
      await this.closeClient(client);
    }
  }

  async getChannelHistorical(params: {
    apiId: string;
    apiHash: string;
    session: string;
    channelRef: string;
    postLimit?: number;
  }) {
    const client = await this.createClient(params);
    try {
      const entity = await client.getEntity(params.channelRef);
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

      let inviteLinks: Array<{
        url: string;
        name?: string;
        joinedCount?: number;
        isRevoked?: boolean;
      }> = [];
      try {
        const exported = await client.invoke(
          new Api.messages.GetExportedChatInvites({
            peer: entity as any,
            adminId: new Api.InputUserSelf(),
            offsetDate: 0,
            offsetLink: '',
            limit: 100,
            revoked: false,
          }),
        );
        inviteLinks = ((exported as any)?.invites || [])
          .map((inv: any) => ({
            url: String(inv?.link || ''),
            name: inv?.title || null,
            joinedCount: Number(inv?.usage || 0),
            isRevoked: !!inv?.revoked,
          }))
          .filter((x: any) => !!x.url);
      } catch {
        inviteLinks = [];
      }

      return {
        inviteLinks,
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
    channelRef: string;
  }) {
    let client: TelegramClient | null = null;
    try {
      client = await this.createClient(params);
      const entity = await client.getEntity(params.channelRef);
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

  async publishPost(params: {
    apiId: string;
    apiHash: string;
    session: string;
    channelRef: string;
    html: string;
    textHtmlParts?: string[];
    captionHtml?: string;
    followupHtmlParts?: string[];
    imageUrls: string[];
    scheduleAt?: Date | null;
  }) {
    const client = await this.createClient(params);
    try {
      const entity = await client.getEntity(params.channelRef);
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
          file: files,
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
    channelRef: string;
    messageIds: string[];
  }) {
    const client = await this.createClient(params);
    try {
      const peer = await client.getInputEntity(params.channelRef);
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
    channelRef: string;
    publishedMessageIds: string[];
    scheduledMessageIds: string[];
  }) {
    const client = await this.createClient(params);
    try {
      const entity = await client.getEntity(params.channelRef);
      const peer = await client.getInputEntity(params.channelRef);
      const publishedIds = params.publishedMessageIds
        .map(Number)
        .filter(Number.isFinite);
      const scheduledIds = params.scheduledMessageIds
        .map(Number)
        .filter(Number.isFinite);
      const published = publishedIds.length
        ? await client.getMessages(entity, { ids: publishedIds })
        : [];
      const recentPublished = scheduledIds.length
        ? await client.getMessages(entity, { limit: 100 })
        : [];
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
    channelRef: string;
    postLimit?: number;
    beforeMessageId?: string | number | null;
  }) {
    const client = await this.createClient(params);
    try {
      const entity = await client.getEntity(params.channelRef);
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
    channelRef: string;
    messageId: string;
  }) {
    const client = await this.createClient(params);
    try {
      const entity = await client.getEntity(params.channelRef);
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
