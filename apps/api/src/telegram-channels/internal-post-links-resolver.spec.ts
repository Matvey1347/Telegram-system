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
    return new TelegramChannelsService(
      prisma as never,
      {} as never,
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

  it('resolves a published target to its primary Telegram URL', async () => {
    const service = serviceWithTargets([
      {
        id: 'published',
        title: 'Published target',
        status: TelegramManagedPostStatus.PUBLISHED,
        telegramRemoteStatus: 'PUBLISHED',
        lastError: null,
        scheduledAt: null,
        telegramMessageIds: ['42', '43'],
        telegramMessageUrls: [
          'https://t.me/example/42',
          'https://t.me/example/43',
        ],
        telegramChannel: { username: 'example', telegramChatId: null },
      },
    ]);
    await expect(
      service['resolveInternalPostLinksForPublish'](
        'workspace',
        'current',
        '[Published](tg-post:published)',
      ),
    ).resolves.toBe('[Published](https://t.me/example/42)');
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
        telegramMessageIds: ['42'],
        telegramMessageUrls: ['https://t.me/example/42'],
        telegramChannel: { username: 'example', telegramChatId: null },
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

  it('resolves an earlier scheduled target while scheduling a later post', async () => {
    const service = serviceWithTargets([
      {
        id: 'scheduled',
        title: 'Earlier scheduled target',
        status: TelegramManagedPostStatus.SCHEDULED,
        telegramRemoteStatus: 'SCHEDULED',
        lastError: null,
        scheduledAt: new Date('2026-07-05T11:16:00.000Z'),
        telegramMessageIds: ['42'],
        telegramMessageUrls: [],
        telegramChannel: { username: '@example', telegramChatId: null },
      },
    ]);
    await expect(
      service['resolveInternalPostLinksForPublish'](
        'workspace',
        'current',
        '[Scheduled](tg-post:scheduled)',
        new Date('2026-07-06T11:16:00.000Z'),
      ),
    ).resolves.toBe('[Scheduled](https://t.me/example/42)');
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
        telegramMessageIds: ['42'],
        telegramMessageUrls: [],
        telegramChannel: { username: 'example', telegramChatId: null },
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
