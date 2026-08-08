import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WorkspaceRole } from '@prisma/client';
import type {
  ScheduledTaskListResponse,
  ScheduledTaskRunSummary,
  ScheduledTaskSchedule,
  ScheduledTaskView,
  UpdateScheduledTaskPayload,
} from '@telegram-system/shared';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  computeNextRunAt,
  isDue,
  normalizeSchedule,
  sanitizeSchedulerError,
} from './schedule-utils';
import { ScheduledTaskLockService } from './scheduled-task-lock.service';
import { ScheduledTaskNotificationsService } from './scheduled-task-notifications.service';
import { ScheduledTaskRegistryService } from './scheduled-task-registry.service';
import type { ScheduledTaskDefinition } from './scheduled-task.types';

@Injectable()
export class ScheduledTasksService implements OnModuleInit {
  private readonly logger = new Logger(ScheduledTasksService.name);
  private readonly ownerId = randomUUID();

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ScheduledTaskRegistryService,
    private readonly locks: ScheduledTaskLockService,
    private readonly notifications: ScheduledTaskNotificationsService,
  ) {}

  async onModuleInit() {
    await this.materializeDefaults();
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async tick() {
    await this.materializeDefaults();
    const now = new Date();
    const configs = await this.prisma.scheduledTaskConfig.findMany({
      where: { enabled: true },
      orderBy: { taskKey: 'asc' },
    });
    for (const config of configs) {
      const definition = this.registry.get(config.taskKey);
      if (!definition) continue;
      const schedule = config.schedule as ScheduledTaskSchedule;
      if (!isDue(schedule, config.lastScheduledEvaluationAt, now)) continue;
      try {
        await this.prisma.scheduledTaskConfig.update({
          where: { id: config.id },
          data: { lastScheduledEvaluationAt: now },
        });
        await this.executeDefinition(definition, {
          workspaceId: config.workspaceId,
          trigger: 'SCHEDULE',
          lockKey: config.lockKey,
          notifyOnSuccess: config.notifyOnSuccess,
          notifyOnFailure: config.notifyOnFailure,
          manual: false,
        });
      } catch (error) {
        this.logger.warn(
          `Scheduled task ${config.taskKey} failed without crashing scheduler loop: ${sanitizeSchedulerError(error)}`,
        );
      }
    }
  }

  async listForMembership(
    membership: Membership,
  ): Promise<ScheduledTaskListResponse> {
    await this.materializeDefaults();
    const configs = await this.prisma.scheduledTaskConfig.findMany({
      where: { workspaceId: membership.workspaceId },
      orderBy: [{ scope: 'asc' }, { taskKey: 'asc' }],
    });
    const items = await Promise.all(
      configs.map(async (config) => {
        const definition = this.registry.get(config.taskKey);
        if (!definition) return null;
        const lastRun = await this.lastRun(config.taskKey, config.workspaceId);
        return this.toView(definition, config, lastRun, membership.role);
      }),
    );
    return {
      items: items.filter((item): item is ScheduledTaskView => Boolean(item)),
    };
  }

  async updateForMembership(
    membership: Membership,
    taskKey: string,
    payload: UpdateScheduledTaskPayload,
  ) {
    if (!this.isWorkspaceAdmin(membership.role)) {
      throw new ForbiddenException('Insufficient workspace role');
    }
    await this.materializeDefaults();
    const definition = this.requireDefinition(taskKey);
    if (definition.scope !== 'WORKSPACE_OPERATION') {
      throw new ForbiddenException(
        'System maintenance tasks cannot be modified from workspace settings',
      );
    }
    if (!definition.scheduleEditable && payload.schedule) {
      throw new ForbiddenException('This task schedule is read-only');
    }
    const config = await this.configFor(definition, membership.workspaceId);
    const data: Record<string, unknown> = {};
    if (payload.enabled !== undefined) data.enabled = payload.enabled;
    if (payload.schedule) {
      try {
        data.schedule = this.validateScheduleForDefinition(
          definition,
          payload.schedule,
        );
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error ? error.message : 'Invalid schedule',
        );
      }
    }
    if (payload.notifications) {
      if (!definition.notificationSupported) {
        throw new ForbiddenException(
          'This task does not support notifications',
        );
      }
      data.notifyOnSuccess = payload.notifications.notifyOnSuccess;
      data.notifyOnFailure = payload.notifications.notifyOnFailure;
      data.notificationChannel = payload.notifications.channel;
    }
    const updated = await this.prisma.scheduledTaskConfig.update({
      where: { id: config.id },
      data,
    });
    const lastRun = await this.lastRun(taskKey, membership.workspaceId);
    return this.toView(definition, updated, lastRun, membership.role);
  }

  async runNowForMembership(membership: Membership, taskKey: string) {
    if (!this.isWorkspaceAdmin(membership.role)) {
      throw new ForbiddenException('Insufficient workspace role');
    }
    await this.materializeDefaults();
    const definition = this.requireDefinition(taskKey);
    if (definition.scope !== 'WORKSPACE_OPERATION') {
      throw new ForbiddenException(
        'System maintenance tasks cannot be run from workspace settings',
      );
    }
    const config = await this.configFor(definition, membership.workspaceId);
    return this.executeDefinition(definition, {
      workspaceId: membership.workspaceId,
      trigger: 'MANUAL',
      lockKey: config.lockKey,
      notifyOnSuccess: config.notifyOnSuccess,
      notifyOnFailure: config.notifyOnFailure,
      manual: true,
    });
  }

  async runsForMembership(membership: Membership, taskKey: string, limit = 20) {
    const safeLimit = Math.max(1, Math.min(100, limit));
    return (
      await this.prisma.scheduledTaskRun.findMany({
        where: { taskKey, workspaceId: membership.workspaceId },
        orderBy: { startedAt: 'desc' },
        take: safeLimit,
      })
    ).map(toRunSummary);
  }

  private async materializeDefaults() {
    const definitions = this.registry.definitions();
    const workspaces = await this.prisma.workspace.findMany({
      select: { id: true, timezone: true },
    });
    for (const definition of definitions) {
      if (definition.scope === 'SYSTEM_MAINTENANCE') {
        await this.upsertDefault(definition, null, 'Europe/Warsaw');
        continue;
      }
      for (const workspace of workspaces) {
        await this.upsertDefault(definition, workspace.id, workspace.timezone);
      }
    }
  }

  private async upsertDefault(
    definition: ScheduledTaskDefinition,
    workspaceId: string | null,
    timezone: string,
  ) {
    const lockKey = lockKeyFor(definition.key, workspaceId);
    await this.prisma.scheduledTaskConfig.upsert({
      where: { lockKey },
      create: {
        workspaceId,
        taskKey: definition.key,
        scope: definition.scope,
        lockKey,
        enabled: true,
        schedule: scheduleWithTimezone(definition.defaultSchedule, timezone),
        notificationChannel: 'SYSTEM_TELEGRAM_BOT',
        notifyOnSuccess: false,
        notifyOnFailure: false,
        lastScheduledEvaluationAt: new Date(),
      },
      update: {},
    });
  }

  private requireDefinition(taskKey: string) {
    const definition = this.registry.get(taskKey);
    if (!definition) throw new NotFoundException('Scheduled task not found');
    return definition;
  }

  private async configFor(
    definition: ScheduledTaskDefinition,
    workspaceId: string | null,
  ) {
    const config = await this.prisma.scheduledTaskConfig.findUnique({
      where: { lockKey: lockKeyFor(definition.key, workspaceId) },
    });
    if (!config) throw new NotFoundException('Scheduled task config not found');
    return config;
  }

  private validateScheduleForDefinition(
    definition: ScheduledTaskDefinition,
    schedule: ScheduledTaskSchedule,
  ) {
    const normalized = normalizeSchedule(schedule);
    if (!definition.supportedFrequencies.includes(normalized.frequency)) {
      throw new BadRequestException('Unsupported frequency for this task');
    }
    return normalized;
  }

  private async executeDefinition(
    definition: ScheduledTaskDefinition,
    params: {
      workspaceId: string | null;
      trigger: 'SCHEDULE' | 'MANUAL';
      lockKey: string;
      notifyOnSuccess: boolean;
      notifyOnFailure: boolean;
      manual: boolean;
    },
  ) {
    const acquired = await this.locks.acquire({
      lockKey: params.lockKey,
      taskKey: definition.key,
      workspaceId: params.workspaceId,
      ownerId: this.ownerId,
    });
    if (!acquired) {
      if (params.manual)
        throw new ConflictException('Scheduled task is already running');
      return null;
    }
    const run = await this.prisma.scheduledTaskRun.create({
      data: {
        taskKey: definition.key,
        workspaceId: params.workspaceId,
        trigger: params.trigger,
        status: 'RUNNING',
      },
    });
    const startedAt = Date.now();
    const renewal = setInterval(() => {
      void this.locks.renew(params.lockKey, this.ownerId);
    }, 60_000);
    try {
      const result = await definition.execute({
        taskKey: definition.key,
        workspaceId: params.workspaceId,
        trigger: params.trigger,
      });
      const status = result?.skipped ? 'SKIPPED' : 'SUCCESS';
      this.notifications.notify({
        taskKey: definition.key,
        workspaceId: params.workspaceId,
        status,
        enabled:
          status === 'SUCCESS'
            ? params.notifyOnSuccess
            : params.notifyOnFailure,
      });
      return toRunSummary(
        await this.prisma.scheduledTaskRun.update({
          where: { id: run.id },
          data: {
            status,
            finishedAt: new Date(),
            durationMs: Date.now() - startedAt,
            resultSummary: result?.summary ?? null,
          },
        }),
      );
    } catch (error) {
      const sanitized = sanitizeSchedulerError(error);
      this.notifications.notify({
        taskKey: definition.key,
        workspaceId: params.workspaceId,
        status: 'FAILED',
        enabled: params.notifyOnFailure,
      });
      return toRunSummary(
        await this.prisma.scheduledTaskRun.update({
          where: { id: run.id },
          data: {
            status: 'FAILED',
            finishedAt: new Date(),
            durationMs: Date.now() - startedAt,
            error: sanitized,
          },
        }),
      );
    } finally {
      clearInterval(renewal);
      await this.locks.release(params.lockKey, this.ownerId);
    }
  }

  private async lastRun(taskKey: string, workspaceId: string | null) {
    return this.prisma.scheduledTaskRun.findFirst({
      where: { taskKey, workspaceId },
      orderBy: { startedAt: 'desc' },
    });
  }

  private toView(
    definition: ScheduledTaskDefinition,
    config: {
      workspaceId: string | null;
      enabled: boolean;
      schedule: unknown;
      notifyOnSuccess: boolean;
      notifyOnFailure: boolean;
      notificationChannel: 'SYSTEM_TELEGRAM_BOT';
      lastScheduledEvaluationAt?: Date | null;
    },
    lastRun: Parameters<typeof toRunSummary>[0] | null,
    role: WorkspaceRole,
  ): ScheduledTaskView {
    const schedule = config.schedule as ScheduledTaskSchedule;
    const canEdit =
      definition.scope === 'WORKSPACE_OPERATION' &&
      definition.scheduleEditable &&
      this.isWorkspaceAdmin(role);
    return {
      key: definition.key,
      name: definition.name,
      description: definition.description,
      scope: definition.scope,
      scheduleEditable: definition.scheduleEditable,
      supportedFrequencies: definition.supportedFrequencies,
      notificationSupported: definition.notificationSupported,
      defaultSchedule: definition.defaultSchedule,
      workspaceId: config.workspaceId,
      enabled: config.enabled,
      schedule,
      notifications: {
        notifyOnSuccess: config.notifyOnSuccess,
        notifyOnFailure: config.notifyOnFailure,
        channel: config.notificationChannel,
      },
      notificationState: !definition.notificationSupported
        ? 'NOT_SUPPORTED'
        : config.notifyOnSuccess || config.notifyOnFailure
          ? 'ENABLED'
          : 'DISABLED',
      lastRun: lastRun ? toRunSummary(lastRun) : null,
      nextRunAt: config.enabled
        ? computeNextRunAt(
            schedule,
            config.lastScheduledEvaluationAt ?? new Date(),
          ).toISOString()
        : null,
      canRunNow:
        definition.scope === 'WORKSPACE_OPERATION' &&
        this.isWorkspaceAdmin(role),
      canEdit,
    };
  }

  private isWorkspaceAdmin(role: WorkspaceRole) {
    return role === WorkspaceRole.owner || role === WorkspaceRole.admin;
  }
}

type Membership = {
  workspaceId: string;
  role: WorkspaceRole;
};

function lockKeyFor(taskKey: string, workspaceId: string | null) {
  return workspaceId
    ? `${taskKey}:workspace:${workspaceId}`
    : `${taskKey}:system`;
}

function scheduleWithTimezone(
  schedule: ScheduledTaskSchedule,
  timezone: string,
): ScheduledTaskSchedule {
  if (schedule.frequency === 'DAILY') return { ...schedule, timezone };
  return { ...schedule, timezone };
}

function toRunSummary(run: {
  id: string;
  taskKey: string;
  workspaceId: string | null;
  trigger: 'SCHEDULE' | 'MANUAL';
  startedAt: Date;
  finishedAt: Date | null;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';
  durationMs: number | null;
  resultSummary: string | null;
  error: string | null;
  createdAt: Date;
}): ScheduledTaskRunSummary {
  return {
    id: run.id,
    taskKey: run.taskKey,
    workspaceId: run.workspaceId,
    trigger: run.trigger,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    status: run.status,
    durationMs: run.durationMs,
    resultSummary: run.resultSummary,
    error: run.error,
    createdAt: run.createdAt.toISOString(),
  };
}
