import { Injectable } from '@nestjs/common';
import { Api, TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';

type ApiCredentials = { apiId: string; apiHash: string };
type SessionParams = ApiCredentials & { session?: string };

@Injectable()
export class TelegramMtprotoClient {
  private readonly defaultTelegramPaletteSize = 7;

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
