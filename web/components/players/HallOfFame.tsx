import type { Player, TournamentResult } from '@/lib/types';

function AwardIcon({
  kind,
}: {
  kind: 'champion' | 'mvp';
}) {
  if (kind === 'champion') {
    return (
      <svg
        width="34"
        height="34"
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M14 20h36l-2 34H16l-2-34Z"
          stroke="#FF5A00"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path
          d="M22 20V12h20v8"
          stroke="#00D1FF"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path
          d="M26 40h12"
          stroke="#FFD700"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <svg
      width="34"
      height="34"
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M20 50c0-16 8-30 12-30s12 14 12 30"
        stroke="#00D1FF"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M24 20c2-8 14-8 16 0"
        stroke="#FF5A00"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M26 44h12"
        stroke="#FFD700"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function AwardBadge({
  kind,
  title,
  subtitle,
  value,
}: {
  kind: 'champion' | 'mvp';
  title: string;
  subtitle: string;
  value: string;
}) {
  const frameClass =
    kind === 'champion'
      ? 'border border-brand/40 bg-white/5 neon-fire'
      : 'border border-white/10 bg-white/5 neon-ice';

  return (
    <div className={`glass-panel rounded-2xl p-5 ${frameClass}`}>
      <div className="flex items-start gap-4">
        <div className="mt-1">
          <AwardIcon kind={kind} />
        </div>
        <div className="flex-1">
          <div className="text-text-muted text-xs uppercase tracking-widest font-condensed">
            {title}
          </div>
          <div className="mt-2 font-heading text-3xl text-text-primary">
            {value}
          </div>
          <div className="mt-1 text-text-secondary text-sm font-body">
            {subtitle}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HallOfFame({
  player,
  matches,
}: {
  player: Player;
  matches: TournamentResult[];
}) {
  const championCount = matches.filter((m) => m.place === 1).length;

  let best = null as TournamentResult | null;
  for (const m of matches) {
    if (!best || m.ratingPts > best.ratingPts) best = m;
  }

  const mvpValue = best
    ? `${best.ratingPts > 0 ? '+' : ''}${best.ratingPts}`
    : '—';
  const mvpSubtitle = best?.tournamentName
    ? `MVP за: ${best.tournamentName}`
    : 'Пока нет сыгранных турниров';

  return (
    <aside className="grid gap-4">
      <div className="glass-panel rounded-2xl p-6 neon-ice">
        <div className="text-text-muted text-xs uppercase tracking-widest font-condensed">
          Зал славы
        </div>
        <div className="mt-3 font-heading text-2xl text-text-primary tracking-wide">
          {player.name}
        </div>

        <div className="mt-2 text-text-secondary text-sm font-body">
          Победы: {player.wins}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <AwardBadge
          kind="champion"
          title="CHAMPION"
          value={String(championCount)}
          subtitle={
            championCount
              ? '1-е места'
              : 'Пока нет чемпионских финишей'
          }
        />
        <AwardBadge
          kind="mvp"
          title="MVP"
          value={mvpValue}
          subtitle={mvpSubtitle}
        />
      </div>
    </aside>
  );
}

