'use client';

import { useEffect, useMemo, useState } from 'react';
import { JudgeScoreboardScreen } from './JudgeScoreboardScreen';

const COURTS = ['1', '2', '3', '4'];
const INTERVAL_OPTIONS = [5, 8, 10, 12, 15] as const;

interface Props {
  initialCourt?: string;
  initialAuto?: boolean;
  initialIntervalSec?: number;
}

function normalizeCourt(value: string | undefined): string {
  return COURTS.includes(String(value || '')) ? String(value) : '1';
}

function normalizeInterval(value: number | undefined): number {
  const int = Number.isFinite(value) ? Number(value) : 8;
  return INTERVAL_OPTIONS.includes(int as (typeof INTERVAL_OPTIONS)[number]) ? int : 8;
}

export function ViewerWall({
  initialCourt = '1',
  initialAuto = true,
  initialIntervalSec = 8,
}: Props) {
  const [courtId, setCourtId] = useState(() => normalizeCourt(initialCourt));
  const [autoRotate, setAutoRotate] = useState(Boolean(initialAuto));
  const [intervalSec, setIntervalSec] = useState(() => normalizeInterval(initialIntervalSec));

  const currentIndex = useMemo(() => Math.max(0, COURTS.indexOf(courtId)), [courtId]);

  useEffect(() => {
    if (!autoRotate) return;
    const timer = window.setInterval(() => {
      setCourtId((prev) => {
        const idx = COURTS.indexOf(prev);
        if (idx < 0) return COURTS[0];
        return COURTS[(idx + 1) % COURTS.length];
      });
    }, intervalSec * 1000);
    return () => window.clearInterval(timer);
  }, [autoRotate, intervalSec]);

  return (
    <div className="min-h-[100dvh] bg-[#020611] text-white">
      <header
        className="sticky top-0 z-30 border-b border-white/10 bg-[#020611]/90 px-4 py-3 backdrop-blur"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)',
          paddingLeft: 'calc(env(safe-area-inset-left, 0px) + 16px)',
          paddingRight: 'calc(env(safe-area-inset-right, 0px) + 16px)',
        }}
      >
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-white/50">LPVOLLEY</div>
            <div className="text-xl font-black uppercase" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              Viewer Mode
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/judge-scoreboard/viewer/mosaic"
              className="rounded-lg border border-sky-400/35 bg-sky-500/15 px-3 py-1 text-xs font-black uppercase tracking-widest text-sky-100"
            >
              Mosaic 2x2
            </a>
            <div className="rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-xs">
              Корт {courtId} ({currentIndex + 1}/4)
            </div>
            <button
              type="button"
              onClick={() => setAutoRotate((v) => !v)}
              className={`rounded-lg px-3 py-1 text-xs font-black uppercase tracking-widest ${
                autoRotate ? 'bg-emerald-500 text-white' : 'bg-white/10 text-white/80'
              }`}
            >
              {autoRotate ? 'AUTO ON' : 'AUTO OFF'}
            </button>
            <select
              value={intervalSec}
              onChange={(e) => setIntervalSec(Number(e.target.value))}
              className="rounded-lg border border-white/15 bg-[#121c2e] px-2 py-1 text-xs"
            >
              {INTERVAL_OPTIONS.map((sec) => (
                <option key={sec} value={sec}>
                  {sec}s
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mx-auto mt-2 grid w-full max-w-5xl grid-cols-4 gap-2">
          {COURTS.map((court) => (
            <button
              key={court}
              type="button"
              onClick={() => setCourtId(court)}
              className={`rounded-lg px-2 py-2 text-xs font-black uppercase tracking-widest ${
                courtId === court ? 'bg-sky-500 text-white' : 'bg-white/10 text-white/70'
              }`}
            >
              Корт {court}
            </button>
          ))}
        </div>
      </header>

      <JudgeScoreboardScreen courtId={courtId} readOnly />
    </div>
  );
}
