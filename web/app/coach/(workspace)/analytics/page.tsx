import Link from 'next/link';
import CoachAvatar from '@/components/coach/CoachAvatar';
import CoachSetupNotice from '@/components/coach/CoachSetupNotice';
import { getCoachAnalytics } from '@/lib/coach/analytics-service';
import { COACH_ANALYTICS_PERIODS } from '@/lib/coach/analytics-types';
import { normalizeCoachAnalyticsPeriod } from '@/lib/coach/analytics-validators';
import { COACH_EXERCISE_CATEGORY_LABELS } from '@/lib/coach/exercise-ui';
import { formatCoachDate } from '@/lib/coach/ui';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ period?: string }> };

const categoryLabels = COACH_EXERCISE_CATEGORY_LABELS as Record<string, string>;
const toneClass = {
  critical: 'border-red-400/25 bg-red-500/[0.07] text-red-200',
  warning: 'border-orange-400/25 bg-orange-500/[0.07] text-orange-100',
  info: 'border-cyan-400/20 bg-cyan-500/[0.06] text-cyan-100',
};

function Distribution({ title, eyebrow, rows, mapLabel = false }: { title: string; eyebrow: string; rows: Awaited<ReturnType<typeof getCoachAnalytics>>['categories']; mapLabel?: boolean }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-4 sm:p-6">
      <p className="text-xs font-black uppercase tracking-[.18em] text-cyan-300">{eyebrow}</p>
      <h2 className="mt-2 font-heading text-3xl text-white">{title}</h2>
      {rows.length ? <div className="mt-5 space-y-4">{rows.map((row) => (
        <div key={row.key}>
          <div className="flex items-end justify-between gap-4 text-sm"><span className="font-bold text-slate-200">{mapLabel ? categoryLabels[row.label] ?? row.label : row.label}</span><span className="text-slate-500">{row.trainingMinutes} мин · {row.sharePercent}%</span></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-orange-400" style={{ width: `${Math.max(2, row.sharePercent)}%` }} /></div>
        </div>
      ))}</div> : <p className="mt-5 rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">Распределение появится после первого завершённого упражнения.</p>}
    </section>
  );
}

