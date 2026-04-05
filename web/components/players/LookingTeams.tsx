import type { Team } from '@/lib/types';

export default function LookingTeams({
  items,
}: {
  items: Array<{
    tournamentId: string;
    tournamentName: string;
    teams: Team[];
  }>;
}) {
  if (!items.length) {
    return (
      <div className="glass-panel rounded-2xl p-6">
        <div className="text-text-secondary font-body">
          Нет команд, ищущих напарника прямо сейчас
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {items.map((it) => (
        <section
          key={it.tournamentId}
          className="glass-panel rounded-2xl p-5 border border-white/10"
        >
          <div className="font-heading text-2xl text-text-primary tracking-wide">
            {it.tournamentName}
          </div>
          <div className="mt-2 text-text-secondary text-xs uppercase tracking-widest font-condensed">
            LOOKING FOR PARTNER · {it.teams.length}
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {it.teams.map((t) => (
              <div
                key={t.id}
                className="glass-panel rounded-xl p-4 border border-white/10 neon-ice"
              >
                <div className="text-text-secondary text-xs uppercase tracking-widest font-condensed">
                  TEAM
                </div>
                <div className="mt-2 font-body text-text-primary font-semibold">
                  {t.player1Name}
                </div>
                {t.seed != null ? (
                  <div className="mt-1 text-text-secondary text-sm font-body">
                    Seed: {t.seed}
                  </div>
                ) : null}
                <div className="mt-3 text-text-secondary/80 text-sm font-body">
                  Naparnik: TBA
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

