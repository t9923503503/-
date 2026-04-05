import { describe, expect, it } from 'vitest';
import {
  buildThaiSpectatorBoardUrl,
  buildTournamentCalendarContentDisposition,
  buildTournamentCalendarFileName,
  buildTournamentIcsContent,
  buildTournamentMapsUrl,
} from '../../web/lib/tournament-links.ts';

describe('tournament links helpers', () => {
  it('builds yandex maps url for the location', () => {
    expect(buildTournamentMapsUrl('Малибу Сургут')).toBe(
      'https://yandex.ru/maps/?text=%D0%9C%D0%B0%D0%BB%D0%B8%D0%B1%D1%83%20%D0%A1%D1%83%D1%80%D0%B3%D1%83%D1%82'
    );
  });

  it('builds Thai spectator board path', () => {
    expect(buildThaiSpectatorBoardUrl('a19522bb-864e-4520-8182-61e035c27894')).toBe(
      '/live/thai/a19522bb-864e-4520-8182-61e035c27894',
    );
  });

  it('creates stable calendar filenames', () => {
    expect(
      buildTournamentCalendarFileName({
        name: 'Round Robin Malibu',
        date: '2026-04-10',
      })
    ).toBe('lpvolley-round-robin-malibu-2026-04-10.ics');
  });

  it('builds byte-safe content disposition for cyrillic names', () => {
    expect(
      buildTournamentCalendarContentDisposition({
        name: 'Малибу Микст',
        date: '2026-04-10',
      })
    ).toBe(
      "attachment; filename=\"lpvolley-2026-04-10.ics\"; filename*=UTF-8''lpvolley-%D0%BC%D0%B0%D0%BB%D0%B8%D0%B1%D1%83-%D0%BC%D0%B8%D0%BA%D1%81%D1%82-2026-04-10.ics"
    );
  });

  it('builds timed ICS events when tournament time is present', () => {
    const content = buildTournamentIcsContent({
      id: 'tournament-1',
      name: 'Round Robin Malibu',
      date: '2026-04-10',
      time: '19:00',
      location: 'Малибу',
      description: 'Сильный вечерний турнир',
    });

    expect(content).toContain('BEGIN:VCALENDAR');
    expect(content).toContain('SUMMARY:Round Robin Malibu');
    expect(content).toContain('DTSTART;TZID=Asia/Yekaterinburg:20260410T190000');
    expect(content).toContain('DTEND;TZID=Asia/Yekaterinburg:20260410T220000');
    expect(content).toContain('LOCATION:Малибу');
    expect(content).toContain('DESCRIPTION:Сильный вечерний турнир');
  });

  it('falls back to all-day ICS events when time is missing', () => {
    const content = buildTournamentIcsContent({
      id: 'tournament-2',
      name: 'Beach Day',
      date: '2026-05-01',
      time: '',
      location: '',
      description: '',
    });

    expect(content).toContain('DTSTART;VALUE=DATE:20260501');
    expect(content).toContain('DTEND;VALUE=DATE:20260502');
  });
});
