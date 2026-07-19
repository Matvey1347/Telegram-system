import {
  ConsoleLogger,
  Injectable,
  LoggerService,
  LogLevel,
} from '@nestjs/common';
import type {
  ApplicationLogKind,
  ApplicationLogLevel,
} from '@prisma/client';
import { APPLICATION_LOG_SERVICE } from './application-logs.constants';
import { sanitizeLogMetadata } from './application-logs.sanitizer';
import { ApplicationLogWriterService } from './application-log-writer.service';
import { RequestContextService } from '../common/request-context/request-context.service';

type StructuredLogInput = {
  level?: ApplicationLogLevel;
  kind?: ApplicationLogKind;
  source?: string | null;
  event: string;
  message: string;
  workspaceId?: string | null;
  userId?: string | null;
  statusCode?: number | null;
  durationMs?: number | null;
  errorName?: string | null;
  errorCode?: string | null;
  stack?: string | null;
  metadata?: Record<string, unknown> | null;
  method?: string | null;
  endpoint?: string | null;
  path?: string | null;
  correlationId?: string | null;
  requestId?: string | null;
};

const LOG_LEVEL_PRIORITY: Record<ApplicationLogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function normalizeMinimumLevel(
  value: string | undefined,
): ApplicationLogLevel {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (normalized === 'all') return 'debug';
  if (normalized === 'debug') return 'debug';
  if (normalized === 'info') return 'info';
  if (normalized === 'warn') return 'warn';
  if (normalized === 'error') return 'error';
  return 'info';
}

@Injectable()
export class ApplicationLoggerService
  extends ConsoleLogger
  implements LoggerService
{
  private readonly minimumLevel = normalizeMinimumLevel(
    process.env.APP_LOG_MIN_LEVEL,
  );

  constructor(
    private readonly writer: ApplicationLogWriterService,
    private readonly requestContext: RequestContextService,
  ) {
    super(APPLICATION_LOG_SERVICE, {
      logLevels: ['log', 'error', 'warn', 'debug', 'verbose', 'fatal'] as LogLevel[],
    });
  }

  log(message: unknown, ...optionalParams: unknown[]) {
    super.log(message as never, ...optionalParams);
    this.writeFromNest('info', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]) {
    super.error(message as never, ...optionalParams);
    this.writeFromNest('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]) {
    super.warn(message as never, ...optionalParams);
    this.writeFromNest('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]) {
    super.debug?.(message as never, ...optionalParams);
    this.writeFromNest('debug', message, optionalParams);
  }

  info(input: StructuredLogInput) {
    this.writeStructured({ ...input, level: input.level || 'info' });
  }

  writeStructured(input: StructuredLogInput) {
    const level = input.level || 'info';
    if (
      LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.minimumLevel]
    ) {
      return;
    }
    const context = this.requestContext.get();
    this.writer.enqueue({
      workspaceId: input.workspaceId ?? context?.workspaceId ?? null,
      userId: input.userId ?? context?.userId ?? null,
      level,
      kind: input.kind || 'application',
      environment: process.env.NODE_ENV || 'development',
      service: APPLICATION_LOG_SERVICE,
      source: input.source ?? null,
      event: input.event,
      message: input.message,
      correlationId: input.correlationId ?? context?.correlationId ?? null,
      requestId: input.requestId ?? context?.requestId ?? null,
      method: input.method ?? context?.method ?? null,
      endpoint: input.endpoint ?? context?.route ?? null,
      path: input.path ?? context?.path ?? null,
      statusCode: input.statusCode ?? null,
      durationMs: input.durationMs ?? null,
      errorName: input.errorName ?? null,
      errorCode: input.errorCode ?? null,
      stack: input.stack ?? null,
      metadata: sanitizeLogMetadata(input.metadata ?? null),
      expiresAt: this.computeExpiresAt(),
    });
  }

  private computeExpiresAt() {
    const retentionDays = Number(process.env.APP_LOG_RETENTION_DAYS ?? 90);
    if (!Number.isFinite(retentionDays) || retentionDays <= 0) return null;
    return new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000);
  }

  private writeFromNest(
    level: ApplicationLogLevel,
    message: unknown,
    optionalParams: unknown[],
  ) {
    const [contextOrTrace, maybeTrace] = optionalParams;
    const source =
      typeof contextOrTrace === 'string' &&
      typeof maybeTrace !== 'string'
        ? contextOrTrace
        : typeof maybeTrace === 'string'
          ? maybeTrace
          : this.context;
    const stack =
      level === 'error'
        ? optionalParams.find((item) => typeof item === 'string' && item.includes('\n'))
        : null;

    this.writeStructured({
      level,
      kind: 'application',
      source: typeof source === 'string' ? source : this.context,
      event: `nestjs.${level}`,
      message: typeof message === 'string' ? message : JSON.stringify(message),
      stack: typeof stack === 'string' ? stack : null,
      metadata:
        typeof message === 'object' && message != null
          ? (sanitizeLogMetadata(message) as Record<string, unknown>)
          : null,
    });
  }
}