export default async function CoachAnalyticsPage({ searchParams }: Props) {
  const query = await searchParams;
  const periodDays = normalizeCoachAnalyticsPeriod(query.period);
  let data;
  try {
    data = await getCoachAnalytics(periodDays);
  } catch (error) {
    return <CoachSetupNotice detail={error instanceof Error ? error.message : undefined} />;
  }
  const activeAthletes = data.athletes.filter((item) => item.trainingMinutes > 0);
  const activeExercises = data.exercises.filter((item) => item.executionCount > 0);
  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div><p className="text-xs font-black uppercase tracking-[.2em] text-orange-400">Stage 5 · только факт</p><h1 className="mt-2 font-heading text-4xl text-white sm:text-5xl">Аналитика тренировок</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">Считаются только завершённые упражнения. Черновики и запланированные минуты не увеличивают показатели.</p></div>
        <nav className="flex min-h-12 items-center gap-1 rounded-2xl border border-white/10 bg-white/[.035] p-1" aria-label="Период аналитики">{COACH_ANALYTICS_PERIODS.map((days) => <Link key={days} href={`/coach/analytics?period=${days}`} className={`grid min-h-10 place-items-center rounded-xl px-4 text-sm font-black ${days === periodDays ? 'bg-orange-500 text-white' : 'text-slate-500 hover:text-white'}`}>{days === 365 ? 'Год' : `${days} дн.`}</Link>)}</nav>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {[
          ['Тренировок', data.summary.factualTrainingCount], ['Минут группы', data.summary.trainingMinutes], ['Чел.-минут', data.summary.athleteMinutes],
          ['Учеников', data.summary.athletesTrained], ['Упражнений', data.summary.exerciseCount], ['Оценка', data.summary.averageRating == null ? '—' : `${data.summary.averageRating}/5`],
        ].map(([label, value]) => <article key={String(label)} className="rounded-2xl border border-white/10 bg-white/[.035] p-4"><b className="font-heading text-3xl text-white">{value}</b><span className="mt-1 block text-[10px] font-black uppercase tracking-wide text-slate-600">{label}</span></article>)}
      </section>

      {data.alerts.length ? <section><div className="flex items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.18em] text-orange-300">Контроль</p><h2 className="mt-1 font-heading text-3xl text-white">Что требует внимания</h2></div><span className="text-xs text-slate-600">{data.alerts.length}</span></div><div className="mt-4 grid gap-3 lg:grid-cols-2">{data.alerts.map((alert) => <Link key={alert.id} href={alert.href} className={`min-h-24 rounded-2xl border p-4 transition hover:-translate-y-0.5 ${toneClass[alert.tone]}`}><b className="block text-sm">{alert.title}</b><span className="mt-2 block text-xs leading-5 opacity-70">{alert.detail}</span></Link>)}</div></section> : null}

      <div className="grid gap-6 xl:grid-cols-2"><Distribution eyebrow="Баланс группы" title="Категории" rows={data.categories} mapLabel /><Distribution eyebrow="Фокус подготовки" title="Основные навыки" rows={data.skills} /></div>

      <section className="rounded-3xl border border-white/10 bg-white/[.035] p-4 sm:p-6">
        <div className="flex items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.18em] text-cyan-300">Ученики</p><h2 className="mt-1 font-heading text-3xl text-white">Нагрузка за период</h2></div><Link href="/coach/athletes" className="min-h-11 px-2 py-3 text-xs font-bold text-cyan-300">Все ученики →</Link></div>
        {activeAthletes.length ? <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{activeAthletes.map((athlete) => <Link key={athlete.playerId} href={`/coach/athletes/${athlete.playerId}`} className="flex min-h-24 items-center gap-3 rounded-2xl border border-white/8 bg-black/15 p-3 transition hover:border-cyan-400/25"><CoachAvatar name={athlete.name} photoUrl={athlete.photoUrl} /><div className="min-w-0 flex-1"><b className="block truncate text-white">{athlete.name}</b><span className="mt-1 block text-xs text-slate-500">{athlete.trainingCount} трен. · {athlete.exerciseCount} упр.</span><span className="mt-2 block text-sm font-black text-cyan-300">{athlete.trainingMinutes} минут</span></div></Link>)}</div> : <p className="mt-5 rounded-2xl border border-dashed border-white/10 p-7 text-center text-sm text-slate-500">Персональная нагрузка появится, когда завершённое упражнение будет назначено участникам.</p>}
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[.035] p-4 sm:p-6">
        <div className="flex items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.18em] text-orange-300">Библиотека</p><h2 className="mt-1 font-heading text-3xl text-white">Использование упражнений</h2></div><Link href="/coach/exercises" className="min-h-11 px-2 py-3 text-xs font-bold text-orange-300">Открыть базу →</Link></div>
        {activeExercises.length ? <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="text-[10px] uppercase tracking-wide text-slate-600"><tr><th className="px-3 py-2">Упражнение</th><th>Фактов</th><th>Ученики</th><th>Минуты</th><th>Оценка</th><th>Последний раз</th></tr></thead><tbody className="divide-y divide-white/5">{activeExercises.map((exercise) => <tr key={exercise.exerciseId}><td className="px-3 py-4"><Link href={`/coach/exercises/${exercise.exerciseId}`} className="font-bold text-white hover:text-orange-300">{exercise.title}</Link><small className="mt-1 block text-slate-600">{categoryLabels[exercise.category] ?? exercise.category}</small></td><td>{exercise.executionCount}</td><td>{exercise.athleteCount}</td><td className="font-black text-orange-300">{exercise.trainingMinutes}</td><td>{exercise.averageRating == null ? '—' : `${exercise.averageRating}/5`}</td><td className="text-slate-500">{formatCoachDate(exercise.lastUsedAt, true)}</td></tr>)}</tbody></table></div> : <p className="mt-5 rounded-2xl border border-dashed border-white/10 p-7 text-center text-sm text-slate-500">Использование появится после первого завершённого упражнения.</p>}
      </section>
    </div>
  );
}
