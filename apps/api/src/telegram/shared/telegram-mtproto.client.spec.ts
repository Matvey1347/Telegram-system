import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Api } from 'telegram';
import { TelegramMtprotoClient } from './telegram-mtproto.client';

describe('TelegramMtprotoClient import resolution', () => {
  let client: TelegramMtprotoClient;
  let fakeClient: {
    invoke: jest.Mock;
    getEntity: jest.Mock;
    getDialogs: jest.Mock;
  };

  beforeEach(() => {
    client = new TelegramMtprotoClient();
    fakeClient = {
      invoke: jest.fn(),
      getEntity: jest.fn(),
      getDialogs: jest.fn(),
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
    const entity = new Api.Channel({
      id: BigInt('123456'),
      title: 'Public Channel',
      accessHash: BigInt(1),
      broadcast: true,
      megagroup: false,
      username: 'public_channel',
    });
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
    const entity = new Api.Channel({
      id: BigInt('555'),
      title: 'Joined Channel',
      accessHash: BigInt(1),
      broadcast: true,
      megagroup: false,
    });
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
    const joined = new Api.Channel({
      id: BigInt('777'),
      title: 'Private Channel',
      accessHash: BigInt(1),
      broadcast: true,
      megagroup: false,
    });
    const invite = new Api.ChatInvite({
      title: 'Private Preview',
      broadcast: true,
      channel: true,
      participantsCount: 33,
    });
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
    const entity = new Api.Channel({
      id: BigInt('901'),
      title: 'Смак Життя',
      accessHash: BigInt(1),
      broadcast: true,
      megagroup: false,
    });
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
    const entity = new Api.Channel({
      id: BigInt('902'),
      title: 'Смак Життя',
      accessHash: BigInt(1),
      broadcast: true,
      megagroup: false,
      username: 'smak_zhyttia',
    });
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
    const first = new Api.Channel({
      id: BigInt('903'),
      title: 'Смак Життя',
      accessHash: BigInt(1),
      broadcast: true,
      megagroup: false,
    });
    const second = new Api.Channel({
      id: BigInt('904'),
      title: 'Смак Життя',
      accessHash: BigInt(2),
      broadcast: true,
      megagroup: false,
    });
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

  it('returns suggestions for fuzzy title matches without auto-importing', async () => {
    const fuzzy = new Api.Channel({
      id: BigInt('905'),
      title: 'Смак життя та бізнес',
      accessHash: BigInt(1),
      broadcast: true,
      megagroup: false,
      username: 'smak_biz',
    });
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
});
