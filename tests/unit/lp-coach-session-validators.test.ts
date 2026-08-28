import { describe, expect, it } from 'vitest';
import {
  normalizeAttendance,
  normalizeCoachTrainingInput,
  normalizeKotyaraTrainingSync,
  validateCoachTrainingInput,
  validateKotyaraTrainingSync,
} from '../../web/lib/coach/session-validators';

describe('LP Coach session validators', () => {
  it('normalizes a Kotyara event and keeps source statuses separate', () => {
    const input = normalizeKotyaraTrainingSync({
      yclientsEventId: 42,
      title: 'Пляжная тренировка',
      startsAt: '2026-08-14T20:00:00+05:00',
      durationSeconds: 7200,
      capacity: 8,
      yclientsRecordsCount: 4,
      participants: [{ provider: 'telegram', externalId: 123, displayName: 'Настя', telegramStatus: 'going' }],
    });
    expect(input.eventKey).toBe('42');
    expect(input.endsAt).toBe('2026-08-14T17:00:00.000Z');
    expect(input.participants[0]).toMatchObject({ telegramStatus: 'going', yclientsStatus: 'unknown' });
    expect(validateKotyaraTrainingSync(input)).toBeNull();
  });

  it('rejects duplicate external identities in one snapshot', () => {
    const input = normalizeKotyaraTrainingSync({
      eventKey: 'yclients:42', title: 'Пляжная тренировка',
      startsAt: '2026-08-14T20:00:00+05:00', endsAt: '2026-08-14T22:00:00+05:00',
      participants: [
        { provider: 'telegram', externalId: '123' },
        { provider: 'telegram', externalId: '123' },
      ],
    });
    expect(validateKotyaraTrainingSync(input)).toContain('передан дважды');
  });

  it('rejects invalid time and YCLIENTS over-capacity data', () => {
    const invalidTime = normalizeKotyaraTrainingSync({ eventKey: 'x', title: 'Тренировка', startsAt: 'bad', endsAt: 'bad' });
    expect(validateKotyaraTrainingSync(invalidTime)).toBe('Некорректное время тренировки');
    const overCapacity = normalizeKotyaraTrainingSync({
      eventKey: 'x', title: 'Тренировка', startsAt: '2026-08-14T20:00:00+05:00', endsAt: '2026-08-14T22:00:00+05:00',
      capacity: 4, yclientsRecordsCount: 5,
    });
    expect(validateKotyaraTrainingSync(overCapacity)).toContain('больше вместимости');
  });

  it('validates manual sessions', () => {
    const input = normalizeCoachTrainingInput({
      title: 'Работа над приёмом', startsAt: '2026-08-14T20:00', endsAt: '2026-08-14T22:00', courtCount: 2,
    });
    expect(validateCoachTrainingInput(input)).toBeNull();
    expect(input).toMatchObject({ courtCount: 2, status: 'scheduled' });
  });

  it('fails closed to unknown attendance', () => {
    expect(normalizeAttendance('present')).toBe('present');
    expect(normalizeAttendance('telegram-going')).toBe('unknown');
  });
});
