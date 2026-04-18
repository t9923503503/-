'use client';

import { useEffect, useMemo, useState } from 'react';
import type { GoGroupView, GoTeamView } from '@/lib/go-next/types';

export type GoSeedDraft = Record<string, GoTeamView[]>;

function draftStrength(teams: GoTeamView[]): number {
  return teams.reduce((sum, team) => sum + (team.ratingSnapshot || 0), 0);
}

interface CollisionInfo {
  level: string;
  teamA: GoTeamView;
  teamB: GoTeamView;
  posA: number;
  posB: number;
  seedDelta: number;
  swapCandidate: { teamId: string; label: string; pos: number } | null;
}

/**
 * Detect first-round bracket collisions (same-group teams meeting in round 1).
 * Returns list of conflicts with optional safe swap candidate (Δseed ≤ 2).
 */
function detectBracketCollisions(draft: GoSeedDraft, groups: GoGroupView[]): CollisionInfo[] {
  // Build group membership map: teamId → groupId
  const teamGroupMap = new Map<string, string>();
  for (const group of groups) {
    for (const team of group.teams) {
      teamGroupMap.set(team.teamId, group.groupId);
    }
  }

  const collisions: CollisionInfo[] = [];

  for (const [level, teams] of Object.entries(draft)) {
    // Round 1 pairs: positions (1,2), (3,4), (5,6), ...
    for (let i = 0; i < teams.length - 1; i += 2) {
      const teamA = teams[i];
      const teamB = teams[i + 1];
      if (!teamA || !teamB) continue;

      const groupA = teamGroupMap.get(teamA.teamId);
      const groupB = teamGroupMap.get(teamB.teamId);

      if (groupA && groupB && groupA === groupB) {
        // Collision! Look for a safe swap candidate outside this pair
        const posA = i + 1; // 1-based position
        const posB = i + 2;

        let swapCandidate: CollisionInfo['swapCandidate'] = null;

        // Try to find a team that can swap with teamB (in posB) — Δseed ≤ 2
        for (let j = 0; j < teams.length; j++) {
          if (j === i || j === i + 1) continue;
          const candidate = teams[j];
          if (!candidate) continue;
          const candidateGroup = teamGroupMap.get(candidate.teamId);
          if (candidateGroup === groupA) continue; // same group — still collision
          const delta = Math.abs((j + 1) - posB);
          if (delta <= 2) {
            swapCandidate = { teamId: candidate.teamId, label: candidate.label, pos: j + 1 };
            break;
          }
        }

        collisions.push({ level, teamA, teamB, posA, posB, seedDelta: Math.abs(posA - posB), swapCandidate });
      }
    }
  }

  return collisions;
}

