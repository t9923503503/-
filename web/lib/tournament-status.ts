import type { Tournament } from './types';

type TournamentStatus = Tournament['status'];

type TournamentStatusLike = Pick<
  Tournament,
  'date' | 'time' | 'capacity' | 'participantCount'
> & {
  status?: Tournament['status'] | string | null;
};

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function getTodayKey(now: Date): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

export function isTournamentDayInPast(
  date: string | null | undefined,
  now = new Date()
): boolean {
  const value = String(date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return value < getTodayKey(now);
}

export function getTournamentSpotsLeft(
  tournament: Pick<TournamentStatusLike, 'capacity' | 'participantCount'>
): number | null {
  const capacity = Number(tournament.capacity ?? 0);
  const participantCount = Math.max(0, Number(tournament.participantCount ?? 0));

  if (!Number.isFinite(capacity) || capacity <= 0) return null;
  return Math.max(0, capacity - participantCount);
}

export function hasTournamentAvailableSpots(
  tournament: Pick<TournamentStatusLike, 'capacity' | 'participantCount'>
): boolean {
  const spotsLeft = getTournamentSpotsLeft(tournament);
  return spotsLeft == null ? true : spotsLeft > 0;
}

export function resolveTournamentStatus(
  tournament: TournamentStatusLike,
  now = new Date()
): TournamentStatus {
  const baseStatus = String(tournament.status || 'open').toLowerCase();

  if (baseStatus === 'cancelled') return 'cancelled';
  if (baseStatus === 'finished') return 'finished';
  if (isTournamentDayInPast(tournament.date, now)) return 'finished';

  return hasTournamentAvailableSpots(tournament) ? 'open' : 'full';
}

export function enrichTournamentRuntimeState<T extends TournamentStatusLike>(
  tournament: T,
  now = new Date()
): T & {
  status: TournamentStatus;
  registrationClosed: boolean;
  spotsLeft: number | null;
} {
  const status = resolveTournamentStatus(tournament, now);
  const spotsLeft = getTournamentSpotsLeft(tournament);

  return {
    ...tournament,
    status,
    registrationClosed: status === 'finished' || status === 'cancelled',
    spotsLeft,
  };
}
