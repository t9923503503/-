import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import {
  fetchPartnerRequests,
  fetchTournaments,
} from '@/lib/queries';
import { verifyPlayerToken } from '@/lib/player-auth';
import PartnerRequestButton from '@/components/partner/PartnerRequestButton';

export const metadata: Metadata = {
  title: 'Поиск пары | Лютые Пляжники',
  description: 'Найди напарника на турнир — список игроков, которые ищут пару на ближайшие события.',
};

interface PartnerPageProps {
  searchParams?: Promise<{
    tournament?: string;
    level?: string;
    gender?: string;
  }>;
}

function normalizeLevel(input: string | undefined): 'all' | 'hard' | 'medium' | 'easy' {
  if (input === 'hard' || input === 'medium' || input === 'easy') return input;
  return 'all';
}

function normalizeGender(input: string | undefined): 'all' | 'M' | 'W' {
  if (input === 'M' || input === 'W') return input;
  return 'all';
}

function levelLabel(level: string): string {
  const val = String(level || '').toLowerCase();
  if (val === 'hard') return 'Hard';
  if (val === 'medium') return 'Medium';
  if (val === 'easy') return 'Lite';
  return '—';
}

export default async function PartnerPage({ searchParams }: PartnerPageProps) {
  const params = (await searchParams) ?? {};
  const selectedTournament = params.tournament || 'all';
  const selectedLevel = normalizeLevel(params.level);
  const selectedGender = normalizeGender(params.gender);

  const cookieStore = await cookies();
  const authToken = cookieStore.get('player_session')?.value;
  const me = authToken ? verifyPlayerToken(authToken) : null;

  const upcoming = (await fetchTournaments(30)).filter(
    (t) => t.status === 'open' || t.status === 'full'
  );
  const rows = await fetchPartnerRequests({
    tournamentId: selectedTournament !== 'all' ? selectedTournament : undefined,
    level: selectedLevel,
    gender: selectedGender,
  });

  const tournamentsMap = new Map<string, string>();
  for (const t of upcoming) {
    tournamentsMap.set(t.id, t.name);
  }
  const tournamentOptions = [
    { id: 'all', label: 'Все турниры' },
    ...Array.from(tournamentsMap.entries()).map(([id, label]) => ({ id, label })),
  ];

  const grouped = new Map<
    string,
    {
      tournamentId: string;
      tournamentName: string;
      tournamentDate: string;
      players: typeof rows;
    }
  >();
  for (const item of rows) {
    const key = item.tournamentId || `unknown-${item.id}`;
    const current = grouped.get(key);
    if (current) {
      current.players.push(item);
      continue;
    }
    grouped.set(key, {
      tournamentId: item.tournamentId,
      tournamentName: item.tournamentName || 'Турнир',
      tournamentDate: item.tournamentDate,
      players: [item],
    });
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="font-heading text-5xl md:text-6xl text-brand tracking-wide uppercase">
        Поиск пары
      </h1>
      <p className="mt-3 font-body text-text-secondary">
        Игроки, которые ищут напарника на ближайший турнир.
      </p>

      <form
        method="GET"
        className="mt-8 rounded-xl border border-white/10 bg-surface-light/20 p-4 md:p-5 grid grid-cols-1 md:grid-cols-3 gap-3"
      >
        <label className="block">
          <span className="text-text-secondary text-xs uppercase tracking-wide font-body">
            Турнир
          </span>
          <select
            className="mt-2 w-full rounded-lg bg-surface text-text-primary border border-white/10 px-3 py-2.5 outline-none focus:border-brand transition-colors font-body"
            name="tournament"
            defaultValue={selectedTournament}
          >
            {tournamentOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-text-secondary text-xs uppercase tracking-wide font-body">
            Уровень
          </span>
          <select
            className="mt-2 w-full rounded-lg bg-surface text-text-primary border border-white/10 px-3 py-2.5 outline-none focus:border-brand transition-colors font-body"
            name="level"
            defaultValue={selectedLevel}
          >
            <option value="all">Все уровни</option>
            <option value="hard">Hard</option>
            <option value="medium">Medium</option>
            <option value="easy">Lite</option>
          </select>
        </label>

        <label className="block">
          <span className="text-text-secondary text-xs uppercase tracking-wide font-body">
            Пол
          </span>
          <select
            className="mt-2 w-full rounded-lg bg-surface text-text-primary border border-white/10 px-3 py-2.5 outline-none focus:border-brand transition-colors font-body"
            name="gender"
            defaultValue={selectedGender}
          >
            <option value="all">Все</option>
            <option value="M">Только мужчины</option>
            <option value="W">Только женщины</option>
          </select>
        </label>
        <div className="md:col-span-3">
          <button
            type="submit"
            className="mt-1 inline-flex items-center justify-center px-4 py-2 rounded-lg bg-brand text-white hover:bg-brand-light transition-colors text-sm font-body font-semibold"
          >
            Применить фильтры
          </button>
        </div>
      </form>

      {grouped.size === 0 ? (
        <p className="mt-10 font-body text-sm text-text-secondary/70 text-center">
          Сейчас нет активных соло-заявок с публичным поиском партнёра.
        </p>
      ) : (
        <div className="mt-8 grid gap-4">
          {Array.from(grouped.values()).map((group) => (
            <section
              key={group.tournamentId || group.tournamentName}
              className="rounded-xl border border-white/10 bg-white/5 p-5"
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <div>
                  <h2 className="font-heading text-2xl text-text-primary tracking-wide">
                    {group.tournamentName}
                  </h2>
                  <p className="mt-1 text-text-secondary text-sm font-body">
                    {group.tournamentDate || 'Дата уточняется'} · {group.players.length} ищут пару
                  </p>
                </div>
                {group.tournamentId ? (
                  <Link
                    href={`/calendar/${group.tournamentId}/register`}
                    className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-brand text-white hover:bg-brand-light transition-colors text-sm font-body font-semibold"
                  >
                    Записаться на турнир
                  </Link>
                ) : null}
              </div>

              <div className="mt-4 grid gap-3">
                {group.players.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-white/10 bg-surface-light/30 px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="font-body text-text-primary font-semibold">
                        {item.name}
                      </div>
                      <div className="mt-1 text-xs font-body text-text-secondary">
                        {item.gender === 'M' ? 'Мужчины' : 'Женщины'} · {levelLabel(item.tournamentLevel)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs rounded-full px-2.5 py-1 bg-brand/20 border border-brand/40 text-brand-light font-body">
                        Ищу партнёра
                      </span>
                      {me?.id && item.requesterUserId && me.id !== item.requesterUserId ? (
                        <PartnerRequestButton sourceRequestId={item.id} />
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {upcoming.length > 0 ? (
        <section className="mt-10">
          <h2 className="font-heading text-3xl text-text-primary tracking-wide">
            Ближайшие турниры
          </h2>
          <div className="mt-4 grid gap-3">
            {upcoming.slice(0, 6).map((t) => (
              <div
                key={t.id}
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 flex items-center justify-between gap-3"
              >
                <div>
                  <div className="font-body text-text-primary font-semibold">{t.name}</div>
                  <div className="mt-1 text-xs text-text-secondary font-body">
                    {t.date} {t.time ? `· ${t.time}` : ''} {t.level ? `· ${t.level}` : ''}
                  </div>
                </div>
                <Link
                  href={`/calendar/${t.id}/register`}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-brand text-white hover:bg-brand-light transition-colors text-sm font-body font-semibold"
                >
                  Записаться
                </Link>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
