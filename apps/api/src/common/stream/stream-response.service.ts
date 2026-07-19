import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { ApplicationLoggerService } from '../../application-logs/application-logger.service';
import { RequestContextService } from '../request-context/request-context.service';

@Injectable()
export class StreamResponseService {
  constructor(
    private readonly applicationLogger: ApplicationLoggerService,
    private readonly requestContext: RequestContextService,
  ) {}

  async stream<TItem, TResult>(
    res: Response,
    config: {
      eventPrefix: string;
      action: (
        onProgress: (item: TItem, current: number, total: number) => void,
      ) => Promise<TResult>;
    },
  ) {
    const context = this.requestContext.get();
    const startedAt = Date.now();
    res.status(200);
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    if (context?.correlationId) {
      res.setHeader('X-Correlation-Id', context.correlationId);
    }
    res.flushHeaders();

    this.applicationLogger.writeStructured({
      level: 'info',
      kind: 'application',
      source: StreamResponseService.name,
      event: `${config.eventPrefix}.started`,
      message: `Stream started for ${config.eventPrefix}`,
    });

    try {
      const result = await config.action((item, current, total) => {
        res.write(
          `${JSON.stringify({ type: 'progress', item, current, total })}\n`,
        );
        (res as Response & { flush?: () => void }).flush?.();
      });
      res.write(`${JSON.stringify({ type: 'complete', result })}\n`);
      (res as Response & { flush?: () => void }).flush?.();
      this.applicationLogger.writeStructured({
        level: 'info',
        kind: 'application',
        source: StreamResponseService.name,
        event: `${config.eventPrefix}.completed`,
        message: `Stream completed for ${config.eventPrefix}`,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Stream action failed';
      res.write(
        `${JSON.stringify({
          type: 'error',
          message,
          correlationId: context?.correlationId,
        })}\n`,
      );
      (res as Response & { flush?: () => void }).flush?.();
      this.applicationLogger.writeStructured({
        level: 'error',
        kind: 'application',
        source: StreamResponseService.name,
        event: `${config.eventPrefix}.failed`,
        message,
        durationMs: Date.now() - startedAt,
        errorName: error instanceof Error ? error.name : 'Error',
        stack: error instanceof Error ? error.stack || null : null,
      });
    } finally {
      res.end();
    }
  }
}
