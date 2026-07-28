import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import {
  TelegramManagedPostRemoteStatus,
  TelegramManagedPostStatus,
  TelegramSourceType,
} from '@prisma/client';
import { TelegramChannelsService } from './telegram-channels.service';

describe('TelegramChannelsService returnManagedPostToDraft', () => {
  it('cancels the scheduled Telegram post and returns it to draft', async () => {
    const scheduledPost = {
      id: 'post-1',
      workspaceId: 'workspace-1',
      telegramChannelId: 'channel-1',
      title: 'Scheduled post',
      text: 'Body',
      imageUrls: [],
      origin: 'SYSTEM',
      status: TelegramManagedPostStatus.SCHEDULED,
      scheduledAt: new Date('2026-07-29T09:00:00.000Z'),
      publishedAt: null,
      telegramMessageIds: ['101'],
      telegramMessageUrls: ['https://t.me/c/123/101'],
      telegramRemoteStatus: TelegramManagedPostRemoteStatus.SCHEDULED,
      sourceType: TelegramSourceType.MTPROTO,
      sourceId: 'mtproto-1',
      publishMode: 'TEXT_ONLY',
      lastError: null,
      lastTelegramSyncedAt: null,
      lastTelegramSyncNote: null,
      assignedMemberId: 'member-1',
      icon: null,
      groupId: null,
      groupPosition: null,
      sidebarPosition: null,
      telegramChannel: {
        username: 'example',
        telegramChatId: '-100123',
      },
    };
    const createRevision = jest.fn().mockResolvedValue({});
    const deleteOldRevisions = jest.fn().mockResolvedValue({ count: 0 });
    const update = jest.fn().mockResolvedValue({
      ...scheduledPost,
      status: TelegramManagedPostStatus.DRAFT,
      scheduledAt: null,
      telegramRemoteStatus: TelegramManagedPostRemoteStatus.NONE,
      telegramMessageIds: [],
      telegramMessageUrls: [],
      sourceType: null,
      sourceId: null,
      publishMode: null,
      lastTelegramSyncedAt: new Date('2026-07-28T10:00:00.000Z'),
      lastTelegramSyncNote:
        'Scheduled Telegram post was cancelled and returned to draft from the editor.',
    });
    const prisma = {
      telegramManagedPost: {
        findFirst: jest.fn().mockResolvedValue(scheduledPost),
        update,
      },
      telegramManagedPostRevision: {
        create: createRevision,
        deleteMany: deleteOldRevisions,
      },
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ exists: '"TelegramManagedPostRevision"' }]),
      $transaction: jest.fn().mockImplementation(async (callback) => callback(prisma)),
    };
    const mtprotoClient = {
      deleteScheduledPost: jest.fn().mockResolvedValue(undefined),
    };
    const service = new TelegramChannelsService(
      prisma as never,
      {} as never,
      { clearByPrefix: jest.fn() } as never,
      {} as never,
      mtprotoClient as never,
      {} as never,
      {} as never,
      {} as never,
    );
    service['workspace'] = jest.fn().mockResolvedValue('workspace-1');
    service['connectedAccount'] = jest.fn().mockResolvedValue({
      id: 'mtproto-1',
    });
    service['accountCredentials'] = jest.fn().mockReturnValue({
      apiId: '1',
      apiHash: 'hash',
      session: 'session',
    });

    const restored = await service.returnManagedPostToDraft(
      'user-1',
      'channel-1',
      'post-1',
    );

    expect(mtprotoClient.deleteScheduledPost).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: expect.objectContaining({
          username: 'example',
          telegramChatId: '-100123',
        }),
        messageIds: ['101'],
      }),
    );
    expect(createRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          telegramManagedPostId: 'post-1',
          title: 'Scheduled post',
          reason: 'before_return_to_draft',
        }),
      }),
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: TelegramManagedPostStatus.DRAFT,
          telegramRemoteStatus: TelegramManagedPostRemoteStatus.NONE,
          telegramMessageIds: [],
          telegramMessageUrls: [],
          scheduledAt: null,
          publishedAt: null,
          sourceType: null,
          sourceId: null,
        }),
      }),
    );
    expect(restored.status).toBe(TelegramManagedPostStatus.DRAFT);
  });

  it('rejects posts created in Telegram', async () => {
    const prisma = {
      telegramManagedPost: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'post-2',
          workspaceId: 'workspace-1',
          telegramChannelId: 'channel-1',
          origin: 'TELEGRAM',
          status: TelegramManagedPostStatus.SCHEDULED,
          telegramMessageIds: ['201'],
          sourceType: TelegramSourceType.MTPROTO,
          sourceId: 'mtproto-1',
          telegramChannel: {
            username: 'example',
            telegramChatId: '-100123',
          },
        }),
      },
    };
    const service = new TelegramChannelsService(
      prisma as never,
      {} as never,
      { clearByPrefix: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    service['workspace'] = jest.fn().mockResolvedValue('workspace-1');

    await expect(
      service.returnManagedPostToDraft('user-1', 'channel-1', 'post-2'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('fails when the managed post does not exist', async () => {
    const prisma = {
      telegramManagedPost: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new TelegramChannelsService(
      prisma as never,
      {} as never,
      { clearByPrefix: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    service['workspace'] = jest.fn().mockResolvedValue('workspace-1');

    await expect(
      service.returnManagedPostToDraft('user-1', 'channel-1', 'missing-post'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
