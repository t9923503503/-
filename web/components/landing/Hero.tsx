import Link from 'next/link';
import type { LeaderboardEntry } from '@/lib/types';
import type { HomeStats } from '@/lib/queries';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="font-heading text-3xl md:text-4xl text-text-primary">{value}</span>
      <span className="text-text-secondary text-[11px] uppercase tracking-widest">{label}</span>
    </div>
  );
}

function PlayerCard({ entry, featured }: { entry: LeaderboardEntry; featured?: boolean }) {
  const initials = (entry.name ?? '').slice(0, 2).toUpperCase();
  const winRate = entry.tournaments > 0
    ? Math.round((entry.wins / entry.tournaments) * 100)
    : 0;

  if (featured) {
    return (
      <article className="lg:col-span-1 glass-panel p-5 md:p-7 relative overflow-hidden neon-ice">
        <div className="absolute -top-16 -left-16 w-56 h-56 rounded-full opacity-25 bg-[radial-gradient(circle_at_center,rgba(0,209,255,0.9),transparent_60%)]" />
        <div className="absolute -bottom-20 -right-20 w-56 h-56 rounded-full opacity-25 bg-[radial-gradient(circle_at_center,rgba(255,90,0,0.9),transparent_60%)]" />

        <div className="flex items-start justify-between relative">
          <span className="text-text-secondary text-xs uppercase tracking-widest font-condensed">#{entry.rank}</span>
        </div>

        <div className="mt-4">
          <div className="w-20 h-20 rounded-2xl glass-panel flex items-center justify-center border border-white/10 text-2xl font-heading text-brand">
            {initials}
          </div>
        </div>

        <div className="mt-4">
          <div className="poster-name text-4xl md:text-5xl text-transparent bg-clip-text bg-gradient-to-r from-[#FF5A00] to-[#00D1FF]">
            {(entry.name ?? '').toUpperCase()}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3">
          <div className="flex flex-col">
            <span className="text-text-secondary text-[10px] uppercase tracking-widest">Рейтинг</span>
            <span className="font-body text-text-primary text-base font-semibold">{entry.rating}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-text-secondary text-[10px] uppercase tracking-widest">Победы</span>
            <span className="font-body text-text-primary text-base font-semibold">{entry.wins}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-text-secondary text-[10px] uppercase tracking-widest">Турниры</span>
            <span className="font-body text-text-primary text-base font-semibold">{entry.tournaments}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-text-secondary text-[10px] uppercase tracking-widest">Win Rate</span>
            <span className="font-body text-text-primary text-base font-semibold">{winRate}%</span>
          </div>
        </div>

        <div className="mt-5">
          <Link href={`/players/${entry.playerId}`} className="btn-action w-full inline-flex items-center justify-center">
            Профиль игрока
          </Link>
        </div>
      </article>
    );
  }

  return (
    <article className="glass-panel p-5 relative overflow-hidden neon-ice">
      <div className="flex items-start justify-between relative">
        <span className="text-text-secondary text-xs uppercase tracking-widest font-condensed">#{entry.rank}</span>
        <div className="w-10 h-10 rounded-xl glass-panel border border-white/10 flex items-center justify-center text-sm font-heading text-brand">
          {initials}
        </div>
      </div>

      <div className="mt-4">
        <div className="poster-name text-2xl md:text-3xl text-transparent bg-clip-text bg-gradient-to-r from-[#FF5A00] to-[#00D1FF]">
          {(entry.name ?? '').toUpperCase()}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2">
        <div className="flex flex-col">
          <span className="text-text-secondary text-[10px] uppercase tracking-widest">Рейтинг</span>
          <span className="font-body text-text-primary text-sm font-semibold">{entry.rating}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-text-secondary text-[10px] uppercase tracking-widest">Победы</span>
          <span className="font-body text-text-primary text-sm font-semibold">{entry.wins}</span>
        </div>
      </div>

      <div className="mt-4">
        <Link href={`/players/${entry.playerId}`} className="btn-action-outline w-full inline-flex items-center justify-center text-sm">
          Профиль
        </Link>
      </div>
    </article>
  );
}

export default function Hero({ stats, topPlayers }: { stats: HomeStats; topPlayers: LeaderboardEntry[] }) {
  const top = topPlayers[0];
  const rest = topPlayers.slice(1, 3);

  return (
    <section className="pt-8 pb-12 md:pt-12 md:pb-16">
      <div className="max-w-6xl mx-auto px-4">
        {/* Hero Banner */}
        <div className="text-center mb-10">
          <div className="inline-block px-4 py-1.5 rounded-full border border-brand/40 bg-brand/10 text-brand text-xs font-body mb-4">
            Сезон 2026 — уже открыт!
          </div>
          <h1 className="font-heading text-[clamp(32px,6vw,64px)] text-text-primary tracking-wide leading-none">
            ДОМИНИРУЙ НА<br /><span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FF5A00] to-[#00D1FF]">КОРТЕ</span>
          </h1>
          <p className="font-body text-text-secondary mt-3 max-w-md mx-auto text-sm">
            Записывайся на турниры, следи за рейтингом и становись королём пляжного волейбола
          </p>
          <div className="flex justify-center gap-8 md:gap-12 mt-6">
            <Stat label="Турниров" value={String(stats.tournamentCount)} />
            <Stat label="Игроков" value={`${stats.playerCount}+`} />
            <Stat label="Открыто" value={String(stats.openCount)} />
          </div>
        </div>

        {/* Leaderboard */}
        {top && (
          <>
            <div className="text-center mb-6">
              <span className="text-text-secondary text-xs uppercase tracking-[0.35em] font-condensed">
                Топ игроки
              </span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
              <PlayerCard entry={top} featured />
              <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-5">
                {rest.map((e) => (
                  <PlayerCard key={e.playerId} entry={e} />
                ))}
              </div>
            </div>
            <div className="text-center mt-6">
              <Link href="/rankings" className="font-body text-sm text-brand hover:text-brand/80 transition-colors">
                Полный рейтинг →
              </Link>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
