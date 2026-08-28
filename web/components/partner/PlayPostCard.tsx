import Link from 'next/link';
import type { PlayPostView } from '@/lib/play-service';
import {
  PLAY_FIT_LABELS,
  formatLevelRange,
  formatPlayDate,
  formatPlayPrice,
  formatPlayTime,
  genderPolicyLabel,
} from '@/lib/play-ui';
import PlayJoinButton from '@/components/partner/PlayJoinButton';

const FIT_TONES = {
  match: 'border-emerald-400/35 bg-emerald-400/10 text-emerald-200',
  level_too_high: 'border-amber-300/35 bg-amber-300/10 text-amber-100',
  level_too_low: 'border-cyan-300/35 bg-cyan-300/10 text-cyan-100',
  gender_mismatch: 'border-rose-300/35 bg-rose-300/10 text-rose-100',
  unknown: 'border-white/15 bg-white/5 text-text-secondary',
} as const;

export default function PlayPostCard({ post, authenticated }: { post: PlayPostView; authenticated: boolean }) {
  const available = Math.max(0, post.capacity - post.confirmedCount);
  const isTraining = post.kind === 'training';
  return (
    <article className="group relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#0b111b]/90 p-5 transition duration-300 hover:-translate-y-1 hover:border-cyan-300/25 md:p-6">
      <div className={`absolute inset-y-0 left-0 w-1 ${isTraining ? 'bg-cyan-300' : 'bg-brand'}`} />
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em]">
            <span className={isTraining ? 'text-cyan-200' : 'text-orange-300'}>
              {isTraining ? 'Тренировка' : 'Игра'}
            </span>
            <span className="text-text-secondary">{formatPlayDate(post.startsAt, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
            <span className="text-text-secondary">{formatPlayTime(post.startsAt)}–{formatPlayTime(post.endsAt)}</span>
          </div>
          <Link href={`/partner/${post.id}`} className="mt-3 block">
            <h2 className="font-heading text-3xl tracking-wide text-text-primary transition group-hover:text-white md:text-4xl">
              {post.title}
            </h2>
          </Link>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-text-secondary">
            {post.kind === 'game' ? <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">{post.ratingMode === 'friendly' ? 'Обычная' : 'На рейтинг'}</span> : null}
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">{formatLevelRange(post.levelMin, post.levelMax)}</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">{genderPolicyLabel(post.genderPolicy)}</span>
            {post.formatLabel ? <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">{post.formatLabel}</span> : null}
          </div>
          <div className="mt-5 grid gap-2 text-sm text-text-secondary sm:grid-cols-2">
            <p><span className="text-text-primary">{post.venue.name}</span> · {post.venue.address}</p>
            <p>{post.coach ? `Тренер: ${post.coach.name}` : `Организатор: ${post.organizer.displayName}`}</p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-3 md:items-end">
          <div className="text-left md:text-right">
            <div className="font-heading text-3xl text-text-primary">{formatPlayPrice(post)}</div>
            <div className={`mt-1 text-sm font-semibold ${available ? 'text-emerald-300' : 'text-amber-200'}`}>
              {post.confirmedCount}/{post.capacity} · {available ? `нужно ${available}` : 'мест нет'}
            </div>
            {post.reserveCount ? <div className="mt-1 text-xs text-text-secondary">В резерве: {post.reserveCount}</div> : null}
          </div>
          <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${FIT_TONES[post.fit]}`}>
            {PLAY_FIT_LABELS[post.fit]}
          </span>
          <PlayJoinButton
            postId={post.id}
            initialStatus={post.viewerStatus}
            authenticated={authenticated}
            joinPolicy={post.joinPolicy}
            compact
          />
        </div>
      </div>
    </article>
  );
}
