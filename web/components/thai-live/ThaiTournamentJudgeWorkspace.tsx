'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type {
  ThaiJudgeSnapshot,
  ThaiJudgeTournamentCourtTabItem,
  ThaiJudgeTournamentSnapshot,
  ThaiRoundType,
} from '@/lib/thai-live/types';
import { ThaiJudgeWorkspace } from '@/components/thai-live/ThaiJudgeWorkspace';

function roundTabClass(active: boolean, available: boolean): string {
  if (active) return 'border-[#ffd24a] bg-[#ffd24a] text-[#17130b]';
  if (!available) return 'border-white/10 bg-white/5 text-[#6f7588]';
  return 'border-[#2a2a44] bg-[#161625] text-[#c6cad6] hover:border-[#5a5a8e]';
}

function courtTabClass(active: boolean, available: boolean): string {
  if (active) return 'border-[#ffd24a] bg-[#ffd24a] text-[#17130b]';
  if (!available) return 'border-white/10 bg-white/5 text-[#6f7588]';
  return 'border-[#2a2a44] bg-[#1a1a2d] text-[#c6cad6] hover:border-[#5a5a8e]';
}

function localizeCourtLabel(label: string): string {
  if (label === 'A') return 'К1';
  if (label === 'B') return 'К2';
  if (label === 'C') return 'К3';
  if (label === 'D') return 'К4';
  return label;
}

function activeCourtBadgeLabel(snapshot: ThaiJudgeTournamentSnapshot): string {
  if (snapshot.activeSnapshot.roundType === 'r1') {
    return `К${snapshot.selectedCourtNo}`;
  }
  return snapshot.activeSnapshot.courtLabel;
}

