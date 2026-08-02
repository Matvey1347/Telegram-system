function getParts(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(date);
  const map = new Map(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(map.get('year')),
    month: Number(map.get('month')),
    day: Number(map.get('day')),
    hour: Number(map.get('hour')),
    minute: Number(map.get('minute')),
    second: Number(map.get('second')),
  };
}

export function zonedDateTimeToUtc(
  dateKey: string,
  time: string,
  timezone: string,
): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  for (let index = 0; index < 4; index += 1) {
    const parts = getParts(guess, timezone);
    const desired = Date.UTC(year, month - 1, day, hour, minute, 0);
    const actual = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const delta = desired - actual;
    if (delta === 0) return guess;
    guess = new Date(guess.getTime() + delta);
  }
  return guess;
}

export function utcDateKey(date: Date, timezone: string) {
  const parts = getParts(date, timezone);
  return `${parts.year.toString().padStart(4, '0')}-${parts.month
    .toString()
    .padStart(2, '0')}-${parts.day.toString().padStart(2, '0')}`;
}

export function utcTimeKey(date: Date, timezone: string) {
  const parts = getParts(date, timezone);
  return `${parts.hour.toString().padStart(2, '0')}:${parts.minute
    .toString()
    .padStart(2, '0')}`;
}
