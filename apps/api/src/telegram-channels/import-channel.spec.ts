import { BadRequestException } from '@nestjs/common';
import { TelegramChannelsService } from './telegram-channels.service';

describe('TelegramChannelsService importChannel', () => {
  const prisma = {
    $transaction: jest.fn(),
  };
  const workspaceService = {
    resolveWorkspaceIdForUser: jest.fn(),
  };
  const encryptionService = {
    decrypt: jest.fn(),
  };
  const mtprotoClient = {
    getPublicChannelInfo: jest.fn(),
    findAccessibleChannelInfoByTitle: jest.fn(),
  };
  const sourceAccessService = {
    recordDataSource: jest.fn(),
  };
  const analyticsService = {};

  let service: TelegramChannelsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TelegramChannelsService(
      prisma as never,
      workspaceService as never,
      encryptionService as never,
      mtprotoClient as never,
      sourceAccessService as never,
      analyticsService as never,
    );
    workspaceService.resolveWorkspaceIdForUser.mockResolvedValue('ws-1');
    encryptionService.decrypt.mockReturnValue('decrypted');
    jest
      .spyOn(service as never, 'firstConnectedAccount' as never)
      .mockResolvedValue({
        id: 'tg-account-1',
        apiId: '1',
        apiHashEncrypted: 'enc',
        apiHashIv: 'iv',
        apiHashAuthTag: 'tag',
        sessionEncrypted: 'sess',
        sessionIv: 'sessiv',
        sessionAuthTag: 'sesstag',
        label: 'Main',
        username: 'mainuser',
        firstName: 'Main',
      } as never);
    jest
      .spyOn(service as never, 'findMatchingChannels' as never)
      .mockResolvedValue([]);
    jest
      .spyOn(service as never, 'findOne' as never)
      .mockResolvedValue({ id: 'channel-1', title: 'Смак Життя' } as never);
    jest
      .spyOn(service as never, 'runInitialImportBackfill' as never)
      .mockResolvedValue({ success: true } as never);
  });

  it('imports an invite-resolved channel, stores inviteLink and backfill metadata', async () => {
    mtprotoClient.getPublicChannelInfo.mockResolvedValue({
      kind: 'channel',
      telegramChatId: '123456',
      title: 'Смак Життя',
      username: null,
      description: 'About',
      participantsCount: 77,
      photoUrl: 'https://example.com/photo.jpg',
      inviteLink: 'https://t.me/+dtmYmT-l2Mo1Yzgy',
      joinedByInvite: true,
    });
    const tx = {
      telegramChannel: {
        create: jest.fn().mockResolvedValue({ id: 'channel-1' }),
      },
    };
    prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(tx),
    );

    const result = await service.importChannel('user-1', {
      input: 'https://t.me/+dtmYmT-l2Mo1Yzgy',
    });

    expect(mtprotoClient.getPublicChannelInfo).toHaveBeenCalled();
    expect(tx.telegramChannel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          telegramChatId: '123456',
          inviteLink: 'https://t.me/+dtmYmT-l2Mo1Yzgy',
        }),
      }),
    );
    expect(sourceAccessService.recordDataSource).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          source: 'channel_import',
          inputType: 'invite',
          joinedByInvite: true,
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 'channel-1',
        initialSync: { success: true },
      }),
    );
  });

  it('updates an existing canonical channel instead of creating a duplicate', async () => {
    mtprotoClient.findAccessibleChannelInfoByTitle.mockResolvedValue({
      kind: 'channel',
      telegramChatId: '123456',
      title: 'Смак Життя',
      username: 'smak_zhyttia',
      description: 'About',
      participantsCount: 88,
      photoUrl: null,
      joinedByInvite: false,
    });
    jest.spyOn(service as never, 'findMatchingChannels' as never).mockResolvedValue([
      { id: 'channel-1', createdAt: new Date('2026-01-01T00:00:00Z'), adminLinks: [] },
    ] as never);
    const tx = {
      telegramChannel: {
        update: jest.fn().mockResolvedValue({ id: 'channel-1' }),
      },
    };
    prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(tx),
    );

    await service.importChannel('user-1', { input: 'Смак Життя' });

    expect(tx.telegramChannel.update).toHaveBeenCalled();
  });

  it('does not create a channel when resolution has no real telegramChatId', async () => {
    mtprotoClient.getPublicChannelInfo.mockResolvedValue({
      kind: 'channel',
      telegramChatId: '',
      title: 'Preview only',
      username: null,
      description: null,
      participantsCount: null,
      photoUrl: null,
    });

    await expect(
      service.importChannel('user-1', {
        input: 'https://t.me/+preview_only',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
