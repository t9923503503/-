import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PlayGameFlowSteps from '@/components/play/PlayGameFlowSteps';
import PlayLiveSessionPanel from '@/components/play/PlayLiveSessionPanel';
import PlayResultForm from '@/components/play/PlayResultForm';
import type { PlayLiveSessionView } from '@/lib/play-live-core';

export const metadata: Metadata = {
  title: 'Предпросмотр быстрого результата | LPVolley',
  robots: { index: false, follow: false },
};

const previewParticipants = [
  { resultKey: 101, name: 'Анна Волкова', registered: true },
  { resultKey: 102, name: 'Максим Орлов', registered: true },
  { resultKey: 1000000001, name: 'Сергей (гость)', registered: false },
  { resultKey: 1000000002, name: 'Олег (гость)', registered: false },
];

export default async function PlayResultPreviewPage({ searchParams }: { searchParams?: Promise<{ mode?: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const mode = (await searchParams)?.mode;
  const showLive = mode === 'live';
  const now = Date.now();
  const endsAt = new Date(now + 90 * 60_000).toISOString();
  const previewLiveSession: PlayLiveSessionView = {
    id: '10000000-0000-4000-8000-000000000001',
    postId: 'preview',
    status: 'active',
    revision: 4,
    updatedAt: new Date(now).toISOString(),
    state: {
      format: 'classic_2x2',
      pairingMode: 'fixed',
      pointLimit: 21,
      roundDurationMinutes: 10,
      roster: previewParticipants.map((participant) => participant.resultKey),
      activeRoster: previewParticipants.map((participant) => participant.resultKey),
      startedAt: new Date(now - 30 * 60_000).toISOString(),
      matches: [{ id: 'set-1', teamA: [101, 102], teamB: [1000000001, 1000000002], scoreA: 0, scoreB: 0, pointLimit: 21 }],
      rounds: [],
      completedRoundIds: [],
      history: [],
    },
  };
  return (
    <div className="min-h-dvh bg-surface">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-3 py-2.5 sm:px-5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 text-xl text-text-primary">←</span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-brand">Режим площадки</p>
            <h1 className="truncate text-base font-black text-text-primary sm:text-lg">Вечерняя игра 2×2</h1>
            <p className="truncate text-[11px] text-text-secondary">15 авг. · 20:00–22:00 · Малибу внутри</p>
          </div>
          <span className="shrink-0 rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-bold text-text-secondary">{showLive ? 'Live' : 'Итог'}</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3 sm:px-5 sm:pt-5">
        {showLive ? (
          <PlayLiveSessionPanel
            postId="preview"
            participants={previewParticipants}
            canStart
            canSubmit
            endsAt={endsAt}
            initialSession={previewLiveSession}
            focusMode
          />
        ) : <section className="rounded-2xl border border-amber-300/25 bg-card p-4 shadow-lg sm:p-5">
          <PlayGameFlowSteps current={2} />
          <div className="mt-5">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-amber-200">Шаг 2 из 3</p>
            <h2 className="mt-1 text-2xl font-black text-text-primary">Внесите счёт</h2>
          </div>
          <div className="mt-5">
            <PlayResultForm postId="preview" participants={previewParticipants} initialFormat="classic_2x2" initialPointLimit={21} initialDecidingPointLimit={15} focusMode />
          </div>
        </section>}
      </main>
    </div>
  );
}
