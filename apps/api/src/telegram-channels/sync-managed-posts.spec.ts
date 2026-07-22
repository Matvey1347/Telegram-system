/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Jest asymmetric matchers are intentionally untyped */
import {
  TelegramManagedPostRemoteStatus,
  TelegramManagedPostStatus,
} from '@prisma/client';
import { TelegramChannelsService } from './telegram-channels.service';

describe('TelegramChannelsService syncManagedPosts', () => {
  const setup = (
    post: Record<string, unknown>,
    remote?: {
      published?: Array<Record<string, unknown>>;
      scheduled?: Array<Record<string, unknown>>;
      recentPublished?: Array<Record<string, unknown>>;
    },
  ) => {
    const update = jest.fn().mockResolvedValue({});
    const createRevision = jest.fn().mockResolvedValue({});
    const deleteOldRevisions = jest.fn().mockResolvedValue({ count: 0 });
    const prisma = {
      telegramManagedPost: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([post])
          .mockResolvedValueOnce([]),
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
      getManagedPostMessages: jest.fn().mockResolvedValue({
        published: remote?.published ?? [],
        scheduled: remote?.scheduled ?? [],
        recentPublished: remote?.recentPublished ?? [],
      }),
    };
    const service = new TelegramChannelsService(
      prisma as never,
      {} as never,
      { clearByPrefix: jest.fn() } as never,
      {} as never,
      mtprotoClient as never,
      {} as never,
      {} as never,
    );
    service['workspace'] = jest.fn().mockResolvedValue('workspace');
    service['findOne'] = jest.fn().mockResolvedValue({
      id: 'channel',
      username: 'example',
      telegramChatId: null,
    });
    service['connectedAccount'] = jest.fn().mockResolvedValue({});
    service['accountCredentials'] = jest.fn().mockReturnValue({
      apiId: '1',
      apiHash: 'hash',
      session: 'session',
    });
    return { service, update, createRevision };
  };

  it('moves a missing scheduled post back to draft', async () => {
    const { service, update, createRevision } = setup({
      id: 'scheduled',
      title: 'Scheduled',
      status: TelegramManagedPostStatus.SCHEDULED,
      text: 'Scheduled',
      imageUrls: [],
      scheduledAt: new Date(),
      publishedAt: null,
      telegramMessageIds: ['10'],
      telegramMessageUrls: [],
    });
    const result = await service.syncManagedPosts('user', 'channel');
    expect(result.movedToDraft).toBe(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: TelegramManagedPostStatus.DRAFT,
          telegramRemoteStatus: TelegramManagedPostRemoteStatus.MISSING,
          telegramMessageIds: [],
        }),
      }),
    );
    expect(createRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          telegramManagedPostId: 'scheduled',
          reason: 'before_sync_missing',
        }),
      }),
    );
  });

  it('keeps a missing published post published but marks its link broken', async () => {
    const { service, update } = setup({
      id: 'published',
      title: 'Published',
      status: TelegramManagedPostStatus.PUBLISHED,
      text: 'Published',
      imageUrls: [],
      scheduledAt: null,
      publishedAt: new Date(),
      telegramMessageIds: ['20'],
      telegramMessageUrls: ['https://t.me/example/20'],
    });
    const result = await service.syncManagedPosts('user', 'channel');
    expect(result.broken).toBe(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          telegramRemoteStatus: TelegramManagedPostRemoteStatus.BROKEN,
        }),
      }),
    );
  });

  it('does not overwrite local text or images during sync', async () => {
    const { service, update } = setup(
      {
        id: 'published',
        title: 'Dealz',
        status: TelegramManagedPostStatus.PUBLISHED,
        text: 'Local managed text',
        imageUrls: ['https://example.com/local-image.png'],
        publishMode: 'IMAGE_WITH_CAPTION',
        scheduledAt: null,
        publishedAt: new Date('2026-07-13T10:00:00Z'),
        telegramMessageIds: ['42'],
        telegramMessageUrls: ['https://t.me/example/42'],
      },
      {
        published: [
          {
            id: '42',
            html: '<b>Remote replacement text</b>',
            date: '2026-07-13T10:00:00.000Z',
            hasMedia: false,
          },
        ],
      },
    );

    await service.syncManagedPosts('user', 'channel');

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          text: expect.anything(),
        }),
      }),
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          imageUrls: expect.anything(),
        }),
      }),
    );
  });

  it('keeps a published post healthy when remote text matches but the internal title is unrelated', async () => {
    const { service, update } = setup(
      {
        id: 'published',
        title: 'Pr 2',
        status: TelegramManagedPostStatus.PUBLISHED,
        text: 'Real Telegram body text',
        imageUrls: [],
        publishMode: 'TEXT_ONLY',
        scheduledAt: null,
        publishedAt: new Date('2026-07-13T10:00:00Z'),
        telegramMessageIds: ['77'],
        telegramMessageUrls: ['https://t.me/c/123456/77'],
      },
      {
        published: [
          {
            id: '77',
            text: 'Real Telegram body text',
            html: 'Real Telegram body text',
            date: '2026-07-13T10:00:00.000Z',
            hasMedia: false,
          },
        ],
        recentPublished: [
          {
            id: '77',
            text: 'Real Telegram body text',
            html: 'Real Telegram body text',
            date: '2026-07-13T10:00:00.000Z',
            hasMedia: false,
          },
        ],
      },
    );

    const result = await service.syncManagedPosts('user', 'channel');

    expect(result.broken).toBe(0);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          telegramRemoteStatus: TelegramManagedPostRemoteStatus.PUBLISHED,
          lastError: null,
        }),
      }),
    );
  });

  it('keeps a published code-block post healthy when visible Telegram text matches even if remote html shape differs', async () => {
    const localText = '```\ncode block\ncode blockёcode block\ncode block\n```';
    const visibleText = 'code block\ncode blockёcode block\ncode block';
    const { service, update } = setup(
      {
        id: 'published',
        title: 'цывуак',
        status: TelegramManagedPostStatus.PUBLISHED,
        text: localText,
        imageUrls: [],
        publishMode: 'TEXT_ONLY',
        scheduledAt: null,
        publishedAt: new Date('2026-07-12T15:04:00Z'),
        telegramMessageIds: ['29'],
        telegramMessageUrls: ['https://t.me/c/3976683330/29'],
      },
      {
        published: [
          {
            id: '29',
            text: visibleText,
            html: '<pre language=\"copy\">code block\ncode blockёcode block\ncode block</pre>',
            date: '2026-07-12T15:04:00.000Z',
            hasMedia: false,
          },
        ],
        recentPublished: [
          {
            id: '29',
            text: visibleText,
            html: '<pre language=\"copy\">code block\ncode blockёcode block\ncode block</pre>',
            date: '2026-07-12T15:04:00.000Z',
            hasMedia: false,
          },
        ],
      },
    );

    const result = await service.syncManagedPosts('user', 'channel');

    expect(result.broken).toBe(0);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          telegramRemoteStatus: TelegramManagedPostRemoteStatus.PUBLISHED,
          lastError: null,
        }),
      }),
    );
  });
});
