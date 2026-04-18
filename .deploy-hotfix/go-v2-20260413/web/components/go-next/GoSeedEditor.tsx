'use client';

import { useEffect, useMemo, useState } from 'react';
import type { GoTeamView } from '@/lib/go-next/types';

export type GoSeedDraft = Record<string, GoTeamView[]>;

function draftStrength(teams: GoTeamView[]): number {
  return teams.reduce((sum, team) => sum + (team.ratingSnapshot || 0), 0);
}

export function GoSeedEditor({
  initialDraft,
  onConfirm,
}: {
  initialDraft: GoSeedDraft;
  onConfirm: (draft: GoSeedDraft) => void;
}) {
  const [draft, setDraft] = useState<GoSeedDraft>(initialDraft);
  const [dragData, setDragData] = useState<{ fromGroup: string; teamId: string } | null>(null);

  useEffect(() => {
    setDraft(initialDraft);
    setDragData(null);
  }, [initialDraft]);

  const groups = useMemo(() => Object.keys(draft), [draft]);
  const strengths = useMemo(
    () =>
      groups.map((group) => ({
        group,
        value: draftStrength(draft[group] ?? []),
      })),
    [draft, groups],
  );

  const maxStrength = Math.max(...strengths.map((item) => item.value), 0);
  const minStrength = Math.min(...strengths.map((item) => item.value), 0);
  const spread = maxStrength - minStrength;

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

  return (
    <section className="rounded-lg border border-white/10 bg-black/20 p-3">
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

      <div className="mt-2 text-xs text-white/60">
        Дисбаланс групп: <span className={spread > 200 ? 'text-amber-300' : 'text-emerald-300'}>{spread}</span>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {groups.map((group) => (
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
              {(draft[group] ?? []).map((team) => (
                <div
                  key={team.teamId}
                  draggable
                  onDragStart={() => setDragData({ fromGroup: group, teamId: team.teamId })}
                  className="cursor-grab rounded border border-white/10 bg-black/20 px-2 py-1 text-xs"
                >
                  <div className="font-medium text-white">{team.label}</div>
                  <div className="text-white/50">Rtg: {team.ratingSnapshot}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
