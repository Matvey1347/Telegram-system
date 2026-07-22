import {
  TelegramManagedPostRemoteStatus,
  TelegramManagedPostStatus,
  TelegramSourceType,
} from '@prisma/client';
import { TelegramChannelsService } from './telegram-channels.service';

describe('TelegramChannelsService updateManagedPost', () => {
  it('recovers telegram message ids from the saved URL and reuses an editable source', async () => {
    const post = {
      id: 'post-1',
      workspaceId: 'workspace',
      telegramChannelId: 'channel',
      title: 'Pinned',
      text: 'Old text',
      imageUrls: [],
      status: TelegramManagedPostStatus.PUBLISHED,
      scheduledAt: null,
      publishedAt: new Date('2026-07-10T10:00:00Z'),
      telegramMessageIds: [],
      telegramMessageUrls: ['https://t.me/c/3976683330/34'],
      telegramRemoteStatus: TelegramManagedPostRemoteStatus.PUBLISHED,
      sourceId: null,
      sourceType: null,
      publishMode: 'TEXT_ONLY',
      lastError: 'Telegram post link is broken.',
      lastTelegramSyncedAt: null,
      lastTelegramSyncNote: null,
      assignedMemberId: 'member-1',
      icon: null,
      groupId: null,
      groupPosition: null,
      sidebarPosition: null,
      updatedAt: new Date('2026-07-18T10:00:00Z'),
      createdAt: new Date('2026-07-10T10:00:00Z'),
    };

    const update = jest.fn().mockResolvedValue({});
    const createRevision = jest.fn().mockResolvedValue({});
    const prisma = {
      telegramManagedPost: {
        findFirst: jest.fn().mockResolvedValue(post),
        update,
      },
      telegramChannel: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'channel',
          workspaceId: 'workspace',
          username: 'example',
          telegramChatId: '-1003976683330',
          inviteLink: null,
        }),
      },
      telegramManagedPostRevision: {
        create: createRevision,
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ exists: '"TelegramManagedPostRevision"' }]),
      $transaction: jest.fn().mockImplementation(async (callback) => callback(prisma)),
    };
    const mtprotoClient = {
      editPostText: jest.fn().mockResolvedValue({
        updatedCount: 1,
        unchangedCount: 0,
      }),
    };
    const sourceAccessService = {
      sourcesForChannel: jest.fn().mockResolvedValue([
        {
          sourceId: 'mtproto-1',
          sourceType: TelegramSourceType.MTPROTO,
          permissions: { canEditMessages: true },
        },
      ]),
    };
    const service = new TelegramChannelsService(
      prisma as never,
      {
        resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace'),
        resolveAssignedMemberId: jest.fn().mockResolvedValue({
          assignedMemberId: 'member-1',
        }),
      } as never,
      { clearByPrefix: jest.fn() } as never,
      {} as never,
      mtprotoClient as never,
      sourceAccessService as never,
      {} as never,
    );
    service['connectedAccount'] = jest.fn().mockResolvedValue({
      id: 'mtproto-1',
    });
    service['accountCredentials'] = jest.fn().mockReturnValue({
      apiId: '1',
      apiHash: 'hash',
      session: 'session',
    });
    service['createManagedPostRevision'] = createRevision;
    service['resolveInternalPostLinksForPublish'] = jest
      .fn()
      .mockResolvedValue('Updated text');
    service['renderManagedPostText'] = jest.fn().mockReturnValue({
      html: 'Updated text',
      captionHtml: 'Updated text',
      followupHtmlParts: [],
      textHtmlParts: ['Updated text'],
      publishMode: 'TEXT_ONLY',
    });

    await service.updateManagedPost('user', 'channel', 'post-1', {
      title: 'Pinned',
      text: 'Updated text',
      assignedMemberId: 'member-1',
    });

    expect(mtprotoClient.editPostText).toHaveBeenCalledWith(
      expect.objectContaining({
        messageIds: ['34'],
      }),
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceId: 'mtproto-1',
          sourceType: TelegramSourceType.MTPROTO,
          telegramMessageIds: ['34'],
        }),
      }),
    );
  });

  it('treats Telegram MESSAGE_NOT_MODIFIED as a successful no-op update', async () => {
    const post = {
      id: 'post-2',
      workspaceId: 'workspace',
      telegramChannelId: 'channel',
      title: 'Tech post',
      text: 'Old text',
      imageUrls: ['https://example.com/image.png'],
      status: TelegramManagedPostStatus.PUBLISHED,
      scheduledAt: null,
      publishedAt: new Date('2026-07-10T10:00:00Z'),
      telegramMessageIds: ['41', '42'],
      telegramMessageUrls: ['https://t.me/c/3976683330/41'],
      telegramRemoteStatus: TelegramManagedPostRemoteStatus.PUBLISHED,
      sourceId: 'mtproto-1',
      sourceType: TelegramSourceType.MTPROTO,
      publishMode: 'IMAGES_THEN_TEXT',
      lastError: null,
      lastTelegramSyncedAt: null,
      lastTelegramSyncNote: null,
      assignedMemberId: 'member-1',
      icon: null,
      groupId: null,
      groupPosition: null,
      sidebarPosition: null,
      updatedAt: new Date('2026-07-18T10:00:00Z'),
      createdAt: new Date('2026-07-10T10:00:00Z'),
    };

    const update = jest.fn().mockResolvedValue({});
    const createRevision = jest.fn().mockResolvedValue({});
    const prisma = {
      telegramManagedPost: {
        findFirst: jest.fn().mockResolvedValue(post),
        update,
      },
      telegramChannel: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'channel',
          workspaceId: 'workspace',
          username: 'example',
          telegramChatId: '-1003976683330',
          inviteLink: null,
        }),
      },
      telegramManagedPostRevision: {
        create: createRevision,
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ exists: '"TelegramManagedPostRevision"' }]),
      $transaction: jest.fn().mockImplementation(async (callback) => callback(prisma)),
    };
    const mtprotoClient = {
      editPostText: jest.fn().mockResolvedValue({
        updatedCount: 0,
        unchangedCount: 2,
      }),
    };
    const sourceAccessService = {
      sourcesForChannel: jest.fn().mockResolvedValue([
        {
          sourceId: 'mtproto-1',
          sourceType: TelegramSourceType.MTPROTO,
          permissions: { canEditMessages: true },
        },
      ]),
    };
    const service = new TelegramChannelsService(
      prisma as never,
      {
        resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace'),
        resolveAssignedMemberId: jest.fn().mockResolvedValue({
          assignedMemberId: 'member-1',
        }),
      } as never,
      { clearByPrefix: jest.fn() } as never,
      {} as never,
      mtprotoClient as never,
      sourceAccessService as never,
      {} as never,
    );
    service['connectedAccount'] = jest.fn().mockResolvedValue({
      id: 'mtproto-1',
    });
    service['accountCredentials'] = jest.fn().mockReturnValue({
      apiId: '1',
      apiHash: 'hash',
      session: 'session',
    });
    service['createManagedPostRevision'] = createRevision;
    service['resolveInternalPostLinksForPublish'] = jest
      .fn()
      .mockResolvedValue('Unchanged rendered text');
    service['renderManagedPostText'] = jest.fn().mockReturnValue({
      html: 'Unchanged rendered text',
      captionHtml: 'Same caption',
      followupHtmlParts: ['Same followup'],
      textHtmlParts: [],
      publishMode: 'IMAGES_THEN_TEXT',
    });

    await expect(
      service.updateManagedPost('user', 'channel', 'post-2', {
        title: 'Tech post',
        text: 'Unchanged rendered text',
        assignedMemberId: 'member-1',
      }),
    ).resolves.toBeDefined();

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastTelegramSyncNote: 'Telegram text already matched the live post.',
        }),
      }),
    );
  });

  it('removes a manual Telegram link and returns the post to draft', async () => {
    const currentPost = {
      id: 'post-3',
      workspaceId: 'workspace',
      telegramChannelId: 'channel',
      title: 'Broken post',
      text: 'Body',
      imageUrls: ['https://example.com/image.png'],
      status: TelegramManagedPostStatus.PUBLISHED,
      scheduledAt: null,
      publishedAt: new Date('2026-07-10T10:00:00Z'),
      telegramMessageIds: ['55'],
      telegramMessageUrls: ['https://t.me/c/3976683330/55'],
      telegramRemoteStatus: TelegramManagedPostRemoteStatus.BROKEN,
      sourceId: 'mtproto-1',
      sourceType: TelegramSourceType.MTPROTO,
      publishMode: 'IMAGES_THEN_TEXT',
      lastError: 'Telegram post link is broken.',
      lastTelegramSyncedAt: null,
      lastTelegramSyncNote: null,
      assignedMemberId: 'member-1',
      icon: null,
      groupId: null,
      groupPosition: null,
      sidebarPosition: null,
      updatedAt: new Date('2026-07-18T10:00:00Z'),
      createdAt: new Date('2026-07-10T10:00:00Z'),
    };

    const update = jest.fn().mockResolvedValue({
      ...currentPost,
      status: TelegramManagedPostStatus.DRAFT,
      telegramRemoteStatus: TelegramManagedPostRemoteStatus.NONE,
      telegramMessageIds: [],
      telegramMessageUrls: [],
      sourceId: null,
      sourceType: null,
      publishMode: null,
      publishedAt: null,
      scheduledAt: null,
      lastError: null,
      lastTelegramSyncNote:
        'Telegram link was removed manually. Post returned to draft.',
    });
    const createRevision = jest.fn().mockResolvedValue({});
    const prisma = {
      telegramManagedPost: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: 'post-3' })
          .mockResolvedValueOnce({
            id: 'channel',
            workspaceId: 'workspace',
            username: 'example',
            telegramChatId: '-1003976683330',
            inviteLink: null,
          })
          .mockResolvedValueOnce(currentPost),
        update,
      },
      telegramChannel: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'channel',
          workspaceId: 'workspace',
          username: 'example',
          telegramChatId: '-1003976683330',
          inviteLink: null,
        }),
      },
      telegramManagedPostRevision: {
        create: createRevision,
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ exists: '"TelegramManagedPostRevision"' }]),
      $transaction: jest.fn().mockImplementation(async (callback) => callback(prisma)),
    };
    const service = new TelegramChannelsService(
      prisma as never,
      {
        resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace'),
      } as never,
      { clearByPrefix: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    service['createManagedPostRevision'] = createRevision;

    await service.setManagedPostTelegramUrl('user', 'channel', 'post-3', '');

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: TelegramManagedPostStatus.DRAFT,
          telegramRemoteStatus: TelegramManagedPostRemoteStatus.NONE,
          telegramMessageIds: [],
          telegramMessageUrls: [],
          sourceId: null,
          sourceType: null,
          publishMode: null,
          publishedAt: null,
        }),
      }),
    );
  });
});
