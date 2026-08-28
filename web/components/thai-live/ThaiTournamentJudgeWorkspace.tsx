'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
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
  const [judgeScreenOpen, setJudgeScreenOpen] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [selectedTourNo, setSelectedTourNo] = useState(initialSnapshot.activeSnapshot.currentTourNo);
  const [judgeStandingsOpen, setJudgeStandingsOpen] = useState(false);
  const [activeMobileSection, setActiveMobileSection] = useState<'score' | 'tours' | 'standings' | 'details'>('score');
  const loadingRef = useRef(false);

  useEffect(() => {
    setSnapshot(initialSnapshot);
    setSelectedTourNo(initialSnapshot.activeSnapshot.currentTourNo);
    setError(null);
  }, [initialSnapshot]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

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
    if (loadingRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const next = await loadTournamentSnapshot(snapshot.tournamentId, roundType, courtNo);
      setSnapshot(next);
      setSelectedTourNo(next.activeSnapshot.currentTourNo);
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
      if (cancelled || loadingRef.current) return;
      if (document.visibilityState !== 'visible') return;
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
    pathname,
    router,
    snapshot.activeSnapshot.canAutoRefreshToNextStage,
    snapshot.selectedCourtNo,
    snapshot.selectedRoundType,
    snapshot.tournamentId,
  ]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !loadingRef.current) {
        void refreshCurrent();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
    };
  }, [snapshot.selectedCourtNo, snapshot.selectedRoundType, snapshot.tournamentId]);

  const snapshotAgeMs = Math.max(0, nowMs - (Date.parse(snapshot.activeSnapshot.lastUpdatedAt) || nowMs));
  const snapshotIsStale = snapshotAgeMs > 25000;

  function scrollJudgeTarget(targetId: string) {
    window.setTimeout(() => document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
  }

  return (
    <div className="min-h-screen min-h-[100dvh] overflow-x-hidden bg-[radial-gradient(circle_at_top,rgba(255,210,74,0.08),transparent_14%),linear-gradient(180deg,#080813,#0d0d18_28%,#090913)] px-3 pb-24 pt-3 text-white md:pb-7">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-3">
        <section id="thai-judge-details" className="scroll-mt-24 rounded-[18px] border border-white/8 bg-[linear-gradient(180deg,rgba(14,15,27,0.98),rgba(10,10,19,0.98))] px-3 py-2.5 shadow-[0_18px_50px_rgba(0,0,0,0.3)]">
          <button
            type="button"
            onClick={() => setJudgeScreenOpen((value) => !value)}
            className="flex w-full items-center justify-between gap-3 text-left"
            aria-expanded={judgeScreenOpen}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-[11px] font-bold uppercase tracking-[0.1em] text-[#ffd24a]">{snapshot.tournamentName}</span>
              <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#aeb6c8]">
                {snapshot.activeSnapshot.roundType.toUpperCase()} · {activeCourtBadgeLabel(snapshot).toUpperCase()} · T{selectedTourNo}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className={`rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] ${snapshot.activeSnapshot.kind === 'finished' ? 'border-white/10 bg-white/5 text-white/65' : 'border-[#ff4d43]/45 bg-[#221010] text-[#ff938b]'}`}>
                {snapshot.activeSnapshot.kind === 'finished' ? 'WAIT' : 'LIVE'}
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#aeb6c8]">
                {judgeScreenOpen ? 'Скрыть' : 'Детали'}
              </span>
            </div>
          </button>

          {judgeScreenOpen ? (
            <>
              <div className="mt-3 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-heading text-[20px] leading-[0.98] uppercase tracking-[0.05em] text-[#ffd24a] sm:text-[24px]">
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

              {snapshotIsStale ? (
                <div className="mt-3 rounded-[14px] border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-100">
                  Снимок турнира устарел. Обновите экран или вернитесь во вкладку.
                </div>
              ) : null}

              {error ? (
                <div className="mt-3 rounded-[14px] border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                  <div>{error}</div>
                  <button
                    type="button"
                    onClick={() => void refreshCurrent()}
                    className="mt-2 rounded-full border border-red-300/35 bg-red-500/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-red-50"
                  >
                    Повторить
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
        </section>

        <section id="thai-judge-tours" className="scroll-mt-24 rounded-[20px] border border-white/8 bg-[linear-gradient(180deg,rgba(14,15,27,0.98),rgba(10,10,19,0.98))] px-3.5 py-3.5 shadow-[0_18px_48px_rgba(0,0,0,0.28)]">
          <div>
            <button
              type="button"
            onClick={() => setNavigationOpen((value) => !value)}
            className="flex w-full items-center justify-between gap-3 text-left"
            aria-expanded={navigationOpen}
          >
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#aeb6c8]">
                {selectedRound?.label ?? snapshot.activeSnapshot.roundType.toUpperCase()} · {localizeCourtLabel(snapshot.activeSnapshot.courtLabel)} · T{selectedTourNo}
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#aeb6c8]">
                {navigationOpen ? 'Скрыть' : 'Изменить'}
              </span>
            </button>
            {navigationOpen ? (
              <>
                <div className="mt-3 text-[9px] font-semibold uppercase tracking-[0.22em] text-[#7d8498]">Раунды</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {snapshot.rounds.map((round) => {
                    const fallbackCourt = round.courts.find((court) => court.isAvailable) ?? round.courts[0] ?? null;
                    const href = fallbackCourt
                      ? resolveCourtSelectionHref(pathname, snapshot.tournamentId, round.roundType, fallbackCourt)
                      : null;
                    const className = `rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] transition ${roundTabClass(round.isSelected, round.isAvailable)} ${!round.isAvailable || loading || !href ? 'cursor-not-allowed opacity-55' : ''}`;
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
              </>
            ) : null}
          </div>

          {selectedRound && navigationOpen ? (
            <div className="mt-3 border-t border-white/8 pt-3">
              <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#7d8498]">Корты</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedRound.courts.map((court) => {
                      const href = resolveCourtSelectionHref(
                        pathname,
                        snapshot.tournamentId,
                        selectedRound.roundType,
                        court,
                      );
                      const className = `rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] transition ${courtTabClass(court.isSelected, court.isAvailable)} ${!court.isAvailable || loading || !href ? 'cursor-not-allowed opacity-55' : ''}`;
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
              <div className="mt-3 border-t border-white/8 pt-3">
                <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#7d8498]">Туры</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {snapshot.activeSnapshot.tours.map((tour) => {
                    const active = tour.tourNo === selectedTourNo;
                    const disabled = tour.tourNo > snapshot.activeSnapshot.currentTourNo;
                    return (
                      <button
                        key={tour.tourId}
                        type="button"
                        disabled={disabled}
                        onClick={() => setSelectedTourNo(tour.tourNo)}
                        className={`rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] transition ${
                          active
                            ? 'border-[#ffd24a] bg-[#ffd24a] text-[#17130b]'
                            : tour.status === 'confirmed'
                              ? 'border-white/10 bg-white/5 text-white/75'
                              : 'border-white/10 bg-white/5 text-[#838aa0]'
                        } ${disabled || loading ? 'cursor-not-allowed opacity-40' : ''}`}
                      >
                        T{tour.tourNo}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </section>

        <ThaiJudgeWorkspace
          initialSnapshot={snapshot.activeSnapshot}
          navigationMode="embedded"
          selectedTourNo={selectedTourNo}
          onSelectedTourNoChange={setSelectedTourNo}
          showTourPicker={false}
          standingsOpen={judgeStandingsOpen}
          onStandingsOpenChange={setJudgeStandingsOpen}
          onSnapshotChange={(nextSnapshot) => {
            void refreshCurrent(nextSnapshot);
          }}
        />
      </div>
      <nav className="mobile-bottom-nav judge-mobile-bottom-nav border-white/10 bg-[#090913]/95 text-white backdrop-blur md:hidden" aria-label="Навигация судьи">
        <div className="mx-auto grid h-[4.25rem] max-w-md grid-cols-4 px-2">
          <JudgeMobileButton label="Счёт" icon="15:8" active={activeMobileSection === 'score'} onClick={() => { setActiveMobileSection('score'); scrollJudgeTarget('thai-judge-score'); }} />
          <JudgeMobileButton label="Туры" icon={`T${selectedTourNo}`} active={activeMobileSection === 'tours'} onClick={() => { setActiveMobileSection('tours'); setNavigationOpen(true); scrollJudgeTarget('thai-judge-tours'); }} />
          <JudgeMobileButton label="Таблица" icon="≡" active={activeMobileSection === 'standings'} onClick={() => { setActiveMobileSection('standings'); setJudgeStandingsOpen(true); scrollJudgeTarget('thai-judge-standings'); }} />
          <JudgeMobileButton label="Детали" icon="•••" active={activeMobileSection === 'details'} onClick={() => { setActiveMobileSection('details'); setJudgeScreenOpen(true); scrollJudgeTarget('thai-judge-details'); }} />
        </div>
      </nav>
    </div>
  );
}

function JudgeMobileButton({ label, icon, active, onClick }: { label: string; icon: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-current={active ? 'page' : undefined} className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[10px] font-bold ${active ? 'text-[#ffd24a]' : 'text-[#9ca5bb]'}`}>
      <span className={`grid h-8 min-w-10 place-items-center rounded-xl px-1 text-xs font-black ${active ? 'bg-[#ffd24a]/15 text-[#ffd24a] ring-1 ring-[#ffd24a]/30' : 'bg-white/5 text-white'}`}>{icon}</span>
      <span className="truncate leading-none">{label}</span>
    </button>
  );
}
