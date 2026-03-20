import type { TournamentResult } from '@/lib/types';

function placeLabel(place: number) {
  if (place === 1) return 'CHAMPION';
  if (place === 2) return 'RUNNER-UP';
  if (place === 3) return 'BRONZE';
  return 'FINISH';
}

export default function MatchHistory({
  results,
}: {
  results: TournamentResult[];
}) {
  if (results.length === 0) {
    return (
      <div className="glass-panel rounded-2xl p-8 text-center">
        <div className="text-text-secondary font-body">
          Пока нет сыгранных турниров
        </div>
        <div className="mt-3 text-text-muted text-xs uppercase tracking-widest font-condensed">
          LEADER READY
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {results.map((r, i) => {
        const isWin =
          r.place === 1 ||
          (typeof r.wins === 'number' && r.wins > 0);

        return (
          <article
            key={`${r.playerId}-${r.tournamentId ?? i}`}
            className={[
              'glass-panel rounded-2xl p-5',
              isWin ? 'border border-brand/50 neon-fire' : 'border border-white/10 neon-ice',
            ].join(' ')}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-text-muted text-xs uppercase tracking-widest font-condensed">
                  {r.tournamentName ?? 'Tournament'}
                </div>
                <div className="mt-2 font-heading text-2xl text-text-primary tracking-wide">
                  {r.tournamentDate ? String(r.tournamentDate) : '—'}
                </div>
              </div>

              <div className="shrink-0 text-right">
                <div className="text-text-muted text-xs uppercase tracking-widest font-condensed">
                  {placeLabel(r.place)}
                </div>
                <div className="mt-2 font-heading text-3xl text-text-primary">
                  #{r.place}
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                <div className="text-text-muted text-xs uppercase tracking-widest font-condensed">
                  GAME PTS
                </div>
                <div className="mt-1 font-body text-text-primary text-lg font-semibold">
                  {r.gamePts}
                </div>
              </div>
              <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                <div className="text-text-muted text-xs uppercase tracking-widest font-condensed">
                  RATING PTS
                </div>
                <div className="mt-1 font-body text-text-primary text-lg font-semibold">
                  {r.ratingPts > 0 ? `+${r.ratingPts}` : r.ratingPts}
                </div>
              </div>
              <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                <div className="text-text-muted text-xs uppercase tracking-widest font-condensed">
                  RESULT
                </div>
                <div
                  className={[
                    'mt-1 font-body text-lg font-semibold',
                    isWin ? 'text-brand' : 'text-text-secondary',
                  ].join(' ')}
                >
                  {isWin ? 'WIN' : 'LOSS'}
                </div>
              </div>
            </div>

            <div
              className={[
                'mt-4 h-1 rounded-full',
                isWin
                  ? 'bg-gradient-to-r from-brand via-brand-light to-[#FFD700]'
                  : 'bg-gradient-to-r from-[#00D1FF]/70 via-sky-500/20 to-white/5',
              ].join(' ')}
            />
          </article>
        );
      })}
    </div>
  );
}
