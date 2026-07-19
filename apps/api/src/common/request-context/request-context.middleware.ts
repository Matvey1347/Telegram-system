import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { createCorrelationId, normalizeCorrelationId } from './correlation-id';
import { RequestContextService } from './request-context.service';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly requestContext: RequestContextService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const correlationId =
      normalizeCorrelationId(req.headers['x-correlation-id']) ||
      createCorrelationId();
    const startedAt = Date.now();

    res.setHeader('X-Correlation-Id', correlationId);

    this.requestContext.run(
      {
        correlationId,
        requestId: correlationId,
        method: req.method,
        path: req.originalUrl || req.url,
        route: req.route?.path || null,
        ip: req.ip || null,
        userAgent:
          typeof req.headers['user-agent'] === 'string'
            ? req.headers['user-agent']
            : null,
        startedAt,
      },
      next,
    );
  }
}
