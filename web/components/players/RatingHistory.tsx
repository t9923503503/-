import type { RatingHistoryEntry } from '@/lib/types';

function PointsDelta({ value }: { value: number }) {
  const positive = value > 0;
  const cls = positive
    ? 'text-brand neon-fire'
    : value < 0
      ? 'text-text-secondary'
      : 'text-text-secondary';

  const shown = `${positive ? '+' : ''}${value}`;

  return <span className={cls}>{shown}</span>;
}

export default function RatingHistory({
  entries,
}: {
  entries: RatingHistoryEntry[];
}) {
  if (!entries.length) {
    return (
      <div className="glass-panel rounded-2xl p-6">
        <div className="text-text-secondary font-body">
          Пока нет истории рейтинга
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {entries.map((e) => {
        const placeText =
          e.place == null ? '—' : `#${e.place}`;
        const dateText = e.createdAt ? String(e.createdAt).slice(0, 10) : '';

        return (
          <article
            key={e.id}
            className="glass-panel rounded-2xl p-5 border border-white/10 hover:border-brand/40 transition-colors"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-text-secondary text-xs uppercase tracking-widest font-condensed">
                  {e.formatCode} · {dateText}
                </div>
                <div className="mt-2 font-heading text-2xl text-text-primary tracking-wide">
                  {e.tournamentName || 'Tournament'}
                </div>
                <div className="mt-2 text-text-secondary text-sm font-body">
                  Place: <span className="text-text-primary/90">{placeText}</span>
                </div>
              </div>

              <div className="shrink-0 text-right">
                <div className="text-text-secondary text-xs uppercase tracking-widest font-condensed">
                  Δ points
                </div>
                <div className="mt-2 font-body text-lg font-semibold">
                  <PointsDelta value={e.pointsChanged} />
                </div>
                <div className="mt-1 text-text-secondary text-sm font-body">
                  New total: <span className="text-text-primary">{e.newTotalRating}</span>
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

