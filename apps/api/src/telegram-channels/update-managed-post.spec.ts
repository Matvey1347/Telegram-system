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
      editPostText: jest.fn().mockResolvedValue(undefined),
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
});
