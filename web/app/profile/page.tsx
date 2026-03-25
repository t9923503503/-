import type { Metadata } from 'next';
import Link from 'next/link';
import {
  fetchPlayer,
  fetchPlayerMatches,
  fetchRatingHistory,
  fetchPlayerExtendedStats,
} from '@/lib/queries';
import EpicProfile from '@/components/players/EpicProfile';

export const metadata: Metadata = {
  title: 'Профиль | Лютые Пляжники',
  description: 'Личный кабинет игрока — рейтинги, статистика, турнирная история.',
};

interface ProfilePageProps {
  searchParams?: Promise<{ id?: string }>;
}

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
  const params = (await searchParams) ?? {};
  const playerId = params.id;

  if (!playerId) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-10">
        <h1 className="font-heading text-5xl md:text-6xl text-text-primary tracking-wide uppercase">
          Профиль
        </h1>
        <p className="mt-3 font-body text-text-secondary">
          Личный кабинет игрока.
        </p>

        <section className="mt-10">
          <div className="glass-panel rounded-2xl p-6 md:p-8 border border-white/10">
            <h2 className="font-heading text-3xl text-text-primary tracking-wide">
              Найди свой профиль
            </h2>
            <p className="mt-2 font-body text-text-secondary text-sm">
              Перейди в <Link href="/rankings" className="text-brand hover:underline">рейтинги</Link> и нажми на своё имя, чтобы открыть профиль.
            </p>

            <form method="get" action="/profile" className="mt-6">
              <label className="block text-text-secondary text-xs font-body uppercase tracking-widest">
                Player ID
              </label>
              <input
                name="id"
                placeholder="UUID игрока"
                className="mt-2 w-full rounded-xl bg-surface border border-white/10 px-4 py-3 text-text-primary outline-none focus:border-brand transition-colors font-body"
              />
              <button type="submit" className="btn-action-outline mt-4 w-full sm:w-auto">
                Открыть профиль
              </button>
            </form>
          </div>
        </section>
      </main>
    );
  }

  const player = await fetchPlayer(playerId);
  if (!player) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-10">
        <div className="glass-panel rounded-2xl p-8 text-center border border-white/10">
          <div className="text-4xl mb-3">{'\u{1F6AB}'}</div>
          <h2 className="font-heading text-3xl text-text-primary">Игрок не найден</h2>
          <p className="mt-2 font-body text-text-secondary text-sm">
            Проверь ID и попробуй ещё раз.
          </p>
          <Link href="/rankings" className="btn-action-outline inline-block mt-6">
            К рейтингам
          </Link>
        </div>
      </main>
    );
  }

  const [matches, ratingHistory, stats] = await Promise.all([
    fetchPlayerMatches(playerId, 30),
    fetchRatingHistory(playerId, 30),
    fetchPlayerExtendedStats(playerId),
  ]);

  return (
    <main>
      <EpicProfile
        player={player}
        stats={stats}
        matches={matches}
        ratingHistory={ratingHistory}
        backLink={{ href: '/rankings', label: '\u2190 Рейтинги' }}
      />
    </main>
  );
}
