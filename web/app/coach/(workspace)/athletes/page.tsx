import Link from 'next/link';
import AddAthleteForm from '@/components/coach/AddAthleteForm';
import CoachAvatar from '@/components/coach/CoachAvatar';
import CoachSetupNotice from '@/components/coach/CoachSetupNotice';
import { listCoachAthletes, listCoachCandidates } from '@/lib/coach/service';
import { COACH_ATHLETE_STATUS_LABELS, COACH_LEVEL_LABELS, formatCoachDate } from '@/lib/coach/ui';

type SearchParams = Promise<{ q?: string; level?: string; status?: string }>;

export default async function CoachAthletesPage({ searchParams }: { searchParams: SearchParams }) {
  const filters = await searchParams;
  let athletes;
  let candidates;
  try {
    [athletes, candidates] = await Promise.all([listCoachAthletes(filters), listCoachCandidates()]);
  } catch (error) {
    return <CoachSetupNotice detail={error instanceof Error ? error.message : undefined} />;
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-400">Состав</p>
          <h1 className="mt-2 font-heading text-4xl leading-none tracking-wide text-white sm:text-5xl">Ученики</h1>
          <p className="mt-3 text-sm text-slate-400">{athletes.length} в текущей выборке · карточки связаны с игроками LPVOLLEY</p>
        </div>
        <AddAthleteForm candidates={candidates} />
      </section>

      <form className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-3 sm:grid-cols-[1fr_180px_180px_auto]" action="/coach/athletes">
        <input name="q" defaultValue={filters.q} placeholder="Поиск по имени" className="min-h-12 rounded-xl border border-white/10 bg-black/20 px-4 outline-none focus:border-cyan-400" />
        <select name="level" defaultValue={filters.level || ''} className="min-h-12 rounded-xl border border-white/10 bg-[#0b111b] px-3 outline-none focus:border-cyan-400">
          <option value="">Все уровни</option><option value="light">Лайт</option><option value="medium">Медиум</option><option value="hard">Хард</option>
        </select>
        <select name="status" defaultValue={filters.status || ''} className="min-h-12 rounded-xl border border-white/10 bg-[#0b111b] px-3 outline-none focus:border-cyan-400">
          <option value="">Все статусы</option><option value="active">Активные</option><option value="paused">Пауза</option><option value="injured">Травма</option><option value="archived">Архив</option>
        </select>
        <button className="min-h-12 rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-5 text-sm font-black text-cyan-200">Найти</button>
      </form>

      {athletes.length ? (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {athletes.map((athlete) => (
            <Link key={athlete.playerId} href={`/coach/athletes/${athlete.playerId}`} className="group rounded-3xl border border-white/10 bg-white/[0.035] p-4 transition hover:-translate-y-0.5 hover:border-cyan-400/30 hover:bg-cyan-400/[0.035]">
              <div className="flex items-start gap-3">
                <CoachAvatar name={athlete.name} photoUrl={athlete.photoUrl} />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base font-black text-white">{athlete.name}</h2>
                  <p className="mt-1 text-xs text-slate-500">{athlete.gender} · рейтинг {Math.round(athlete.rating)} · {athlete.tournamentsPlayed} турн.</p>
                </div>
                <span aria-hidden="true" className="text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-cyan-300">→</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-lg bg-orange-500/10 px-2.5 py-1 text-xs font-bold text-orange-300">{COACH_LEVEL_LABELS[athlete.levelCode]}</span>
                <span className="rounded-lg bg-white/5 px-2.5 py-1 text-xs text-slate-400">{COACH_ATHLETE_STATUS_LABELS[athlete.status]}</span>
                {athlete.criticalIssueCount ? <span className="rounded-lg bg-red-500/10 px-2.5 py-1 text-xs font-bold text-red-300">Критичных: {athlete.criticalIssueCount}</span> : null}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/8 pt-4 text-center">
                <span><b className="block text-lg text-white">{athlete.evaluationCount}</b><small className="text-[10px] uppercase tracking-wide text-slate-600">оценок</small></span>
                <span><b className="block text-lg text-white">{athlete.activeIssueCount}</b><small className="text-[10px] uppercase tracking-wide text-slate-600">проблем</small></span>
                <span><b className="block text-xs text-slate-300">{formatCoachDate(athlete.lastEvaluatedAt)}</b><small className="text-[10px] uppercase tracking-wide text-slate-600">оценён</small></span>
              </div>
            </Link>
          ))}
        </section>
      ) : (
        <section className="rounded-3xl border border-dashed border-white/10 p-10 text-center">
          <p className="font-heading text-3xl text-slate-300">Учеников пока нет</p>
          <p className="mt-2 text-sm text-slate-500">Добавьте существующего игрока LPVOLLEY — турнирные данные уже останутся с ним.</p>
        </section>
      )}
    </div>
  );
}
