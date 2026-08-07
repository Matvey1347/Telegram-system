import { NotFoundException } from '@nestjs/common';
import { TelegramChannelsService } from './telegram-channels.service';

describe('TelegramChannelsService importManagedPosts', () => {
  const setup = (options?: { groupFound?: boolean }) => {
    const posts: Array<Record<string, unknown>> = [
      {
        id: 'existing',
        workspaceId: 'workspace',
        telegramChannelId: 'channel',
        title: 'Existing',
        text: null,
        imageUrls: [],
        assignedMemberId: 'member-1',
        icon: null,
        groupId: 'group-1',
        groupPosition: 0,
        createdAt: new Date('2026-08-01T10:00:00Z'),
        updatedAt: new Date('2026-08-01T10:00:00Z'),
      },
    ];
    let nextPostId = 1;
    const create = jest.fn().mockImplementation(async ({ data }) => {
      const post = {
        id: `post-${nextPostId++}`,
        ...data,
        createdAt: new Date(`2026-08-01T10:00:0${nextPostId}Z`),
        updatedAt: new Date(`2026-08-01T10:00:0${nextPostId}Z`),
      };
      posts.push(post);
      return post;
    });
    const findMany = jest.fn().mockImplementation(async (args) => {
      let result = posts;
      if (args?.where?.id?.in) {
        result = result.filter((post) => args.where.id.in.includes(post.id));
      }
      if (args?.where?.groupId) {
        result = result.filter((post) => post.groupId === args.where.groupId);
      }
      if (args?.orderBy) {
        result = [...result].sort((left, right) => {
          const leftPosition = left.groupPosition as number | null;
          const rightPosition = right.groupPosition as number | null;
          if (leftPosition !== rightPosition) {
            return (
              (leftPosition ?? Number.MAX_SAFE_INTEGER) -
              (rightPosition ?? Number.MAX_SAFE_INTEGER)
            );
          }
          return (
            (left.createdAt as Date).getTime() -
            (right.createdAt as Date).getTime()
          );
        });
      }
      if (args?.select?.id) {
        return result.map((post) => ({ id: post.id }));
      }
      return result;
    });
    const update = jest.fn().mockImplementation(async ({ where, data }) => {
      const post = posts.find((item) => item.id === where.id);
      if (!post) return null;
      Object.assign(post, data);
      return post;
    });
    const executeRaw = jest.fn().mockImplementation(async () => {
      const grouped = posts
        .filter((post) => post.groupId === 'group-1')
        .sort((left, right) => {
          const leftPosition = left.groupPosition as number | null;
          const rightPosition = right.groupPosition as number | null;
          if (leftPosition !== rightPosition) {
            return (
              (leftPosition ?? Number.MAX_SAFE_INTEGER) -
              (rightPosition ?? Number.MAX_SAFE_INTEGER)
            );
          }
          return (
            (left.createdAt as Date).getTime() -
            (right.createdAt as Date).getTime()
          );
        });
      grouped.forEach((post, index) => {
        post.groupPosition = index;
        post.statusPosition = index;
      });
      return grouped.length;
    });
    const count = jest
      .fn()
      .mockImplementation(
        async ({ where }) =>
          posts.filter((post) => post.groupId === where.groupId).length,
      );
    const prisma = {
      telegramManagedPost: {
        create,
        count,
        findMany,
        update,
      },
      postGroup: {
        findFirst: jest
          .fn()
          .mockResolvedValue(
            options?.groupFound === false
              ? null
              : { id: 'group-1', workspaceId: 'workspace' },
          ),
      },
      icon: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockImplementation(async ({ where }) => ({
          id: where.id,
        })),
        upsert: jest.fn().mockImplementation(async ({ create }) => ({
          id: `icon-${create.emoji}`,
        })),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $executeRaw: executeRaw,
      $transaction: jest
        .fn()
        .mockImplementation(async (callback) => callback(prisma)),
    };
    const workspaceService = {
      resolveAssignedMemberId: jest.fn().mockResolvedValue({
        workspaceId: 'workspace',
        assignedMemberId: 'member-1',
      }),
    };
    const service = new TelegramChannelsService(
      prisma as never,
      workspaceService as never,
      { clearByPrefix: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    service['findOne'] = jest.fn().mockResolvedValue({
      id: 'channel',
      workspaceId: 'workspace',
    });
    return { service, prisma, create, posts };
  };

  it('creates selected rows in the selected group with managed-post defaults and normalized positions', async () => {
    const { service, prisma, create, posts } = setup();

    const result = await service.importManagedPosts('user', 'channel', {
      postGroupId: 'group-1',
      rows: [
        {
          title: 'First',
          text: 'First body',
          emoji: '🔥',
          urls: ['https://example.com/one.png'],
          groupPosition: 1,
        },
        {
          title: 'Second',
          text: 'Second body',
          urls: ['https://example.com/two.png'],
        },
      ],
    });

    expect(result.createdCount).toBe(2);
    expect(result.skippedCount).toBe(0);
    expect(result.rows.map((row) => row.status)).toEqual([
      'created',
      'created',
    ]);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: 'workspace',
          telegramChannelId: 'channel',
          groupId: 'group-1',
          assignedMemberId: 'member-1',
          title: 'First',
          text: 'First body',
          imageUrls: ['https://example.com/one.png'],
          origin: 'SYSTEM',
          icon: 'icon-🔥',
          groupPosition: 1,
        }),
      }),
    );
    expect(prisma.icon.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          workspaceId: 'workspace',
          type: 'emoji',
          name: 'First',
          emoji: '🔥',
          createdByUserId: 'user',
        }),
      }),
    );
    expect(
      posts.map((post) => [post.id, post.groupPosition, post.statusPosition]),
    ).toEqual([
      ['existing', 0, 0],
      ['post-1', 1, 1],
      ['post-2', 2, 2],
    ]);
  });

  it('skips invalid rows and still creates valid rows', async () => {
    const { service, create } = setup();
    const onProgress = jest.fn();

    const result = await service.importManagedPosts(
      'user',
      'channel',
      {
        postGroupId: 'group-1',
        rows: [
          { title: '   ', text: 'No title' },
          { title: 'Bad image', urls: 42 },
          {
            title: 'Good',
            urls: 'https://example.com/one.png, https://example.com/two.png',
          },
        ],
      },
      onProgress,
    );

    expect(result.createdCount).toBe(1);
    expect(result.skippedCount).toBe(2);
    expect(result.rows).toEqual([
      { index: 0, status: 'skipped', error: 'Title is required' },
      {
        index: 1,
        status: 'skipped',
        error: 'Image URLs must be strings',
      },
      expect.objectContaining({ index: 2, status: 'created' }),
    ]);
    expect(create).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        index: 0,
        status: 'skipped',
        error: 'Title is required',
      }),
      1,
      3,
    );
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        index: 2,
        status: 'created',
        title: 'Good',
        message: 'Post 1 created in drafts: Good',
      }),
      3,
      3,
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Good',
          imageUrls: [
            'https://example.com/one.png',
            'https://example.com/two.png',
          ],
        }),
      }),
    );
  });

  it('cleans markdown-wrapped image urls during import', async () => {
    const { service, create } = setup();

    await service.importManagedPosts('user', 'channel', {
      rows: [
        {
          title: 'Markdown image',
          urls: [
            '[https://images.example.com/a.png](https://images.example.com/a.png)',
          ],
        },
      ],
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          imageUrls: ['https://images.example.com/a.png'],
        }),
      }),
    );
  });

  it('uses an extended transaction timeout for large imports', async () => {
    const { service, prisma } = setup();

    await service.importManagedPosts('user', 'channel', {
      postGroupId: 'group-1',
      rows: Array.from({ length: 8 }, (_, index) => ({
        title: `Post ${index + 1}`,
      })),
    });

    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        maxWait: 10_000,
        timeout: 30_000,
      }),
    );
  });

  it('uses standard group positions when groupPosition is blank', async () => {
    const { service, create, posts } = setup();

    await service.importManagedPosts('user', 'channel', {
      postGroupId: 'group-1',
      rows: [
        { title: 'First blank', text: 'Body', groupPosition: '' },
        { title: 'Second blank', text: 'Body' },
      ],
    });

    expect(create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ groupPosition: 1 }),
      }),
    );
    expect(create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ groupPosition: 2 }),
      }),
    );
    expect(
      posts.map((post) => [post.id, post.groupPosition, post.statusPosition]),
    ).toEqual([
      ['existing', 0, 0],
      ['post-1', 1, 1],
      ['post-2', 2, 2],
    ]);
  });

  it('requires the selected group to belong to the current workspace and channel', async () => {
    const { service, prisma } = setup({ groupFound: false });

    await expect(
      service.importManagedPosts('user', 'channel', {
        postGroupId: 'group-from-other-workspace',
        rows: [{ title: 'Post' }],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.postGroup.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'group-from-other-workspace',
        workspaceId: 'workspace',
        telegramChannelId: 'channel',
      },
      select: { id: true },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
