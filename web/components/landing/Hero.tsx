import Link from 'next/link';
import type { LeaderboardEntry } from '@/lib/types';
import PlayerPhoto from '@/components/ui/PlayerPhoto';
import type { HomeStats } from '@/lib/queries';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="font-heading text-3xl md:text-4xl text-text-primary">{value}</span>
      <span className="text-text-secondary text-[11px] uppercase tracking-widest">{label}</span>
    </div>
  );
}

/* ── Player Avatar ──────────────────────────── */
function PlayerAvatar({ entry, size }: { entry: LeaderboardEntry; size: 'lg' | 'sm' }) {
  const s = size === 'lg' ? 96 : 56;
  const cls = size === 'lg'
    ? 'w-24 h-24 rounded-2xl text-3xl'
    : 'w-14 h-14 rounded-xl text-xl';

  if (entry.photoUrl) {
    return (
      <div className={`${cls} relative overflow-hidden border-2 border-white/20 shadow-lg`}>
        <PlayerPhoto photoUrl={entry.photoUrl} alt={entry.name} width={s} height={s} />
      </div>
    );
  }

  // Gradient initials fallback
  const initial = (entry.name ?? '').charAt(0).toUpperCase();
  const gradients = [
    'from-brand to-[#FFD700]',
    'from-[#00D1FF] to-[#6366F1]',
    'from-[#FF69B4] to-[#FF5A00]',
    'from-[#6ABF69] to-[#00D1FF]',
  ];
  const grad = gradients[entry.rank % gradients.length];

  return (
    <div className={`${cls} bg-gradient-to-br ${grad} flex items-center justify-center font-heading text-white shadow-lg border-2 border-white/20`}>
      {initial}
    </div>
  );
}

/* ── Rank Badge ─────────────────────────────── */
function RankBadge({ rank }: { rank: number }) {
  const medal = rank === 1 ? '\u{1F947}' : rank === 2 ? '\u{1F948}' : rank === 3 ? '\u{1F949}' : null;
  const bg = rank === 1 ? 'bg-gold/20 text-gold border-gold/40'
    : rank === 2 ? 'bg-silver/20 text-silver border-silver/40'
    : rank === 3 ? 'bg-bronze/20 text-bronze border-bronze/40'
    : 'bg-white/10 text-text-secondary border-white/20';

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border ${bg}`}>
      {medal && <span>{medal}</span>}
      #{rank}
    </span>
  );
}

/* ── Featured Player Card (#1) ─────────────── */
function FeaturedCard({ entry }: { entry: LeaderboardEntry }) {
  const winRate = entry.tournaments > 0
    ? Math.round((entry.wins / entry.tournaments) * 100) : 0;

  return (
    <article className="lg:col-span-1 relative overflow-hidden rounded-2xl border border-brand/30"
      style={{
        background: 'radial-gradient(ellipse 140% 80% at 20% 20%, rgba(255,90,0,0.15), transparent 60%), radial-gradient(ellipse 100% 70% at 85% 80%, rgba(0,209,255,0.12), transparent 50%), var(--bg-panel)',
      }}>
      {/* Decorative particles */}
      <div className="absolute inset-0 opacity-[0.06] pointer-events-none"
        style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.4) 1px, transparent 1px)', backgroundSize: '18px 18px' }} />

      <div className="relative p-6 md:p-8">
        <div className="flex items-start justify-between">
          <RankBadge rank={entry.rank} />
          <span className="text-xs font-condensed uppercase tracking-widest text-brand/70">MVP</span>
        </div>

        <div className="mt-5 flex items-center gap-4">
          <PlayerAvatar entry={entry} size="lg" />
          <div className="min-w-0">
            <h3 className="font-heading text-3xl md:text-4xl text-transparent bg-clip-text bg-gradient-to-r from-[#FF5A00] to-[#00D1FF] uppercase truncate">
              {entry.name}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${entry.gender === 'M' ? 'bg-[#00D1FF]/20 text-[#00D1FF]' : 'bg-[#FF69B4]/20 text-[#FF69B4]'}`}>
                {entry.gender}
              </span>
              {winRate >= 50 && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-brand/20 text-brand">
                  {winRate}% WIN
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div className="mt-6 grid grid-cols-4 gap-3">
          {[
            { label: 'Rating', value: String(entry.rating), color: 'text-brand' },
            { label: 'Wins', value: String(entry.wins), color: 'text-gold' },
            { label: 'Tourneys', value: String(entry.tournaments), color: 'text-[#00D1FF]' },
            { label: 'Win %', value: `${winRate}%`, color: 'text-text-primary' },
          ].map(s => (
            <div key={s.label} className="text-center rounded-xl bg-white/5 border border-white/10 py-3 px-2">
              <div className={`font-heading text-xl ${s.color}`}>{s.value}</div>
              <div className="text-text-secondary text-[9px] uppercase tracking-widest mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Rating bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-[10px] text-text-secondary uppercase tracking-widest mb-1">
            <span>Power Level</span>
            <span className="text-brand">{entry.rating}</span>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand to-[#FFD700] transition-all duration-1000"
              style={{ width: `${Math.min((entry.rating / 300) * 100, 100)}%` }}
            />
          </div>
        </div>

        <Link href={`/players/${entry.playerId}`}
          className="btn-action w-full inline-flex items-center justify-center mt-5 text-sm">
          Профиль игрока
        </Link>
      </div>
    </article>
  );
}

/* ── Regular Player Card (#2, #3) ─────────── */
function CompactCard({ entry }: { entry: LeaderboardEntry }) {
  const winRate = entry.tournaments > 0
    ? Math.round((entry.wins / entry.tournaments) * 100) : 0;

  return (
    <article className="relative overflow-hidden rounded-2xl border border-white/15 hover:border-brand/30 transition-all group"
      style={{
        background: 'var(--bg-panel)',
      }}>
      <div className="p-5">
        <div className="flex items-center gap-3">
          <PlayerAvatar entry={entry} size="sm" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <RankBadge rank={entry.rank} />
            </div>
            <h3 className="font-heading text-2xl text-transparent bg-clip-text bg-gradient-to-r from-[#FF5A00] to-[#00D1FF] uppercase truncate mt-1">
              {entry.name}
            </h3>
          </div>
        </div>

        {/* Stats row */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            { label: 'Rating', value: String(entry.rating), color: 'text-brand' },
            { label: 'Wins', value: String(entry.wins), color: 'text-gold' },
            { label: 'Win %', value: `${winRate}%`, color: 'text-[#00D1FF]' },
          ].map(s => (
            <div key={s.label} className="text-center rounded-lg bg-white/5 border border-white/10 py-2">
              <div className={`font-heading text-lg ${s.color}`}>{s.value}</div>
              <div className="text-text-secondary text-[9px] uppercase tracking-widest">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Rating bar */}
        <div className="mt-3">
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand to-[#FFD700]"
              style={{ width: `${Math.min((entry.rating / 300) * 100, 100)}%` }}
            />
          </div>
        </div>

        <Link href={`/players/${entry.playerId}`}
          className="btn-action-outline w-full inline-flex items-center justify-center text-sm mt-4 group-hover:border-brand/60">
          Профиль
        </Link>
      </div>
    </article>
  );
}

/* ── Hero Section ─────────────────────────── */
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
              <FeaturedCard entry={top} />
              <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-5">
                {rest.map((e) => (
                  <CompactCard key={e.playerId} entry={e} />
                ))}
              </div>
            </div>
            <div className="text-center mt-6">
              <Link href="/rankings" className="font-body text-sm text-brand hover:text-brand/80 transition-colors">
                Полный рейтинг &rarr;
              </Link>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
