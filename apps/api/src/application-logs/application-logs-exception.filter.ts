import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApplicationLoggerService } from './application-logger.service';
import { RequestContextService } from '../common/request-context/request-context.service';
import { sanitizeLogMetadata } from './application-logs.sanitizer';

@Catch()
@Injectable()
export class ApplicationLogsExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly applicationLogger: ApplicationLoggerService,
    private readonly requestContext: RequestContextService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const requestContext = this.requestContext.get();
    const correlationId = requestContext?.correlationId || null;

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = isHttpException ? exception.getResponse() : null;
    const payloadMessage =
      typeof payload === 'string'
        ? payload
        : Array.isArray((payload as any)?.message)
          ? (payload as any).message.join('\n')
          : typeof (payload as any)?.message === 'string'
            ? (payload as any).message
            : status === 500
              ? 'Internal server error'
              : 'Request failed';
    const code =
      typeof (payload as any)?.code === 'string'
        ? (payload as any).code
        : isHttpException
          ? exception.name
          : 'INTERNAL_SERVER_ERROR';
    const event =
      exception instanceof BadRequestException
        ? 'validation.failed'
        : status >= 500
          ? 'application.unhandled_exception'
          : 'http.request_failed';

    (request as any).__applicationErrorLogged = true;
    response.setHeader('X-Correlation-Id', correlationId || '');

    this.applicationLogger.writeStructured({
      level: status >= 500 ? 'error' : 'warn',
      kind: 'http',
      source: 'ApplicationLogsExceptionFilter',
      event,
      message: payloadMessage,
      statusCode: status,
      method: request.method,
      endpoint: request.route?.path || null,
      path: request.originalUrl || request.url,
      errorName:
        exception instanceof Error ? exception.name : 'UnknownException',
      errorCode: code,
      stack: exception instanceof Error ? exception.stack || null : null,
      metadata:
        typeof payload === 'object' && payload != null
          ? (sanitizeLogMetadata(payload) as Record<string, unknown>)
          : null,
    });

    response.status(status).json({
      statusCode: status,
      error:
        isHttpException && typeof (payload as any)?.error === 'string'
          ? (payload as any).error
          : status >= 500
            ? 'Internal Server Error'
            : exception instanceof Error
              ? exception.name
              : 'Request Failed',
      message: payloadMessage,
      ...(typeof payload === 'object' &&
      payload != null &&
      'details' in (payload as object)
        ? { details: (payload as any).details }
        : {}),
      code,
      correlationId,
    });
  }
}
