import { enrichTournamentRuntimeState, getTournamentSpotsLeft } from './tournament-status';

type AdminTournamentStatusLike = {
  date?: string | null;
  time?: string | null;
  capacity?: number | null;
  participantCount?: number | null;
  status?: string | null;
};

export function enrichAdminTournamentRuntimeState<T extends AdminTournamentStatusLike>(
  tournament: T,
  now = new Date(),
): T & {
  status: string;
  registrationClosed: boolean;
  spotsLeft: number | null;
} {
  const rawStatus = String(tournament.status ?? 'open').trim().toLowerCase();
  if (rawStatus === 'draft') {
    return {
      ...tournament,
      status: 'draft',
      registrationClosed: false,
      spotsLeft: getTournamentSpotsLeft({
        capacity: Number(tournament.capacity ?? 0),
        participantCount: Number(tournament.participantCount ?? 0),
      }),
    };
  }

  return enrichTournamentRuntimeState(
    {
      ...tournament,
      date: String(tournament.date ?? ''),
      time: String(tournament.time ?? ''),
      capacity: Number(tournament.capacity ?? 0),
      participantCount: Number(tournament.participantCount ?? 0),
    },
    now,
  ) as T & {
    status: string;
    registrationClosed: boolean;
    spotsLeft: number | null;
  };
}
