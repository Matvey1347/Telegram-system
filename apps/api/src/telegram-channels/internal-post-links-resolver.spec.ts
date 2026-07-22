import { BadRequestException } from '@nestjs/common';
import { TelegramManagedPostStatus } from '@prisma/client';
import { TelegramChannelsService } from './telegram-channels.service';

describe('TelegramChannelsService internal post link resolver', () => {
  const serviceWithTargets = (targets: unknown[]) => {
    const prisma = {
      telegramManagedPost: {
        findMany: jest.fn().mockResolvedValue(targets),
      },
    };
    const responseCache = {
      clearByPrefix: jest.fn(),
    };
    return new TelegramChannelsService(
      prisma as never,
      {} as never,
      responseCache as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  };

  it('rejects a self-reference', async () => {
    const service = serviceWithTargets([]);
    await expect(
      service['resolveInternalPostLinksForPublish'](
        'workspace',
        'current',
        '[This post](tg-post:current)',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an unresolved target', async () => {
    const service = serviceWithTargets([
      {
        id: 'draft',
        title: 'Draft target',
        status: TelegramManagedPostStatus.DRAFT,
        telegramRemoteStatus: 'NONE',
        lastError: null,
        scheduledAt: null,
        imageUrls: [],
        telegramMessageIds: [],
        telegramMessageUrls: [],
        telegramChannel: { username: 'example', telegramChatId: null },
      },
    ]);
    await expect(
      service['resolveInternalPostLinksForPublish'](
        'workspace',
        'current',
        '[Draft](tg-post:draft)',
      ),
    ).rejects.toThrow('not published');
  });

  it('resolves a public target to a stable private-style Telegram URL', async () => {
    const service = serviceWithTargets([
      {
        id: 'published',
        title: 'Published target',
        status: TelegramManagedPostStatus.PUBLISHED,
        telegramRemoteStatus: 'PUBLISHED',
        lastError: null,
        scheduledAt: null,
        imageUrls: [],
        telegramMessageIds: ['33'],
        telegramMessageUrls: ['https://t.me/test_tg_system/33'],
        telegramChannel: {
          username: 'test_tg_system',
          telegramChatId: '-1003976683330',
        },
      },
    ]);
    await expect(
      service['resolveInternalPostLinksForPublish'](
        'workspace',
        'current',
        '[Published](tg-post:published)',
      ),
    ).resolves.toBe('[Published](https://t.me/c/3976683330/33)');
  });

  it('resolves a private target to the same stable private-style Telegram URL', async () => {
    const service = serviceWithTargets([
      {
        id: 'published',
        title: 'Published target',
        status: TelegramManagedPostStatus.PUBLISHED,
        telegramRemoteStatus: 'PUBLISHED',
        lastError: null,
        scheduledAt: null,
        imageUrls: [],
        telegramMessageIds: ['33'],
        telegramMessageUrls: [],
        telegramChannel: {
          username: null,
          telegramChatId: '-1003976683330',
        },
      },
    ]);
    await expect(
      service['resolveInternalPostLinksForPublish'](
        'workspace',
        'current',
        '[Published](tg-post:published)',
      ),
    ).resolves.toBe('[Published](https://t.me/c/3976683330/33)');
  });

  it('ignores cached public telegramMessageUrls for internal link resolution', async () => {
    const service = serviceWithTargets([
      {
        id: 'published',
        title: 'Published target',
        status: TelegramManagedPostStatus.PUBLISHED,
        telegramRemoteStatus: 'PUBLISHED',
        lastError: null,
        scheduledAt: null,
        imageUrls: [],
        telegramMessageIds: ['33'],
        telegramMessageUrls: ['https://t.me/old_username/33'],
        telegramChannel: {
          username: 'new_test_tg_system',
          telegramChatId: '-1003976683330',
        },
      },
    ]);
    await expect(
      service['resolveInternalPostLinksForPublish'](
        'workspace',
        'current',
        '[Published](tg-post:published)',
      ),
    ).resolves.toBe('[Published](https://t.me/c/3976683330/33)');
  });

  it('keeps target message ids tied to the correct managed posts regardless of result ordering', async () => {
    const service = serviceWithTargets([
      {
        id: 'post-b',
        title: 'Post B',
        status: TelegramManagedPostStatus.PUBLISHED,
        telegramRemoteStatus: 'PUBLISHED',
        lastError: null,
        scheduledAt: null,
        imageUrls: [],
        telegramMessageIds: ['33'],
        telegramMessageUrls: ['https://t.me/old_username/33'],
        telegramChannel: { username: 'example', telegramChatId: '-1003976683330' },
      },
      {
        id: 'post-a',
        title: 'Post A',
        status: TelegramManagedPostStatus.PUBLISHED,
        telegramRemoteStatus: 'PUBLISHED',
        lastError: null,
        scheduledAt: null,
        imageUrls: [],
        telegramMessageIds: ['32'],
        telegramMessageUrls: ['https://t.me/old_username/32'],
        telegramChannel: { username: 'example', telegramChatId: '-1003976683330' },
      },
    ]);
    await expect(
      service['resolveInternalPostLinksForPublish'](
        'workspace',
        'current',
        '[A](tg-post:post-a) [B](tg-post:post-b)',
      ),
    ).resolves.toBe(
      '[A](https://t.me/c/3976683330/32) [B](https://t.me/c/3976683330/33)',
    );
  });

  it('blocks publish when the target channel has no stable Telegram channel id', async () => {
    const service = serviceWithTargets([
      {
        id: 'published',
        title: 'Published target',
        status: TelegramManagedPostStatus.PUBLISHED,
        telegramRemoteStatus: 'PUBLISHED',
        lastError: null,
        scheduledAt: null,
        imageUrls: [],
        telegramMessageIds: ['33'],
        telegramMessageUrls: ['https://t.me/test_tg_system/33'],
        telegramChannel: {
          username: 'test_tg_system',
          telegramChatId: null,
        },
      },
    ]);
    await expect(
      service['resolveInternalPostLinksForPublish'](
        'workspace',
        'current',
        '[Published](tg-post:published)',
      ),
    ).rejects.toThrow(
      'Target channel has no stable Telegram channel ID. Sync or re-import the channel.',
    );
  });

  it('rejects a published target with a broken Telegram link', async () => {
    const service = serviceWithTargets([
      {
        id: 'broken',
        title: 'Broken target',
        status: TelegramManagedPostStatus.PUBLISHED,
        telegramRemoteStatus: 'BROKEN',
        lastError: 'Telegram post link is broken.',
        scheduledAt: null,
        imageUrls: [],
        telegramMessageIds: ['42'],
        telegramMessageUrls: ['https://t.me/example/42'],
        telegramChannel: { username: 'example', telegramChatId: '-1003976683330' },
      },
    ]);
    await expect(
      service['resolveInternalPostLinksForPublish'](
        'workspace',
        'current',
        '[Broken](tg-post:broken)',
      ),
    ).rejects.toThrow('broken Telegram link');
  });

  it('resolves an earlier scheduled target to a stable url while scheduling a later post', async () => {
    const service = serviceWithTargets([
      {
        id: 'scheduled',
        title: 'Earlier scheduled target',
        status: TelegramManagedPostStatus.SCHEDULED,
        telegramRemoteStatus: 'SCHEDULED',
        lastError: null,
        scheduledAt: new Date('2026-07-05T11:16:00.000Z'),
        imageUrls: [],
        telegramMessageIds: ['42'],
        telegramMessageUrls: [],
        telegramChannel: { username: '@example', telegramChatId: '-1003976683330' },
      },
    ]);
    await expect(
      service['resolveInternalPostLinksForPublish'](
        'workspace',
        'current',
        '[Scheduled](tg-post:scheduled)',
        new Date('2026-07-06T11:16:00.000Z'),
      ),
    ).resolves.toBe('[Scheduled](https://t.me/c/3976683330/42)');
  });

  it('rejects a scheduled target that is not earlier', async () => {
    const service = serviceWithTargets([
      {
        id: 'scheduled',
        title: 'Later target',
        status: TelegramManagedPostStatus.SCHEDULED,
        telegramRemoteStatus: 'SCHEDULED',
        lastError: null,
        scheduledAt: new Date('2026-07-07T11:16:00.000Z'),
        imageUrls: [],
        telegramMessageIds: ['42'],
        telegramMessageUrls: [],
        telegramChannel: { username: 'example', telegramChatId: '-1003976683330' },
      },
    ]);
    await expect(
      service['resolveInternalPostLinksForPublish'](
        'workspace',
        'current',
        '[Scheduled](tg-post:scheduled)',
        new Date('2026-07-06T11:16:00.000Z'),
      ),
    ).rejects.toThrow('must be scheduled before');
  });
});
