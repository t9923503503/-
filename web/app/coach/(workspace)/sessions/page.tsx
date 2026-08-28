import Link from 'next/link';
import CreateSessionForm from '@/components/coach/CreateSessionForm';
import CoachSetupNotice from '@/components/coach/CoachSetupNotice';
import { listCoachTrainingSessions } from '@/lib/coach/session-service';
import { COACH_TRAINING_SOURCE_LABELS, COACH_TRAINING_STATUS_LABELS, formatCoachSessionDate } from '@/lib/coach/session-ui';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const views = [{ value: 'upcoming', label: 'Предстоящие' }, { value: 'today', label: 'Сегодня' }, { value: 'past', label: 'Прошедшие' }, { value: 'drafts', label: 'Черновики' }];

export default async function CoachSessionsPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const view = typeof raw.view === 'string' ? raw.view : 'upcoming';
  let sessions;
  try { sessions = await listCoachTrainingSessions(view); } catch (error) { return <CoachSetupNotice detail={error instanceof Error ? error.message : undefined} />; }
  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-orange-400">Stage 3 · sessions</p><h1 className="mt-2 font-heading text-4xl leading-none tracking-wide text-white sm:text-5xl">Тренировки</h1><p className="mt-3 max-w-2xl text-sm text-slate-400">LP Coach — центральная база. Котяра и YCLIENTS обновляют свои статусы отдельно.</p></div><CreateSessionForm /></section>
      <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Фильтр тренировок">{views.map((item) => <Link key={item.value} href={`/coach/sessions?view=${item.value}`} className={`inline-flex min-h-11 shrink-0 items-center rounded-xl px-4 text-sm font-bold ${view === item.value ? 'bg-orange-500 text-white' : 'border border-white/10 text-slate-400'}`}>{item.label}</Link>)}</nav>
      {sessions.length ? <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{sessions.map((session) => <Link key={session.id} href={`/coach/sessions/${session.id}`} className="group rounded-3xl border border-white/10 bg-white/[0.035] p-5 transition hover:border-orange-400/35">
        <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-black uppercase tracking-[.16em] text-orange-300">{COACH_TRAINING_SOURCE_LABELS[session.source]} · {COACH_TRAINING_STATUS_LABELS[session.status]}</p><h2 className="mt-2 text-xl font-black text-white">{session.title}</h2></div>{session.unknownCount ? <span className="rounded-lg bg-rose-400/10 px-2 py-1 text-xs font-black text-rose-200">{session.unknownCount} ?</span> : null}</div>
        <p className="mt-4 text-sm font-bold text-slate-200">{formatCoachSessionDate(session.startsAt)}</p><p className="mt-1 text-sm text-slate-500">{session.location || 'Место не указано'} · {session.courtCount} корт</p>
        <div className="mt-5 grid grid-cols-3 gap-2 border-t border-white/8 pt-4 text-center text-xs text-slate-500"><span><b className="block text-base text-white">{session.participantCount}</b>участников</span><span><b className="block text-base text-sky-200">{session.goingCount}</b>идут</span><span><b className={`block text-base ${session.conflictCount ? 'text-amber-300' : 'text-white'}`}>{session.conflictCount}</b>конфликтов</span></div>
      </Link>)}</section> : <section className="rounded-3xl border border-dashed border-white/10 p-10 text-center"><p className="font-heading text-3xl text-slate-200">Тренировок нет</p><p className="mt-2 text-sm text-slate-500">Создайте вручную или дождитесь следующей синхронизации Котяры.</p></section>}
    </div>
  );
}
