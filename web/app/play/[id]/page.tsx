import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { PLAYER_COOKIE, verifyPlayerToken } from '@/lib/player-auth';
import { getAdminSessionFromCookies } from '@/lib/admin-auth';
import { getPlayPostDetail, isPlayPostManager } from '@/lib/play-service';
import {
  formatLevelRange,
  formatPlayDate,
  formatPlayPrice,
  formatPlayTime,
  gatherBadge,
  genderPolicyLabel,
} from '@/lib/play-ui';
import PlayJoinButton from '@/components/partner/PlayJoinButton';
import PlayShareButton from '@/components/partner/PlayShareButton';
import PlayInviteRespond from '@/components/play/PlayInviteRespond';
import PlayMassInviteButton from '@/components/play/PlayMassInviteButton';
import PlayResultForm from '@/components/play/PlayResultForm';
import PlayResultSummary from '@/components/play/PlayResultSummary';
import PlayResultLifecycleActions from '@/components/play/PlayResultLifecycleActions';
import PlayGameFlowSteps from '@/components/play/PlayGameFlowSteps';
import PlayAttendanceButtons from '@/components/play/PlayAttendanceButtons';
import PlayGameReportCard from '@/components/play/PlayGameReportCard';
import PlayRatingPreviewCard from '@/components/play/PlayRatingPreviewCard';
import type { PlayResultFormat } from '@/lib/play-result-core';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const post = await getPlayPostDetail(id);
  return post
    ? {
        title: `${post.title} | LPVolley`,
        description: post.description || 'Игра по пляжному волейболу в Сургуте.',
        alternates: { canonical: `https://lpvolley.ru/partner/${post.id}` },
        openGraph: { url: `https://lpvolley.ru/partner/${post.id}` },
      }
    : { title: 'Игра не найдена | LPVolley', robots: { index: false, follow: false } };
}

