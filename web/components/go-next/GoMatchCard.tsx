'use client';

import type { GoJudgeMatchView, GoMatchView } from '@/lib/go-next/types';

type MatchLike =
  | GoMatchView
  | (GoJudgeMatchView & {
      groupLabel?: string | null;
      bracketLevel?: string | null;
      bracketRound?: number | null;
    });

function renderScore(scoreA: number[], scoreB: number[]): string {
  if (!scoreA.length && !scoreB.length) return '—';
  const len = Math.max(scoreA.length, scoreB.length);
  const parts: string[] = [];
  for (let i = 0; i < len; i += 1) {
    parts.push(`${scoreA[i] ?? 0}:${scoreB[i] ?? 0}`);
  }
  return parts.join(' · ');
}

export function GoMatchCard({ match }: { match: MatchLike }) {
  const teamA = 'teamA' in match ? match.teamA?.label ?? 'TBD' : 'TBD';
  const teamB = 'teamB' in match ? match.teamB?.label ?? 'TBD' : 'TBD';
  const context =
    'context' in match && match.context
      ? match.context
      : match.groupLabel
        ? `Группа ${match.groupLabel}`
        : match.bracketLevel
          ? `${String(match.bracketLevel).toUpperCase()} · ${match.bracketRound ?? ''}`
          : 'Матч';

  return (
    <article className="rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="flex items-center justify-between gap-2 text-xs text-white/60">
        <span>#{match.matchNo}</span>
        <span>{context}</span>
      </div>
      <div className="mt-2 space-y-1 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-white">{teamA}</span>
          <span className="text-white/75">{match.setsA}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-white">{teamB}</span>
          <span className="text-white/75">{match.setsB}</span>
        </div>
      </div>
      <div className="mt-2 text-xs text-white/60">{renderScore(match.scoreA, match.scoreB)}</div>
    </article>
  );
}
