function dateTimePartsInZone(date: Date, timezone: string): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date).map((part) => [part.type, part.value]),
  );
}

export function localDateTimeValue(date = new Date(), timezone = 'Asia/Yekaterinburg'): string {
  const parts = dateTimePartsInZone(date, timezone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** Convert an HTML datetime-local wall clock in an IANA timezone to UTC. */
export function zonedDateTimeToIso(value: string, timezone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = '00'] = match;
  const desiredWallClock = Date.UTC(
    Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second),
  );
  let instant = desiredWallClock;
  // Iterate because an IANA timezone offset can change around DST boundaries.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = dateTimePartsInZone(new Date(instant), timezone);
    const representedWallClock = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second),
    );
    const correction = desiredWallClock - representedWallClock;
    instant += correction;
    if (correction === 0) break;
  }
  const resolved = new Date(instant);
  return localDateTimeValue(resolved, timezone) === value.slice(0, 16)
    ? resolved.toISOString()
    : null;
}