export default async function PlayGamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await cookies();
  const token = store.get(PLAYER_COOKIE)?.value;
  const me = token ? verifyPlayerToken(token) : null;
  const admin = await getAdminSessionFromCookies();
  const post = await getPlayPostDetail(id, me?.id);
  if (!post) notFound();

  const isManager = Boolean(admin && admin.role !== 'viewer') || (me ? await isPlayPostManager(me.id, post.id) : false);
  const address = [post.venue.city, post.venue.address].filter(Boolean).join(', ');
  const mapsUrl = `https://yandex.ru/maps/?text=${encodeURIComponent(address)}`;
  const widgetUrl = `https://yandex.ru/map-widget/v1/?text=${encodeURIComponent(address)}&z=15`;
  const badge = gatherBadge(post);
  const isParticipant = post.viewerStatus === 'confirmed';
  const canEnterResult = post.status === 'completed'
    || (post.status === 'published' && new Date(post.endsAt).getTime() <= Date.now());
  const availablePlaces = Math.max(0, post.capacity - post.confirmedCount);
  const ratingMode = (post as typeof post & { ratingMode?: string }).ratingMode === 'friendly' ? 'Обычная' : 'На рейтинг';
  const resultSettings = post as typeof post & {
    ratingMode?: 'rated' | 'friendly';
    resultFormat?: PlayResultFormat;
    resultConfig?: { pointLimit?: number; decidingPointLimit?: number } | null;
  };
  const shareText = [
    `${post.title}${post.formatLabel ? ` · ${post.formatLabel}` : ''}`,
    ratingMode,
    `${formatPlayDate(post.startsAt, { day: 'numeric', month: 'long' })}, ${formatPlayTime(post.startsAt)}`,
    post.venue.name,
    `${formatPlayPrice(post)} · ${availablePlaces ? `свободно мест: ${availablePlaces}` : 'состав заполнен'}`,
  ].join('\n');
  const nameByUserId = new Map(post.participants.map((p) => [p.resultKey, p.name]));
  const places = post.result && post.result.payload && typeof post.result.payload === 'object'
    ? ((post.result.payload as { places?: unknown }).places ?? null)
    : null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 md:py-9">
      <Link href="/partner" className="text-sm font-semibold text-cyan-200 transition hover:text-white">← Все игры</Link>

      <section className="relative mt-4 overflow-hidden rounded-2xl border border-white/10 bg-card p-5 shadow-lg md:p-6">
        <div className="absolute inset-x-0 top-0 h-1 bg-brand" />
        <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-cyan-300/10 blur-3xl" />
        <div className="relative grid gap-5 md:grid-cols-[1fr_250px]">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em]">
              <span className="text-orange-300">{post.kind === 'training' ? 'Тренировка' : 'Открытая игра'}</span>
              {post.kind === 'game' ? <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-text-secondary">{ratingMode}</span> : null}
              {post.status === 'cancelled' ? <span className="rounded-full bg-red-400/15 px-3 py-1 text-red-200">Отменено</span> : null}
              {post.gatherState === 'minimum_reached' ? <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-emerald-200">✅ Состоится</span> : null}
              {post.gatherState === 'at_risk' ? <span className="rounded-full bg-amber-300/15 px-3 py-1 text-amber-100">⚠️ Под угрозой отмены</span> : null}
              {!post.courtBooked && post.status === 'published' ? <span className="rounded-full bg-amber-300/10 px-3 py-1 text-amber-100">⚠️ корт не забронирован</span> : null}
            </div>
            <h1 className="mt-3 text-2xl font-black leading-tight tracking-tight text-text-primary md:text-3xl">{post.title}</h1>
            {post.description ? <p className="mt-3 max-w-2xl whitespace-pre-line text-sm leading-6 text-text-secondary">{post.description}</p> : null}

            <div className="mt-4 flex flex-wrap gap-2 text-xs text-text-secondary">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">{formatLevelRange(post.levelMin, post.levelMax)}</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">{genderPolicyLabel(post.genderPolicy)}</span>
              {post.formatLabel ? <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">{post.formatLabel}</span> : null}
            </div>

            {me && post.fit !== 'unknown' ? (
              <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-sm text-text-secondary">
                <p className="font-semibold text-text-primary">Почему тебе подходит</p>
                <ul className="mt-2 grid gap-1">
                  <li>{post.fit === 'match' ? '✓' : '✗'} Уровень: {formatLevelRange(post.levelMin, post.levelMax)}</li>
                  {post.pastTeammatesCount > 0 ? <li>✓ {post.pastTeammatesCount} из твоих прошлых игр играют</li> : null}
                  <li>{post.gatherState === 'full' ? '✗ Мест нет — только лист ожидания' : '✓ Есть место или лист ожидания'}</li>
                </ul>
              </div>
            ) : null}

            {post.viewerInvite?.status === 'sent' && me ? (
              <div className="mt-6">
                <PlayInviteRespond inviteId={post.viewerInvite.id} />
              </div>
            ) : null}
          </div>

          <aside className="rounded-xl border border-white/10 bg-surface-light/40 p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-text-secondary">{formatPlayDate(post.startsAt, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            <p className="mt-1 text-xl font-black text-text-primary">{formatPlayTime(post.startsAt)}–{formatPlayTime(post.endsAt)}</p>
            <div className="mt-3 border-t border-white/10 pt-3">
              <p className="text-xl font-black text-text-primary">{formatPlayPrice(post)}</p>
              {post.priceEstimate.approximate ? <p className="mt-1 text-xs text-text-secondary">Итог зависит от состава: корт {post.courtCostRub} ₽ делится на всех.</p> : null}
              <p className="mt-2 text-sm font-semibold text-text-secondary">{post.confirmedCount}/{post.capacity}{post.reserveCount ? ` · лист ожидания ${post.reserveCount}` : ''}</p>
              {badge ? <p className="mt-1 text-sm font-semibold text-emerald-300">{badge}</p> : null}
              {post.viewerWaitlistPosition ? <p className="mt-1 text-xs text-amber-200">Ты №{post.viewerWaitlistPosition} в листе ожидания — попадёшь в состав автоматически.</p> : null}
            </div>
            <div className="mt-5">
              {post.status === 'published' ? (
                <PlayJoinButton postId={post.id} initialStatus={post.viewerStatus} authenticated={Boolean(me)} joinPolicy={post.joinPolicy} returnTo={`/partner/${post.id}`} />
              ) : (
                <span className="text-sm text-red-200">Запись недоступна</span>
              )}
            </div>
            {isParticipant && post.status === 'published' && new Date(post.startsAt).getTime() > Date.now() ? (
              <div className="mt-4 border-t border-white/10 pt-4">
                <PlayAttendanceButtons postId={post.id} initialStatus={post.viewerAttendanceStatus} />
              </div>
            ) : null}
          </aside>
        </div>
      </section>

      {post.kind === 'game' && !post.result && ['published', 'completed'].includes(post.status) && (isManager || isParticipant) ? (
        <section id="live" className="relative mt-4 scroll-mt-24 overflow-hidden rounded-2xl border border-emerald-300/25 bg-card p-4 shadow-lg sm:p-5">
          {canEnterResult ? <span id="result-entry" className="absolute top-0 scroll-mt-24" aria-hidden="true" /> : null}
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-200">
                {canEnterResult ? 'Игра завершена' : 'Режим площадки'}
              </p>
              <h2 className="mt-1 text-2xl font-black text-text-primary">
                {canEnterResult ? 'Осталось внести счёт' : 'Провести игру без лишней информации'}
              </h2>
              <p className="mt-1 max-w-xl text-sm leading-6 text-text-secondary">
                Отдельный пульт покажет только состав, текущую партию и следующее действие.
              </p>
            </div>
            <Link
              href={`/partner/${post.id}/live`}
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-brand px-5 text-sm font-black text-white shadow-lg shadow-orange-950/20"
            >
              {canEnterResult ? 'Внести результат →' : 'Открыть пульт игры →'}
            </Link>
          </div>
          <div className="mt-4">
            <PlayGameFlowSteps current={canEnterResult ? 2 : 1} />
          </div>
        </section>
      ) : null}

      <div className="mt-4 grid gap-4">
        <div className="space-y-4">
          <section className="rounded-2xl border border-white/10 bg-card p-5">
            <h2 className="text-xs font-extrabold uppercase tracking-[0.16em] text-text-secondary">Игроки</h2>
            {post.participants.length ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {post.participants.map((participant) => participant.playerId ? (
                  <Link key={participant.id} href={`/players/${participant.playerId}`} className="group/player flex items-center gap-3 rounded-xl bg-surface-light/40 px-3 py-2 transition hover:bg-cyan-300/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {participant.avatarUrl ? <img src={participant.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" /> : <span className="grid h-8 w-8 place-items-center rounded-full bg-cyan-300/10 text-sm font-black text-cyan-100">{participant.name.slice(0, 1).toUpperCase()}</span>}
                    <span className="text-sm font-semibold text-text-primary transition group-hover/player:text-cyan-300">{participant.name}</span>
                    <span aria-hidden="true" className="ml-auto text-sm text-text-secondary transition group-hover/player:translate-x-0.5 group-hover/player:text-cyan-300">→</span>
                  </Link>
                ) : (
                  <div key={participant.id} className="flex items-center gap-3 rounded-xl bg-surface-light/40 px-3 py-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {participant.avatarUrl ? <img src={participant.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" /> : <span className="grid h-8 w-8 place-items-center rounded-full bg-cyan-300/10 text-sm font-black text-cyan-100">{participant.name.slice(0, 1).toUpperCase()}</span>}
                    <span className="text-sm font-semibold text-text-primary">{participant.name}</span>
                  </div>
                ))}
              </div>
            ) : <p className="mt-5 rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-text-secondary">Подтверждённых участников пока нет.</p>}
          </section>

          {post.result ? (
            <section id="result" className="scroll-mt-24 rounded-[1.75rem] border border-white/10 bg-white/[0.035] p-6">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="font-heading text-3xl tracking-wide text-text-primary">Результат</h2>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  post.result.status === 'confirmed'
                    ? 'bg-emerald-400/15 text-emerald-200'
                    : post.result.status === 'cancelled'
                      ? 'bg-slate-400/15 text-slate-200'
                    : post.result.status === 'disputed'
                      ? 'bg-rose-400/15 text-rose-200'
                      : 'bg-amber-300/15 text-amber-100'
                }`}>
                  {post.result.status === 'confirmed' ? 'Утверждён' : post.result.status === 'cancelled' ? 'Аннулирован' : post.result.status === 'disputed' ? 'Исправляется' : 'Ждёт организатора'}
                </span>
              </div>
              {Array.isArray(places) ? (
                <ol className="mt-4 grid gap-1 text-sm text-text-secondary">
                  {(places as number[]).map((userId, index) => (
                    <li key={userId}>{index + 1}. <span className="text-text-primary">{nameByUserId.get(Number(userId)) ?? `Игрок #${userId}`}</span></li>
                  ))}
                </ol>
              ) : <PlayResultSummary payload={post.result.payload} names={nameByUserId} />}
              <PlayGameReportCard payload={post.result.payload} names={nameByUserId} />
              {resultSettings.ratingMode !== 'friendly' && (isManager || isParticipant) ? <PlayRatingPreviewCard postId={post.id} names={Object.fromEntries(post.participants.filter((participant) => participant.userId != null).map((participant) => [participant.userId!, participant.name]))} /> : null}
              {post.result.confirmations.length ? (
                <p className="mt-3 text-xs text-text-secondary">
                  Подтвердили: {post.result.confirmations.filter((c) => c.verdict === 'confirmed').length} ·
                  Оспорили: {post.result.confirmations.filter((c) => c.verdict === 'disputed').length}
                </p>
              ) : null}
              <PlayResultLifecycleActions
                resultId={post.result.id}
                revision={post.result.revision}
                status={post.result.status}
                isManager={isManager}
                isParticipant={isParticipant}
                approvalBlocker={post.result.approvalBlocker}
                correctionRequests={post.result.correctionRequests}
                viewerUserId={me?.id}
              />
              {isManager && ['pending', 'disputed'].includes(post.result.status) ? (
                <details id="result-edit" open={post.result.status === 'disputed'} className="mt-4 rounded-xl border border-white/10 bg-surface/40 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-text-primary">Исправить счёт</summary>
                  <div className="mt-4">
                    <PlayResultForm
                      postId={post.id}
                      participants={post.participants.map((p) => ({ resultKey: p.resultKey, name: p.name, registered: p.userId != null, avatarUrl: p.avatarUrl }))}
                      initialFormat={resultSettings.resultFormat}
                      initialPointLimit={resultSettings.resultConfig?.pointLimit}
                      initialDecidingPointLimit={resultSettings.resultConfig?.decidingPointLimit}
                      initialPayload={post.result.payload}
                      resultId={post.result.id}
                      expectedRevision={post.result.revision}
                      ratingMode={resultSettings.ratingMode || 'rated'}
                      submitterRole="organizer"
                    />
                  </div>
                </details>
              ) : null}
            </section>
          ) : null}

          <section className="overflow-hidden rounded-2xl border border-white/10 bg-card">
            <div className="p-5"><h2 className="text-xs font-extrabold uppercase tracking-[0.16em] text-text-secondary">Площадка</h2><p className="mt-2 text-sm text-text-secondary"><span className="font-semibold text-text-primary">{post.venue.name}</span> · {address}</p></div>
            <iframe title={`Карта: ${post.venue.name}`} src={widgetUrl} width="100%" height="224" className="block h-56 min-w-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
            <div className="border-t border-white/10 p-4"><a href={mapsUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-cyan-200 hover:text-white">Открыть в Яндекс Картах →</a></div>
          </section>
        </div>

        <aside className="grid gap-4 sm:grid-cols-2">
          <section className="rounded-2xl border border-white/10 bg-card p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-text-secondary">Организатор</p>
            <h2 className="mt-2 text-lg font-black text-text-primary">{post.organizer.displayName}</h2>
            {post.organizer.contactUrl ? <a href={post.organizer.contactUrl} target="_blank" rel="noreferrer" className="mt-5 inline-flex rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2.5 text-sm font-semibold text-cyan-100">Связаться с организатором</a> : null}
          </section>

          {isManager && post.status === 'published' ? (
            <section className="rounded-[1.75rem] border border-brand/30 bg-brand/5 p-6">
              <h2 className="font-heading text-2xl text-text-primary">Пульт организатора</h2>
              <div className="mt-4 grid gap-3">
                <PlayMassInviteButton postId={post.id} />
                <Link href="/partner/manage" className="text-sm font-semibold text-cyan-200 hover:text-white">Заявки и настройки игры →</Link>
              </div>
            </section>
          ) : null}

          <section className="rounded-2xl border border-white/10 bg-card p-5">
            <h2 className="text-sm font-extrabold text-text-primary">Сохранить событие</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              <a href={`/api/play-posts/${post.id}/calendar`} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-text-primary transition hover:border-orange-300/50">В календарь</a>
              <PlayShareButton title={post.title} text={shareText} />
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
