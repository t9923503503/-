import { describe, expect, it } from 'vitest';

import {
  buildGoV2TelegramRecipientDedupKey,
  extractGoV2NotificationEntryScope,
  isValidPrivateTelegramChatId,
  renderGoV2TelegramNotification,
} from '../../web/lib/go-v2/notification-delivery';

const NOTIFICATION_ID = '123e4567-e89b-42d3-a456-426614174000';
const ENTRY_A = '123e4567-e89b-42d3-a456-426614174001';
const ENTRY_B = '123e4567-e89b-42d3-a456-426614174002';

describe('GO V2 notification delivery', () => {
  it('narrows recipients only from explicit entry/team fields', () => {
    expect(extractGoV2NotificationEntryScope({
      operationId: '123e4567-e89b-42d3-a456-426614174099',
      result: {
        matchId: '123e4567-e89b-42d3-a456-426614174098',
        winnerEntryId: ENTRY_B,
        teamAId: ENTRY_A,
        affectedTeams: [{ id: ENTRY_A }, { id: ENTRY_B }],
      },
    })).toEqual({ mode: 'affected', entryIds: [ENTRY_A, ENTRY_B] });

    expect(extractGoV2NotificationEntryScope({
      operationId: '123e4567-e89b-42d3-a456-426614174099',
      result: { matchId: '123e4567-e89b-42d3-a456-426614174098' },
    })).toEqual({ mode: 'tournament', entryIds: [] });
  });

  it('accepts only positive private Telegram chat ids', () => {
    expect(isValidPrivateTelegramChatId('123456789')).toBe(true);
    expect(isValidPrivateTelegramChatId(' 123456789 ')).toBe(true);
    expect(isValidPrivateTelegramChatId('tournament:123')).toBe(false);
    expect(isValidPrivateTelegramChatId('-100123456789')).toBe(false);
    expect(isValidPrivateTelegramChatId('123 456')).toBe(false);
  });

  it('creates deterministic per-recipient bridge keys without exposing chat ids', () => {
    const first = buildGoV2TelegramRecipientDedupKey(NOTIFICATION_ID, '123456789');
    expect(first).toBe(buildGoV2TelegramRecipientDedupKey(NOTIFICATION_ID, '123456789'));
    expect(first).not.toBe(buildGoV2TelegramRecipientDedupKey(NOTIFICATION_ID, '987654321'));
    expect(first).not.toContain('123456789');
    expect(() => buildGoV2TelegramRecipientDedupKey(NOTIFICATION_ID, 'tournament:123')).toThrow();
  });

  it.each([
    ['draw.commit', {}, 'Жеребьёвка групп опубликована.'],
    ['bracket.lock', {}, 'Сетка плей-офф опубликована.'],
    ['schedule.generate.commit', {}, 'Расписание опубликовано.'],
    ['schedule.replan.commit', {}, 'Расписание обновлено.'],
    ['schedule.policy.commit', {}, 'временно изменены разрешённые корты'],
    ['stage.rules.commit', {}, 'Правила будущего раунда изменены.'],
    ['publication_state_changed', { toState: 'published' }, 'живое расписание турнира опубликованы'],
    ['publication_state_changed', { toState: 'unpublished' }, 'Публичный доступ к турниру временно закрыт'],
    ['match.result.revise', {}, 'Результат матча обновлён.'],
    ['attendance.commit', { result: { toState: 'checked_in' } }, 'команда на месте'],
    ['disruption.commit', { result: { disruptionKind: 'court_close' } }, 'Корт закрыт.'],
  ])('renders %s from domain data without requiring payload.text', (eventType, payload, expected) => {
    const text = renderGoV2TelegramNotification({
      tournamentId: NOTIFICATION_ID,
      tournamentName: '  Кубок\nLPVolley  ',
      eventType,
      payload,
      origin: 'https://lpvolley.ru',
    });
    expect(text).toContain('🏐 Кубок LPVolley');
    expect(text).toContain(expected);
    expect(text).toContain(`/calendar/${NOTIFICATION_ID}/live`);
  });
});
