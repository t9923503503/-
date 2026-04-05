import type { ThaiFunStats } from '@/lib/thai-live/tournament-fun-stats';

function roundLabel(rt: string): string {
  return rt === 'r2' ? 'R2' : 'R1';
}

export function ThaiSpectatorFunStats({ stats }: { stats: ThaiFunStats }) {
  const hasAny =
    stats.absoluteLeaders.some((b) => b.leaders.length > 0) ||
    stats.universalSoldiers.length > 0 ||
    stats.closersKings.length > 0 ||
    stats.steamrollers.length > 0 ||
    stats.ironDefense.length > 0 ||
    stats.blowouts.length > 0 ||
    stats.idealMatches.length > 0;

  if (!hasAny) {
    return (
      <section className="rounded-[24px] border border-[#3a3016] bg-[linear-gradient(180deg,rgba(20,18,32,0.98),rgba(12,12,24,0.98))] px-5 py-5 shadow-[0_18px_50px_rgba(0,0,0,0.26)]">
        <div className="text-[10px] uppercase tracking-[0.3em] text-[#8f7c4a]">Итоги</div>
        <h2 className="mt-2 font-heading text-2xl uppercase tracking-[0.08em] text-[#ffd24a]">Финальная статистика</h2>
        <p className="mt-2 text-sm text-[#aeb6c8]">Нет подтверждённых матчей для расчёта номинаций.</p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="rounded-[24px] border border-[#3a3016] bg-[linear-gradient(180deg,rgba(20,18,32,0.98),rgba(12,12,24,0.98))] px-5 py-5 shadow-[0_18px_50px_rgba(0,0,0,0.26)]">
        <div className="text-[10px] uppercase tracking-[0.3em] text-[#8f7c4a]">Итоги турнира</div>
        <h2 className="mt-2 font-heading text-2xl uppercase tracking-[0.08em] text-[#ffd24a]">Финальная статистика</h2>
      </div>

      {stats.absoluteLeaders.map((block) => (
        <div
          key={block.poolKey}
          className="rounded-[24px] border border-[#3a3016] bg-[linear-gradient(180deg,rgba(20,18,32,0.98),rgba(12,12,24,0.98))] px-5 py-5 shadow-[0_18px_50px_rgba(0,0,0,0.26)]"
        >
          <div className="text-[10px] uppercase tracking-[0.3em] text-[#8f7c4a]">Абсолютные лидеры</div>
          <h3 className="mt-2 font-heading text-xl uppercase tracking-[0.08em] text-[#ffd24a]">{block.poolLabel}</h3>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {block.leaders.length ? (
              block.leaders.map((l) => (
                <li
                  key={l.playerId}
                  className="rounded-2xl border border-white/8 bg-white/5 px-4 py-3 text-sm font-semibold text-white"
                >
                  {l.playerName}{' '}
                  <span className="font-black text-[#ffd24a]">
                    {l.wins} из {l.matchesPlayed}
                  </span>
                </li>
              ))
            ) : (
              <li className="text-sm text-[#7d8498]">—</li>
            )}
          </ul>
        </div>
      ))}

      {stats.universalSoldiers.length ? (
        <div className="rounded-[24px] border border-[#3a3016] bg-[linear-gradient(180deg,rgba(20,18,32,0.98),rgba(12,12,24,0.98))] px-5 py-5 shadow-[0_18px_50px_rgba(0,0,0,0.26)]">
          <div className="text-[10px] uppercase tracking-[0.3em] text-[#8f7c4a]">Универсальный солдат</div>
          <h3 className="mt-2 font-heading text-xl uppercase tracking-[0.08em] text-[#ffd24a]">Тащит с кем угодно</h3>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {stats.universalSoldiers.map((l) => (
              <li
                key={l.playerId}
                className="rounded-2xl border border-white/8 bg-white/5 px-4 py-3 text-sm font-semibold text-white"
              >
                {l.playerName}{' '}
                <span className="font-black text-[#ffd24a]">{l.value}</span>{' '}
                <span className="text-[#aeb6c8]">напарников</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {stats.closersKings.length ? (
        <div className="rounded-[24px] border border-[#3a3016] bg-[linear-gradient(180deg,rgba(20,18,32,0.98),rgba(12,12,24,0.98))] px-5 py-5 shadow-[0_18px_50px_rgba(0,0,0,0.26)]">
          <div className="text-[10px] uppercase tracking-[0.3em] text-[#8f7c4a]">Короли концовок</div>
          <h3 className="mt-2 font-heading text-xl uppercase tracking-[0.08em] text-[#ffd24a]">Перевес 1–2 мяча</h3>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {stats.closersKings.map((l) => (
              <li
                key={l.playerId}
                className="rounded-2xl border border-white/8 bg-white/5 px-4 py-3 text-sm font-semibold text-white"
              >
                {l.playerName}{' '}
                <span className="font-black text-[#ffd24a]">{l.value}</span>{' '}
                <span className="text-[#aeb6c8]">таких побед</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {stats.steamrollers.length ? (
        <div className="rounded-[24px] border border-[#3a3016] bg-[linear-gradient(180deg,rgba(20,18,32,0.98),rgba(12,12,24,0.98))] px-5 py-5 shadow-[0_18px_50px_rgba(0,0,0,0.26)]">
          <div className="text-[10px] uppercase tracking-[0.3em] text-[#8f7c4a]">Каток турнира</div>
          <h3 className="mt-2 font-heading text-xl uppercase tracking-[0.08em] text-[#ffd24a]">Лучшая разница +/-</h3>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {stats.steamrollers.map((l) => (
              <li
                key={l.playerId}
                className="rounded-2xl border border-white/8 bg-white/5 px-4 py-3 text-sm font-semibold text-white"
              >
                {l.playerName}{' '}
                <span className="font-black text-[#ffd24a]">{l.value > 0 ? `+${l.value}` : l.value}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {stats.ironDefense.length ? (
        <div className="rounded-[24px] border border-[#3a3016] bg-[linear-gradient(180deg,rgba(20,18,32,0.98),rgba(12,12,24,0.98))] px-5 py-5 shadow-[0_18px_50px_rgba(0,0,0,0.26)]">
          <div className="text-[10px] uppercase tracking-[0.3em] text-[#8f7c4a]">Железобетон</div>
          <h3 className="mt-2 font-heading text-xl uppercase tracking-[0.08em] text-[#ffd24a]">Меньше всего пропущено</h3>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {stats.ironDefense.map((l) => (
              <li
                key={l.playerId}
                className="rounded-2xl border border-white/8 bg-white/5 px-4 py-3 text-sm font-semibold text-white"
              >
                {l.playerName}{' '}
                <span className="font-black text-[#ffd24a]">{l.value}</span>{' '}
                <span className="text-[#aeb6c8]">пропущено</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {stats.blowouts.length ? (
        <div className="rounded-[24px] border border-[#3a3016] bg-[linear-gradient(180deg,rgba(20,18,32,0.98),rgba(12,12,24,0.98))] px-5 py-5 shadow-[0_18px_50px_rgba(0,0,0,0.26)]">
          <div className="text-[10px] uppercase tracking-[0.3em] text-[#8f7c4a]">Уничтожение</div>
          <h3 className="mt-2 font-heading text-xl uppercase tracking-[0.08em] text-[#ffd24a]">Самая крупная победа</h3>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {stats.blowouts.map((m) => (
              <li
                key={m.matchId}
                className="rounded-2xl border border-white/8 bg-[#10101a] px-4 py-3 text-sm text-white/88"
              >
                <div className="font-semibold text-[#ffd24a]">
                  {m.team1Score}:{m.team2Score}
                  <span className="ml-2 text-xs font-normal text-[#aeb6c8]">(±{m.margin})</span>
                </div>
                <div className="mt-2 text-xs text-[#aeb6c8]">
                  {roundLabel(m.roundType)} · {m.courtLabel} · тур {m.tourNo}
                </div>
                <div className="mt-1 text-sm">{m.team1Labels}</div>
                <div className="text-[10px] uppercase tracking-wider text-[#7d8498]">против</div>
                <div className="text-sm">{m.team2Labels}</div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {stats.idealMatches.length ? (
        <div className="rounded-[24px] border border-[#3a3016] bg-[linear-gradient(180deg,rgba(20,18,32,0.98),rgba(12,12,24,0.98))] px-5 py-5 shadow-[0_18px_50px_rgba(0,0,0,0.26)]">
          <div className="text-[10px] uppercase tracking-[0.3em] text-[#8f7c4a]">Идеальный мэтч</div>
          <h3 className="mt-2 font-heading text-xl uppercase tracking-[0.08em] text-[#ffd24a]">Одна игра вместе</h3>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {stats.idealMatches.map((p) => (
              <li
                key={`${p.playerAId}-${p.playerBId}-${p.roundType}-${p.tourNo}`}
                className="rounded-2xl border border-[#5b4713]/40 bg-[#18140d] px-4 py-3 text-sm font-semibold text-white"
              >
                {p.playerAName} + {p.playerBName}
                <div className="mt-1 text-xs font-normal text-[#aeb6c8]">
                  {p.teamScore} очков команды, перевес {p.margin > 0 ? `+${p.margin}` : p.margin} · {roundLabel(p.roundType)} ·{' '}
                  {p.courtLabel} · тур {p.tourNo}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
