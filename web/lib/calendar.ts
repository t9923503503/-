import type { Tournament } from './types';
import { hasTournamentAvailableSpots } from './tournament-status';

type SearchParamValue = string | string[] | undefined;

const LEVEL_ORDER = ['hard', 'advance', 'medium', 'easy'];
const STATUS_VALUES = new Set<Tournament['status'] | 'all'>([
  'all',
  'open',
  'full',
  'finished',
  'cancelled',
]);

export interface CalendarFilterState {
  query: string;
  month: string;
  format: string;
  division: string;
  level: string;
  status: Tournament['status'] | 'all';
  available: boolean;
}

export interface CalendarFilterOptions {
  months: string[];
  formats: string[];
  divisions: string[];
  levels: string[];
}

function readSingleValue(value: SearchParamValue): string {
  if (Array.isArray(value)) return String(value[0] || '');
  return String(value || '');
}

function normalizeString(value: string | null | undefined): string {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeNeedle(value: string | null | undefined): string {
  return normalizeString(value).toLowerCase();
}

function getTimeSortValue(time: string | null | undefined): number {
  const match = String(time || '').match(/(\d{1,2}):(\d{2})/);
  if (!match) return Number.POSITIVE_INFINITY;
  return Number(match[1]) * 60 + Number(match[2]);
}

function compareLabels(a: string, b: string): number {
  return a.localeCompare(b, 'ru', { sensitivity: 'base' });
}

export function normalizeCalendarFilters(
  input: Record<string, SearchParamValue> = {}
): CalendarFilterState {
  const rawStatus = readSingleValue(input.status).trim().toLowerCase();
  const status = STATUS_VALUES.has(rawStatus as CalendarFilterState['status'])
    ? (rawStatus as CalendarFilterState['status'])
    : 'all';
  const availableValue = readSingleValue(input.available).trim().toLowerCase();

  return {
    query: normalizeString(readSingleValue(input.q)),
    month: normalizeString(readSingleValue(input.month)),
    format: normalizeString(readSingleValue(input.format)),
    division: normalizeString(readSingleValue(input.division)),
    level: normalizeString(readSingleValue(input.level)).toLowerCase(),
    status,
    available:
      availableValue === '1' ||
      availableValue === 'true' ||
      availableValue === 'yes' ||
      availableValue === 'on',
  };
}

export function hasActiveCalendarFilters(filters: CalendarFilterState): boolean {
  return Boolean(
    filters.query ||
      filters.month ||
      filters.format ||
      filters.division ||
      filters.level ||
      filters.status !== 'all' ||
      filters.available
  );
}

export function getTournamentMonthKey(date: string | null | undefined): string {
  const value = String(date || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.slice(0, 7) : '';
}

export function formatTournamentMonthLabel(month: string): string {
  if (!/^\d{4}-\d{2}$/.test(month)) return month;
  const date = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(date.getTime())) return month;

  const label = new Intl.DateTimeFormat('ru-RU', {
    month: 'long',
    year: 'numeric',
  }).format(date);

  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function getCalendarFilterOptions(
  tournaments: Tournament[]
): CalendarFilterOptions {
  const months = Array.from(
    new Set(tournaments.map((tournament) => getTournamentMonthKey(tournament.date)).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  const formats = Array.from(
    new Set(tournaments.map((tournament) => normalizeString(tournament.format)).filter(Boolean))
  ).sort(compareLabels);

  const divisions = Array.from(
    new Set(tournaments.map((tournament) => normalizeString(tournament.division)).filter(Boolean))
  ).sort(compareLabels);

  const levels = Array.from(
    new Set(tournaments.map((tournament) => normalizeNeedle(tournament.level)).filter(Boolean))
  ).sort((a, b) => {
    const aIndex = LEVEL_ORDER.indexOf(a);
    const bIndex = LEVEL_ORDER.indexOf(b);
    if (aIndex === -1 && bIndex === -1) return compareLabels(a, b);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  return { months, formats, divisions, levels };
}

export function filterCalendarTournaments(
  tournaments: Tournament[],
  filters: CalendarFilterState
): Tournament[] {
  const queryNeedle = normalizeNeedle(filters.query);

  return tournaments.filter((tournament) => {
    if (filters.status !== 'all' && tournament.status !== filters.status) {
      return false;
    }

    if (filters.available) {
      if (tournament.status !== 'open' || !hasTournamentAvailableSpots(tournament)) {
        return false;
      }
    }

    if (filters.month && getTournamentMonthKey(tournament.date) !== filters.month) {
      return false;
    }

    if (
      filters.format &&
      normalizeNeedle(tournament.format) !== normalizeNeedle(filters.format)
    ) {
      return false;
    }

    if (
      filters.division &&
      normalizeNeedle(tournament.division) !== normalizeNeedle(filters.division)
    ) {
      return false;
    }

    if (filters.level && normalizeNeedle(tournament.level) !== filters.level) {
      return false;
    }

    if (queryNeedle) {
      const haystack = [
        tournament.name,
        tournament.location,
        tournament.format,
        tournament.division,
      ]
        .map((value) => normalizeNeedle(value))
        .join(' ');

      if (!haystack.includes(queryNeedle)) {
        return false;
      }
    }

    return true;
  });
}

export function compareTournamentsForCalendar(
  a: Pick<Tournament, 'status' | 'date' | 'time' | 'name'>,
  b: Pick<Tournament, 'status' | 'date' | 'time' | 'name'>
): number {
  const aUpcoming = a.status === 'open' || a.status === 'full';
  const bUpcoming = b.status === 'open' || b.status === 'full';

  if (aUpcoming !== bUpcoming) {
    return aUpcoming ? -1 : 1;
  }

  const dateCompare = String(a.date || '').localeCompare(String(b.date || ''));
  if (dateCompare !== 0) {
    return aUpcoming ? dateCompare : -dateCompare;
  }

  const aTime = getTimeSortValue(a.time);
  const bTime = getTimeSortValue(b.time);
  if (aTime !== bTime) {
    return aUpcoming ? aTime - bTime : bTime - aTime;
  }

  return compareLabels(String(a.name || ''), String(b.name || ''));
}

export function sortTournamentsForCalendar(tournaments: Tournament[]): Tournament[] {
  return [...tournaments].sort(compareTournamentsForCalendar);
}

export function buildTournamentEventKey(
  tournament: Pick<Tournament, 'id' | 'date' | 'time' | 'location' | 'format'>
): string {
  if (!tournament.date || !tournament.format) {
    return `solo||${tournament.id}`;
  }

  return [
    tournament.date,
    normalizeNeedle(tournament.time),
    normalizeNeedle(tournament.location),
    normalizeNeedle(tournament.format),
  ].join('||');
}

export function sortTournamentGroupsForCalendar<
  T extends Pick<Tournament, 'status' | 'date' | 'time'> & { baseName: string }
>(groups: T[]): T[] {
  return [...groups].sort((a, b) =>
    compareTournamentsForCalendar(
      { status: a.status, date: a.date, time: a.time, name: a.baseName },
      { status: b.status, date: b.date, time: b.time, name: b.baseName }
    )
  );
}
