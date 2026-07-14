import {
  TelegramManagedPostRemoteStatus,
  TelegramManagedPostStatus,
} from '@prisma/client';
import { TelegramChannelsService } from './telegram-channels.service';

describe('TelegramChannelsService managed post history', () => {
  it('restores a revision into draft and keeps a backup of the current state', async () => {
    const currentPost = {
      id: 'post-1',
      workspaceId: 'workspace-1',
      telegramChannelId: 'channel-1',
      title: 'Current title',
      text: 'Current text',
      imageUrls: ['https://example.com/current.png'],
      status: TelegramManagedPostStatus.PUBLISHED,
      scheduledAt: null,
      publishedAt: new Date('2026-07-14T08:00:00.000Z'),
      telegramMessageIds: ['10'],
      telegramMessageUrls: ['https://t.me/example/10'],
      telegramRemoteStatus: TelegramManagedPostRemoteStatus.PUBLISHED,
      lastTelegramSyncedAt: new Date('2026-07-14T08:05:00.000Z'),
      lastTelegramSyncNote: null,
      sourceType: null,
      sourceId: null,
      publishMode: 'IMAGE_WITH_CAPTION',
      lastError: null,
      assignedMemberId: 'member-1',
      icon: 'icon-1',
      groupId: 'group-1',
      groupPosition: 2,
      sidebarPosition: 4,
    };
    const revision = {
      id: 'revision-1',
      telegramManagedPostId: 'post-1',
      workspaceId: 'workspace-1',
      telegramChannelId: 'channel-1',
      title: 'Old title',
      text: 'Old text',
      imageUrls: ['https://example.com/old.png'],
      status: TelegramManagedPostStatus.SCHEDULED,
      scheduledAt: new Date('2026-07-13T09:00:00.000Z'),
      publishedAt: null,
      telegramMessageIds: ['5'],
      telegramMessageUrls: ['https://t.me/example/5'],
      telegramRemoteStatus: TelegramManagedPostRemoteStatus.SCHEDULED,
      lastTelegramSyncedAt: null,
      lastTelegramSyncNote: null,
      sourceType: null,
      sourceId: null,
      publishMode: 'IMAGE_WITH_CAPTION',
      lastError: null,
      assignedMemberId: 'member-2',
      icon: 'icon-2',
      groupId: 'group-2',
      groupPosition: 1,
      sidebarPosition: 3,
      reason: 'before_update',
      createdAt: new Date('2026-07-10T10:00:00.000Z'),
    };
    const createRevision = jest.fn().mockResolvedValue({});
    const deleteOldRevisions = jest.fn().mockResolvedValue({ count: 0 });
    const update = jest.fn().mockResolvedValue({
      ...currentPost,
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
      telegramMessageIds: [],
      telegramMessageUrls: [],
      scheduledAt: null,
      publishedAt: null,
      sourceType: null,
      sourceId: null,
      publishMode: null,
      lastError:
        'This post was restored from backup history and moved to draft. Publish it again, schedule it again, or attach a valid Telegram link manually.',
      lastTelegramSyncNote:
        'Restored from backup created at 2026-07-10T10:00:00.000Z.',
    });
    const prisma = {
      telegramManagedPost: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(currentPost)
          .mockResolvedValueOnce(currentPost),
        update,
      },
      telegramManagedPostRevision: {
        findFirst: jest.fn().mockResolvedValue(revision),
        create: createRevision,
        deleteMany: deleteOldRevisions,
      },
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ exists: '"TelegramManagedPostRevision"' }]),
      $transaction: jest.fn().mockImplementation(async (callback) => callback(prisma)),
    };
    const service = new TelegramChannelsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    service['workspace'] = jest.fn().mockResolvedValue('workspace-1');
    service['findOne'] = jest.fn().mockResolvedValue({ id: 'channel-1' });

    const restored = await service.restoreManagedPostRevision(
      'user',
      'channel-1',
      'post-1',
      'revision-1',
    );

    expect(createRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          telegramManagedPostId: 'post-1',
          title: 'Current title',
          reason: 'before_restore',
        }),
      }),
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Old title',
          text: 'Old text',
          imageUrls: ['https://example.com/old.png'],
          status: TelegramManagedPostStatus.DRAFT,
          telegramRemoteStatus: TelegramManagedPostRemoteStatus.NONE,
          telegramMessageIds: [],
          telegramMessageUrls: [],
        }),
      }),
    );
    expect(restored.status).toBe(TelegramManagedPostStatus.DRAFT);
  });
});
