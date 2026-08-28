import Link from 'next/link';
import type { CoachAthleteChallengeSummary } from '@/lib/coach/challenge-types';
import { formatChallengeScore } from '@/lib/coach/challenge-ui';
import { formatCoachDate } from '@/lib/coach/ui';

export default function AthleteChallengePanel({ data }: { data: CoachAthleteChallengeSummary }) {
  return (
    <section className="mt-6 rounded-3xl border border-orange-400/15 bg-orange-400/[.035] p-4 sm:p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-xs font-black uppercase tracking-[.18em] text-orange-300">Challenges</p><h2 className="mt-1 font-heading text-3xl text-white">Контроль и рекорды</h2></div><Link href="/coach/challenges" className="min-h-11 py-3 text-xs font-bold text-orange-300">Все Challenges →</Link></div>
      {data.reminders.length ? <div className="mt-5 space-y-2">{data.reminders.map((item) => <Link key={`${item.challengeId}-${item.playerId}`} href={`/coach/challenges/${item.challengeId}`} className="block rounded-2xl border border-orange-400/20 bg-orange-500/[.07] p-3"><b className="text-sm text-orange-100">Пора повторить: {item.challengeTitle}</b><span className="mt-1 block text-xs text-orange-200/60">{item.issueTitle} · просрочено {item.daysOverdue} дн.</span></Link>)}</div> : null}
      {data.personalRecords.length ? <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{data.personalRecords.map((record) => <Link key={record.challengeId} href={`/coach/challenges/${record.challengeId}`} className="rounded-2xl border border-white/8 bg-black/15 p-4"><small className="text-[10px] font-black uppercase tracking-wide text-slate-600">🏆 Личный рекорд</small><b className="mt-2 block text-sm text-white">{record.title}</b><span className="mt-2 block font-heading text-2xl text-orange-300">{formatChallengeScore(record.score, record.maxScore, record.unitLabel)}</span></Link>)}</div> : <p className="mt-5 text-sm text-slate-500">Личные рекорды появятся после первой контрольной попытки.</p>}
      {data.attempts.length ? <div className="mt-5 border-t border-white/5 pt-4"><h3 className="text-xs font-black uppercase tracking-wide text-slate-600">Последние попытки</h3><div className="mt-2 flex flex-wrap gap-2">{data.attempts.slice(0, 6).map((attempt) => <span key={attempt.id} className="rounded-xl bg-white/5 px-3 py-2 text-xs text-slate-400">{formatCoachDate(attempt.completedAt)} · <b className="text-white">{attempt.score}{attempt.maxScore != null ? `/${attempt.maxScore}` : ''}</b>{attempt.isPersonalRecord ? ' · PR' : ''}</span>)}</div></div> : null}
    </section>
  );
}
