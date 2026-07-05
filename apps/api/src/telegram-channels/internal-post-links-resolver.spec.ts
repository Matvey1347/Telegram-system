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
        telegramMessageUrls: [],
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
        telegramMessageUrls: [
          'https://t.me/example/42',
          'https://t.me/example/43',
        ],
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
});
