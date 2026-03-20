import type { Metadata } from 'next';
import Link from 'next/link';
import {
  fetchPlayer,
  fetchPlayerMatches,
  fetchRatingHistory,
  fetchTournaments,
  fetchTeamsLookingForPartner,
} from '@/lib/queries';
import PlayerCard from '@/components/players/PlayerCard';
import HallOfFame from '@/components/players/HallOfFame';
import MatchHistory from '@/components/players/MatchHistory';
import RatingHistory from '@/components/players/RatingHistory';
import LookingTeams from '@/components/players/LookingTeams';

export const metadata: Metadata = {
  title: 'Профиль | Лютые Пляжники',
  description: 'Личный кабинет игрока — регистрации, статистика, контакты.',
};

interface ProfilePageProps {
  searchParams?: Promise<{ id?: string }>;
}

export default async function ProfilePage({
  searchParams,
}: ProfilePageProps) {
  const params = (await searchParams) ?? {};
  const playerId = params.id;

  return (
    <main className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-heading text-5xl md:text-6xl text-text-primary tracking-wide uppercase">
            Профиль
          </h1>
          <p className="mt-3 font-body text-text-secondary">
            Личный кабинет игрока (пока без авторизации).
          </p>
        </div>

        <div className="text-sm">
          <Link
            href="/rankings"
            className="inline-flex items-center gap-2 text-text-secondary hover:text-brand transition-colors font-condensed"
          >
            ← В рейтинги
          </Link>
        </div>
      </div>

      {!playerId ? (
        <section className="mt-10">
          <div className="glass-panel rounded-2xl p-6 md:p-8">
            <h2 className="font-heading text-3xl text-text-primary tracking-wide">
              Введите `playerId`
            </h2>
            <p className="mt-2 font-body text-text-secondary text-sm">
              Авторизация в разработке. Для просмотра кабинета укажи ID игрока
              (UUID) из таблицы игроков.
            </p>

            <form method="get" action="/profile" className="mt-6">
              <label className="block text-text-secondary text-xs font-body uppercase tracking-widest">
                playerId
              </label>
              <input
                name="id"
                placeholder="например: 3fa85f64-5717-4562-b3fc-2c963f66afa6"
                className="mt-2 w-full rounded-xl bg-surface border border-white/10 px-4 py-3 text-text-primary outline-none focus:border-brand transition-colors font-body"
              />

              <div className="mt-5 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                <button type="submit" className="btn-action-outline w-full sm:w-auto">
                  Открыть кабинет
                </button>
                <a
                  href="/login"
                  className="text-center inline-flex items-center justify-center px-6 py-3 rounded-xl font-body font-semibold bg-white/5 border border-white/10 text-text-secondary hover:text-brand transition-colors"
                >
                  Перейти к входу
                </a>
              </div>
            </form>
          </div>
        </section>
      ) : (
        <ProfilePlayer playerId={playerId} />
      )}
    </main>
  );
}

async function ProfilePlayer({ playerId }: { playerId: string }) {
  const player = await fetchPlayer(playerId);
  if (!player) {
    return (
      <section className="mt-10">
        <div className="glass-panel rounded-2xl p-6 md:p-8">
          <h2 className="font-heading text-3xl text-text-primary tracking-wide">
            Игрок не найден
          </h2>
          <p className="mt-2 font-body text-text-secondary text-sm">
            Проверь `id` в адресной строке и попробуй ещё раз.
          </p>
        </div>
      </section>
    );
  }

  const matches = await fetchPlayerMatches(playerId, 12);
  const ratingHistory = await fetchRatingHistory(playerId, 20);

  const tournaments = await fetchTournaments(8);
  const openLike = tournaments
    .filter((t) => t.status === 'open' || t.status === 'full')
    .slice(0, 4);
  const teamsLists = await Promise.all(
    openLike.map(async (t) => ({
      tournamentId: t.id,
      tournamentName: t.name,
      teams: await fetchTeamsLookingForPartner(t.id),
    }))
  );
  const lookingTeams = teamsLists.filter((x) => x.teams.length > 0);

  return (
    <section className="mt-10">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        <div className="md:col-span-2">
          <PlayerCard player={player} />
        </div>
        <div className="md:col-span-1">
          <HallOfFame player={player} matches={matches} />
        </div>
      </div>

      <div className="mt-8">
        <h2 className="font-heading text-2xl text-text-primary uppercase mb-4 tracking-wide">
          Мои матчи
        </h2>
        <MatchHistory results={matches} />
      </div>

      <div className="mt-10">
        <h2 className="font-heading text-2xl text-text-primary uppercase mb-4 tracking-wide">
          История рейтинга
        </h2>
        <RatingHistory entries={ratingHistory} />
      </div>

      <div className="mt-10">
        <h2 className="font-heading text-2xl text-text-primary uppercase mb-4 tracking-wide">
          Тимы ищут напарника
        </h2>
        <LookingTeams items={lookingTeams} />
      </div>
    </section>
  );
}
