import type { Player } from '@/lib/types';

interface StatCardProps {
  label: string;
  value: number;
  highlight?: boolean;
}

function StatCard({ label, value, highlight }: StatCardProps) {
  return (
    <div
      className={[
        'rounded-xl p-4 flex flex-col gap-1 text-center glass-panel',
        highlight
          ? 'border border-brand/50 neon-fire'
          : 'border border-white/10 bg-white/5',
      ].join(' ')}
    >
      <span
        className={[
          'font-heading text-3xl',
          highlight ? 'text-brand' : 'text-text-primary',
        ].join(' ')}
      >
        {value}
      </span>
      <span className="text-text-secondary text-xs font-condensed uppercase tracking-wide">
        {label}
      </span>
    </div>
  );
}

interface PlayerCardProps {
  player: Player;
}

const GENDER_LABEL: Record<string, string> = {
  M: 'Мужской',
  W: 'Женский',
};

export default function PlayerCard({ player }: PlayerCardProps) {
  return (
    <div className="glass-panel rounded-2xl p-6 flex flex-col gap-6 neon-ice">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-4xl md:text-5xl text-text-primary uppercase">
            {player.name}
          </h1>
          <p className="text-text-secondary font-condensed mt-1">
            {GENDER_LABEL[player.gender] ?? player.gender}
            {player.status === 'temporary' && (
              <span className="ml-2 text-xs bg-white/5 border border-white/10 rounded px-2 py-0.5">
                Временный
              </span>
            )}
          </p>
        </div>
        {player.lastSeen && (
          <span className="text-text-secondary text-sm shrink-0">
            {player.lastSeen}
          </span>
        )}
      </div>

      {/* Ratings */}
      <div>
        <h2 className="text-text-secondary font-condensed uppercase text-xs tracking-widest mb-3">
          Рейтинги
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            label="Мужской"
            value={player.ratingM}
            highlight={player.gender === 'M'}
          />
          <StatCard
            label="Женский"
            value={player.ratingW}
            highlight={player.gender === 'W'}
          />
          <StatCard label="Микст" value={player.ratingMix} />
        </div>
      </div>

      {/* Stats */}
      <div>
        <h2 className="text-text-secondary font-condensed uppercase text-xs tracking-widest mb-3">
          Статистика
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Турниры М"
            value={player.tournamentsM}
          />
          <StatCard
            label="Турниры Ж"
            value={player.tournamentsW}
          />
          <StatCard
            label="Турниры Mix"
            value={player.tournamentsMix}
          />
          <StatCard label="Победы" value={player.wins} />
        </div>
      </div>
    </div>
  );
}
