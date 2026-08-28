'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { METRIKA_GOALS, reachMetrikaGoal } from '@/lib/metrika-goals';

const TOURNAMENT_OPEN_SOURCE_KEY = 'lpv:tournament-open-source';

type TournamentMetrikaParams = {
  tournamentId: string;
  format?: string | null;
  division?: string | null;
  status?: string | null;
};

function buildTournamentParams(params: TournamentMetrikaParams) {
  return {
    tournamentId: params.tournamentId,
    format: params.format || null,
    division: params.division || null,
    status: params.status || null,
  };
}

function consumeTournamentOpenSource(tournamentId: string) {
  try {
    const raw = window.sessionStorage.getItem(TOURNAMENT_OPEN_SOURCE_KEY);
    if (!raw) return null;

    const payload = JSON.parse(raw) as { tournamentId?: string; source?: string; ts?: number };
    window.sessionStorage.removeItem(TOURNAMENT_OPEN_SOURCE_KEY);

    const fresh = typeof payload.ts === 'number' && Date.now() - payload.ts < 10000;
    if (fresh && payload.tournamentId === tournamentId) {
      return payload.source || null;
    }
  } catch {
    window.sessionStorage.removeItem(TOURNAMENT_OPEN_SOURCE_KEY);
  }
  return null;
}

function markTournamentOpenSource(tournamentId: string, source: string) {
  try {
    window.sessionStorage.setItem(
      TOURNAMENT_OPEN_SOURCE_KEY,
      JSON.stringify({ tournamentId, source, ts: Date.now() })
    );
  } catch {
    // Analytics attribution should never block navigation.
  }
}

export function TournamentOpenPageTracker(props: TournamentMetrikaParams) {
  useEffect(() => {
    reachMetrikaGoal(METRIKA_GOALS.tournamentOpen, {
      ...buildTournamentParams(props),
      source: consumeTournamentOpenSource(props.tournamentId) || 'page',
    });
  }, [props.tournamentId, props.format, props.division, props.status]);

  return null;
}

export function TournamentOpenLink({
  href,
  ariaLabel,
  className,
  children,
  ...params
}: TournamentMetrikaParams & {
  href: string;
  ariaLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className={className}
      onClick={() => {
        markTournamentOpenSource(params.tournamentId, 'card');
      }}
    >
      {children}
    </Link>
  );
}
