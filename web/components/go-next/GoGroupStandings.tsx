'use client';

import type { GoGroupView } from '@/lib/go-next/types';

export function GoGroupStandings({
  group,
  qualifyCount = 1,
  compact = false,
}: {
  group: GoGroupView;
  qualifyCount?: number;
  compact?: boolean;
}) {
  const tiedRows = group.standings.filter((row, index, rows) => {
    const previous = rows[index - 1];
    return Boolean(previous && previous.wins === row.wins && previous.setQuotient === row.setQuotient && previous.pointQuotient === row.pointQuotient);
  });
  return (
    <section className="rounded-lg border border-white/10 bg-black/20 p-3">
      <h4 className="text-sm font-semibold text-white">Группа {group.label}</h4>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[520px] text-xs">
          <thead className="text-white/55">
            <tr>
              <th className="px-2 py-1 text-left">#</th>
              <th className="px-2 py-1 text-left">Команда</th>
              <th className="px-2 py-1 text-right">И</th>
              <th className="px-2 py-1 text-right">В</th>
              <th className="px-2 py-1 text-right">П</th>
              <th className="px-2 py-1 text-right">О</th>
              {!compact ? <th className="px-2 py-1 text-right">С+</th> : null}
              {!compact ? <th className="px-2 py-1 text-right">С-</th> : null}
              <th className="px-2 py-1 text-right">М+</th>
              <th className="px-2 py-1 text-right">М-</th>
            </tr>
          </thead>
          <tbody>
            {group.standings.map((row) => {
              const isQualified = row.position > 0 && row.position <= qualifyCount;
              return (
                <tr
                  key={row.teamId}
                  className={`border-t border-white/5 ${
                    isQualified ? 'bg-emerald-500/8' : 'bg-transparent'
                  }`}
                >
                  <td className="px-2 py-1">{row.position}</td>
                  <td className="px-2 py-1 text-white/90">{row.teamLabel}</td>
                  <td className="px-2 py-1 text-right">{row.played}</td>
                  <td className="px-2 py-1 text-right">{row.wins}</td>
                  <td className="px-2 py-1 text-right">{row.losses}</td>
                  <td className="px-2 py-1 text-right font-semibold text-brand">{row.matchPoints}</td>
                  {!compact ? <td className="px-2 py-1 text-right">{row.setsWon}</td> : null}
                  {!compact ? <td className="px-2 py-1 text-right">{row.setsLost}</td> : null}
                  <td className="px-2 py-1 text-right">{row.pointsFor}</td>
                  <td className="px-2 py-1 text-right">{row.pointsAgainst}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-2 rounded bg-white/5 px-2 py-1.5 text-[10px] leading-relaxed text-white/55">
        Тай-брейк: победы → соотношение сетов → соотношение мячей → личная встреча (для двух пар) → разница мячей.
        {tiedRows.length ? ` Сейчас равны по основным показателям: ${tiedRows.map((row) => row.teamLabel).join(', ')}; применён следующий критерий.` : ''}
      </div>
    </section>
  );
}
