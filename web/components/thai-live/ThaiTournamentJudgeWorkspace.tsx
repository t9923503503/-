'use client';

import { useEffect, useMemo, useState } from 'react';
import type {
  ThaiJudgeSnapshot,
  ThaiJudgeTournamentSnapshot,
  ThaiRoundType,
} from '@/lib/thai-live/types';
import { ThaiJudgeWorkspace } from '@/components/thai-live/ThaiJudgeWorkspace';

function roundTabClass(active: boolean, available: boolean): string {
  if (active) return 'border-[#ffd24a] bg-[#ffd24a] text-[#17130b]';
  if (!available) return 'border-white/10 bg-white/5 text-[#6f7588]';
  return 'border-[#2a2a44] bg-[#141422] text-[#c6cad6] hover:border-[#5a5a8e]';
}

function courtTabClass(active: boolean, available: boolean): string {
  if (active) return 'border-[#ffd24a] bg-[#ffd24a] text-[#17130b]';
  if (!available) return 'border-white/10 bg-white/5 text-[#6f7588]';
  return 'border-[#2a2a44] bg-[#141422] text-[#c6cad6] hover:border-[#5a5a8e]';
}

function localizeCourtLabel(label: string): string {
  if (label === 'A') return 'К1';
  if (label === 'B') return 'К2';
  if (label === 'C') return 'К3';
  if (label === 'D') return 'К4';
  return label;
}

/** R1: K1–K4 по номеру корта; R2: зона из снимка (HARD/LIGHT/…). */
function activeCourtBadgeLabel(snapshot: ThaiJudgeTournamentSnapshot): string {
  if (snapshot.activeSnapshot.roundType === 'r1') {
    return `K${snapshot.selectedCourtNo}`;
  }
  return snapshot.activeSnapshot.courtLabel;
}

async function loadTournamentSnapshot(
  tournamentId: string,
  selectedRoundType: ThaiRoundType,
  selectedCourtNo: number,
): Promise<ThaiJudgeTournamentSnapshot> {
  const response = await fetch(
    `/api/thai/judge/tournament/${encodeURIComponent(tournamentId)}?round=${encodeURIComponent(selectedRoundType)}&court=${selectedCourtNo}`,
    { cache: 'no-store' },
  );
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    snapshot?: ThaiJudgeTournamentSnapshot;
  };
  if (!response.ok || !payload.snapshot) {
    throw new Error(payload.error || 'Не удалось загрузить экран турнира.');
  }
  return payload.snapshot;
}

export function ThaiTournamentJudgeWorkspace({
  initialSnapshot,
}: {
  initialSnapshot: ThaiJudgeTournamentSnapshot;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSnapshot(initialSnapshot);
    setError(null);
  }, [initialSnapshot]);

  const selectedRound = useMemo(
    () => snapshot.rounds.find((round) => round.isSelected) ?? snapshot.rounds[0],
    [snapshot],
  );

  async function switchSelection(roundType: ThaiRoundType, courtNo: number) {
    setLoading(true);
    setError(null);
    try {
      const next = await loadTournamentSnapshot(snapshot.tournamentId, roundType, courtNo);
      setSnapshot(next);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Не удалось переключить корт.');
    } finally {
      setLoading(false);
    }
  }

  async function refreshCurrent(activeSnapshot?: ThaiJudgeSnapshot) {
    const roundType = activeSnapshot?.roundType ?? snapshot.selectedRoundType;
    const courtNo = activeSnapshot?.courtNo ?? snapshot.selectedCourtNo;
    await switchSelection(roundType, courtNo);
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-[radial-gradient(circle_at_top,rgba(255,210,74,0.08),transparent_14%),linear-gradient(180deg,#080813,#0d0d18_28%,#090913)] px-3 pb-8 pt-3 text-white">
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-3">
        <section className="rounded-[18px] border border-[#33280f] bg-[linear-gradient(180deg,rgba(21,18,32,0.98),rgba(12,12,24,0.98))] px-3 py-2.5 shadow-[0_18px_50px_rgba(0,0,0,0.3)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate font-heading text-[15px] leading-tight uppercase tracking-[0.05em] text-[#ffd24a] sm:text-lg">
                {snapshot.tournamentName} <span className="ml-1.5 text-[9px] uppercase tracking-[0.18em] text-[#aeb6c8] font-sans">{snapshot.variant.toUpperCase()} • {snapshot.pointLimit}</span>
              </div>
            </div>
            <div className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#aeb6c8]">
              {loading
                ? '...'
                : `${snapshot.activeSnapshot.roundType.toUpperCase()} ${activeCourtBadgeLabel(snapshot).toUpperCase()}`}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-2">
            <div className="flex min-w-0 flex-wrap gap-2">
              {snapshot.rounds.map((round) => (
                <button
                  key={round.roundType}
                  type="button"
                  disabled={!round.isAvailable || loading}
                  onClick={() => {
                    const fallbackCourt = round.courts.find((court) => court.isAvailable) ?? round.courts[0];
                    if (fallbackCourt) void switchSelection(round.roundType, fallbackCourt.courtNo);
                  }}
                  className={`rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] transition ${roundTabClass(round.isSelected, round.isAvailable)} ${!round.isAvailable || loading ? 'cursor-not-allowed opacity-55' : ''}`}
                >
                  {round.label}
                </button>
              ))}
            </div>
            {selectedRound ? (
              <div className="flex shrink-0 flex-wrap justify-end gap-2">
                {selectedRound.courts.map((court) => (
                  <button
                    key={`${selectedRound.roundType}-${court.courtNo}`}
                    type="button"
                    disabled={!court.isAvailable || loading}
                    onClick={() => void switchSelection(selectedRound.roundType, court.courtNo)}
                    className={`rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] transition ${courtTabClass(court.isSelected, court.isAvailable)} ${!court.isAvailable || loading ? 'cursor-not-allowed opacity-55' : ''}`}
                  >
                    {localizeCourtLabel(court.label)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {error ? (
            <div className="mt-3 rounded-[14px] border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">
              {error}
            </div>
          ) : null}
        </section>

        <ThaiJudgeWorkspace
          initialSnapshot={snapshot.activeSnapshot}
          navigationMode="embedded"
          onSnapshotChange={(nextSnapshot) => {
            void refreshCurrent(nextSnapshot);
          }}
        />
      </div>
    </div>
  );
}
