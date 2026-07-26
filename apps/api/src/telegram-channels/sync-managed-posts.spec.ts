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
      scheduledHistory?: Array<Record<string, unknown>>;
    },
  ) => {
    const update = jest.fn().mockImplementation(async ({ where, data }) => ({
      ...post,
      id: where.id ?? post.id,
      ...data,
      text: data.text ?? post.text ?? null,
      imageUrls: data.imageUrls ?? post.imageUrls ?? [],
      telegramMessageIds:
        data.telegramMessageIds ?? post.telegramMessageIds ?? [],
      telegramMessageUrls:
        data.telegramMessageUrls ?? post.telegramMessageUrls ?? [],
      scheduledAt: data.scheduledAt ?? post.scheduledAt ?? null,
      publishedAt:
        data.publishedAt === undefined ? post.publishedAt ?? null : data.publishedAt,
      remoteImportKey:
        data.remoteImportKey === undefined
          ? post.remoteImportKey ?? null
          : data.remoteImportKey,
      origin: data.origin ?? post.origin ?? 'SYSTEM',
      assignedMemberId:
        data.assignedMemberId ?? post.assignedMemberId ?? 'member-1',
      lastError: data.lastError ?? null,
      updatedAt: new Date(),
    }));
    const create = jest.fn().mockImplementation(async ({ data }) => ({
      id: 'imported',
      title: data.title,
      text: data.text ?? null,
      imageUrls: data.imageUrls ?? [],
      origin: data.origin,
      remoteImportKey: data.remoteImportKey ?? null,
      status: data.status,
      telegramRemoteStatus: data.telegramRemoteStatus,
      scheduledAt: data.scheduledAt ?? null,
      publishedAt: null,
      telegramMessageIds: data.telegramMessageIds ?? [],
      telegramMessageUrls: [],
      sourceType: data.sourceType ?? null,
      sourceId: data.sourceId ?? null,
      publishMode: null,
      lastError: null,
      assignedMemberId: data.assignedMemberId,
      icon: null,
      groupId: null,
      groupPosition: null,
      sidebarPosition: null,
      workspaceId: data.workspaceId,
      telegramChannelId: data.telegramChannelId,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    const createRevision = jest.fn().mockResolvedValue({});
    const deleteOldRevisions = jest.fn().mockResolvedValue({ count: 0 });
    const findMany = jest.fn().mockImplementation(async (args?: { where?: Record<string, unknown> }) => {
      const where = args?.where ?? {};
      if (
        where.status === TelegramManagedPostStatus.PUBLISHED &&
        where.telegramRemoteStatus === TelegramManagedPostRemoteStatus.PUBLISHED
      ) {
        return [];
      }
      return [post];
    });
    const prisma = {
      telegramManagedPost: {
        findMany,
        update,
        create,
      },
      telegramChannel: {
        findFirst: jest.fn().mockResolvedValue({ assignedMemberId: 'member-1' }),
      },
      workspaceMember: {
        findFirst: jest.fn().mockResolvedValue({ id: 'member-1' }),
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
      getScheduledHistory: jest
        .fn()
        .mockResolvedValue(remote?.scheduledHistory ?? []),
      downloadChannelMessageMedia: jest.fn().mockResolvedValue(null),
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
    return { service, update, create, createRevision };
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

  it('imports Telegram scheduled posts even if their ids overlap with published local posts', async () => {
    const { service, create, update } = setup(
      {
        id: 'published',
        title: 'Published',
        origin: 'SYSTEM',
        remoteImportKey: null,
        status: TelegramManagedPostStatus.PUBLISHED,
        telegramRemoteStatus: TelegramManagedPostRemoteStatus.PUBLISHED,
        text: 'Published body',
        imageUrls: [],
        scheduledAt: null,
        publishedAt: new Date('2026-07-12T15:04:00Z'),
        telegramMessageIds: ['29'],
        telegramMessageUrls: ['https://t.me/c/3976683330/29'],
      },
      {
        scheduledHistory: [
          {
            id: '29',
            text: 'Scheduled from Telegram',
            html: 'Scheduled from Telegram',
            date: '2026-07-27T12:09:00.000Z',
            hasMedia: false,
            mediaKind: null,
            groupedId: null,
          },
        ],
      },
    );

    const result = await service.syncManagedPosts('user', 'channel');

    expect(result.importedScheduled).toBe(1);
    expect(result.missing).toBe(0);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          origin: 'TELEGRAM',
          status: TelegramManagedPostStatus.SCHEDULED,
          telegramMessageIds: ['29'],
          title: 'Scheduled from Telegram',
        }),
      }),
    );
    expect(update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: TelegramManagedPostStatus.FAILED,
          telegramRemoteStatus: TelegramManagedPostRemoteStatus.MISSING,
        }),
      }),
    );
  });

  it('imports image previews for scheduled Telegram posts with media', async () => {
    const { service, create } = setup(
      {
        id: 'published',
        title: 'Published',
        origin: 'SYSTEM',
        remoteImportKey: null,
        status: TelegramManagedPostStatus.PUBLISHED,
        telegramRemoteStatus: TelegramManagedPostRemoteStatus.PUBLISHED,
        text: 'Published body',
        imageUrls: [],
        scheduledAt: null,
        publishedAt: new Date('2026-07-12T15:04:00Z'),
        telegramMessageIds: ['29'],
        telegramMessageUrls: ['https://t.me/c/3976683330/29'],
      },
      {
        scheduledHistory: [
          {
            id: '41',
            text: 'Scheduled with image',
            html: 'Scheduled with image',
            date: '2026-07-27T12:09:00.000Z',
            hasMedia: true,
            mediaKind: 'MessageMediaPhoto',
            groupedId: null,
          },
        ],
      },
    );
    service['mtprotoClient'].downloadChannelMessageMedia = jest
      .fn()
      .mockResolvedValue({
        buffer: Buffer.from('image-bytes'),
        mimeType: 'image/jpeg',
      });

    const result = await service.syncManagedPosts('user', 'channel');

    expect(result.importedScheduled).toBe(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          imageUrls: ['data:image/jpeg;base64,aW1hZ2UtYnl0ZXM='],
        }),
      }),
    );
  });

  it('revives previously imported Telegram scheduled posts when they still exist remotely', async () => {
    const { service, update, create } = setup(
      {
        id: 'imported-scheduled',
        title: 'Old title',
        origin: 'TELEGRAM',
        remoteImportKey: 'message:3',
        status: TelegramManagedPostStatus.FAILED,
        telegramRemoteStatus: TelegramManagedPostRemoteStatus.MISSING,
        text: 'Old text',
        imageUrls: [],
        scheduledAt: new Date('2026-07-26T10:09:00.000Z'),
        publishedAt: null,
        telegramMessageIds: ['3'],
        telegramMessageUrls: [],
        lastError: null,
        assignedMemberId: 'member-1',
      },
      {
        scheduledHistory: [
          {
            id: '3',
            text: 'цвуакпецуак',
            html: 'цвуакпецуак',
            date: '2026-07-26T10:09:00.000Z',
            hasMedia: false,
            mediaKind: null,
            groupedId: null,
          },
        ],
      },
    );

    const result = await service.syncManagedPosts('user', 'channel');

    expect(result.importedScheduled).toBe(0);
    expect(result.missing).toBe(0);
    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'imported-scheduled' },
        data: expect.objectContaining({
          title: 'цвуакпецуак',
          status: TelegramManagedPostStatus.SCHEDULED,
          telegramRemoteStatus: TelegramManagedPostRemoteStatus.SCHEDULED,
          telegramMessageIds: ['3'],
          lastError: null,
        }),
      }),
    );
  });

  it('pulls Telegram scheduled posts when loading the calendar', async () => {
    const create = jest.fn().mockImplementation(async ({ data }) => ({
      id: 'imported-calendar',
      title: data.title,
      text: data.text ?? null,
      imageUrls: data.imageUrls ?? [],
      origin: data.origin,
      remoteImportKey: data.remoteImportKey ?? null,
      status: data.status,
      telegramRemoteStatus: data.telegramRemoteStatus,
      scheduledAt: data.scheduledAt ?? null,
      publishedAt: null,
      telegramMessageIds: data.telegramMessageIds ?? [],
      telegramMessageUrls: [],
      sourceType: data.sourceType ?? null,
      sourceId: data.sourceId ?? null,
      publishMode: null,
      lastError: null,
      assignedMemberId: data.assignedMemberId,
      icon: null,
      groupId: null,
      groupPosition: null,
      sidebarPosition: null,
      workspaceId: data.workspaceId,
      telegramChannelId: data.telegramChannelId,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    const prisma = {
      telegramManagedPost: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            {
              id: 'imported-calendar',
              telegramChannelId: 'channel',
              title: 'цвуакпецуак',
              text: 'цвуакпецуак',
              status: TelegramManagedPostStatus.SCHEDULED,
              scheduledAt: new Date('2026-07-26T10:09:00.000Z'),
              publishedAt: null,
              origin: 'TELEGRAM',
              telegramRemoteStatus: TelegramManagedPostRemoteStatus.SCHEDULED,
              telegramMessageUrls: [],
              imageUrls: [],
              group: null,
              assignedMember: {
                id: 'member-1',
                workspaceId: 'workspace',
                user: { name: 'Matthew', email: 'm@example.com' },
                avatarIcon: null,
                role: 'MEMBER',
              },
            },
          ]),
        create,
        count: jest.fn().mockResolvedValue(1),
        findFirst: jest
          .fn()
          .mockResolvedValue({ scheduledAt: new Date('2026-07-26T10:09:00.000Z') }),
      },
      telegramChannel: {
        findFirst: jest.fn().mockResolvedValue({ assignedMemberId: 'member-1' }),
      },
      workspaceMember: {
        findFirst: jest.fn().mockResolvedValue({ id: 'member-1' }),
      },
    };
    const mtprotoClient = {
      getScheduledHistory: jest.fn().mockResolvedValue([
        {
          id: '3',
          text: 'цвуакпецуак',
          html: 'цвуакпецуак',
          date: '2026-07-26T10:09:00.000Z',
          hasMedia: false,
          mediaKind: null,
          groupedId: null,
        },
      ]),
      downloadChannelMessageMedia: jest.fn().mockResolvedValue(null),
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

    const result = await service.managedPostsCalendar('user', 'channel', {
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-31T23:59:59.999Z',
    });

    expect(mtprotoClient.getScheduledHistory).toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          origin: 'TELEGRAM',
          status: TelegramManagedPostStatus.SCHEDULED,
          title: 'цвуакпецуак',
          telegramMessageIds: ['3'],
        }),
      }),
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        id: 'imported-calendar',
        origin: 'TELEGRAM',
        status: 'SCHEDULED',
        title: 'цвуакпецуак',
      }),
    );
  });
});
