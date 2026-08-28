import Link from 'next/link';
import type { PlayPlayerStats } from '@/lib/play-player-stats';

function formatDate(value: string): string {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Yekaterinburg',
    }).format(new Date(value));
  } catch {
    return '';
  }
}

export default function PlayerGameStats({ stats }: { stats: PlayPlayerStats }) {
  const decisions = stats.wins + stats.losses;
  const winRate = decisions > 0 ? Math.round((stats.wins / decisions) * 100) : 0;

  return (
    <section className="mx-auto max-w-6xl px-4 pb-10 md:pb-14" aria-labelledby="player-game-stats-heading">
      <div className="overflow-hidden rounded-[28px] border border-cyan-300/20 bg-card shadow-[0_18px_50px_rgba(2,8,23,0.12)]">
        <div className="flex flex-col gap-4 border-b border-white/10 bg-[radial-gradient(circle_at_0%_0%,rgba(34,211,238,0.14),transparent_42%),radial-gradient(circle_at_100%_0%,rgba(255,90,0,0.12),transparent_36%)] px-5 py-6 md:flex-row md:items-end md:justify-between md:px-7">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-cyan-300">Обычные игры</p>
            <h2 id="player-game-stats-heading" className="mt-2 font-heading text-4xl uppercase tracking-wide text-text-primary md:text-5xl">
              Игровая статистика
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-text-secondary">
              Отдельно от официального турнирного рейтинга. Учитываются подтверждённые матчи.
            </p>
          </div>
          {stats.matches > 0 ? (
            <div className="rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-5 py-3 text-left md:text-right">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">Игровой рейтинг</div>
              <div className="mt-1 text-3xl font-black text-text-primary">{stats.rating}</div>
            </div>
          ) : null}
        </div>

        {stats.matches > 0 ? (
          <div className="grid gap-5 p-5 md:p-7 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
                {[
                  ['Матчей', stats.matches],
                  ['Побед', stats.wins],
                  ['Поражений', stats.losses],
                  ['Эффективность', `${winRate}%`],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-2xl border border-white/10 bg-surface-light/40 p-4">
                    <div className="text-2xl font-black text-text-primary">{value}</div>
                    <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-text-secondary">{label}</div>
                  </div>
                ))}
              </div>

              {stats.recentForm.length ? (
                <div className="mt-4 rounded-2xl border border-white/10 bg-surface-light/30 p-4">
                  <div className="text-xs font-bold uppercase tracking-[0.14em] text-text-secondary">
                    Последняя форма{stats.winStreak ? ` · серия ${stats.winStreak}` : ''}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {stats.recentForm.map((outcome, index) => (
                      <span
                        key={`${outcome}-${index}`}
                        className={`grid h-8 w-8 place-items-center rounded-full text-xs font-black ${
                          outcome === 'W'
                            ? 'bg-emerald-400/15 text-emerald-300'
                            : 'bg-rose-400/15 text-rose-300'
                        }`}
                      >
                        {outcome === 'W' ? 'В' : 'П'}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div>
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-heading text-3xl uppercase tracking-wide text-text-primary">Последние матчи</h3>
                <span className="text-xs text-text-secondary">Только публичные</span>
              </div>
              {stats.history.length ? (
                <div className="mt-3 grid gap-2">
                  {stats.history.slice(0, 5).map((item) => (
                    <Link
                      key={item.resultId}
                      href={`/partner/${item.postId}`}
                      className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-surface-light/30 px-4 py-3 transition hover:border-cyan-300/35"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-text-primary">{item.title}</div>
                        <div className="mt-1 text-xs text-text-secondary">{formatDate(item.createdAt)}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className={`text-sm font-black ${item.delta >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                          {item.delta >= 0 ? '+' : ''}{item.delta}
                        </div>
                        <div className="text-[10px] text-text-secondary">{item.ratingAfter}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="mt-3 rounded-2xl border border-dashed border-white/15 px-5 py-8 text-sm text-text-secondary">
                  Подтверждённые матчи есть, но среди них пока нет публичных игр.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="px-5 py-9 text-center md:px-7 md:py-12">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-cyan-300/10 text-2xl" aria-hidden>🏐</div>
            <h3 className="mt-4 text-lg font-black text-text-primary">Статистика появится после первого подтверждённого матча</h3>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-text-secondary">
              После игры участники подтверждают результат — затем обновляются история, форма и игровой рейтинг.
            </p>
            <Link href="/partner" className="mt-5 inline-flex rounded-xl bg-brand px-5 py-2.5 text-sm font-black text-white transition hover:bg-brand/90">
              Смотреть игры
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
