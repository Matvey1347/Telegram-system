import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ApplicationLogsDeleteResult,
  ApplicationLogsFilterOptions,
  ApplicationLogsListResult,
} from '@telegram-system/shared';
import { WorkspaceRole } from '@prisma/client';
import { WorkspaceService } from '../common/workspace.service';
import { sanitizeLogMetadata } from './application-logs.sanitizer';
import { isApplicationLogStorageMissing } from './application-logs-storage';
import { ApplicationLogsRepository } from './application-logs.repository';
import { ApplicationLogsQueryDto } from './dto/application-logs-query.dto';
import { ClientLogDto } from './dto/client-log.dto';

function encodeCursor(createdAt: Date, id: string) {
  return Buffer.from(`${createdAt.toISOString()}::${id}`).toString('base64url');
}

function decodeCursor(cursor: string) {
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  const [createdAtRaw, id] = decoded.split('::');
  const createdAt = new Date(createdAtRaw);
  if (!id || Number.isNaN(createdAt.getTime())) return null;
  return { createdAt, id };
}

@Injectable()
export class ApplicationLogsService {
  private storageState: 'unknown' | 'available' | 'missing' = 'unknown';
  private nextStorageProbeAt = 0;

  constructor(
    private readonly repository: ApplicationLogsRepository,
    private readonly workspaceService: WorkspaceService,
  ) {}

  private async requireAdminWorkspace(userId: string) {
    return this.workspaceService.requireWorkspaceRole(userId, [
      WorkspaceRole.owner,
      WorkspaceRole.admin,
    ]);
  }

  private toLogDto(log: any) {
    return {
      id: log.id,
      workspaceId: log.workspaceId,
      userId: log.userId,
      level: log.level,
      kind: log.kind,
      environment: log.environment,
      service: log.service,
      source: log.source,
      event: log.event,
      message: log.message,
      correlationId: log.correlationId,
      requestId: log.requestId,
      method: log.method,
      endpoint: log.endpoint,
      path: log.path,
      statusCode: log.statusCode,
      durationMs: log.durationMs,
      errorName: log.errorName,
      errorCode: log.errorCode,
      stack: log.stack,
      metadata: (log.metadata as Record<string, unknown> | null) ?? null,
      createdAt: log.createdAt.toISOString(),
      expiresAt: log.expiresAt?.toISOString() ?? null,
      user: log.user
        ? {
            id: log.user.id,
            name: log.user.name,
            email: log.user.email,
          }
        : null,
    };
  }

  private emptyListResult(query: ApplicationLogsQueryDto, limit: number): ApplicationLogsListResult {
    return {
      items: [],
      nextCursor: null,
      hasMore: false,
      filters: {
        cursor: query.cursor,
        limit,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        levels: query.levels as any,
        kinds: query.kinds as any,
        sources: query.sources,
        events: query.events,
        methods: query.methods,
        endpoint: query.endpoint,
        statusCode: query.statusCode,
        statusCodeFrom: query.statusCodeFrom,
        statusCodeTo: query.statusCodeTo,
        correlationId: query.correlationId,
        userId: query.userId,
        search: query.search,
      },
    };
  }

  private emptyFilterOptions(): ApplicationLogsFilterOptions {
    return {
      levels: ['debug', 'info', 'warn', 'error'],
      kinds: ['http', 'application', 'integration', 'cron', 'client', 'audit'],
      sources: [],
      events: [],
      endpoints: [],
      users: [],
    };
  }

  private markStorageMissing() {
    this.storageState = 'missing';
    this.nextStorageProbeAt = Date.now() + 5000;
  }

  private markStorageAvailable() {
    this.storageState = 'available';
    this.nextStorageProbeAt = 0;
  }

  private shouldSkipForMissingStorage() {
    return (
      this.storageState === 'missing' && Date.now() < this.nextStorageProbeAt
    );
  }

