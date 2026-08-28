import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import PlayGameFlowSteps from '@/components/play/PlayGameFlowSteps';
import PlayLiveSessionPanel from '@/components/play/PlayLiveSessionPanel';
import PlayResultForm from '@/components/play/PlayResultForm';
import { getAdminSessionFromCookies } from '@/lib/admin-auth';
import type { PlayActor } from '@/lib/play-auth';
import { getPlayLiveSession } from '@/lib/play-live-session';
import { getPlayPostDetail, isPlayPostManager } from '@/lib/play-service';
import { formatPlayDate, formatPlayTime } from '@/lib/play-ui';
import { PLAYER_COOKIE, verifyPlayerToken } from '@/lib/player-auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Проведение игры | LPVolley',
  robots: { index: false, follow: false },
};

export default async function PlayGameLivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await cookies();
  const token = store.get(PLAYER_COOKIE)?.value;
  const me = token ? verifyPlayerToken(token) : null;
  const admin = await getAdminSessionFromCookies();
  const post = await getPlayPostDetail(id, me?.id);
  if (!post) notFound();

  const isManager = Boolean(admin && admin.role !== 'viewer') || (me ? await isPlayPostManager(me.id, post.id) : false);
  const isParticipant = post.viewerStatus === 'confirmed';
  const actor: PlayActor | null = admin && admin.role !== 'viewer'
    ? { kind: 'admin', admin }
    : me
      ? { kind: 'user', userId: me.id, email: me.email }
      : null;
  const detailHref = `/partner/${post.id}`;

  if (post.kind !== 'game' || post.status === 'draft' || post.status === 'cancelled' || !actor || (!isManager && !isParticipant)) {
    redirect(detailHref);
  }
  if (post.result) redirect(`${detailHref}#result`);

  const session = await getPlayLiveSession(actor, post.id);
  const gameEnded = post.status === 'completed' || new Date(post.endsAt).getTime() <= Date.now();
  const showManualResult = !session && gameEnded;
  const initialResultFormat = post.resultFormat === 'legacy_custom' ? 'classic_2x2' : post.resultFormat;
  const resultConfig = post.resultConfig as { pointLimit?: number; decidingPointLimit?: number };

  return (
    <div className="min-h-dvh bg-surface">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-3 py-2.5 sm:px-5">
          <Link
            href={detailHref}
            aria-label="Вернуться к информации об игре"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 text-xl text-text-primary transition hover:border-cyan-300/40"
          >
            ←
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-brand">Режим площадки</p>
            <h1 className="truncate text-base font-black text-text-primary sm:text-lg">{post.title}</h1>
            <p className="truncate text-[11px] text-text-secondary">
              {formatPlayDate(post.startsAt, { day: 'numeric', month: 'short' })} · {formatPlayTime(post.startsAt)}–{formatPlayTime(post.endsAt)} · {post.venue.name}
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-bold text-text-secondary">
            {showManualResult ? 'Итог' : 'Live'}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3 sm:px-5 sm:pt-5">
        {showManualResult ? (
          <section className="rounded-2xl border border-amber-300/25 bg-card p-4 shadow-lg sm:p-5">
            <PlayGameFlowSteps current={2} />
            <div className="mt-5">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-amber-200">Шаг 2 из 3</p>
              <h2 className="mt-1 text-2xl font-black text-text-primary">Внесите счёт</h2>
            </div>
            <div className="mt-5">
              <PlayResultForm
                postId={post.id}
                participants={post.participants.map((participant) => ({ resultKey: participant.resultKey, name: participant.name, registered: participant.userId != null, avatarUrl: participant.avatarUrl }))}
                initialFormat={initialResultFormat}
                initialPointLimit={resultConfig.pointLimit}
                initialDecidingPointLimit={resultConfig.decidingPointLimit}
                ratingMode={post.ratingMode}
                submitterRole={isManager ? 'organizer' : 'participant'}
                focusMode
              />
            </div>
          </section>
        ) : (
          <PlayLiveSessionPanel
            postId={post.id}
            participants={post.participants.map((participant) => ({ resultKey: participant.resultKey, name: participant.name, avatarUrl: participant.avatarUrl, registered: participant.userId != null }))}
            canStart={isManager}
            canSubmit={isManager || isParticipant}
            endsAt={post.endsAt}
            initialSession={session}
            focusMode
            postCompleted={post.status === 'completed'}
          />
        )}
      </main>
    </div>
  );
}
