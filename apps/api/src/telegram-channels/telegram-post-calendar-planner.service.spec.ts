import { NotFoundException } from '@nestjs/common';
import { TelegramManagedPostStatus } from '@prisma/client';
import { TelegramPostCalendarPlannerService } from './telegram-post-calendar-planner.service';

describe('TelegramPostCalendarPlannerService', () => {
  const setup = () => {
    const prisma = {
      telegramChannel: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'channel-1',
          workspaceId: 'workspace-1',
        }),
      },
      workspace: {
        findUnique: jest.fn().mockResolvedValue({ timezone: 'Europe/Warsaw' }),
      },
      postGroup: {
        count: jest.fn().mockResolvedValue(1),
      },
      telegramPostPlannerFormat: {
        count: jest.fn().mockResolvedValue(1),
        findFirst: jest.fn().mockResolvedValue({ id: 'format-1' }),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      },
      telegramPostPlannerSlot: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'slot-1',
            workspaceId: 'workspace-1',
            telegramChannelId: 'channel-1',
            formatId: 'format-1',
            postGroupIds: ['group-1'],
            weekday: 1,
            time: '09:30',
            timezone: 'Europe/Warsaw',
            position: 0,
            isActive: true,
            createdAt: new Date('2026-08-01T00:00:00.000Z'),
            updatedAt: new Date('2026-08-01T00:00:00.000Z'),
          },
          {
            id: 'slot-2',
            workspaceId: 'workspace-1',
            telegramChannelId: 'channel-1',
            formatId: 'format-1',
            postGroupIds: ['group-1'],
            weekday: 1,
            time: '11:00',
            timezone: 'Europe/Warsaw',
            position: 1,
            isActive: true,
            createdAt: new Date('2026-08-01T00:00:00.000Z'),
            updatedAt: new Date('2026-08-01T00:00:00.000Z'),
          },
        ]),
        create: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
      },
      telegramManagedPost: {
        findMany: jest.fn().mockImplementation(async (args) => {
          if (args?.select?.scheduledAt) return [];
          return [
            {
              id: 'post-1',
              title: 'First',
              groupId: 'group-1',
              groupPosition: 0,
              createdAt: new Date('2026-08-01T00:00:00.000Z'),
            },
            {
              id: 'post-2',
              title: 'Second',
              groupId: 'group-1',
              groupPosition: 1,
              createdAt: new Date('2026-08-02T00:00:00.000Z'),
            },
          ];
        }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest
        .fn()
        .mockImplementation(async (callback) => callback(prisma)),
    };
    const workspaceService = {
      resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
    };
    const telegramChannelsService = {
      returnManagedPostToDraft: jest.fn().mockResolvedValue({}),
      scheduleManagedPostsBatch: jest.fn().mockResolvedValue({
        action: 'SCHEDULE_SEQUENCE',
        total: 2,
        successCount: 2,
        failedCount: 0,
        skippedCount: 0,
        results: [
          {
            postId: 'post-1',
            title: 'First',
            success: true,
            action: 'SCHEDULED',
            newStatus: TelegramManagedPostStatus.SCHEDULED,
          },
          {
            postId: 'post-2',
            title: 'Second',
            success: true,
            action: 'SCHEDULED',
            newStatus: TelegramManagedPostStatus.SCHEDULED,
          },
        ],
      }),
    };
    const service = new TelegramPostCalendarPlannerService(
      prisma as never,
      workspaceService as never,
      telegramChannelsService as never,
    );
    return { prisma, service, telegramChannelsService };
  };

  it('builds deterministic assignments from active slots and draft posts', async () => {
    const { service } = setup();

    const dto = {
      from: '2026-08-10',
      to: '2026-08-10',
      postGroupIds: ['group-1'],
      formatIds: ['format-1'],
    };
    const result = await service.preview('user-1', 'channel-1', dto);
    const repeated = await service.preview('user-1', 'channel-1', dto);

    expect(result.assignments.map((assignment) => assignment.postId)).toEqual(
      repeated.assignments.map((assignment) => assignment.postId),
    );
    expect(result.assignments.map((assignment) => assignment.slotId)).toEqual([
      'slot-1',
      'slot-2',
    ]);
    expect(result.summary).toMatchObject({
      eligiblePosts: 2,
      availableSlots: 2,
      plannedPosts: 2,
      unfilledSlots: 0,
    });
  });

  it('rerolls a day by rotating eligible posts without changing slots', async () => {
    const { service } = setup();

    const baseline = await service.preview('user-1', 'channel-1', {
      from: '2026-08-10',
      to: '2026-08-10',
      postGroupIds: ['group-1'],
      formatIds: ['format-1'],
    });
    const result = await service.preview('user-1', 'channel-1', {
      from: '2026-08-10',
      to: '2026-08-10',
      postGroupIds: ['group-1'],
      formatIds: ['format-1'],
      rerollOffset: 1,
    });

    expect(result.assignments.map((assignment) => assignment.postId)).not.toEqual(
      baseline.assignments.map((assignment) => assignment.postId),
    );
    expect(result.assignments.map((assignment) => assignment.slotId)).toEqual([
      'slot-1',
      'slot-2',
    ]);
  });

  it('excludes planner formats with zero frequency from preview assignments', async () => {
    const { prisma, service } = setup();
    const plannerSlots = [
      {
        id: 'slot-1',
        workspaceId: 'workspace-1',
        telegramChannelId: 'channel-1',
        formatId: 'format-1',
        postGroupIds: ['group-1'],
        weekday: 1,
        time: '09:30',
        timezone: 'Europe/Warsaw',
        position: 0,
        isActive: true,
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        updatedAt: new Date('2026-08-01T00:00:00.000Z'),
      },
      {
        id: 'slot-2',
        workspaceId: 'workspace-1',
        telegramChannelId: 'channel-1',
        formatId: 'format-2',
        postGroupIds: ['group-1'],
        weekday: 1,
        time: '11:00',
        timezone: 'Europe/Warsaw',
        position: 1,
        isActive: true,
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        updatedAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    ];
    prisma.telegramPostPlannerSlot.findMany.mockImplementation(async (args) => {
      const formatIds = args?.where?.formatId?.in as string[] | undefined;
      return formatIds
        ? plannerSlots.filter((slot) => formatIds.includes(slot.formatId))
        : plannerSlots;
    });

    const result = await service.preview('user-1', 'channel-1', {
      from: '2026-08-10',
      to: '2026-08-10',
      postGroupIds: ['group-1'],
      formatWeights: {
        'format-1': 100,
        'format-2': 0,
      },
    });

    expect(result.assignments.map((assignment) => assignment.slotId)).toEqual([
      'slot-1',
    ]);
    expect(result.assignments.map((assignment) => assignment.formatId)).toEqual([
      'format-1',
    ]);
  });

  it('reroll day returns existing auto-planned posts to draft before applying', async () => {
    const { service, telegramChannelsService } = setup();

    const result = await service.rerollDay('user-1', 'channel-1', {
      date: '2026-08-10',
      postGroupIds: ['group-1'],
      formatIds: ['format-1'],
    });

    expect(telegramChannelsService.returnManagedPostToDraft).toHaveBeenCalled();
    expect(result.plannerRunId).toEqual(expect.any(String));
    expect(result.preview.assignments.length).toBeGreaterThan(0);
  });

  it('rejects planner slots for post groups outside the workspace channel', async () => {
    const { prisma, service } = setup();
    prisma.postGroup.count.mockResolvedValue(0);

    await expect(
      service.createSlot('user-1', 'channel-1', {
        weekday: 1,
        time: '09:30',
        postGroupIds: ['foreign-group'],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('applies through managed-post batch scheduling and stores provenance', async () => {
    const { prisma, service, telegramChannelsService } = setup();

    const result = await service.apply('user-1', 'channel-1', {
      from: '2026-08-10',
      to: '2026-08-10',
      postGroupIds: ['group-1'],
      formatIds: ['format-1'],
    });

    expect(telegramChannelsService.scheduleManagedPostsBatch).toHaveBeenCalledWith(
      'user-1',
      'channel-1',
      {
        items: [
          ...result.preview.assignments.map((assignment) => ({
            postId: assignment.postId,
            scheduledAt: assignment.scheduledAt,
          })),
        ],
      },
    );
    const firstAssignment = result.preview.assignments[0];
    expect(prisma.telegramManagedPost.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: firstAssignment.postId,
          workspaceId: 'workspace-1',
          telegramChannelId: 'channel-1',
        },
        data: expect.objectContaining({
          plannerFormatId: firstAssignment.formatId,
          plannerSlotId: firstAssignment.slotId,
          plannerRunId: result.plannerRunId,
          plannerProvenance: expect.objectContaining({
            planner: 'telegram_posts_auto_calendar',
            plannerRunId: result.plannerRunId,
          }),
        }),
      }),
    );
  });
});
