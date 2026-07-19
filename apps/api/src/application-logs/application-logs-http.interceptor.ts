import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import type { Request, Response } from 'express';
import { ApplicationLoggerService } from './application-logger.service';
import { APPLICATION_LOG_HTTP_EXCLUDED_PATHS } from './application-logs.constants';
import { RequestContextService } from '../common/request-context/request-context.service';
import { sanitizeLogMetadata } from './application-logs.sanitizer';

@Injectable()
export class ApplicationLogsHttpInterceptor implements NestInterceptor {
  constructor(
    private readonly applicationLogger: ApplicationLoggerService,
    private readonly requestContext: RequestContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const path = request.originalUrl || request.url;
    const shouldSkip =
      request.method === 'OPTIONS' ||
      APPLICATION_LOG_HTTP_EXCLUDED_PATHS.some((pattern) => pattern.test(path));

    return next.handle().pipe(
      tap({
        next: () => {
          if (shouldSkip || (request as any).__applicationErrorLogged) return;
          const startedAt = this.requestContext.get()?.startedAt ?? Date.now();
          const durationMs = Date.now() - startedAt;
          const statusCode = response.statusCode;
          const level =
            statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
          const query =
            request.query && Object.keys(request.query).length
              ? sanitizeLogMetadata(request.query)
              : null;
          this.applicationLogger.writeStructured({
            level,
            kind: 'http',
            source: 'HttpLoggingInterceptor',
            event: 'request.completed',
            message: `${request.method} ${path} completed with ${statusCode}`,
            statusCode,
            durationMs,
            method: request.method,
            endpoint: request.route?.path || null,
            path,
            metadata: query ? { query } : null,
          });
        },
      }),
    );
  }
}
