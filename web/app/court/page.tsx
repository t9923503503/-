import Link from 'next/link';
import { redirect } from 'next/navigation';
import { fetchActiveThaiJudgeTournaments } from '@/lib/queries';

export const dynamic = 'force-dynamic';

function formatDateLabel(date: string, time: string): string {
  const dateLabel = date || 'Без даты';
  return time ? `${dateLabel} • ${time}` : dateLabel;
}

export default async function CourtEntryPage() {
  const tournaments = await fetchActiveThaiJudgeTournaments();

  if (tournaments.length === 1) {
    redirect(`/court/tournament/${encodeURIComponent(tournaments[0].tournamentId)}`);
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(255,210,74,0.08),transparent_14%),linear-gradient(180deg,#080813,#0d0d18_28%,#090913)] px-4 py-8 text-white">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-[28px] border border-[#3a3016] bg-[linear-gradient(180deg,rgba(21,18,33,0.98),rgba(12,12,24,0.98))] px-6 py-6 shadow-[0_24px_70px_rgba(0,0,0,0.34)]">
          <div className="text-[10px] uppercase tracking-[0.34em] text-[#9a8452]">Judge entry</div>
          <h1 className="mt-2 font-heading text-4xl uppercase tracking-[0.08em] text-[#ffd24a]">
            Судьям
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#c7cada]/78">
            Откройте турнир, который сейчас в процессе. Если активен только один Thai-турнир,
            вход откроется сразу автоматически.
          </p>
        </div>

        <div className="mt-6 space-y-4">
          {tournaments.length ? (
            tournaments.map((tournament) => (
              <Link
                key={tournament.tournamentId}
                href={`/court/tournament/${encodeURIComponent(tournament.tournamentId)}`}
                className="block rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,17,29,0.98),rgba(12,12,24,0.98))] px-5 py-5 shadow-[0_18px_50px_rgba(0,0,0,0.26)] transition hover:-translate-y-0.5 hover:border-[#ffd24a]/40"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.28em] text-[#8f7c4a]">
                      {tournament.roundType.toUpperCase()} LIVE
                    </div>
                    <h2 className="mt-2 font-heading text-2xl uppercase tracking-[0.06em] text-white">
                      {tournament.name}
                    </h2>
                    <div className="mt-2 text-sm text-[#aeb6c8]">
                      {formatDateLabel(tournament.date, tournament.time)}
                    </div>
                    {tournament.location ? (
                      <div className="mt-1 text-sm text-[#7d8498]">{tournament.location}</div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-[#4a3d1b] bg-[#1b160d] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#ffd24a]">
                      {(tournament.variant || 'THAI').toUpperCase()}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-[#aeb6c8]">
                      T{tournament.currentTourNo}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-[#aeb6c8]">
                      {tournament.courtCount} courts
                    </span>
                  </div>
                </div>
              </Link>
            ))
          ) : (
            <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,17,29,0.98),rgba(12,12,24,0.98))] px-5 py-5 text-sm text-[#c7cada]/78 shadow-[0_18px_50px_rgba(0,0,0,0.26)]">
              Сейчас нет активных Thai-турниров.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
