import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import type { TournamentResult, RatingHistoryEntry } from '@/lib/types';
import {
  fetchPlayer,
  fetchPlayerMatches,
  fetchRatingHistory,
  fetchPlayerExtendedStats,
  findPlayerIdsByName,
  type PlayerExtendedStats,
} from '@/lib/queries';
import EpicProfile from '@/components/players/EpicProfile';
import PartnerInbox from '@/components/profile/PartnerInbox';
import TelegramLinkForm from '@/components/profile/TelegramLinkForm';
import { verifyPlayerToken } from '@/lib/player-auth';

export const metadata: Metadata = {
  title: 'Профиль | Лютые Пляжники',
  description: 'Личный кабинет игрока — рейтинги, статистика, турнирная история.',
};

interface ProfilePageProps {
  searchParams?: Promise<{ id?: string }>;
}

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
  const params = (await searchParams) ?? {};
  const rawId = (params.id || '').trim();
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('player_session')?.value;
  const me = sessionToken ? verifyPlayerToken(sessionToken) : null;

  if (!rawId) {
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
                ID или имя игрока
              </label>
              <input
                name="id"
                placeholder="Напр. Лебедев или UUID"
                className="mt-2 w-full rounded-xl bg-surface border border-white/10 px-4 py-3 text-text-primary outline-none focus:border-brand transition-colors font-body"
              />
              <button type="submit" className="btn-action-outline mt-4 w-full sm:w-auto">
                Открыть профиль
              </button>
            </form>
          </div>
        </section>
        {me?.id ? (
          <>
            <PartnerInbox />
            <TelegramLinkForm />
          </>
        ) : null}
      </main>
    );
  }

  let playerId = rawId;
  let resolvedByName = false;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawId)) {
    const ids = await findPlayerIdsByName(rawId, 2);
    if (ids.length === 1) {
      playerId = ids[0];
      resolvedByName = true;
    } else if (ids.length > 1) {
      return (
        <main className="max-w-4xl mx-auto px-4 py-10">
          <div className="glass-panel rounded-2xl p-8 text-center border border-white/10">
            <div className="text-4xl mb-3">{'\u{1F50E}'}</div>
            <h2 className="font-heading text-3xl text-text-primary">Найдено несколько игроков</h2>
            <p className="mt-2 font-body text-text-secondary text-sm">
              Уточни запрос: <span className="text-text-primary/90">{rawId}</span>
            </p>
            <Link href="/rankings" className="btn-action-outline inline-block mt-6">
              Выбрать в рейтингах
            </Link>
          </div>
        </main>
      );
    } else {
      return (
        <main className="max-w-4xl mx-auto px-4 py-10">
          <div className="glass-panel rounded-2xl p-8 text-center border border-white/10">
            <div className="text-4xl mb-3">{'\u{1F6AB}'}</div>
            <h2 className="font-heading text-3xl text-text-primary">Игрок не найден</h2>
            <p className="mt-2 font-body text-text-secondary text-sm">
              По запросу <span className="text-text-primary/90">{rawId}</span> нет совпадений.
            </p>
            <Link href="/rankings" className="btn-action-outline inline-block mt-6">
              К рейтингам
            </Link>
          </div>
        </main>
      );
    }
  }

  let player = null;
  try {
    player = await fetchPlayer(playerId);
  } catch {
    player = null;
  }
  if (!player) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-10">
        <div className="glass-panel rounded-2xl p-8 text-center border border-white/10">
          <div className="text-4xl mb-3">{'\u{1F6AB}'}</div>
          <h2 className="font-heading text-3xl text-text-primary">Игрок не найден</h2>
          <p className="mt-2 font-body text-text-secondary text-sm">
            Проверь ID или имя и попробуй ещё раз.
          </p>
          <Link href="/rankings" className="btn-action-outline inline-block mt-6">
            К рейтингам
          </Link>
        </div>
      </main>
    );
  }

  let matches: TournamentResult[] = [];
  let ratingHistory: RatingHistoryEntry[] = [];
  let stats: PlayerExtendedStats = {
    totalTournaments: 0,
    gold: 0,
    silver: 0,
    bronze: 0,
    topThreeRate: 0,
    avgPlace: 0,
    bestPlace: 0,
    totalRatingPts: 0,
    avgRatingPts: 0,
    winRate: 0,
    totalWins: 0,
    totalBalls: 0,
    avgBalls: 0,
    bestTournament: null,
    currentStreak: { type: 'none', count: 0 },
    rankM: null,
    rankW: null,
    rankMix: null,
    formLast5: [],
  };
  try {
    [matches, ratingHistory, stats] = await Promise.all([
      fetchPlayerMatches(playerId, 30),
      fetchRatingHistory(playerId, 30),
      fetchPlayerExtendedStats(playerId),
    ]);
  } catch {
    // Keep profile page alive even if one of the analytical queries fails.
  }

  return (
    <main>
      {resolvedByName ? (
        <div className="max-w-5xl mx-auto px-4 pt-6">
          <div className="rounded-xl border border-brand/30 bg-brand/10 px-4 py-3 text-sm font-body text-brand-light">
            Профиль открыт по поиску имени: <span className="font-semibold">{rawId}</span>
          </div>
        </div>
      ) : null}
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
