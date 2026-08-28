import { buildPlayResultStandings, normalizeStructuredPlayResult } from '@/lib/play-result-core';

const FORMAT_LABELS = { classic_2x2: 'Матч 2×2', king_sideout: 'Сайдаут / KING', thai_8: 'Тайский формат' } as const;

export default function PlayResultSummary({ payload, names }: { payload: unknown; names: Map<number, string> }) {
  const result = normalizeStructuredPlayResult(payload);
  if (!result) return <pre className="mt-4 overflow-x-auto rounded-xl border border-white/10 bg-surface/70 p-3 text-xs text-text-secondary">{JSON.stringify(payload, null, 2)}</pre>;
  const standings = buildPlayResultStandings(result);

  if (result.format === 'king_sideout') {
    return (
      <div className="mt-4 grid gap-4">
        <p className="text-xs font-semibold text-cyan-200">
          {FORMAT_LABELS[result.format]} · {result.pairingMode === 'fixed' ? 'фиксированные пары' : 'турнирная ротация пар'} · {result.rounds?.length ?? 0} раундов по {result.roundDurationMinutes} мин · максимум 15 очков пары
        </p>
        <div className="grid gap-3">
          {(result.rounds ?? []).map((round) => (
            <section key={round.id} className="rounded-xl border border-white/10 bg-surface/50 p-3">
              <h4 className="mb-2 text-sm font-bold text-text-primary">Раунд {round.roundNumber}</h4>
              <div className="grid gap-1 sm:grid-cols-2">
                {round.pairs.map((pair) => (
                  <div key={`${round.id}-${pair.pairIndex}`} className="flex items-center justify-between gap-3 rounded-lg bg-card/60 px-3 py-2 text-xs">
                    <span className="text-text-primary">{pair.team.map((id) => names.get(id) || `#${id}`).join(' + ')}</span>
                    <strong className="text-base text-cyan-100">{pair.points}</strong>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
        <Standings rows={standings} names={names} king />
      </div>
    );
  }

  const tourNumbers = result.format === 'thai_8'
    ? Array.from(new Set(result.matches.map((match) => match.tourNumber ?? 1)))
    : [0];
  return (
    <div className="mt-4 grid gap-4">
      <p className="text-xs font-semibold text-cyan-200">
        {FORMAT_LABELS[result.format]}
        {result.format === 'thai_8' ? ` · турнирная схема · ${result.pairingMode === 'fixed' ? 'состав по списку' : 'случайная жеребьёвка'} · до ${result.pointLimit}` : ''}
      </p>
      {tourNumbers.map((tourNumber) => (
        <section key={tourNumber} className={result.format === 'thai_8' ? 'rounded-xl border border-white/10 bg-surface/40 p-3' : ''}>
          {result.format === 'thai_8' ? <h4 className="mb-2 text-sm font-bold text-text-primary">Тур {tourNumber}</h4> : null}
          <div className="grid gap-2">
            {result.matches.map((match) => (result.format !== 'thai_8' || (match.tourNumber ?? 1) === tourNumber) ? (
              <div key={match.id} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl border border-white/10 bg-surface/50 p-3 text-xs">
                <span className={`text-right ${match.scoreA > match.scoreB ? 'font-bold text-emerald-200' : 'text-text-secondary'}`}>{match.teamA.map((id) => names.get(id) || `#${id}`).join(' + ')}</span>
                <strong className="rounded-lg bg-card px-2 py-1 text-base text-text-primary">{match.scoreA}:{match.scoreB}</strong>
                <span className={match.scoreB > match.scoreA ? 'font-bold text-emerald-200' : 'text-text-secondary'}>{match.teamB.map((id) => names.get(id) || `#${id}`).join(' + ')}</span>
              </div>
            ) : null)}
          </div>
        </section>
      ))}
      {result.format === 'thai_8' ? <Standings rows={standings} names={names} /> : null}
    </div>
  );
}

function Standings({ rows, names, king = false }: { rows: ReturnType<typeof buildPlayResultStandings>; names: Map<number, string>; king?: boolean }) {
  return (
    <ol className="grid gap-1 text-xs text-text-secondary">
      {rows.map((row, index) => (
        <li key={row.userId}>
          <strong className="text-text-primary">{index + 1}. {names.get(row.userId) || `#${row.userId}`}</strong>
          {king ? ` · ${row.pointsFor} очков` : ` · ${row.wins}–${row.losses} · разница ${row.diff > 0 ? '+' : ''}${row.diff}`}
        </li>
      ))}
    </ol>
  );
}
