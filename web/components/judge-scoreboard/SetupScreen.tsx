'use client';

import { useState } from 'react';
import type { MatchState, Preset, TeamId } from '@/lib/judge-scoreboard/types';
import { PRESETS } from '@/lib/judge-scoreboard/presets';

interface Props {
  courtId: string;
  savedState: MatchState | null;
  onStart: (args: {
    preset: Preset;
    teamA: string;
    teamB: string;
    firstServer: TeamId;
    matchName: string;
    judgeName: string;
  }) => void;
  onResume: () => void;
  onDiscardSaved: () => void;
}

const NAME_PAIRS: Array<[string, string]> = [
  ['Красные', 'Синие'],
  ['Хозяева', 'Гости'],
  ['Жёлтые', 'Чёрные'],
];

const toneBg: Record<Preset['tone'], string> = {
  green: 'from-emerald-500/25 to-emerald-500/5 border-emerald-400/40',
  yellow: 'from-amber-500/25 to-amber-500/5 border-amber-400/40',
  red: 'from-rose-500/25 to-rose-500/5 border-rose-400/40',
};

export function SetupScreen({
  courtId,
  savedState,
  onStart,
  onResume,
  onDiscardSaved,
}: Props) {
  const [presetId, setPresetId] = useState<Preset['id']>(PRESETS[0].id);
  const [teamA, setTeamA] = useState('');
  const [teamB, setTeamB] = useState('');
  const [firstServer, setFirstServer] = useState<TeamId>('A');
  const [matchName, setMatchName] = useState('');
  const [judgeName, setJudgeName] = useState('');

  const selectedPreset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];
  const canStart = teamA.trim().length > 0 && teamB.trim().length > 0;

  const canResume =
    savedState && savedState.core.status !== 'setup' && savedState.core.status !== 'finished';

  const handleStart = () => {
    if (!canStart) return;
    onStart({
      preset: selectedPreset,
      teamA,
      teamB,
      firstServer,
      matchName: matchName.trim() || `Матч на корте ${courtId}`,
      judgeName: judgeName.trim(),
    });
  };

  return (
    <div
      className="flex min-h-[100dvh] w-full flex-col bg-[#050914] text-white"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
        paddingLeft: 'calc(env(safe-area-inset-left, 0px) + 16px)',
        paddingRight: 'calc(env(safe-area-inset-right, 0px) + 16px)',
      }}
    >
      <header className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-white/50">Корт</p>
          <h1
            className="text-4xl font-black leading-none text-white"
            style={{ fontFamily: 'Bebas Neue, sans-serif' }}
          >
            {courtId}
          </h1>
        </div>
        <a
          href="/judge-scoreboard"
          className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs uppercase tracking-wider text-white/70 active:bg-white/10"
          style={{ fontFamily: 'Bebas Neue, sans-serif' }}
        >
          Сменить корт
        </a>
      </header>

      {canResume && savedState && (
        <div className="mb-5 rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-4">
          <p className="text-xs uppercase tracking-widest text-emerald-300">
            Незавершённый матч
          </p>
          <p
            className="mt-1 text-xl font-bold"
            style={{ fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.02em' }}
          >
            {savedState.core.teamA} vs {savedState.core.teamB}
          </p>
          <p className="mt-1 text-sm text-white/70">
            Сет {savedState.core.currentSet} · счёт {savedState.core.scoreA}:
            {savedState.core.scoreB} · по сетам {savedState.core.setsA}:
            {savedState.core.setsB}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={onResume}
              className="min-h-[52px] flex-1 rounded-xl bg-emerald-600 text-base font-bold uppercase tracking-wide text-white active:bg-emerald-700"
              style={{ fontFamily: 'Bebas Neue, sans-serif' }}
            >
              Продолжить
            </button>
            <button
              type="button"
              onClick={onDiscardSaved}
              className="min-h-[52px] rounded-xl border border-white/20 bg-white/5 px-4 text-sm font-semibold uppercase tracking-wide text-white/70 active:bg-white/10"
              style={{ fontFamily: 'Bebas Neue, sans-serif' }}
            >
              Сбросить
            </button>
          </div>
        </div>
      )}

      <section>
        <p className="mb-2 text-xs uppercase tracking-widest text-white/50">Формат</p>
        <div className="grid gap-3">
          {PRESETS.map((preset) => {
            const active = preset.id === presetId;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => setPresetId(preset.id)}
                className={`flex items-center justify-between rounded-2xl border bg-gradient-to-br px-4 py-4 text-left transition active:scale-[0.99] ${toneBg[preset.tone]} ${active ? 'ring-2 ring-white/70' : 'opacity-80'}`}
                style={{ minHeight: 78 }}
              >
                <div>
                  <div
                    className="text-2xl font-black uppercase tracking-wide text-white"
                    style={{ fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.03em' }}
                  >
                    {preset.title}
                  </div>
                  <div className="text-xs uppercase tracking-widest text-white/60">
                    {preset.subtitle}
                  </div>
                </div>
                {active && (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-base font-black text-slate-900">
                    ✓
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-6">
        <p className="mb-2 text-xs uppercase tracking-widest text-white/50">Команды</p>
        <div className="grid gap-3">
          <input
            type="text"
            value={teamA}
            onChange={(e) => setTeamA(e.target.value)}
            placeholder="Команда A"
            maxLength={40}
            className="min-h-[60px] rounded-2xl border border-white/15 bg-white/5 px-4 text-xl font-bold text-white outline-none focus:border-white/40"
            style={{ fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.02em' }}
          />
          <input
            type="text"
            value={teamB}
            onChange={(e) => setTeamB(e.target.value)}
            placeholder="Команда B"
            maxLength={40}
            className="min-h-[60px] rounded-2xl border border-white/15 bg-white/5 px-4 text-xl font-bold text-white outline-none focus:border-white/40"
            style={{ fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.02em' }}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {NAME_PAIRS.map(([a, b]) => (
            <button
              key={a}
              type="button"
              onClick={() => {
                setTeamA(a);
                setTeamB(b);
              }}
              className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs uppercase tracking-wider text-white/70 active:bg-white/10"
              style={{ fontFamily: 'Bebas Neue, sans-serif' }}
            >
              {a} / {b}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <p className="mb-2 text-xs uppercase tracking-widest text-white/50">
          Первый подающий
        </p>
        <div className="grid grid-cols-2 gap-3">
          {(['A', 'B'] as TeamId[]).map((t) => {
            const active = firstServer === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setFirstServer(t)}
                className={`flex min-h-[72px] items-center justify-center gap-2 rounded-2xl border text-2xl font-black uppercase tracking-wide transition active:scale-[0.98] ${
                  active
                    ? 'border-white/70 bg-white/15 text-white'
                    : 'border-white/15 bg-white/5 text-white/60'
                }`}
                style={{ fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.04em' }}
              >
                <span aria-hidden>🏐</span>
                <span>{t === 'A' ? teamA || 'A' : teamB || 'B'}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          type="text"
          value={matchName}
          onChange={(e) => setMatchName(e.target.value)}
          placeholder="Название матча (необязательно)"
          maxLength={40}
          className="min-h-[52px] rounded-2xl border border-white/10 bg-white/5 px-4 text-base text-white outline-none focus:border-white/30"
        />
        <input
          type="text"
          value={judgeName}
          onChange={(e) => setJudgeName(e.target.value)}
          placeholder="Судья (необязательно)"
          maxLength={40}
          className="min-h-[52px] rounded-2xl border border-white/10 bg-white/5 px-4 text-base text-white outline-none focus:border-white/30"
        />
      </section>

      <div className="mt-auto pt-8">
        <button
          type="button"
          onClick={handleStart}
          disabled={!canStart}
          className="min-h-[96px] w-full rounded-3xl bg-emerald-500 text-4xl font-black uppercase tracking-wide text-white shadow-lg shadow-emerald-500/20 transition active:scale-[0.98] active:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30 disabled:shadow-none"
          style={{ fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.06em' }}
        >
          Старт матча
        </button>
      </div>
    </div>
  );
}
