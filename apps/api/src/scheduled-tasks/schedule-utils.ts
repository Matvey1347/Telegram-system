import type { ScheduledTaskSchedule } from '@telegram-system/shared';

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTimeZone(timezone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function normalizeSchedule(
  schedule: ScheduledTaskSchedule,
): ScheduledTaskSchedule {
  if (!isValidTimeZone(schedule.timezone)) {
    throw new Error('Invalid timezone');
  }
  if (schedule.frequency === 'DAILY') {
    if (!TIME_RE.test(schedule.time)) throw new Error('Invalid schedule time');
    return schedule;
  }
  if (
    !Number.isInteger(schedule.intervalMinutes) ||
    schedule.intervalMinutes < 1 ||
    schedule.intervalMinutes > 1440
  ) {
    throw new Error('Invalid interval minutes');
  }
  return schedule;
}

export function computeNextRunAt(
  schedule: ScheduledTaskSchedule,
  now = new Date(),
): Date {
  const normalized = normalizeSchedule(schedule);
  if (normalized.frequency === 'INTERVAL') {
    return new Date(now.getTime() + normalized.intervalMinutes * 60_000);
  }
  return nextDailyRun(normalized.time, normalized.timezone, now);
}

export function isDue(
  schedule: ScheduledTaskSchedule,
  lastEvaluationAt: Date | null,
  now = new Date(),
) {
  if (!lastEvaluationAt) return true;
  return (
    computeNextRunAt(schedule, lastEvaluationAt).getTime() <= now.getTime()
  );
}

function partsInZone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const byType = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return {
    year: Number(byType.year),
    month: Number(byType.month),
    day: Number(byType.day),
    hour: Number(byType.hour),
    minute: Number(byType.minute),
    second: Number(byType.second),
  };
}

function addDays(year: number, month: number, day: number, days: number) {
  const date = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function nextDailyRun(time: string, timezone: string, now: Date) {
  const [hour, minute] = time.split(':').map(Number);
  const localNow = partsInZone(now, timezone);
  const todayCandidate = zonedDateTimeToUtc(
    localNow.year,
    localNow.month,
    localNow.day,
    hour,
    minute,
    timezone,
  );
  if (todayCandidate.getTime() > now.getTime()) return todayCandidate;
  const tomorrow = addDays(localNow.year, localNow.month, localNow.day, 1);
  return zonedDateTimeToUtc(
    tomorrow.year,
    tomorrow.month,
    tomorrow.day,
    hour,
    minute,
    timezone,
  );
}

function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
) {
  const target = { year, month, day, hour, minute };
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const start = guess - 36 * 60 * 60_000;
  const end = guess + 36 * 60 * 60_000;
  for (let value = start; value <= end; value += 60_000) {
    const parts = partsInZone(new Date(value), timezone);
    if (
      parts.year === target.year &&
      parts.month === target.month &&
      parts.day === target.day &&
      parts.hour === target.hour &&
      parts.minute === target.minute
    ) {
      return new Date(value);
    }
  }
  return new Date(guess);
}

export function sanitizeSchedulerError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/api[_-]?hash[=:]\S+/gi, 'api_hash=[redacted]')
    .replace(/password[=:]\S+/gi, 'password=[redacted]')
    .slice(0, 1000);
}
