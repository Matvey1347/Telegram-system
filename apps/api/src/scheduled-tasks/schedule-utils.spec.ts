import { computeNextRunAt, isDue } from './schedule-utils';

describe('scheduled task schedule utils', () => {
  it('computes interval next run', () => {
    expect(
      computeNextRunAt(
        {
          frequency: 'INTERVAL',
          intervalMinutes: 30,
          timezone: 'Europe/Warsaw',
        },
        new Date('2026-08-08T10:00:00.000Z'),
      ).toISOString(),
    ).toBe('2026-08-08T10:30:00.000Z');
  });

  it('computes daily next run in timezone', () => {
    expect(
      computeNextRunAt(
        { frequency: 'DAILY', time: '02:30', timezone: 'Europe/Warsaw' },
        new Date('2026-08-08T00:00:00.000Z'),
      ).toISOString(),
    ).toBe('2026-08-08T00:30:00.000Z');
  });

  it('uses the next local day after daily time passes', () => {
    expect(
      computeNextRunAt(
        { frequency: 'DAILY', time: '02:30', timezone: 'Europe/Warsaw' },
        new Date('2026-08-08T01:00:00.000Z'),
      ).toISOString(),
    ).toBe('2026-08-09T00:30:00.000Z');
  });

  it('handles DST-sensitive daily calculation', () => {
    expect(
      computeNextRunAt(
        { frequency: 'DAILY', time: '02:30', timezone: 'Europe/Warsaw' },
        new Date('2026-10-24T23:00:00.000Z'),
      ).toISOString(),
    ).toBe('2026-10-25T00:30:00.000Z');
  });

  it('detects due and not-due tasks', () => {
    const schedule = {
      frequency: 'INTERVAL' as const,
      intervalMinutes: 30,
      timezone: 'Europe/Warsaw',
    };
    expect(
      isDue(
        schedule,
        new Date('2026-08-08T10:00:00.000Z'),
        new Date('2026-08-08T10:29:00.000Z'),
      ),
    ).toBe(false);
    expect(
      isDue(
        schedule,
        new Date('2026-08-08T10:00:00.000Z'),
        new Date('2026-08-08T10:30:00.000Z'),
      ),
    ).toBe(true);
  });
});
