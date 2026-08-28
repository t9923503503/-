import { describe, expect, it } from 'vitest';

import { localDateTimeValue, zonedDateTimeToIso } from '../../web/lib/go-v2/client-timezone';

describe('GO V2 tournament timezone conversion', () => {
  it('interprets datetime-local in the configured tournament timezone', () => {
    expect(zonedDateTimeToIso('2026-08-15T09:00', 'Asia/Yekaterinburg'))
      .toBe('2026-08-15T04:00:00.000Z');
    expect(localDateTimeValue(new Date('2026-08-15T04:00:00.000Z'), 'Asia/Yekaterinburg'))
      .toBe('2026-08-15T09:00');
  });

  it('rejects malformed and DST-skipped wall-clock values', () => {
    expect(zonedDateTimeToIso('not-a-date', 'Asia/Yekaterinburg')).toBeNull();
    expect(zonedDateTimeToIso('2026-03-29T02:30', 'Europe/Berlin')).toBeNull();
  });
});
