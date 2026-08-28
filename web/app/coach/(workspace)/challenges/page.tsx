import Link from 'next/link';
import ChallengeForm from '@/components/coach/ChallengeForm';
import CoachSetupNotice from '@/components/coach/CoachSetupNotice';
import { listCoachChallenges } from '@/lib/coach/challenge-service';
import { COACH_CHALLENGE_SCORING_LABELS, COACH_CHALLENGE_TYPE_LABELS } from '@/lib/coach/challenge-ui';
import { listCoachIssueOptions } from '@/lib/coach/exercise-service';
import { listCoachSkills } from '@/lib/coach/service';

export const dynamic = 'force-dynamic';

export default async function CoachChallengesPage() {
  let challenges; let skills; let issues;
  try { [challenges, skills, issues] = await Promise.all([listCoachChallenges(), listCoachSkills(), listCoachIssueOptions()]); }
  catch (error) { return <CoachSetupNotice detail={error instanceof Error ? error.message : undefined} />; }
  const counts = { control: 0, training: 0, competitive: 0 };
  challenges.forEach((item) => { counts[item.type] += 1; });
  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><p className="text-xs font-black uppercase tracking-[.2em] text-orange-400">Stage 6 · контроль прогресса</p><h1 className="mt-2 font-heading text-4xl text-white sm:text-5xl">Challenges</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">Стандартизированные тесты: одинаковые правила, сравнимые попытки, личные рекорды и напоминания повторить контроль.</p></div><div className="grid grid-cols-3 gap-2">{Object.entries(counts).map(([type, count]) => <div key={type} className="rounded-2xl border border-white/10 bg-white/[.035] p-3 text-center"><b className="font-heading text-2xl text-white">{count}</b><small className="block text-[9px] uppercase text-slate-600">{COACH_CHALLENGE_TYPE_LABELS[type as keyof typeof counts]}</small></div>)}</div></section>

      <details open={!challenges.length} className="rounded-3xl border border-orange-400/20 bg-orange-500/[.035] p-4 sm:p-6"><summary className="min-h-11 cursor-pointer py-2 font-black text-orange-200">＋ Создать Challenge</summary><div className="mt-5"><ChallengeForm skills={skills} issues={issues} /></div></details>

      {challenges.length ? <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{challenges.map((challenge) => <Link key={challenge.id} href={`/coach/challenges/${challenge.id}`} className="group rounded-3xl border border-white/10 bg-white/[.035] p-5 transition hover:-translate-y-0.5 hover:border-orange-400/30"><div className="flex flex-wrap gap-2"><span className="rounded-lg bg-orange-500/10 px-2 py-1 text-[10px] font-black uppercase text-orange-300">{COACH_CHALLENGE_TYPE_LABELS[challenge.type]}</span><span className="rounded-lg bg-cyan-500/10 px-2 py-1 text-[10px] font-bold text-cyan-300">{COACH_CHALLENGE_SCORING_LABELS[challenge.scoringType]}</span></div><h2 className="mt-4 text-lg font-black text-white group-hover:text-orange-200">{challenge.title}</h2><p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-slate-500">{challenge.description || 'Стандартизированный тест прогресса'}</p><div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500"><span>{challenge.attemptCount} действий</span>{challenge.maxScore != null ? <span>· до {challenge.maxScore}</span> : null}{challenge.repeatIntervalDays ? <span>· каждые {challenge.repeatIntervalDays} дн.</span> : null}</div><div className="mt-5 grid grid-cols-3 gap-2 border-t border-white/5 pt-4 text-center"><span><b className="block text-white">{challenge.attemptTotal}</b><small className="text-[9px] uppercase text-slate-600">попыток</small></span><span><b className="block text-white">{challenge.athleteTotal}</b><small className="text-[9px] uppercase text-slate-600">учеников</small></span><span><b className="block text-white">{challenge.issueCount}</b><small className="text-[9px] uppercase text-slate-600">проблем</small></span></div></Link>)}</section> : <section className="rounded-3xl border border-dashed border-white/10 p-10 text-center"><p className="font-heading text-3xl text-white">Создайте первый контроль</p><p className="mt-3 text-sm text-slate-500">Например: «Приём 10 коротких подач», максимум 30 баллов, повтор через 21 день.</p></section>}
    </div>
  );
}
