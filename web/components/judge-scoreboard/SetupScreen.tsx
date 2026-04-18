'use client';

import { useMemo, useState } from 'react';
import type { MatchConfig, MatchState, Preset, TeamId } from '@/lib/judge-scoreboard/types';
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
    groupLabel: string;
    courtId: string;
  }) => void;
  onResume: () => void;
  onDiscardSaved: () => void;
}

const MAX_POINTS_OPTIONS: MatchConfig['targetMain'][] = [10, 15, 21];
const TIMEOUT_LIMIT_OPTIONS: MatchConfig['timeoutsPerTeam'][] = [0, 1, 2];
const TIMEOUT_DURATION_OPTIONS: MatchConfig['timeoutDurationSec'][] = [30, 45, 60];
const TIMER_MODE_OPTIONS: MatchConfig['timerModeMinutes'][] = [0, 6, 9, 10, 15];
const DIVISION_OPTIONS: Array<{ id: MatchConfig['division']; label: string }> = [
  { id: 'MM', label: 'М/М' },
  { id: 'WW', label: 'Ж/Ж' },
  { id: 'MIX', label: 'Микст' },
];

function courtToNumber(court: string): string {
  const normalized = String(court || '').replace(/[^\d]/g, '');
  return normalized || '1';
}

export function SetupScreen({
  courtId,
  savedState,
  onStart,
  onResume,
  onDiscardSaved,
}: Props) {
  const [presetId, setPresetId] = useState<Preset['id']>(PRESETS[1].id);
  const [maxPoints, setMaxPoints] = useState<MatchConfig['targetMain']>(21);
  const [winByTwo, setWinByTwo] = useState(true);
  const [setsToWin, setSetsToWin] = useState<MatchConfig['setsToWin']>(1);
  const [timeoutsPerTeam, setTimeoutsPerTeam] = useState<MatchConfig['timeoutsPerTeam']>(1);
  const [timeoutDurationSec, setTimeoutDurationSec] = useState<MatchConfig['timeoutDurationSec']>(45);
  const [lockScoreDuringTimeout, setLockScoreDuringTimeout] = useState(false);
  const [autoServeOnPoint, setAutoServeOnPoint] = useState(true);
  const [timerModeMinutes, setTimerModeMinutes] = useState<MatchConfig['timerModeMinutes']>(0);
  const [division, setDivision] = useState<MatchConfig['division']>('MM');
  const [teamA, setTeamA] = useState('ОБУХОВ / ПАНИЧКИН');
  const [teamB, setTeamB] = useState('ГАДАБОРШЕВ / ГРУЗИН');
  const [firstServer, setFirstServer] = useState<TeamId>('A');
  const [matchName, setMatchName] = useState('');
  const [judgeName, setJudgeName] = useState('');
  const [groupLabel, setGroupLabel] = useState('GROUP B');
  const [selectedCourt, setSelectedCourt] = useState(courtToNumber(courtId));

  const selectedPreset = useMemo(() => PRESETS.find((p) => p.id === presetId) ?? PRESETS[1], [presetId]);
  const canStart = teamA.trim().length > 0 && teamB.trim().length > 0;
  const canResume =
    savedState && savedState.core.status !== 'setup' && savedState.core.status !== 'finished';

  const startWithConfig = () => {
    if (!canStart) return;
    const derivedPreset: Preset = {
      ...selectedPreset,
      config: {
        ...selectedPreset.config,
        targetMain: maxPoints,
        targetDecider: setsToWin === 2 ? 15 : maxPoints,
        winByTwo,
        setsToWin,
        timeoutsPerTeam,
        timeoutDurationSec,
        lockScoreDuringTimeout,
        autoServeOnPoint,
        timerModeMinutes,
        division,
      },
    };
    const normalizedCourt = courtToNumber(selectedCourt);
    onStart({
      preset: derivedPreset,
      teamA,
      teamB,
      firstServer,
      matchName: matchName.trim() || `КОРТ ${normalizedCourt} · МАТЧ`,
      judgeName: judgeName.trim(),
      groupLabel: groupLabel.trim() || 'GROUP B',
      courtId: normalizedCourt,
    });
  };

  return (
    <div
      className="mx-auto flex min-h-[100dvh] w-full max-w-3xl flex-col bg-[#060b16] px-4 py-4 text-white"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
        paddingLeft: 'calc(env(safe-area-inset-left, 0px) + 12px)',
        paddingRight: 'calc(env(safe-area-inset-right, 0px) + 12px)',
      }}
    >
      <header className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-white/50">LPVOLLEY · Judge UI</p>
          <h1
            className="text-3xl font-black uppercase"
            style={{ fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.05em' }}
          >
            Настройки матча
          </h1>
        </div>
        <a
          href="/judge-scoreboard"
          className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-xs uppercase tracking-widest text-white/70"
          style={{ fontFamily: 'Bebas Neue, sans-serif' }}
        >
          Назад
        </a>
      </header>

      {canResume && savedState && (
        <div className="mb-4 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4">
          <p className="text-xs uppercase tracking-widest text-emerald-300">Незавершенный матч</p>
          <p className="mt-1 text-sm text-white/80">
            {savedState.core.teamA} vs {savedState.core.teamB} · Сет {savedState.core.currentSet} ·{' '}
            {savedState.core.scoreA}:{savedState.core.scoreB}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onResume}
              className="min-h-[48px] rounded-xl bg-emerald-600 text-lg font-black uppercase tracking-widest text-white"
              style={{ fontFamily: 'Bebas Neue, sans-serif' }}
            >
              Продолжить
            </button>
            <button
              type="button"
              onClick={onDiscardSaved}
              className="min-h-[48px] rounded-xl border border-white/20 bg-white/5 text-sm font-black uppercase tracking-widest text-white/70"
              style={{ fontFamily: 'Bebas Neue, sans-serif' }}
            >
              Сбросить
            </button>
          </div>
        </div>
      )}

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
        <p className="mb-2 text-xs uppercase tracking-widest text-white/50">Обязательные параметры</p>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs uppercase tracking-widest text-white/60">
            Корт
            <select
              value={selectedCourt}
              onChange={(e) => setSelectedCourt(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#0b1527] px-3 text-sm text-white"
            >
              {['1', '2', '3', '4'].map((court) => (
                <option key={court} value={court}>
                  КОРТ {court}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs uppercase tracking-widest text-white/60">
            Формат
            <select
              value={presetId}
              onChange={(e) => setPresetId(e.target.value as Preset['id'])}
              className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#0b1527] px-3 text-sm text-white"
            >
              {PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.title}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs uppercase tracking-widest text-white/60">
            До очков
            <select
              value={maxPoints}
              onChange={(e) => setMaxPoints(Number(e.target.value) as MatchConfig['targetMain'])}
              className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#0b1527] px-3 text-sm text-white"
            >
              {MAX_POINTS_OPTIONS.map((points) => (
                <option key={points} value={points}>
                  {points}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs uppercase tracking-widest text-white/60">
            Сеты
            <select
              value={setsToWin}
              onChange={(e) => setSetsToWin(Number(e.target.value) as MatchConfig['setsToWin'])}
              className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#0b1527] px-3 text-sm text-white"
            >
              <option value={1}>1 сет</option>
              <option value={2}>До 2 побед</option>
            </select>
          </label>
          <label className="text-xs uppercase tracking-widest text-white/60">
            Тип
            <select
              value={division}
              onChange={(e) => setDivision(e.target.value as MatchConfig['division'])}
              className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#0b1527] px-3 text-sm text-white"
            >
              {DIVISION_OPTIONS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs uppercase tracking-widest text-white/60">
            KOTC таймер
            <select
              value={timerModeMinutes}
              onChange={(e) =>
                setTimerModeMinutes(Number(e.target.value) as MatchConfig['timerModeMinutes'])
              }
              className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#0b1527] px-3 text-sm text-white"
            >
              {TIMER_MODE_OPTIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes === 0 ? 'Нет' : `${minutes} мин`}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs uppercase tracking-widest text-white/60">
            Тайм-ауты
            <select
              value={timeoutsPerTeam}
              onChange={(e) =>
                setTimeoutsPerTeam(Number(e.target.value) as MatchConfig['timeoutsPerTeam'])
              }
              className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#0b1527] px-3 text-sm text-white"
            >
              {TIMEOUT_LIMIT_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs uppercase tracking-widest text-white/60">
            Длительность тайм-аута
            <select
              value={timeoutDurationSec}
              onChange={(e) =>
                setTimeoutDurationSec(Number(e.target.value) as MatchConfig['timeoutDurationSec'])
              }
              className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#0b1527] px-3 text-sm text-white"
            >
              {TIMEOUT_DURATION_OPTIONS.map((seconds) => (
                <option key={seconds} value={seconds}>
                  {seconds} сек
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-h-[44px] items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-xs uppercase tracking-widest text-white/80">
            <input
              type="checkbox"
              checked={winByTwo}
              onChange={(e) => setWinByTwo(e.target.checked)}
              className="h-4 w-4"
            />
            Баланс: разница 2
          </label>
          <label className="flex min-h-[44px] items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-xs uppercase tracking-widest text-white/80">
            <input
              type="checkbox"
              checked={lockScoreDuringTimeout}
              onChange={(e) => setLockScoreDuringTimeout(e.target.checked)}
              className="h-4 w-4"
            />
            Блокировать очки во время timeout
          </label>
          <label className="flex min-h-[44px] items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-xs uppercase tracking-widest text-white/80">
            <input
              type="checkbox"
              checked={autoServeOnPoint}
              onChange={(e) => setAutoServeOnPoint(e.target.checked)}
              className="h-4 w-4"
            />
            Авто смена подачи при очке
          </label>
        </div>
      </section>

      <section className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
        <p className="mb-2 text-xs uppercase tracking-widest text-white/50">Матч</p>
        <div className="grid gap-2 md:grid-cols-2">
          <input
            type="text"
            value={teamA}
            onChange={(e) => setTeamA(e.target.value)}
            maxLength={48}
            placeholder="Команда A"
            className="min-h-[46px] rounded-xl border border-red-400/30 bg-red-500/10 px-3 text-base text-white"
          />
          <input
            type="text"
            value={teamB}
            onChange={(e) => setTeamB(e.target.value)}
            maxLength={48}
            placeholder="Команда B"
            className="min-h-[46px] rounded-xl border border-sky-400/30 bg-sky-500/10 px-3 text-base text-white"
          />
          <input
            type="text"
            value={matchName}
            onChange={(e) => setMatchName(e.target.value)}
            maxLength={60}
            placeholder="Название матча"
            className="min-h-[46px] rounded-xl border border-white/10 bg-white/5 px-3 text-base text-white"
          />
          <input
            type="text"
            value={judgeName}
            onChange={(e) => setJudgeName(e.target.value)}
            maxLength={48}
            placeholder="Имя судьи"
            className="min-h-[46px] rounded-xl border border-white/10 bg-white/5 px-3 text-base text-white"
          />
          <input
            type="text"
            value={groupLabel}
            onChange={(e) => setGroupLabel(e.target.value.toUpperCase())}
            maxLength={24}
            placeholder="GROUP B"
            className="min-h-[46px] rounded-xl border border-white/10 bg-white/5 px-3 text-base uppercase text-white"
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setFirstServer('A')}
              className={`min-h-[46px] rounded-xl border text-sm font-black uppercase tracking-widest ${
                firstServer === 'A'
                  ? 'border-yellow-300 bg-yellow-400/20 text-yellow-100'
                  : 'border-white/15 bg-white/5 text-white/60'
              }`}
              style={{ fontFamily: 'Bebas Neue, sans-serif' }}
            >
              Подача A
            </button>
            <button
              type="button"
              onClick={() => setFirstServer('B')}
              className={`min-h-[46px] rounded-xl border text-sm font-black uppercase tracking-widest ${
                firstServer === 'B'
                  ? 'border-yellow-300 bg-yellow-400/20 text-yellow-100'
                  : 'border-white/15 bg-white/5 text-white/60'
              }`}
              style={{ fontFamily: 'Bebas Neue, sans-serif' }}
            >
              Подача B
            </button>
          </div>
        </div>
      </section>

      <div className="mt-auto pt-4">
        <button
          type="button"
          onClick={startWithConfig}
          disabled={!canStart}
          className="min-h-[82px] w-full rounded-3xl bg-emerald-500 text-3xl font-black uppercase tracking-[0.08em] text-white disabled:bg-white/10 disabled:text-white/30"
          style={{ fontFamily: 'Bebas Neue, sans-serif' }}
        >
          Старт матча
        </button>
      </div>
    </div>
  );
}
