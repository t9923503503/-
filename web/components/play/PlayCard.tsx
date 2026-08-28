import Link from 'next/link';
import type { PlayPostView } from '@/lib/play-service';
import { formatLevelRange, formatPlayDate, formatPlayPrice, formatPlayTime, gatherBadge, genderPolicyLabel } from '@/lib/play-ui';
import PlayJoinButton from '@/components/partner/PlayJoinButton';

export default function PlayCard({ post, authenticated, hot = false }: { post: PlayPostView; authenticated: boolean; hot?: boolean }) {
  const badge = gatherBadge(post);
  const full = post.confirmedCount >= post.capacity;
  return (
    <article className={`group relative cursor-pointer rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-lg ${full ? 'border-white/10 bg-surface-light/40' : 'border-white/12 bg-card'}`}>
      <Link href={`/partner/${post.id}`} aria-label={`Открыть игру «${post.title}»`} className="absolute inset-0 z-0 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
        <span className="sr-only">Открыть игру «{post.title}»</span>
      </Link>
      <span className="pointer-events-none absolute inset-y-3 left-0 w-1 rounded-r-full bg-brand" />
      <div className="pointer-events-none relative z-10 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 pl-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-black tracking-tight text-text-primary transition group-hover:text-brand sm:text-lg">{post.title}</span>
            <span className="rounded-full bg-orange-500/10 px-2.5 py-1 text-[11px] font-extrabold text-orange-300">{formatLevelRange(post.levelMin, post.levelMax)}</span>
            {hot ? <span className="rounded-full border border-orange-400/25 bg-orange-400/10 px-2.5 py-1 text-[11px] font-extrabold text-orange-300">🔥 Тебе подходит</span> : null}
          </div>
          <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium text-text-secondary">
            <span>{formatPlayDate(post.startsAt, { weekday: 'short', day: 'numeric', month: 'short' })} · {formatPlayTime(post.startsAt)}–{formatPlayTime(post.endsAt)}</span>
            <span>{post.venue.name}</span>
            <span>{genderPolicyLabel(post.genderPolicy)}</span>
            {post.formatLabel ? <span>{post.formatLabel}</span> : null}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <strong className="text-sm text-text-primary">{post.confirmedCount}/{post.capacity} игроков</strong>
            {badge ? <span className="font-bold text-cyan-300">{badge}</span> : null}
            {post.reserveCount ? <span className="font-semibold text-amber-300">лист ожидания {post.reserveCount}</span> : null}
          </div>
          {!post.courtBooked ? <span className="mt-3 inline-flex rounded-full border border-amber-300/25 bg-amber-300/10 px-2.5 py-1 text-[11px] font-bold text-amber-200">⚠ корт не забронирован</span> : null}
        </div>
        <div className="flex shrink-0 items-center justify-between gap-4 sm:flex-col sm:items-end">
          <div className="sm:text-right"><div className="text-lg font-black text-text-primary">{formatPlayPrice(post)}</div>{post.priceEstimate.approximate ? <div className="text-[10px] text-text-secondary">зависит от состава</div> : null}</div>
          <div className="pointer-events-auto"><PlayJoinButton postId={post.id} initialStatus={post.viewerStatus} authenticated={authenticated} joinPolicy={post.joinPolicy} returnTo={`/partner/${post.id}`} compact /></div>
        </div>
      </div>
    </article>
  );
}
