/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { ForbiddenException } from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';
import { ScheduledTasksService } from './scheduled-tasks.service';

const now = new Date('2026-08-08T10:30:00.000Z');

describe('ScheduledTasksService', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(now);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  function setup(
    options: {
      enabled?: boolean;
      lastScheduledEvaluationAt?: Date | null;
      execute?: jest.Mock;
      lockAcquired?: boolean;
    } = {},
  ) {
    const execute =
      options.execute ?? jest.fn().mockResolvedValue({ summary: 'ok' });
    const definition = {
      key: 'workspace.task',
      name: 'Workspace task',
      description: 'Runs in a workspace',
      scope: 'WORKSPACE_OPERATION' as const,
      defaultSchedule: {
        frequency: 'INTERVAL' as const,
        intervalMinutes: 30,
        timezone: 'Europe/Warsaw',
      },
      scheduleEditable: true,
      supportedFrequencies: ['INTERVAL' as const],
      notificationSupported: true,
      execute,
    };
    const systemDefinition = {
      ...definition,
      key: 'system.task',
      scope: 'SYSTEM_MAINTENANCE' as const,
      scheduleEditable: false,
      notificationSupported: false,
    };
    const config = {
      id: 'config-1',
      taskKey: definition.key,
      workspaceId: 'workspace-1',
      scope: 'WORKSPACE_OPERATION',
      lockKey: 'workspace.task:workspace:workspace-1',
      enabled: options.enabled ?? true,
      schedule: definition.defaultSchedule,
      notifyOnSuccess: false,
      notifyOnFailure: false,
      notificationChannel: 'SYSTEM_TELEGRAM_BOT',
      lastScheduledEvaluationAt:
        options.lastScheduledEvaluationAt ??
        new Date('2026-08-08T10:00:00.000Z'),
    };
    const run = {
      id: 'run-1',
      taskKey: definition.key,
      workspaceId: 'workspace-1',
      trigger: 'SCHEDULE',
      startedAt: now,
      finishedAt: null,
      status: 'RUNNING',
      durationMs: null,
      resultSummary: null,
      error: null,
      createdAt: now,
    };
    const prisma = {
      workspace: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'workspace-1', timezone: 'Europe/Warsaw' },
          ]),
      },
      scheduledTaskConfig: {
        upsert: jest.fn().mockResolvedValue(config),
        findMany: jest.fn().mockResolvedValue(config.enabled ? [config] : []),
        update: jest.fn().mockResolvedValue(config),
        findUnique: jest.fn().mockResolvedValue(config),
      },
      scheduledTaskRun: {
        create: jest.fn().mockResolvedValue(run),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            ...run,
            ...data,
            finishedAt: data.finishedAt ?? null,
            status: data.status,
          }),
        ),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const registry = {
      definitions: jest.fn().mockReturnValue([definition, systemDefinition]),
      get: jest.fn((key: string) =>
        key === definition.key
          ? definition
          : key === systemDefinition.key
            ? systemDefinition
            : null,
      ),
    };
    const locks = {
      acquire: jest.fn().mockResolvedValue(options.lockAcquired ?? true),
      renew: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    };
    const notifications = {
      notify: jest.fn().mockResolvedValue({ status: 'DISABLED' }),
    };
    const service = new ScheduledTasksService(
      prisma as never,
      registry as never,
      locks as never,
      notifications as never,
    );
    return {
      service,
      prisma,
      execute,
      locks,
      notifications,
      definition,
      config,
    };
  }

  it('executes a due task and records successful history', async () => {
    const { service, execute, prisma } = setup();
    await service.tick();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(prisma.scheduledTaskRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'SUCCESS',
          resultSummary: 'ok',
        }),
      }),
    );
  });

  it('does not execute a not-due task', async () => {
    const { service, execute } = setup({
      lastScheduledEvaluationAt: new Date('2026-08-08T10:15:00.000Z'),
    });
    await service.tick();
    expect(execute).not.toHaveBeenCalled();
  });

  it('does not execute disabled tasks', async () => {
    const { service, execute } = setup({ enabled: false });
    await service.tick();
    expect(execute).not.toHaveBeenCalled();
  });

  it('prevents duplicate worker execution with a lease', async () => {
    const { service, execute, locks } = setup({ lockAcquired: false });
    await service.tick();
    expect(locks.acquire).toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it('manual run uses the same execution path', async () => {
    const { service, execute, prisma } = setup();
    await service.runNowForMembership(
      { workspaceId: 'workspace-1', role: WorkspaceRole.admin },
      'workspace.task',
    );
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: 'MANUAL',
        workspaceId: 'workspace-1',
      }),
    );
    expect(prisma.scheduledTaskRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ trigger: 'MANUAL' }),
      }),
    );
  });

  it('records sanitized failures and continues the scheduler loop', async () => {
    const { service, prisma } = setup({
      execute: jest
        .fn()
        .mockRejectedValue(new Error('password=secret exploded')),
    });
    await expect(service.tick()).resolves.toBeUndefined();
    expect(prisma.scheduledTaskRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          error: expect.stringContaining('password=[redacted]'),
        }),
      }),
    );
  });

  it('rejects regular member edits', async () => {
    const { service } = setup();
    await expect(
      service.updateForMembership(
        { workspaceId: 'workspace-1', role: WorkspaceRole.member },
        'workspace.task',
        { enabled: false },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects regular member manual runs', async () => {
    const { service } = setup();
    await expect(
      service.runNowForMembership(
        { workspaceId: 'workspace-1', role: WorkspaceRole.member },
        'workspace.task',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not expose system maintenance tasks in workspace list', async () => {
    const { service, prisma } = setup();
    await service.listForMembership({
      workspaceId: 'workspace-1',
      role: WorkspaceRole.admin,
    });
    expect(prisma.scheduledTaskConfig.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: 'workspace-1' } }),
    );
  });

  it('does not advertise run now to regular members', async () => {
    const { service } = setup();
    const result = await service.listForMembership({
      workspaceId: 'workspace-1',
      role: WorkspaceRole.member,
    });
    expect(result.items[0]?.canRunNow).toBe(false);
  });

  it('saves notification preferences for editable workspace tasks', async () => {
    const { service, prisma } = setup();
    await service.updateForMembership(
      { workspaceId: 'workspace-1', role: WorkspaceRole.admin },
      'workspace.task',
      {
        notifications: {
          notifyOnSuccess: true,
          notifyOnFailure: true,
          channel: 'SYSTEM_TELEGRAM_BOT',
        },
      },
    );
    expect(prisma.scheduledTaskConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          notifyOnSuccess: true,
          notifyOnFailure: true,
        }),
      }),
    );
  });

  it('prevents workspace users from modifying system maintenance tasks', async () => {
    const { service } = setup();
    await expect(
      service.updateForMembership(
        { workspaceId: 'workspace-1', role: WorkspaceRole.admin },
        'system.task',
        { enabled: false },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
