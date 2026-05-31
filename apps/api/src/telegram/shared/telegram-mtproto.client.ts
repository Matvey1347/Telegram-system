import { Injectable } from '@nestjs/common';
import { Api, TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';

type ApiCredentials = { apiId: string; apiHash: string };
type SessionParams = ApiCredentials & { session?: string };

@Injectable()
export class TelegramMtprotoClient {
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
        const user = result.user as Api.User;
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
      const user = (await client.signInWithPassword(
        { apiId: Number(params.apiId), apiHash: params.apiHash },
        {
          password: async () => params.password,
          onError: (err) => {
            throw err;
          },
        },
      )) as Api.User;

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
        },
      };
    } finally {
      await client.disconnect();
    }
  }

  async getMe(params: { apiId: string; apiHash: string; session: string }) {
    const client = await this.createClient(params);
    try {
      const me = (await client.getMe()) as Api.User;
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
}
