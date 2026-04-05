import type { Tournament } from './types';

const ICS_TIMEZONE = 'Asia/Yekaterinburg';
const DEFAULT_DURATION_MINUTES = 180;

type TournamentLinkLike = Pick<
  Tournament,
  'id' | 'name' | 'date' | 'time' | 'location' | 'description'
>;

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function slugify(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function escapeIcsText(value: string): string {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function parseTournamentTime(time: string | null | undefined): {
  hours: number;
  minutes: number;
} | null {
  const match = String(time || '').match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return { hours, minutes };
}

function formatDateStamp(date: Date): string {
  return [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate()),
    'T',
    pad2(date.getHours()),
    pad2(date.getMinutes()),
    pad2(date.getSeconds()),
  ].join('');
}

function formatUtcStamp(date: Date): string {
  return [
    date.getUTCFullYear(),
    pad2(date.getUTCMonth() + 1),
    pad2(date.getUTCDate()),
    'T',
    pad2(date.getUTCHours()),
    pad2(date.getUTCMinutes()),
    pad2(date.getUTCSeconds()),
    'Z',
  ].join('');
}

function buildEventDate(date: string, time: { hours: number; minutes: number } | null): Date {
  if (!time) {
    return new Date(`${date}T00:00:00`);
  }
  return new Date(`${date}T${pad2(time.hours)}:${pad2(time.minutes)}:00`);
}

export function buildTournamentMapsUrl(location: string | null | undefined): string {
  const value = String(location || '').trim();
  if (!value) return '';
  return `https://yandex.ru/maps/?text=${encodeURIComponent(value)}`;
}

/** Публичное табло Thai Next (зрители, итоги R1/R2). */
export function buildThaiSpectatorBoardUrl(tournamentId: string): string {
  const id = String(tournamentId || '').trim();
  return `/live/thai/${encodeURIComponent(id)}`;
}

export function buildTournamentCalendarFileName(
  tournament: Pick<TournamentLinkLike, 'name' | 'date'>
): string {
  const slug = slugify(tournament.name || 'tournament') || 'tournament';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(tournament.date || ''))
    ? String(tournament.date)
    : 'event';
  return `lpvolley-${slug}-${date}.ics`;
}

function sanitizeAsciiFileName(value: string): string {
  return String(value || '')
    .replace(/[^\x20-\x7E]+/g, '-')
    .replace(/["\\]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function buildTournamentCalendarContentDisposition(
  tournament: Pick<TournamentLinkLike, 'name' | 'date'>
): string {
  const fileName = buildTournamentCalendarFileName(tournament);
  const asciiFallback =
    sanitizeAsciiFileName(fileName) || 'lpvolley-tournament.ics';

  return [
    'attachment',
    `filename=\"${asciiFallback}\"`,
    `filename*=UTF-8''${encodeURIComponent(fileName)}`,
  ].join('; ');
}

export function buildTournamentIcsContent(tournament: TournamentLinkLike): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(tournament.date || ''))) {
    throw new Error('Tournament date is required for ICS export');
  }

  const time = parseTournamentTime(tournament.time);
  const startDate = buildEventDate(tournament.date, time);
  const endDate = new Date(
    startDate.getTime() + (time ? DEFAULT_DURATION_MINUTES : 24 * 60) * 60 * 1000
  );
  const uid = `${String(tournament.id || tournament.name || 'event')}@lpvolley.ru`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LPVolley//Tournaments//RU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText('Лютые Пляжники')}`,
    `X-WR-TIMEZONE:${ICS_TIMEZONE}`,
    'BEGIN:VEVENT',
    `UID:${escapeIcsText(uid)}`,
    `DTSTAMP:${formatUtcStamp(new Date())}`,
    time
      ? `DTSTART;TZID=${ICS_TIMEZONE}:${formatDateStamp(startDate)}`
      : `DTSTART;VALUE=DATE:${String(tournament.date).replace(/-/g, '')}`,
    time
      ? `DTEND;TZID=${ICS_TIMEZONE}:${formatDateStamp(endDate)}`
      : `DTEND;VALUE=DATE:${formatDateStamp(endDate).slice(0, 8)}`,
    `SUMMARY:${escapeIcsText(tournament.name || 'Турнир LPVolley')}`,
    tournament.location
      ? `LOCATION:${escapeIcsText(tournament.location)}`
      : '',
    tournament.description
      ? `DESCRIPTION:${escapeIcsText(tournament.description)}`
      : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);

  return `${lines.join('\r\n')}\r\n`;
}