export function GoSeedEditor({
  initialDraft,
  groups,
  onConfirm,
}: {
  initialDraft: GoSeedDraft;
  groups?: GoGroupView[];
  onConfirm: (draft: GoSeedDraft) => void;
}) {
  const [draft, setDraft] = useState<GoSeedDraft>(initialDraft);
  const [dragData, setDragData] = useState<{ fromGroup: string; teamId: string } | null>(null);
  const [swappedPositions, setSwappedPositions] = useState<Set<string>>(new Set());

  useEffect(() => {
    setDraft(initialDraft);
    setDragData(null);
  }, [initialDraft]);

  const draftGroups = useMemo(() => Object.keys(draft), [draft]);
  const strengths = useMemo(
    () =>
      draftGroups.map((group) => ({
        group,
        value: draftStrength(draft[group] ?? []),
      })),
    [draft, draftGroups],
  );

  const maxStrength = Math.max(...strengths.map((item) => item.value), 0);
  const minStrength = Math.min(...strengths.map((item) => item.value), 0);
  const spread = maxStrength - minStrength;

  const collisions = useMemo(
    () => (groups?.length ? detectBracketCollisions(draft, groups) : []),
    [draft, groups],
  );

  function moveTeam(teamId: string, fromGroup: string, toGroup: string) {
    if (fromGroup === toGroup) return;
    setDraft((current) => {
      const source = [...(current[fromGroup] ?? [])];
      const target = [...(current[toGroup] ?? [])];
      const index = source.findIndex((team) => team.teamId === teamId);
      if (index === -1) return current;
      const [team] = source.splice(index, 1);
      target.push(team);
      return {
        ...current,
        [fromGroup]: source,
        [toGroup]: target,
      };
    });
  }

  function swapInLevel(level: string, posA: number, posB: number) {
    // posA, posB are 1-based
    setDraft((current) => {
      const teams = [...(current[level] ?? [])];
      const idxA = posA - 1;
      const idxB = posB - 1;
      if (idxA < 0 || idxB < 0 || idxA >= teams.length || idxB >= teams.length) return current;
      [teams[idxA], teams[idxB]] = [teams[idxB], teams[idxA]];
      return { ...current, [level]: teams };
    });

    // Yellow highlight for 2 seconds
    const key = `${level}:${posA}:${posB}`;
    setSwappedPositions((prev) => new Set([...prev, key]));
    setTimeout(() => {
      setSwappedPositions((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }, 2000);
  }

  return (
    <section className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-white">Preview посева</h4>
        <button
          type="button"
          onClick={() => onConfirm(draft)}
          className="rounded-lg border border-brand/60 bg-brand/20 px-3 py-1.5 text-xs font-semibold text-brand"
        >
          Подтвердить посев
        </button>
      </div>

      <div className="text-xs text-white/60">
        Дисбаланс групп: <span className={spread > 200 ? 'text-amber-300' : 'text-emerald-300'}>{spread}</span>
      </div>

      {/* Anti-collision alerts */}
      {collisions.length > 0 ? (
        <div className="space-y-2">
          {collisions.map((col, idx) => (
            <div
              key={idx}
              className="flex items-start justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
            >
              <div>
                <span className="font-semibold">⚠️ Повторный матч [{col.level}]:</span>{' '}
                {col.teamA.label} vs {col.teamB.label}
                {col.swapCandidate ? (
                  <span className="ml-1 text-amber-300/70">
                    — рекомендуется поменять с {col.swapCandidate.label} (Δ={Math.abs(col.posB - col.swapCandidate.pos)})
                  </span>
                ) : (
                  <span className="ml-1 text-red-400/70"> — разведение невозможно (Δseed &gt; 2)</span>
                )}
              </div>
              {col.swapCandidate ? (
                <button
                  type="button"
                  onClick={() => swapInLevel(col.level, col.posB, col.swapCandidate!.pos)}
                  className="shrink-0 rounded border border-amber-400/40 px-2 py-1 text-[10px] font-semibold text-amber-300 hover:bg-amber-400/10"
                >
                  Разместить
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {draftGroups.map((group) => (
          <div
            key={group}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const payload = dragData;
              if (!payload) return;
              moveTeam(payload.teamId, payload.fromGroup, group);
              setDragData(null);
            }}
            className="rounded-lg border border-white/10 bg-white/5 p-2"
          >
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/70">{group}</div>
            <div className="space-y-2">
              {(draft[group] ?? []).map((team, idx) => {
                const pos = idx + 1;
                const isSwapped = [...swappedPositions].some((k) => {
                  const [lvl, pA, pB] = k.split(':');
                  return lvl === group && (Number(pA) === pos || Number(pB) === pos);
                });
                return (
                  <div
                    key={team.teamId}
                    draggable
                    onDragStart={() => setDragData({ fromGroup: group, teamId: team.teamId })}
                    className={[
                      'cursor-grab rounded border px-2 py-1 text-xs transition-colors duration-700',
                      isSwapped ? 'border-yellow-400 bg-yellow-400/10' : 'border-white/10 bg-black/20',
                    ].join(' ')}
                  >
                    <div className="font-medium text-white">{team.label}</div>
                    <div className="text-white/50">Rtg: {team.ratingSnapshot}</div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
