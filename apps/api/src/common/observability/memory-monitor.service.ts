import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';

export type MemoryMetadata = Record<
  string,
  string | number | boolean | null | undefined
>;

const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_WARN_RSS_MB = 400;

function readPositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

@Injectable()
export class MemoryMonitorService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger('MemoryMonitor');
  private readonly enabled = process.env.MEMORY_MONITOR_ENABLED !== 'false';
  private readonly intervalMs = readPositiveNumber(
    process.env.MEMORY_MONITOR_INTERVAL_MS,
    DEFAULT_INTERVAL_MS,
  );
  private readonly warnRssMb = readPositiveNumber(
    process.env.MEMORY_MONITOR_WARN_RSS_MB,
    DEFAULT_WARN_RSS_MB,
  );
  private timer?: NodeJS.Timeout;

  onApplicationBootstrap(): void {
    if (!this.enabled) return;

    this.logMemory('application_started');

    this.timer = setInterval(() => {
      this.logMemory('interval');
    }, this.intervalMs);

    this.timer.unref?.();
  }

  onApplicationShutdown(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  logMemory(event: string, metadata: MemoryMetadata = {}): void {
    const memory = process.memoryUsage();

    const payload = {
      event,
      rssMb: this.toMb(memory.rss),
      heapUsedMb: this.toMb(memory.heapUsed),
      heapTotalMb: this.toMb(memory.heapTotal),
      externalMb: this.toMb(memory.external),
      arrayBuffersMb: this.toMb(memory.arrayBuffers),
      uptimeSeconds: Math.round(process.uptime()),
      ...metadata,
    };

    const message = JSON.stringify(payload);
    if (payload.rssMb >= this.warnRssMb) {
      this.logger.warn(message);
      return;
    }

    this.logger.log(message);
  }

  async track<T>(
    operation: string,
    metadata: MemoryMetadata,
    callback: () => Promise<T>,
  ): Promise<T> {
    const startedAt = Date.now();
    const before = process.memoryUsage();

    this.logMemory('operation_started', {
      operation,
      ...metadata,
    });

    try {
      return await callback();
    } finally {
      const after = process.memoryUsage();

      this.logMemory('operation_finished', {
        operation,
        durationMs: Date.now() - startedAt,
        rssDeltaMb: this.toMb(after.rss - before.rss),
        heapUsedDeltaMb: this.toMb(after.heapUsed - before.heapUsed),
        externalDeltaMb: this.toMb(after.external - before.external),
        arrayBuffersDeltaMb: this.toMb(
          after.arrayBuffers - before.arrayBuffers,
        ),
        ...metadata,
      });
    }
  }

  private toMb(bytes: number): number {
    return Math.round((bytes / 1024 / 1024) * 10) / 10;
  }
}
