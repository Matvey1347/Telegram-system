import { Logger } from '@nestjs/common';
import { MemoryMonitorService } from './memory-monitor.service';

const MB = 1024 * 1024;

describe('MemoryMonitorService', () => {
  const originalUptime = process.uptime;
  const originalWarnThreshold = process.env.MEMORY_MONITOR_WARN_RSS_MB;

  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let memoryUsageSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    memoryUsageSpy = jest.spyOn(process, 'memoryUsage');
    process.uptime = jest.fn(() => 12.4);
    process.env.MEMORY_MONITOR_WARN_RSS_MB = '400';
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    memoryUsageSpy.mockRestore();
    process.uptime = originalUptime;
    if (originalWarnThreshold === undefined) {
      delete process.env.MEMORY_MONITOR_WARN_RSS_MB;
    } else {
      process.env.MEMORY_MONITOR_WARN_RSS_MB = originalWarnThreshold;
    }
  });

  it('logs memory usage as structured JSON below the warning threshold', () => {
    memoryUsageSpy.mockReturnValue({
      rss: 256 * MB,
      heapTotal: 90.25 * MB,
      heapUsed: 64.12 * MB,
      external: 8 * MB,
      arrayBuffers: 2.5 * MB,
    });

    new MemoryMonitorService().logMemory('manual_check', {
      operation: 'import',
    });

    expect(warnSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(logSpy.mock.calls[0][0] as string)).toEqual({
      event: 'manual_check',
      rssMb: 256,
      heapUsedMb: 64.1,
      heapTotalMb: 90.3,
      externalMb: 8,
      arrayBuffersMb: 2.5,
      uptimeSeconds: 12,
      operation: 'import',
    });
  });

  it('warns when RSS reaches the configured threshold', () => {
    memoryUsageSpy.mockReturnValue({
      rss: 401 * MB,
      heapTotal: 110 * MB,
      heapUsed: 88 * MB,
      external: 12 * MB,
      arrayBuffers: 4 * MB,
    });

    new MemoryMonitorService().logMemory('interval');

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(warnSpy.mock.calls[0][0] as string)).toMatchObject({
      event: 'interval',
      rssMb: 401,
    });
  });
});
