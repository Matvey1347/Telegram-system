import { Injectable } from '@nestjs/common';
import { Api, TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';

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
  private readonly defaultTelegramPaletteSize = 7;
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
      { connectionRetries: 3 },
    );
    await client.connect();
    return client;
  }

  private toJsonSafe(value: unknown): unknown {
    if (value == null || typeof value === 'string' || typeof value === 'boolean') {
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

  private async normalizeStatsGraph(
    client: TelegramClient,
    field: BroadcastStatsGraphField,
    graph: unknown,
    warnings: string[],
  ) {
    let resolvedGraph = graph;
    if (resolvedGraph instanceof Api.StatsGraphAsync) {
      const token = resolvedGraph.token;
      try {
        resolvedGraph = await client.invoke(
          new Api.stats.LoadAsyncGraph({ token }),
        );
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

  private telegramPublicPhotoUrl(username: string | null) {
    return username ? `https://t.me/i/userpic/320/${username}.jpg` : null;
  }

  private async profilePhotoDataUrl(client: TelegramClient, entity: unknown) {
    try {
      const photo = await client.downloadProfilePhoto(entity as any, { isBig: true });
      if (!Buffer.isBuffer(photo) || photo.length === 0) return null;
      return `data:image/jpeg;base64,${photo.toString('base64')}`;
    } catch {
      return null;
    }
  }

  private normalizeBroadcastStatsError(error: unknown) {
    const errorCode = this.getTelegramErrorCode(error);
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
    if (
      errorCode.includes('CHAT_ADMIN_REQUIRED') ||
      errorCode.includes('CHANNEL_PRIVATE') ||
      errorCode.includes('RIGHT_FORBIDDEN')
    ) {
      return {
        status: 'no_admin_rights',
        errorCode,
        floodWaitSeconds: null,
        warnings: [`Broadcast stats require channel admin rights: ${errorCode}`],
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
        warnings: [`Broadcast stats are unavailable for this channel: ${errorCode}`],
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

  private async getSelfUserWithDetails(client: TelegramClient, fallback?: Api.User) {
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
      await client.disconnect();
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
          throw new Error('This phone requires sign up and is not supported in this flow yet.');
        }
        const authUser = result.user as Api.User;
        const user = (await this.getSelfUserWithDetails(client, authUser)) || authUser;
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
      await client.disconnect();
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
      const user = (await this.getSelfUserWithDetails(client, authUser)) || authUser;

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
      await client.disconnect();
    }
  }

  async getMe(params: { apiId: string; apiHash: string; session: string }) {
    const client = await this.createClient(params);
    try {
      const meRaw = (await client.getMe()) as Api.User;
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
      await client.disconnect();
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
          const entity = d.entity as any;
          return !!(entity?.creator || entity?.adminRights);
        })
        .map((d: any) => ({
          id: String(d.id),
          title: d.title || 'Untitled',
          username: d.entity?.username || null,
          isCreator: !!d.entity?.creator,
        }));
    } finally {
      await client.disconnect();
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
      await client.disconnect();
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
      const limit = Math.max(1, Math.min(300, params.postLimit || 100));
      const posts = await client.getMessages(entity, { limit });
      const dailyMap = new Map<
        string,
        { date: string; viewsCount: number; reactionsCount: number; forwardsCount: number }
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
      await client.disconnect();
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
      const rawStats = await client.invoke(
        new Api.stats.GetBroadcastStats({ channel: entity }),
      );
      const rawStatsRecord = rawStats as unknown as Record<string, unknown>;
      const warnings: string[] = [];
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
        );
        graphs[field.normalized] = normalizedGraph;
        if (normalizedGraph.status === 'available') {
          availableFields.push(field.normalized);
        }
      }

      return {
        raw: this.toJsonSafe(rawStats),
        normalized: {
          status: 'available',
          period: this.toJsonSafe(rawStats.period),
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
      if (client) await client.disconnect();
    }
  }

  async getChannelPostsMetrics(params: {
    apiId: string;
    apiHash: string;
    session: string;
    channelRef: string;
    postLimit?: number;
  }) {
    const client = await this.createClient(params);
    try {
      const entity = await client.getEntity(params.channelRef);
      const limit = Math.max(1, Math.min(300, params.postLimit || 100));
      const messages = await client.getMessages(entity, { limit });

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
                  : rawReaction?.emoticon || rawReaction?.emoticonId || String(rawReaction || '');
              return { reaction, count };
            })
            .filter((row: { reaction: string; count: number }) => !!row.reaction);
          const reactionsCount = reactions.reduce(
            (sum: number, row: { reaction: string; count: number }) => sum + row.count,
            0,
          );

          return {
            telegramMessageId: String(message.id),
            postDate,
            text: message.message || null,
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
      await client.disconnect();
    }
  }
}