  async list(userId: string, query: ApplicationLogsQueryDto): Promise<ApplicationLogsListResult> {
    const membership = await this.requireAdminWorkspace(userId);
    const limit = Math.min(200, Math.max(1, query.limit || 50));
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    if (this.shouldSkipForMissingStorage()) {
      return this.emptyListResult(query, limit);
    }

    const and: Prisma.ApplicationLogWhereInput[] = [
      { workspaceId: membership.workspaceId },
    ];

    if (query.dateFrom || query.dateTo) {
      and.push({
        createdAt: {
          ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
          ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
        },
      });
    }

    if (query.levels?.length) {
      and.push({ level: { in: query.levels as any } });
    }
    if (query.kinds?.length) {
      and.push({ kind: { in: query.kinds as any } });
    }
    if (query.sources?.length) {
      and.push({ source: { in: query.sources } });
    }
    if (query.events?.length) {
      and.push({ event: { in: query.events } });
    }
    if (query.methods?.length) {
      and.push({ method: { in: query.methods } });
    }
    if (query.endpoint) {
      and.push({
        OR: [
          { endpoint: { contains: query.endpoint, mode: 'insensitive' } },
          { path: { contains: query.endpoint, mode: 'insensitive' } },
        ],
      });
    }
    if (query.statusCode != null) {
      and.push({ statusCode: query.statusCode });
    } else if (query.statusCodeFrom != null || query.statusCodeTo != null) {
      and.push({
        statusCode: {
          ...(query.statusCodeFrom != null ? { gte: query.statusCodeFrom } : {}),
          ...(query.statusCodeTo != null ? { lte: query.statusCodeTo } : {}),
        },
      });
    }
    if (query.correlationId) {
      and.push({ correlationId: query.correlationId });
    }
    if (query.userId) {
      and.push({ userId: query.userId });
    }
    if (query.search) {
      and.push({
        OR: [
          { message: { contains: query.search, mode: 'insensitive' } },
          { event: { contains: query.search, mode: 'insensitive' } },
          { source: { contains: query.search, mode: 'insensitive' } },
          { errorCode: { contains: query.search, mode: 'insensitive' } },
          { endpoint: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }
    if (cursor) {
      and.push({
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      });
    }

    const where: Prisma.ApplicationLogWhereInput = {
      AND: and,
    };

    try {
      const logs = await this.repository.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
        take: limit + 1,
      });
      this.markStorageAvailable();

      const items = logs.slice(0, limit).map((log) => this.toLogDto(log));
      const next = logs[limit];
      return {
        items,
        nextCursor: next ? encodeCursor(next.createdAt, next.id) : null,
        hasMore: Boolean(next),
        filters: this.emptyListResult(query, limit).filters,
      };
    } catch (error) {
      if (isApplicationLogStorageMissing(error)) {
        this.markStorageMissing();
        return this.emptyListResult(query, limit);
      }
      throw error;
    }
  }

  async detail(userId: string, id: string) {
    const membership = await this.requireAdminWorkspace(userId);
    if (this.shouldSkipForMissingStorage()) {
      throw new NotFoundException('Application log not found');
    }
    let log;
    try {
      log = await this.repository.findFirst({
        where: { id, workspaceId: membership.workspaceId },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      });
      this.markStorageAvailable();
    } catch (error) {
      if (isApplicationLogStorageMissing(error)) {
        this.markStorageMissing();
        throw new NotFoundException('Application log not found');
      }
      throw error;
    }
    if (!log) throw new NotFoundException('Application log not found');
    return this.toLogDto(log);
  }

  async filterOptions(userId: string): Promise<ApplicationLogsFilterOptions> {
    const membership = await this.requireAdminWorkspace(userId);
    if (this.shouldSkipForMissingStorage()) {
      return this.emptyFilterOptions();
    }

    try {
      const [sources, events, endpoints, users] = await Promise.all([
        this.repository.findMany({
          where: { workspaceId: membership.workspaceId, source: { not: null } },
          distinct: ['source'],
          orderBy: { source: 'asc' },
          select: { source: true },
          take: 100,
        }),
        this.repository.findMany({
          where: { workspaceId: membership.workspaceId },
          distinct: ['event'],
          orderBy: { event: 'asc' },
          select: { event: true },
          take: 100,
        }),
        this.repository.findMany({
          where: { workspaceId: membership.workspaceId, endpoint: { not: null } },
          distinct: ['endpoint'],
          orderBy: { endpoint: 'asc' },
          select: { endpoint: true },
          take: 100,
        }),
        this.repository.findMany({
          where: { workspaceId: membership.workspaceId, userId: { not: null } },
          distinct: ['userId'],
          orderBy: { createdAt: 'desc' },
          select: {
            user: { select: { id: true, name: true, email: true } },
          },
          take: 100,
        }),
      ]);
      this.markStorageAvailable();

      return {
        levels: ['debug', 'info', 'warn', 'error'],
        kinds: ['http', 'application', 'integration', 'cron', 'client', 'audit'],
        sources: sources.map((item) => item.source).filter(Boolean) as string[],
        events: events.map((item) => item.event).filter(Boolean),
        endpoints: endpoints
          .map((item) => item.endpoint)
          .filter(Boolean) as string[],
        users: (users as Array<{ user?: { id: string; name: string; email: string } | null }>)
          .map((item) => item.user)
          .filter(Boolean)
          .map((user) => ({
            id: user!.id,
            name: user!.name,
            email: user!.email,
          })),
      };
    } catch (error) {
      if (isApplicationLogStorageMissing(error)) {
        this.markStorageMissing();
        return this.emptyFilterOptions();
      }
      throw error;
    }
  }

  async createClientLog(userId: string, dto: ClientLogDto) {
    const membership = await this.workspaceService.resolveWorkspaceMembershipForUser(userId);
    if (this.shouldSkipForMissingStorage()) {
      return { skipped: true };
    }
    try {
      const result = await this.repository.createClientLog({
        workspaceId: membership.workspaceId,
        userId,
        level: 'error',
        kind: 'client',
        environment: process.env.NODE_ENV || 'development',
        service: 'web',
        source: 'ClientErrorReporter',
        event: 'client.runtime_error',
        message: dto.message,
        correlationId: dto.correlationId || null,
        requestId: dto.correlationId || null,
        path: dto.route || null,
        stack: dto.stack || null,
        metadata: sanitizeLogMetadata({
          route: dto.route,
          userAgent: dto.userAgent,
          ...(dto.metadata || {}),
        }) as Prisma.InputJsonValue,
        expiresAt: null,
      });
      this.markStorageAvailable();
      return result;
    } catch (error) {
      if (isApplicationLogStorageMissing(error)) {
        this.markStorageMissing();
        return { skipped: true };
      }
      throw error;
    }
  }

  async cleanupExpiredLogs() {
    const retentionDays = Number(process.env.APP_LOG_RETENTION_DAYS ?? 90);
    if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
      return { deletedCount: 0, disabled: true };
    }
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    if (this.shouldSkipForMissingStorage()) {
      return { deletedCount: 0, disabled: false };
    }
    try {
      const result = await this.repository.deleteMany({
        where: {
          OR: [{ expiresAt: { lt: new Date() } }, { createdAt: { lt: cutoff } }],
        },
      });
      this.markStorageAvailable();
      return { deletedCount: result.count, disabled: false };
    } catch (error) {
      if (isApplicationLogStorageMissing(error)) {
        this.markStorageMissing();
        return { deletedCount: 0, disabled: false };
      }
      throw error;
    }
  }

  async clearWorkspaceLogs(userId: string): Promise<ApplicationLogsDeleteResult> {
    const membership = await this.requireAdminWorkspace(userId);
    if (this.shouldSkipForMissingStorage()) {
      return { success: true, deletedCount: 0 };
    }
    try {
      const result = await this.repository.deleteMany({
        where: { workspaceId: membership.workspaceId },
      });
      this.markStorageAvailable();
      return { success: true, deletedCount: result.count };
    } catch (error) {
      if (isApplicationLogStorageMissing(error)) {
        this.markStorageMissing();
        return { success: true, deletedCount: 0 };
      }
      throw error;
    }
  }
}
