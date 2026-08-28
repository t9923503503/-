import Link from 'next/link';
import { notFound } from 'next/navigation';
import SessionWorkspace from '@/components/coach/SessionWorkspace';
import WorkoutWorkspace from '@/components/coach/WorkoutWorkspace';
import CoachSetupNotice from '@/components/coach/CoachSetupNotice';
import { requireCoachPageActor } from '@/lib/coach/auth';
import { listCoachIdentityCandidates } from '@/lib/coach/session-service';
import { getCoachRecommendationContext } from '@/lib/coach/recommendation-service';
import { COACH_TRAINING_SOURCE_LABELS, COACH_TRAINING_STATUS_LABELS, formatCoachSessionDate } from '@/lib/coach/session-ui';
import { isCoachUuid } from '@/lib/coach/validators';
import { getCoachWorkoutWorkspace } from '@/lib/coach/workout-service';

type Props = { params: Promise<{ id: string }> };

export default async function CoachSessionPage({ params }: Props) {
  const { id } = await params;
  if (!isCoachUuid(id)) notFound();
  const actor = await requireCoachPageActor();
  let workspace;
  let candidates;
  let recommendationContext;
  try { [workspace, candidates, recommendationContext] = await Promise.all([getCoachWorkoutWorkspace(id, actor.id), listCoachIdentityCandidates(), getCoachRecommendationContext(id)]); } catch (error) { return <CoachSetupNotice detail={error instanceof Error ? error.message : undefined} />; }
  if (!workspace || !recommendationContext) notFound();
  const { session } = workspace;
  return <div className="space-y-6">
    <Link href="/coach/sessions" className="inline-flex min-h-11 items-center text-sm font-bold text-slate-400 hover:text-white">← Все тренировки</Link>
    <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 sm:p-6"><p className="text-xs font-black uppercase tracking-[.18em] text-orange-300">{COACH_TRAINING_SOURCE_LABELS[session.source]} · {COACH_TRAINING_STATUS_LABELS[session.status]}</p><h1 className="mt-2 font-heading text-4xl text-white sm:text-5xl">{session.title}</h1><p className="mt-4 text-base font-bold text-slate-200">{formatCoachSessionDate(session.startsAt)}</p><p className="mt-1 text-sm text-slate-500">{session.location || 'Место не указано'} · {session.courtCount} кортов · YCLIENTS {session.yclientsRecordsCount ?? '—'}/{session.capacity ?? '—'}</p></section>
    <WorkoutWorkspace initialData={workspace} recommendationContext={recommendationContext} />
    <section id="roster"><div className="mb-4 flex items-end justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.18em] text-cyan-300">Состав</p><h2 className="mt-1 font-heading text-3xl text-white">{session.participantCount} участников</h2></div>{session.conflictCount ? <span className="rounded-xl bg-amber-400/10 px-3 py-2 text-sm font-black text-amber-200">⚠ {session.conflictCount} конфликтов</span> : null}</div><SessionWorkspace initialSession={session} candidates={candidates} /></section>
  </div>;
}