function formatSnapshotFreshness(lastUpdatedAt: string, nowMs: number): string {
  const parsed = Date.parse(lastUpdatedAt);
  if (!Number.isFinite(parsed)) return 'только что';
  const diffSec = Math.max(0, Math.round((nowMs - parsed) / 1000));
  if (diffSec < 5) return 'только что';
  if (diffSec < 60) return `${diffSec} сек назад`;
  const diffMin = Math.max(1, Math.round(diffSec / 60));
  if (diffMin < 60) return `${diffMin} мин назад`;
  const diffHours = Math.max(1, Math.round(diffMin / 60));
  return `${diffHours} ч назад`;
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

function buildThaiTournamentSelectionUrl(
  tournamentId: string,
  selectedRoundType: ThaiRoundType,
  selectedCourtNo: number,
): string {
  const params = new URLSearchParams({
    round: selectedRoundType,
    court: String(selectedCourtNo),
  });
  return `/court/tournament/${encodeURIComponent(tournamentId)}?${params.toString()}`;
}

function isTournamentJudgeRoute(pathname: string | null): boolean {
  return String(pathname || '').startsWith('/court/tournament/');
}

function resolveCourtSelectionHref(
  pathname: string | null,
  tournamentId: string,
  roundType: ThaiRoundType,
  court: Pick<ThaiJudgeTournamentCourtTabItem, 'courtNo' | 'judgeUrl' | 'isAvailable'>,
): string | null {
  if (!court.isAvailable) return null;
  if (isTournamentJudgeRoute(pathname)) {
    return buildThaiTournamentSelectionUrl(tournamentId, roundType, court.courtNo);
  }
  return court.judgeUrl;
}

function resolveAutoAdvanceHref(
  pathname: string | null,
  snapshot: ThaiJudgeTournamentSnapshot,
): string | null {
  const round2 = snapshot.rounds.find((round) => round.roundType === 'r2' && round.isAvailable) ?? null;
  if (!round2) return null;
  const targetCourt =
    round2.courts.find((court) => court.isAvailable && court.courtNo === snapshot.selectedCourtNo) ??
    round2.courts.find((court) => court.isAvailable) ??
    null;
  if (!targetCourt) return null;
  return resolveCourtSelectionHref(pathname, snapshot.tournamentId, 'r2', targetCourt);
}

function resolveRoundHelperText(snapshot: ThaiJudgeTournamentSnapshot): string | null {
  return snapshot.rounds.find((round) => !round.isSelected && round.unavailableReason)?.unavailableReason ?? null;
}

function resolveCourtHelperText(round: ThaiJudgeTournamentSnapshot['rounds'][number] | undefined): string | null {
  if (!round) return null;
  if (round.unavailableReason) return round.unavailableReason;
  return round.courts.find((court) => !court.isAvailable && court.unavailableReason)?.unavailableReason ?? null;
}

export function ThaiTournamentJudgeWorkspace({
  initialSnapshot,
}: {
  initialSnapshot: ThaiJudgeTournamentSnapshot;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    setSnapshot(initialSnapshot);
    setError(null);
  }, [initialSnapshot]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const selectedRound = useMemo(
    () => snapshot.rounds.find((round) => round.isSelected) ?? snapshot.rounds[0],
    [snapshot],
  );

  const freshnessLabel = useMemo(
    () => formatSnapshotFreshness(snapshot.activeSnapshot.lastUpdatedAt, nowMs),
    [snapshot.activeSnapshot.lastUpdatedAt, nowMs],
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

  useEffect(() => {
    if (!snapshot.activeSnapshot.canAutoRefreshToNextStage) return;
    let cancelled = false;
    const intervalId = window.setInterval(async () => {
      if (cancelled || loading) return;
      try {
        const next = await loadTournamentSnapshot(
          snapshot.tournamentId,
          snapshot.selectedRoundType,
          snapshot.selectedCourtNo,
        );
        if (cancelled) return;
        const autoAdvanceHref = resolveAutoAdvanceHref(pathname, next);
        if (autoAdvanceHref) {
          router.replace(autoAdvanceHref);
          return;
        }
        setSnapshot(next);
        setError(null);
      } catch {
        if (!cancelled) {
          setError('Автопроверка следующего этапа не удалась. Попробуем снова.');
        }
      }
    }, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    loading,
    pathname,
    router,
    snapshot.activeSnapshot.canAutoRefreshToNextStage,
    snapshot.selectedCourtNo,
    snapshot.selectedRoundType,
    snapshot.tournamentId,
  ]);

  return (
    <div className="min-h-screen min-h-[100dvh] overflow-x-hidden bg-[radial-gradient(circle_at_top,rgba(255,210,74,0.08),transparent_14%),linear-gradient(180deg,#080813,#0d0d18_28%,#090913)] px-3 pb-7 pt-3 text-white">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-3">
        <section className="rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(14,15,27,0.98),rgba(10,10,19,0.98))] px-4 py-4 shadow-[0_18px_50px_rgba(0,0,0,0.3)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-[0.28em] text-white/34">Судейский экран</div>
              <div className="mt-2 font-heading text-[20px] leading-[0.98] uppercase tracking-[0.05em] text-[#ffd24a] sm:text-[24px]">
                {snapshot.tournamentName}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#aeb6c8]">
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                  {snapshot.variant.toUpperCase()}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                  До {snapshot.pointLimit}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                  {loading ? 'Обновляем...' : `${snapshot.activeSnapshot.roundType.toUpperCase()} ${activeCourtBadgeLabel(snapshot).toUpperCase()}`}
                </span>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <div className="rounded-full border border-[#ff4d43]/45 bg-[#221010] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#ff938b]">
                {snapshot.activeSnapshot.kind === 'finished' ? 'WAIT' : 'LIVE'}
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#aeb6c8]">
                Обновлено {freshnessLabel}
              </div>
            </div>
          </div>

          {snapshot.activeSnapshot.canAutoRefreshToNextStage ? (
            <div className="mt-3 rounded-[14px] border border-[#ffd24a]/18 bg-[#ffd24a]/8 px-3 py-2 text-[12px] text-[#f6dd93]">
              Проверяем запуск следующего этапа автоматически каждые 15 секунд.
            </div>
          ) : null}

          {error ? (
            <div className="mt-3 rounded-[14px] border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">
              {error}
            </div>
          ) : null}
        </section>

        <section className="rounded-[20px] border border-white/8 bg-[linear-gradient(180deg,rgba(14,15,27,0.98),rgba(10,10,19,0.98))] px-3.5 py-3.5 shadow-[0_18px_48px_rgba(0,0,0,0.28)]">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#7d8498]">Раунды</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {snapshot.rounds.map((round) => {
                const fallbackCourt = round.courts.find((court) => court.isAvailable) ?? round.courts[0] ?? null;
                const href = fallbackCourt
                  ? resolveCourtSelectionHref(pathname, snapshot.tournamentId, round.roundType, fallbackCourt)
                  : null;
                const className = `rounded-full border px-4 py-2.5 text-[13px] font-bold uppercase tracking-[0.08em] transition ${roundTabClass(round.isSelected, round.isAvailable)} ${!round.isAvailable || loading || !href ? 'cursor-not-allowed opacity-55' : ''}`;
                if (!href || !round.isAvailable || loading) {
                  return (
                    <span key={round.roundType} aria-disabled="true" className={className}>
                      {round.label}
                    </span>
                  );
                }
                return (
                  <Link key={round.roundType} href={href} prefetch={false} className={className} aria-current={round.isSelected ? 'page' : undefined}>
                    {round.label}
                  </Link>
                );
              })}
            </div>
            {resolveRoundHelperText(snapshot) ? (
              <div className="mt-2 text-[12px] text-[#9ca5bb]">{resolveRoundHelperText(snapshot)}</div>
            ) : null}
          </div>

          {selectedRound ? (
            <div className="mt-3">
              <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#7d8498]">Корты</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedRound.courts.map((court) => {
                  const href = resolveCourtSelectionHref(
                    pathname,
                    snapshot.tournamentId,
                    selectedRound.roundType,
                    court,
                  );
                  const className = `rounded-full border px-4 py-2.5 text-[13px] font-bold uppercase tracking-[0.08em] transition ${courtTabClass(court.isSelected, court.isAvailable)} ${!court.isAvailable || loading || !href ? 'cursor-not-allowed opacity-55' : ''}`;
                  if (!href || !court.isAvailable || loading) {
                    return (
                      <span key={`${selectedRound.roundType}-${court.courtNo}`} aria-disabled="true" className={className}>
                        {localizeCourtLabel(court.label)}
                      </span>
                    );
                  }
                  return (
                    <Link
                      key={`${selectedRound.roundType}-${court.courtNo}`}
                      href={href}
                      prefetch={false}
                      className={className}
                      aria-current={court.isSelected ? 'page' : undefined}
                    >
                      {localizeCourtLabel(court.label)}
                    </Link>
                  );
                })}
              </div>
              {resolveCourtHelperText(selectedRound) ? (
                <div className="mt-2 text-[12px] text-[#9ca5bb]">{resolveCourtHelperText(selectedRound)}</div>
              ) : null}
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
