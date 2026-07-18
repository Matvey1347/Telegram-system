import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Api } from 'telegram';
import { returnBigInt } from 'telegram/Helpers';
import { TelegramMtprotoClient } from './telegram-mtproto.client';

describe('TelegramMtprotoClient import resolution', () => {
  let client: TelegramMtprotoClient;
  let fakeClient: {
    invoke: jest.Mock;
    getEntity: jest.Mock;
    getDialogs: jest.Mock;
    getInputEntity: jest.Mock;
    getMessages: jest.Mock;
    getMe: jest.Mock;
  };

  beforeEach(() => {
    client = new TelegramMtprotoClient();
    fakeClient = {
      invoke: jest.fn(),
      getEntity: jest.fn(),
      getDialogs: jest.fn(),
      getInputEntity: jest.fn(),
      getMessages: jest.fn().mockResolvedValue([]),
      getMe: jest.fn(),
    };
    jest
      .spyOn(client as never, 'createClient' as never)
      .mockResolvedValue(fakeClient as never);
    jest
      .spyOn(client as never, 'closeClient' as never)
      .mockResolvedValue(undefined as never);
    jest
      .spyOn(client as never, 'profilePhotoDataUrl' as never)
      .mockResolvedValue(null as never);
  });

  it('resolves a public username to a real entity', async () => {
    const entity = new Api.Channel(({
      id: '123456' as any,
      title: 'Public Channel',
      accessHash: '1' as any,
      broadcast: true,
      megagroup: false,
      username: 'public_channel',
    } as unknown) as any);
    fakeClient.getEntity.mockResolvedValue(entity);
    fakeClient.invoke.mockImplementation((request: unknown) => {
      if (request instanceof Api.channels.GetFullChannel) {
        return { fullChat: { about: 'About', participantsCount: 10 } };
      }
      throw new Error('Unexpected invoke');
    });

    const result = await client.getPublicChannelInfo({
      apiId: '1',
      apiHash: 'hash',
      session: 'session',
      channelRef: '@public_channel',
    });

    expect(result).toMatchObject({
      kind: 'channel',
      telegramChatId: '123456',
      title: 'Public Channel',
      username: 'public_channel',
      description: 'About',
      participantsCount: 10,
    });
  });

  it('handles ChatInviteAlready without importing again', async () => {
    const entity = new Api.Channel(({
      id: '555' as any,
      title: 'Joined Channel',
      accessHash: '1' as any,
      broadcast: true,
      megagroup: false,
    } as unknown) as any);
    const invite = new Api.ChatInviteAlready({ chat: entity });
    fakeClient.getEntity.mockResolvedValue(entity);
    fakeClient.invoke.mockImplementation((request: unknown) => {
      if (request instanceof Api.messages.CheckChatInvite) return invite;
      if (request instanceof Api.channels.GetFullChannel) {
        return { fullChat: { about: 'Invite about', participantsCount: 42 } };
      }
      if (request instanceof Api.messages.ImportChatInvite) {
        throw new Error('ImportChatInvite should not be called');
      }
      throw new Error('Unexpected invoke');
    });

    const result = await client.getPublicChannelInfo({
      apiId: '1',
      apiHash: 'hash',
      session: 'session',
      channelRef: 'https://t.me/+abc123',
      inviteHash: 'abc123',
    });

    expect(result).toMatchObject({
      kind: 'channel',
      telegramChatId: '555',
      title: 'Joined Channel',
      inviteLink: 'https://t.me/+abc123',
      joinedByInvite: false,
    });
  });

  it('imports a private invite preview and uses the real joined entity', async () => {
    const joined = new Api.Channel(({
      id: '777' as any,
      title: 'Private Channel',
      accessHash: '1' as any,
      broadcast: true,
      megagroup: false,
    } as unknown) as any);
    const invite = new Api.ChatInvite(({
      title: 'Private Preview',
      broadcast: true,
      channel: true,
      participantsCount: 33,
    } as unknown) as any);
    const updates = new Api.Updates({
      updates: [],
      users: [],
      chats: [joined],
      date: 1,
      seq: 1,
    });
    fakeClient.invoke.mockImplementation((request: unknown) => {
      if (request instanceof Api.messages.CheckChatInvite) return invite;
      if (request instanceof Api.messages.ImportChatInvite) return updates;
      if (request instanceof Api.channels.GetFullChannel) {
        return { fullChat: { about: 'Joined after invite', participantsCount: 99 } };
      }
      throw new Error('Unexpected invoke');
    });

    const result = await client.getPublicChannelInfo({
      apiId: '1',
      apiHash: 'hash',
      session: 'session',
      channelRef: 'https://t.me/+invite_hash',
      inviteHash: 'invite_hash',
    });

    expect(result).toMatchObject({
      kind: 'channel',
      telegramChatId: '777',
      title: 'Private Channel',
      inviteLink: 'https://t.me/+invite_hash',
      joinedByInvite: true,
      participantsCount: 99,
    });
  });

  it('maps invalid invite hash to a user-facing error', async () => {
    fakeClient.invoke.mockImplementation((request: unknown) => {
      if (request instanceof Api.messages.CheckChatInvite) {
        const error = new Error('INVITE_HASH_INVALID');
        (error as Error & { errorMessage?: string }).errorMessage =
          'INVITE_HASH_INVALID';
        throw error;
      }
      throw new Error('Unexpected invoke');
    });

    await expect(
      client.getPublicChannelInfo({
        apiId: '1',
        apiHash: 'hash',
        session: 'session',
        channelRef: 'https://t.me/+broken',
        inviteHash: 'broken',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('resolves a unique exact title from dialogs', async () => {
    const entity = new Api.Channel(({
      id: '901' as any,
      title: 'Смак Життя',
      accessHash: '1' as any,
      broadcast: true,
      megagroup: false,
    } as unknown) as any);
    fakeClient.getDialogs.mockResolvedValue([{ title: 'Смак Життя', entity }]);
    fakeClient.invoke.mockImplementation((request: unknown) => {
      if (request instanceof Api.contacts.Search) {
        return { chats: [], users: [] };
      }
      if (request instanceof Api.channels.GetFullChannel) {
        return { fullChat: { about: 'Dialog exact', participantsCount: 17 } };
      }
      throw new Error('Unexpected invoke');
    });

    const result = await client.findAccessibleChannelInfoByTitle({
      apiId: '1',
      apiHash: 'hash',
      session: 'session',
      titleQuery: 'Смак Життя',
    });

    expect(result.telegramChatId).toBe('901');
    expect(result.title).toBe('Смак Життя');
  });

  it('resolves a unique exact title from public search', async () => {
    const entity = new Api.Channel(({
      id: '902' as any,
      title: 'Смак Життя',
      accessHash: '1' as any,
      broadcast: true,
      megagroup: false,
      username: 'smak_zhyttia',
    } as unknown) as any);
    fakeClient.getDialogs.mockResolvedValue([]);
    fakeClient.invoke.mockImplementation((request: unknown) => {
      if (request instanceof Api.contacts.Search) {
        return { chats: [entity], users: [] };
      }
      if (request instanceof Api.channels.GetFullChannel) {
        return { fullChat: { about: 'Search exact', participantsCount: 21 } };
      }
      throw new Error('Unexpected invoke');
    });

    const result = await client.findAccessibleChannelInfoByTitle({
      apiId: '1',
      apiHash: 'hash',
      session: 'session',
      titleQuery: 'Смак Життя',
    });

    expect(result.telegramChatId).toBe('902');
    expect(result.username).toBe('smak_zhyttia');
  });

  it('throws an ambiguity error on several exact title matches', async () => {
    const first = new Api.Channel(({
      id: '903' as any,
      title: 'Смак Життя',
      accessHash: '1' as any,
      broadcast: true,
      megagroup: false,
    } as unknown) as any);
    const second = new Api.Channel(({
      id: '904' as any,
      title: 'Смак Життя',
      accessHash: '2' as any,
      broadcast: true,
      megagroup: false,
    } as unknown) as any);
    fakeClient.getDialogs.mockResolvedValue([{ entity: first }, { entity: second }]);
    fakeClient.invoke.mockImplementation((request: unknown) => {
      if (request instanceof Api.contacts.Search) {
        return { chats: [], users: [] };
      }
      throw new Error('Unexpected invoke');
    });

    await expect(
      client.findAccessibleChannelInfoByTitle({
        apiId: '1',
        apiHash: 'hash',
        session: 'session',
        titleQuery: 'Смак Життя',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('resolves a private channel by dialog id when the stored username is stale', async () => {
    const entity = new Api.Channel(({
      id: '9901' as any,
      title: 'Private after rename',
      accessHash: '445566' as any,
      broadcast: true,
      megagroup: false,
      username: undefined,
    } as unknown) as any);
    fakeClient.getDialogs.mockResolvedValue([
      { id: '9901' as any, title: 'Private after rename', entity },
    ]);
    fakeClient.getEntity.mockImplementation(async (ref: unknown) => {
      if (ref === '@old_public_name') {
        const error = new Error('USERNAME_NOT_OCCUPIED');
        (error as Error & { errorMessage?: string }).errorMessage =
          'USERNAME_NOT_OCCUPIED';
        throw error;
      }
      if (ref instanceof Api.InputPeerChannel) {
        return entity;
      }
      throw new Error(`Unexpected getEntity ref: ${String(ref)}`);
    });
    fakeClient.getInputEntity.mockResolvedValue(
      new Api.InputPeerChannel({
        channelId: '9901' as any,
        accessHash: '445566' as any,
      }),
    );
    fakeClient.invoke.mockImplementation((request: unknown) => {
      if (request instanceof Api.channels.GetFullChannel) {
        return { fullChat: { about: 'Still accessible', participantsCount: 19 } };
      }
      if (request instanceof Api.messages.GetAdminsWithInvites) {
        return { admins: [], users: [] };
      }
      throw new Error('Unexpected invoke');
    });

    const result = await client.getChannelHistorical({
      apiId: '1',
      apiHash: 'hash',
      session: 'session',
      channel: {
        username: 'old_public_name',
        telegramChatId: '9901',
        telegramAccessHash: '445566',
        inviteLink: null,
      },
      postLimit: 1,
    });

    expect(fakeClient.getDialogs).toHaveBeenCalled();
    expect(result.channel?.username).toBeNull();
    expect(result.channel?.telegramChatId).toBe('9901');
    expect(result.channel?.resolvedBy).toBe('dialog-id');
  });

  it('does not resolve USER_ALREADY_PARTICIPANT invite conflicts by title guessing', async () => {
    const invite = new Api.ChatInvite(({
      title: 'Duplicate title',
      broadcast: true,
      channel: true,
      participantsCount: 11,
    } as unknown) as any);
    fakeClient.invoke.mockImplementation((request: unknown) => {
      if (request instanceof Api.messages.CheckChatInvite) return invite;
      if (request instanceof Api.messages.ImportChatInvite) {
        const error = new Error('USER_ALREADY_PARTICIPANT');
        (error as Error & { errorMessage?: string }).errorMessage =
          'USER_ALREADY_PARTICIPANT';
        throw error;
      }
      throw new Error('Unexpected invoke');
    });
    fakeClient.getDialogs.mockResolvedValue([]);

    await expect(
      client.getPublicChannelInfo({
        apiId: '1',
        apiHash: 'hash',
        session: 'session',
        channelRef: 'https://t.me/+duplicate_hash',
        inviteHash: 'duplicate_hash',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns suggestions for fuzzy title matches without auto-importing', async () => {
    const fuzzy = new Api.Channel(({
      id: '905' as any,
      title: 'Смак життя та бізнес',
      accessHash: '1' as any,
      broadcast: true,
      megagroup: false,
      username: 'smak_biz',
    } as unknown) as any);
    fakeClient.getDialogs.mockResolvedValue([{ entity: fuzzy }]);
    fakeClient.invoke.mockImplementation((request: unknown) => {
      if (request instanceof Api.contacts.Search) {
        return { chats: [], users: [] };
      }
      throw new Error('Unexpected invoke');
    });

    await expect(
      client.findAccessibleChannelInfoByTitle({
        apiId: '1',
        apiHash: 'hash',
        session: 'session',
        titleQuery: 'Смак',
      }),
    ).rejects.toThrow(/Possible matches: Смак життя та бізнес \(@smak_biz\)/);
  });

  it('explains that inaccessible private channels require an invite link', async () => {
    fakeClient.getDialogs.mockResolvedValue([]);
    fakeClient.invoke.mockImplementation((request: unknown) => {
      if (request instanceof Api.contacts.Search) {
        return { chats: [], users: [] };
      }
      throw new Error('Unexpected invoke');
    });

    await expect(
      client.findAccessibleChannelInfoByTitle({
        apiId: '1',
        apiHash: 'hash',
        session: 'session',
        titleQuery: 'Смак Життя',
      }),
    ).rejects.toThrow(
      /Private channels that are not accessible to the connected Telegram account require an invite link\./,
    );
  });

  it('loads invite links for self and another admin via GetAdminsWithInvites', async () => {
    const channel = new Api.Channel(({
      id: '7001' as any,
      title: 'Invite Channel',
      accessHash: '9001' as any,
      broadcast: true,
      megagroup: false,
      username: 'invite_channel',
    } as unknown) as any);
    const selfUser = new Api.User(({
      id: '100' as any,
      accessHash: '1000' as any,
      firstName: 'Owner',
      username: 'owner_admin',
    } as unknown) as any);
    const otherAdmin = new Api.User(({
      id: '200' as any,
      firstName: 'Sasha',
      username: 'sasha_admin',
    } as unknown) as any);
    const progress: string[] = [];

    fakeClient.getEntity.mockResolvedValue(channel);
    fakeClient.getMe.mockResolvedValue(selfUser);
    fakeClient.getInputEntity.mockResolvedValue(
      new Api.InputUser({
        userId: '200' as any,
        accessHash: '2000' as any,
      }),
    );
    fakeClient.invoke.mockImplementation((request: unknown) => {
      if (request instanceof Api.users.GetFullUser) {
        return { users: [selfUser] };
      }
      if (request instanceof Api.messages.GetAdminsWithInvites) {
        return {
          admins: [
            { adminId: '100', invitesCount: 11, revokedInvitesCount: 0 },
            { adminId: '200', invitesCount: 13, revokedInvitesCount: 0 },
          ],
          users: [selfUser, otherAdmin],
        };
      }
      if (request instanceof Api.messages.GetExportedChatInvites) {
        const adminId =
          request.adminId instanceof Api.InputUserSelf
            ? '100'
            : String((request.adminId as any).userId);
        const offsetLink = String((request as any).offsetLink || '');
        if (adminId === '100') {
          return {
            invites:
              offsetLink === ''
                ? Array.from({ length: 11 }, (_, index) => ({
                    link: `https://t.me/+owner_${index + 1}`,
                    date: index + 1,
                    adminId: '100',
                    usage: index,
                    requested: 0,
                    revoked: false,
                  }))
                : [],
            users: [selfUser],
          };
        }
        return {
          invites:
            offsetLink === ''
              ? Array.from({ length: 13 }, (_, index) => ({
                  link: `https://t.me/+sasha_${index + 1}`,
                  date: index + 1,
                  adminId: '200',
                  usage: index + 10,
                  requested: index === 0 ? 2 : 0,
                  revoked: false,
                }))
              : [],
          users: [otherAdmin],
        };
      }
      throw new Error(`Unexpected invoke: ${String((request as any)?.className || request)}`);
    });

    const result = await client.getAllChannelInviteLinks({
      apiId: '1',
      apiHash: 'hash',
      session: 'session',
      channelRef: '@invite_channel',
      onProgress: (item) => {
        progress.push(
          `${item.phase}:${item.stageCurrent ?? 'x'}/${item.stageTotal ?? 'x'}`,
        );
      },
    });

    expect(result.scope).toBe('ALL_ADMINS');
    expect(result.expectedTotalLinks).toBe(24);
    expect(result.links).toHaveLength(24);
    expect(
      fakeClient.invoke.mock.calls.filter(
        ([request]) => request instanceof Api.messages.GetExportedChatInvites,
      ),
    ).toHaveLength(4);
    expect(result.links.find((link) => link.url.endsWith('sasha_1'))).toMatchObject({
      telegramCreatorUserId: '200',
      creatorUsername: 'sasha_admin',
      requested: 2,
    });
    expect(progress).toContain('discovering_invite_admins:x/x');
    expect(progress).toContain('loading_invite_links:0/24');
    expect(progress).toContain('loading_invite_links:24/24');
  });

  it('falls back to channel admin directory when invite admins payload lacks resolvable access data', async () => {
    const channel = new Api.Channel(({
      id: '7003' as any,
      title: 'Invite Channel',
      accessHash: '9003' as any,
      broadcast: true,
      megagroup: false,
      username: 'invite_channel_3',
    } as unknown) as any);
    const selfUser = new Api.User(({
      id: '100' as any,
      accessHash: '1000' as any,
      firstName: 'Owner',
      username: 'owner_admin',
    } as unknown) as any);
    const incompleteAdmin = new Api.User(({
      id: '200' as any,
      firstName: 'Sasha',
      username: 'sasha_admin',
    } as unknown) as any);
    const adminFromDirectory = new Api.User(({
      id: '200' as any,
      accessHash: '2000' as any,
      firstName: 'Sasha',
      username: 'sasha_admin',
    } as unknown) as any);

    fakeClient.getEntity.mockResolvedValue(channel);
    fakeClient.getMe.mockResolvedValue(selfUser);
    fakeClient.getInputEntity.mockImplementation(async (candidate: unknown) => {
      if (
        (candidate instanceof Api.User && String(candidate.id) === '200') ||
        candidate === '@sasha_admin' ||
        candidate instanceof Api.PeerUser
      ) {
        const error = new Error('ADMIN_ID_INVALID');
        (error as Error & { errorMessage?: string }).errorMessage =
          'ADMIN_ID_INVALID';
        throw error;
      }
      return new Api.InputUser({
        userId: '100' as any,
        accessHash: '1000' as any,
      });
    });
    fakeClient.invoke.mockImplementation((request: unknown) => {
      if (request instanceof Api.users.GetFullUser) {
        return { users: [selfUser] };
      }
      if (request instanceof Api.messages.GetAdminsWithInvites) {
        return {
          admins: [
            { adminId: '100', invitesCount: 1, revokedInvitesCount: 0 },
            { adminId: '200', invitesCount: 1, revokedInvitesCount: 0 },
          ],
          users: [selfUser, incompleteAdmin],
        };
      }
      if (request instanceof Api.channels.GetParticipants) {
        return {
          participants: [
            new Api.ChannelParticipantCreator({
              userId: '100' as any,
              adminRights: new Api.ChatAdminRights({}),
            }),
            new Api.ChannelParticipantAdmin({
              userId: '200' as any,
              promotedBy: '100' as any,
              date: 1,
              adminRights: new Api.ChatAdminRights({}),
            }),
          ],
          users: [selfUser, adminFromDirectory],
        };
      }
      if (request instanceof Api.messages.GetExportedChatInvites) {
        const adminId =
          request.adminId instanceof Api.InputUserSelf
            ? '100'
            : String((request.adminId as any).userId);
        if (adminId === '100') {
          return {
            invites: [
              {
                link: 'https://t.me/+owner_full',
                date: 1,
                adminId: '100',
                usage: 1,
                requested: 0,
                revoked: false,
              },
            ],
            users: [selfUser],
          };
        }
        return {
          invites: [
            {
              link: 'https://t.me/+sasha_full',
              date: 2,
              adminId: '200',
              usage: 2,
              requested: 1,
              revoked: false,
            },
          ],
          users: [adminFromDirectory],
        };
      }
      throw new Error('Unexpected invoke');
    });

    const result = await client.getAllChannelInviteLinks({
      apiId: '1',
      apiHash: 'hash',
      session: 'session',
      channelRef: '@invite_channel_3',
    });

    expect(result.scope).toBe('ALL_ADMINS');
    expect(result.links).toHaveLength(2);
    expect(result.links.find((link) => link.url.endsWith('sasha_full'))).toMatchObject({
      telegramCreatorUserId: '200',
      creatorUsername: 'sasha_admin',
      requested: 1,
    });
    expect(result.warnings).toEqual([]);
  });

  it('builds InputUser directly from a GramJS Integer accessHash without getInputEntity fallback', async () => {
    const adminUser = new Api.User(({
      id: returnBigInt('821695725') as any,
      accessHash: returnBigInt('9876543210987654321') as any,
      firstName: 'Sasha',
      username: 'sasha_admin',
    } as unknown) as any);

    const inputUser = await (client as any).resolveInviteAdminInputUser({
      client: fakeClient,
      user: adminUser,
      selfUserId: '100',
    });

    expect(inputUser).toBeInstanceOf(Api.InputUser);
    expect(inputUser.userId?.constructor?.name).toBe('Integer');
    expect(inputUser.accessHash?.constructor?.name).toBe('Integer');
    expect(fakeClient.getInputEntity).not.toHaveBeenCalled();
  });

  it('keeps the fuller admin user when GetParticipants returns a min snapshot without access hash', async () => {
    const channel = new Api.Channel(({
      id: '7004' as any,
      title: 'Invite Channel',
      accessHash: '9004' as any,
      broadcast: true,
      megagroup: false,
      username: 'invite_channel_4',
    } as unknown) as any);
    const selfUser = new Api.User(({
      id: '100' as any,
      accessHash: '1000' as any,
      firstName: 'Owner',
      username: 'owner_admin',
      self: true,
    } as unknown) as any);
    const adminFromInvites = new Api.User(({
      id: returnBigInt('821695725') as any,
      accessHash: returnBigInt('9876543210987654321') as any,
      firstName: 'Sasha',
      username: 'sasha_admin',
    } as unknown) as any);
    const minAdminFromDirectory = new Api.User(({
      id: returnBigInt('821695725') as any,
      min: true,
      firstName: 'Sasha',
      username: 'sasha_admin',
    } as unknown) as any);

    fakeClient.getEntity.mockResolvedValue(channel);
    fakeClient.getMe.mockResolvedValue(selfUser);
    fakeClient.invoke.mockImplementation((request: unknown) => {
      if (request instanceof Api.users.GetFullUser) {
        return { users: [selfUser] };
      }
      if (request instanceof Api.messages.GetAdminsWithInvites) {
        return {
          admins: [{ adminId: '821695725', invitesCount: 1, revokedInvitesCount: 0 }],
          users: [adminFromInvites],
        };
      }
      if (request instanceof Api.channels.GetParticipants) {
        return {
          participants: [
            new Api.ChannelParticipantAdmin({
              userId: '821695725' as any,
              promotedBy: '100' as any,
              date: 1,
              adminRights: new Api.ChatAdminRights({}),
            }),
          ],
          users: [minAdminFromDirectory],
        };
      }
      if (request instanceof Api.messages.GetExportedChatInvites) {
        expect(request.adminId).toBeInstanceOf(Api.InputUser);
        expect((request.adminId as Api.InputUser).accessHash?.constructor?.name).toBe(
          'Integer',
        );
        return {
          invites: [
            {
              link: 'https://t.me/+sasha_integer',
              date: 1,
              adminId: '821695725',
              usage: 5,
              requested: 0,
              revoked: false,
            },
          ],
          users: [adminFromInvites],
        };
      }
      throw new Error('Unexpected invoke');
    });

    const result = await client.getAllChannelInviteLinks({
      apiId: '1',
      apiHash: 'hash',
      session: 'session',
      channelRef: '@invite_channel_4',
    });

    expect(result.scope).toBe('ALL_ADMINS');
    expect(result.links).toEqual([
      expect.objectContaining({
        url: 'https://t.me/+sasha_integer',
        telegramCreatorUserId: '821695725',
        creatorUsername: 'sasha_admin',
      }),
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('falls back to loading invite links across all admins when a specific admin cannot be resolved', async () => {
    const channel = new Api.Channel(({
      id: '7002' as any,
      title: 'Invite Channel',
      accessHash: '9002' as any,
      broadcast: true,
      megagroup: false,
      username: 'invite_channel_2',
    } as unknown) as any);
    const selfUser = new Api.User(({
      id: '100' as any,
      accessHash: '1000' as any,
      firstName: 'Owner',
      username: 'owner_admin',
    } as unknown) as any);
    const otherAdmin = new Api.User(({
      id: '200' as any,
      firstName: 'Sasha',
      username: 'sasha_admin',
    } as unknown) as any);

    fakeClient.getEntity.mockResolvedValue(channel);
    fakeClient.getMe.mockResolvedValue(selfUser);
    fakeClient.getInputEntity.mockImplementation(async (candidate: unknown) => {
      if (
        (candidate instanceof Api.User && String(candidate.id) === '200') ||
        candidate === '@sasha_admin' ||
        candidate instanceof Api.PeerUser
      ) {
        const error = new Error('ADMIN_ID_INVALID');
        (error as Error & { errorMessage?: string }).errorMessage =
          'ADMIN_ID_INVALID';
        throw error;
      }
      return new Api.InputUser({
        userId: '100' as any,
        accessHash: '1000' as any,
      });
    });
    fakeClient.invoke.mockImplementation((request: unknown) => {
      if (request instanceof Api.users.GetFullUser) {
        return { users: [selfUser] };
      }
      if (request instanceof Api.messages.GetAdminsWithInvites) {
        return {
          admins: [
            { adminId: '100', invitesCount: 2, revokedInvitesCount: 0 },
            { adminId: '200', invitesCount: 1, revokedInvitesCount: 0 },
          ],
          users: [selfUser, otherAdmin],
        };
      }
      if (request instanceof Api.channels.GetParticipants) {
        return {
          participants: [],
          users: [selfUser, otherAdmin],
        };
      }
      if (request instanceof Api.messages.GetExportedChatInvites) {
        if (request.adminId instanceof Api.InputUserEmpty) {
          return {
            invites: [
              {
                link: 'https://t.me/+owner_partial',
                date: 1,
                adminId: '100',
                usage: 3,
                requested: 0,
                revoked: false,
              },
              {
                link: 'https://t.me/+owner_partial_2',
                date: 2,
                adminId: '100',
                usage: 4,
                requested: 0,
                revoked: false,
              },
              {
                link: 'https://t.me/+sasha_global',
                date: 3,
                adminId: '200',
                usage: 7,
                requested: 1,
                revoked: false,
              },
            ],
            users: [selfUser, otherAdmin],
          };
        }
        return {
          invites: [
            {
              link: 'https://t.me/+owner_partial',
              date: 1,
              adminId: '100',
              usage: 3,
              requested: 0,
              revoked: false,
            },
            {
              link: 'https://t.me/+owner_partial_2',
              date: 2,
              adminId: '100',
              usage: 4,
              requested: 0,
              revoked: false,
            },
          ],
          users: [selfUser],
        };
      }
      throw new Error('Unexpected invoke');
    });

    const result = await client.getAllChannelInviteLinks({
      apiId: '1',
      apiHash: 'hash',
      session: 'session',
      channelRef: '@invite_channel_2',
    });

    expect(result.scope).toBe('ALL_ADMINS');
    expect(result.expectedTotalLinks).toBe(3);
    expect(result.links).toHaveLength(3);
    expect(result.links.find((link) => link.url.endsWith('sasha_global'))).toMatchObject({
      telegramCreatorUserId: '200',
      creatorUsername: 'sasha_admin',
      requested: 1,
    });
    expect(result.warnings).toEqual([]);
  });
});
