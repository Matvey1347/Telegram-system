/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Jest asymmetric matchers are intentionally untyped */
import {
  TelegramManagedPostRemoteStatus,
  TelegramManagedPostStatus,
} from '@prisma/client';
import { TelegramChannelsService } from './telegram-channels.service';

describe('TelegramChannelsService syncManagedPosts', () => {
  const setup = (post: Record<string, unknown>) => {
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      telegramManagedPost: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([post])
          .mockResolvedValueOnce([]),
        update,
      },
    };
    const mtprotoClient = {
      getManagedPostMessages: jest.fn().mockResolvedValue({
        published: [],
        scheduled: [],
        recentPublished: [],
      }),
    };
    const service = new TelegramChannelsService(
      prisma as never,
      {} as never,
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
    return { service, update };
  };

  it('moves a missing scheduled post back to draft', async () => {
    const { service, update } = setup({
      id: 'scheduled',
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
  });

  it('keeps a missing published post published but marks its link broken', async () => {
    const { service, update } = setup({
      id: 'published',
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
});
