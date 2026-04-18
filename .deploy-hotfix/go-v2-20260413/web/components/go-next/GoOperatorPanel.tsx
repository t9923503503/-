'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GoMatchView, GoOperatorActionName, GoOperatorState } from '@/lib/go-next/types';
import { GoBracketView } from './GoBracketView';
import { GoGroupStandings } from './GoGroupStandings';
import { GoMatchCard } from './GoMatchCard';
import { GoProgressBar } from './GoProgressBar';
import { GoSeedEditor, type GoSeedDraft } from './GoSeedEditor';

type GoStateResponse = {
  state?: GoOperatorState;
  groups?: GoOperatorState['groups'];
  matches?: GoMatchView[];
  brackets?: Record<string, any[]>;
  seedDraft?: GoSeedDraft;
};

function asState(payload: unknown): GoOperatorState | null {
  if (!payload || typeof payload !== 'object') return null;
  if ('stage' in (payload as Record<string, unknown>) && 'settings' in (payload as Record<string, unknown>)) {
    return payload as GoOperatorState;
  }
  if ('state' in (payload as Record<string, unknown>)) {
    return ((payload as GoStateResponse).state ?? null) as GoOperatorState | null;
  }
  return null;
}

export function GoOperatorPanel({
  tournamentId,
  initialState,
}: {
  tournamentId: string;
  initialState?: GoOperatorState | null;
}) {
  const [state, setState] = useState<GoOperatorState | null>(initialState ?? null);
  const [matches, setMatches] = useState<GoMatchView[]>([]);
  const [brackets, setBrackets] = useState<Record<string, any[]>>({});
  const [seedDraft, setSeedDraft] = useState<GoSeedDraft | null>(null);
  const [activeTab, setActiveTab] = useState<'groups' | 'schedule' | 'bracket' | 'courts'>('groups');
  const [activeBracketLevel, setActiveBracketLevel] = useState<string>('');
  const [selectedGroupForWalkover, setSelectedGroupForWalkover] = useState<string>('');
  const [pending, setPending] = useState<GoOperatorActionName | null>(null);
  const [error, setError] = useState<string>('');

  const groups = state?.groups ?? [];
  const qualifyCount = Math.max(1, state?.settings.bracketLevels ?? 1);

  const hydrate = useCallback((payload: unknown) => {
    const nextState = asState(payload);
    if (nextState) setState(nextState);
    const data = payload as GoStateResponse;
    if (Array.isArray(data?.matches)) setMatches(data.matches);
    if (data?.brackets && typeof data.brackets === 'object') {
      setBrackets(data.brackets as Record<string, any[]>);
      if (!activeBracketLevel) {
        const firstLevel = Object.keys(data.brackets)[0];
        if (firstLevel) setActiveBracketLevel(firstLevel);
      }
    }
    if (data?.seedDraft && typeof data.seedDraft === 'object') {
      setSeedDraft(data.seedDraft);
    }
  }, [activeBracketLevel]);

  const loadState = useCallback(async () => {
    if (!tournamentId) return;
    try {
      const response = await fetch(`/api/admin/tournaments/${encodeURIComponent(tournamentId)}/go-standings`, {
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return;
      hydrate(payload);
    } catch {
      // The operator can still work through action responses.
    }

    try {
      const response = await fetch(`/api/admin/tournaments/${encodeURIComponent(tournamentId)}/go-bracket`, {
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return;
      hydrate(payload);
    } catch {
      // Optional endpoint during parallel implementation.
    }
  }, [hydrate, tournamentId]);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  useEffect(() => {
    const timer = setInterval(() => {
      void loadState();
    }, 8000);
    return () => clearInterval(timer);
  }, [loadState]);

  useEffect(() => {
    if (!selectedGroupForWalkover && groups.length > 0) {
      setSelectedGroupForWalkover(groups[0].groupId);
    }
  }, [groups, selectedGroupForWalkover]);

  const actionButtons = useMemo(
    () => [
      { action: 'bootstrap_groups' as const, label: 'Bootstrap Groups' },
      { action: 'start_group_stage' as const, label: 'Start Groups' },
      { action: 'finish_group_stage' as const, label: 'Finish Groups' },
      { action: 'preview_bracket_seed' as const, label: 'Preview Seed' },
      { action: 'confirm_bracket_seed' as const, label: 'Confirm Seed' },
      { action: 'bootstrap_bracket' as const, label: 'Bootstrap Bracket' },
      { action: 'finish_bracket' as const, label: 'Finish Bracket' },
      { action: 'rollback_stage' as const, label: 'Rollback' },
    ],
    [],
  );

  async function runAction(action: GoOperatorActionName, options?: Record<string, unknown>) {
    if (!tournamentId) return;
    setPending(action);
    setError('');
    try {
      const response = await fetch(`/api/admin/tournaments/${encodeURIComponent(tournamentId)}/go-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...(options ?? {}) }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const text = typeof payload?.error === 'string' ? payload.error : 'Go action failed';
        throw new Error(text);
      }
      hydrate(payload);
      await loadState();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Go action failed');
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-white">GO Tournament Control</h1>
          <p className="text-sm text-white/60">Tournament: {tournamentId}</p>
        </div>
      </header>

      {state ? <GoProgressBar stage={state.stage} /> : null}

      <div className="sticky top-2 z-10 rounded-xl border border-white/10 bg-[#0f1119]/95 p-2 backdrop-blur">
        <div className="flex flex-wrap gap-2">
          {[
            { key: 'groups', label: 'Группы' },
            { key: 'schedule', label: 'Расписание' },
            { key: 'bracket', label: 'Сетка' },
            { key: 'courts', label: 'Корты' },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                activeTab === tab.key
                  ? 'border-brand/60 bg-brand/20 text-brand'
                  : 'border-white/10 bg-white/5 text-white/70'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'groups' ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {groups.map((group) => (
            <GoGroupStandings key={group.groupId} group={group} qualifyCount={qualifyCount} />
          ))}
        </div>
      ) : null}

      {activeTab === 'schedule' ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {matches.map((match) => (
            <GoMatchCard key={match.matchId} match={match} />
          ))}
          {matches.length === 0 ? (
            <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-white/60">Нет матчей</div>
          ) : null}
        </div>
      ) : null}

      {activeTab === 'bracket' ? (
        <>
          {seedDraft ? (
            <GoSeedEditor
              initialDraft={seedDraft}
              onConfirm={(draft) => {
                void runAction('confirm_bracket_seed', { seedDraft: draft });
              }}
            />
          ) : null}
          <GoBracketView
            brackets={brackets as Record<string, any>}
            level={activeBracketLevel}
            onLevelChange={setActiveBracketLevel}
          />
        </>
      ) : null}

      {activeTab === 'courts' ? (
        <section className="rounded-lg border border-white/10 bg-black/20 p-3">
          <h4 className="text-sm font-semibold text-white">Судейские PIN-коды</h4>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(state?.courts ?? []).map((court) => (
              <div key={court.courtNo} className="rounded-lg border border-white/10 bg-white/5 p-2 text-xs">
                <div className="text-white/55">{court.label}</div>
                <div className="mt-1 font-mono text-sm text-white">{court.pinCode}</div>
                <a
                  href={`/court/${encodeURIComponent(court.pinCode)}`}
                  className="mt-1 inline-block text-brand hover:text-brand/80"
                  target="_blank"
                  rel="noreferrer"
                >
                  Открыть судью →
                </a>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-lg border border-white/10 bg-black/20 p-3">
        <h4 className="text-sm font-semibold text-white">Actions</h4>
        <div className="mt-2 flex flex-wrap gap-2">
          {actionButtons.map((button) => (
            <button
              key={button.action}
              type="button"
              onClick={() => void runAction(button.action)}
              disabled={pending !== null}
              className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/85 disabled:opacity-50"
            >
              {pending === button.action ? '...' : button.label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <select
            value={selectedGroupForWalkover}
            onChange={(event) => setSelectedGroupForWalkover(event.target.value)}
            className="rounded-md border border-white/15 bg-black/30 px-2 py-1 text-white"
          >
            {groups.map((group) => (
              <option key={group.groupId} value={group.groupId}>
                Group {group.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void runAction('mass_walkover_group', { groupId: selectedGroupForWalkover })}
            disabled={!selectedGroupForWalkover || pending !== null}
            className="rounded-md border border-red-400/40 bg-red-500/10 px-3 py-1.5 font-semibold text-red-200 disabled:opacity-50"
          >
            Mass walkover
          </button>
        </div>
      </section>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
    </div>
  );
}
