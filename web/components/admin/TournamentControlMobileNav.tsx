'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

export type TournamentControlCourtNav = { key: string; label: string; status: string; targetId: string; judgeUrl?: string | null; active?: boolean };
export type TournamentControlRoundNav = { key: string; label: string; status: string; targetId: string; active?: boolean; courts: TournamentControlCourtNav[] };
type ExtraLink = { href: string; label: string; note: string; external?: boolean };
type Sheet = 'rounds' | 'courts' | 'more' | null;

function scrollToTarget(targetId: string) {
  document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function TournamentControlMobileNav({ format, rounds, overviewTargetId, resultsTargetId, extras }: { format: string; rounds: TournamentControlRoundNav[]; overviewTargetId: string; resultsTargetId: string; extras: ExtraLink[] }) {
  const suggestedRound = rounds.find((round) => round.active)?.key ?? rounds.at(-1)?.key ?? '';
  const [selectedRoundKey, setSelectedRoundKey] = useState(suggestedRound);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [activeSection, setActiveSection] = useState<'overview' | 'rounds' | 'courts' | 'results' | 'more'>('overview');

  useEffect(() => {
    if (!rounds.some((round) => round.key === selectedRoundKey)) setSelectedRoundKey(suggestedRound);
  }, [rounds, selectedRoundKey, suggestedRound]);

  useEffect(() => {
    const targets = [
      { id: overviewTargetId, section: 'overview' as const },
      ...rounds.map((round) => ({ id: round.targetId, section: 'rounds' as const })),
      ...rounds.flatMap((round) => round.courts.map((court) => ({ id: court.targetId, section: 'courts' as const }))),
      { id: resultsTargetId, section: 'results' as const },
    ];
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
        const match = visible ? targets.find((target) => target.id === visible.target.id) : null;
        if (match) setActiveSection(match.section);
      },
      { rootMargin: '-18% 0px -62% 0px', threshold: [0, 0.1, 0.5] },
    );
    targets.forEach((target) => {
      const element = document.getElementById(target.id);
      if (element) observer.observe(element);
    });
    return () => observer.disconnect();
  }, [overviewTargetId, resultsTargetId, rounds]);

  const selectedRound = useMemo(() => rounds.find((round) => round.key === selectedRoundKey) ?? rounds.find((round) => round.active) ?? rounds.at(-1) ?? null, [rounds, selectedRoundKey]);
  function navigate(targetId: string, section?: typeof activeSection) {
    setSheet(null);
    if (section) setActiveSection(section);
    window.setTimeout(() => scrollToTarget(targetId), 20);
  }

  function openSheet(nextSheet: Exclude<Sheet, null>) {
    setActiveSection(nextSheet);
    setSheet(nextSheet);
  }

  return (
    <>
      {sheet ? (
        <div className="fixed inset-0 z-[105] md:hidden" role="dialog" aria-modal="true" aria-label="Навигация по турниру">
          <button type="button" className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSheet(null)} aria-label="Закрыть меню турнира" />
          <div className="admin-more-sheet absolute inset-x-0 mx-auto max-w-lg rounded-t-[1.75rem] border border-white/15 bg-card p-4 shadow-[0_-24px_60px_rgba(0,0,0,0.42)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-brand">{format} · управление</p><h2 className="mt-1 text-xl font-black text-text-primary">{sheet === 'rounds' ? 'Раунды турнира' : sheet === 'courts' ? 'Корты' : 'Дополнительно'}</h2></div>
              <button type="button" onClick={() => setSheet(null)} className="grid h-10 w-10 place-items-center rounded-full border border-white/15 text-xl text-text-primary" aria-label="Закрыть">×</button>
            </div>
            {sheet === 'rounds' ? <div className="grid gap-2">{rounds.map((round) => <button key={round.key} type="button" onClick={() => { setSelectedRoundKey(round.key); navigate(round.targetId); }} className={`flex items-center justify-between rounded-2xl border p-4 text-left ${round.active ? 'border-brand bg-brand/10' : 'border-white/10 bg-surface-light/40'}`}><span><span className="block text-base font-black text-text-primary">{round.label}</span><span className="mt-1 block text-xs text-text-secondary">{round.courts.length} корт(а)</span></span><span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wide ${round.active ? 'bg-brand text-white' : 'bg-white/10 text-text-secondary'}`}>{round.status}</span></button>)}{!rounds.length ? <p className="rounded-2xl border border-dashed border-white/15 p-5 text-sm text-text-secondary">Раунды ещё не сформированы.</p> : null}</div> : null}
            {sheet === 'courts' ? <div><div className="mb-3 flex gap-2 overflow-x-auto pb-1">{rounds.map((round) => <button key={round.key} type="button" onClick={() => setSelectedRoundKey(round.key)} className={`shrink-0 rounded-full border px-4 py-2 text-xs font-black ${selectedRound?.key === round.key ? 'border-brand bg-brand text-white' : 'border-white/15 text-text-secondary'}`}>{round.label}</button>)}</div><div className="grid gap-2">{selectedRound?.courts.map((court) => <div key={court.key} className={`flex items-center gap-2 rounded-2xl border p-2 ${court.active ? 'border-emerald-400/40 bg-emerald-500/10' : 'border-white/10 bg-surface-light/40'}`}><button type="button" onClick={() => navigate(court.targetId)} className="min-w-0 flex-1 px-2 py-2 text-left"><span className="block truncate text-sm font-black text-text-primary">{court.label}</span><span className={`mt-1 block text-[10px] font-bold uppercase tracking-wide ${court.active ? 'text-emerald-300' : 'text-text-secondary'}`}>{court.status}</span></button>{court.judgeUrl ? <a href={court.judgeUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-xl bg-brand px-3 py-2 text-xs font-black text-white">Судейство ↗</a> : null}</div>)}{!selectedRound?.courts.length ? <p className="rounded-2xl border border-dashed border-white/15 p-5 text-sm text-text-secondary">Корты этого раунда ещё не готовы.</p> : null}</div></div> : null}
            {sheet === 'more' ? <div className="grid grid-cols-2 gap-2">{extras.map((item) => item.external ? <a key={item.href} href={item.href} target="_blank" rel="noopener noreferrer" className="rounded-2xl border border-white/10 bg-surface-light/40 p-3"><span className="block text-sm font-black text-text-primary">{item.label} ↗</span><span className="mt-1 block text-[10px] leading-4 text-text-secondary">{item.note}</span></a> : <Link key={item.href} href={item.href} className="rounded-2xl border border-white/10 bg-surface-light/40 p-3"><span className="block text-sm font-black text-text-primary">{item.label}</span><span className="mt-1 block text-[10px] leading-4 text-text-secondary">{item.note}</span></Link>)}</div> : null}
          </div>
        </div>
      ) : null}
      <nav className="mobile-bottom-nav admin-mobile-bottom-nav tournament-control-mobile-nav md:hidden" aria-label="Управление ходом турнира">
        <div className="mx-auto grid h-[4.25rem] max-w-md grid-cols-5 px-1.5">
          <ControlButton label="Обзор" icon="⌂" active={activeSection === 'overview'} onClick={() => navigate(overviewTargetId, 'overview')} />
          <ControlButton label="Раунды" icon={selectedRound?.label ?? 'R'} active={activeSection === 'rounds'} onClick={() => openSheet('rounds')} />
          <ControlButton label="Корты" icon={String(selectedRound?.courts.length ?? '—')} active={activeSection === 'courts'} onClick={() => openSheet('courts')} />
          <ControlButton label="Итоги" icon="≡" active={activeSection === 'results'} onClick={() => navigate(resultsTargetId, 'results')} />
          <ControlButton label="Ещё" icon="•••" active={activeSection === 'more'} onClick={() => openSheet('more')} />
        </div>
      </nav>
    </>
  );
}

function ControlButton({ label, icon, active, onClick }: { label: string; icon: string; active: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-current={active ? 'page' : undefined} className={`relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[10px] font-bold transition-colors ${active ? 'text-brand' : 'text-text-secondary hover:text-brand'}`}><span className={`grid h-8 min-w-9 place-items-center rounded-xl px-1 text-sm font-black ${active ? 'bg-brand/15 text-brand ring-1 ring-brand/30' : 'bg-white/5 text-text-primary'}`}>{icon}</span><span className="truncate leading-none">{label}</span></button>;
}
