'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import CoachAvatar from '@/components/coach/CoachAvatar';
import ChallengeForm from '@/components/coach/ChallengeForm';
import type { CoachChallengeDetail, CoachChallengeIssueLink, CoachChallengeWorkspaceOptions } from '@/lib/coach/challenge-types';
import { COACH_CHALLENGE_SCORING_LABELS, COACH_CHALLENGE_TYPE_LABELS, formatChallengeScore } from '@/lib/coach/challenge-ui';
import type { CoachSkill } from '@/lib/coach/types';
import { formatCoachDate } from '@/lib/coach/ui';

const field = 'mt-1 min-h-12 w-full rounded-xl border border-white/12 bg-[#0b111b] px-3 text-sm text-white outline-none focus:border-orange-400';

export default function ChallengeWorkspace({ challenge, options, skills, issues }: { challenge: CoachChallengeDetail; options: CoachChallengeWorkspaceOptions; skills: CoachSkill[]; issues: CoachChallengeIssueLink[] }) {
  const router = useRouter();
  const athleteIds = [...new Set(challenge.attempts.map((item) => item.playerId))];
  const [graphPlayerId, setGraphPlayerId] = useState(athleteIds[0] ?? '');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const graphAttempts = useMemo(() => challenge.attempts.filter((item) => item.playerId === graphPlayerId).slice().reverse(), [challenge.attempts, graphPlayerId]);
  const scores = graphAttempts.map((item) => item.score);
  const min = scores.length ? Math.min(...scores) : 0;
  const max = scores.length ? Math.max(...scores) : 1;
  const range = Math.max(1, max - min);
  const points = graphAttempts.map((attempt, index) => {
    const performance = challenge.higherIsBetter ? (attempt.score - min) / range : (max - attempt.score) / range;
    return `${graphAttempts.length === 1 ? 300 : 25 + index * 550 / (graphAttempts.length - 1)},${155 - performance * 120}`;
  }).join(' ');
  const leaderboard = useMemo(() => {
    const best = new Map<string, typeof challenge.attempts[number]>();
    for (const attempt of challenge.attempts) {
      const current = best.get(attempt.playerId);
      if (!current || (challenge.higherIsBetter ? attempt.score > current.score : attempt.score < current.score)) best.set(attempt.playerId, attempt);
    }
    return [...best.values()].sort((a, b) => challenge.higherIsBetter ? b.score - a.score : a.score - b.score);
  }, [challenge]);

  async function addAttempt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError(''); setMessage('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const response = await fetch(`/api/coach/challenges/${challenge.id}/attempts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.fromEntries(form.entries())) });
    const result = await response.json().catch(() => ({})) as { error?: string; attempt?: { playerId: string; isPersonalRecord: boolean } };
    setPending(false);
    if (!response.ok || !result.attempt) { setError(result.error || 'Не удалось записать результат'); return; }
    setGraphPlayerId(result.attempt.playerId); setMessage(result.attempt.isPersonalRecord ? 'Новый личный рекорд!' : 'Результат записан');
    formElement.reset(); router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,.12),transparent_38%),rgba(255,255,255,.035)] p-4 sm:p-6">
        <Link href="/coach/challenges" className="inline-flex min-h-11 items-center text-sm text-slate-500 hover:text-orange-300">← Все Challenges</Link>
        <div className="mt-3 flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><div className="flex flex-wrap gap-2"><span className="rounded-lg bg-orange-500/10 px-2.5 py-1 text-xs font-black text-orange-300">{COACH_CHALLENGE_TYPE_LABELS[challenge.type]}</span><span className="rounded-lg bg-cyan-500/10 px-2.5 py-1 text-xs font-bold text-cyan-300">{COACH_CHALLENGE_SCORING_LABELS[challenge.scoringType]}</span>{challenge.primarySkill ? <span className="rounded-lg bg-white/5 px-2.5 py-1 text-xs text-slate-400">{challenge.primarySkill.parentName} · {challenge.primarySkill.name}</span> : null}</div><h1 className="mt-3 font-heading text-4xl text-white sm:text-5xl">{challenge.title}</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">{challenge.description || 'Стандартизированный тест прогресса.'}</p></div><div className="grid grid-cols-3 gap-2"><div className="rounded-2xl bg-black/20 p-3 text-center"><b className="font-heading text-2xl text-white">{challenge.attemptCount}</b><small className="block text-[9px] uppercase text-slate-600">действий</small></div><div className="rounded-2xl bg-black/20 p-3 text-center"><b className="font-heading text-2xl text-white">{challenge.maxScore ?? '—'}</b><small className="block text-[9px] uppercase text-slate-600">максимум</small></div><div className="rounded-2xl bg-black/20 p-3 text-center"><b className="font-heading text-2xl text-white">{challenge.repeatIntervalDays ?? '—'}</b><small className="block text-[9px] uppercase text-slate-600">дней</small></div></div></div>
      </section>

      <section className="rounded-3xl border border-orange-400/20 bg-orange-500/[.045] p-4 sm:p-6">
        <p className="text-xs font-black uppercase tracking-[.18em] text-orange-300">1–3 действия</p><h2 className="mt-1 font-heading text-3xl text-white">Записать попытку</h2>
        <form onSubmit={addAttempt} className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-[1.4fr_.7fr_.8fr_1.5fr_auto]">
          <label className="text-xs font-bold text-slate-400">Ученик<select name="playerId" required defaultValue="" className={field}><option value="" disabled>Выберите</option>{options.athletes.map((athlete) => <option key={athlete.playerId} value={athlete.playerId}>{athlete.name}</option>)}</select></label>
          <label className="text-xs font-bold text-slate-400">Результат<input name="score" type="number" step="0.001" required placeholder={challenge.maxScore ? `из ${challenge.maxScore}` : challenge.unitLabel} className={field} /></label>
          <label className="text-xs font-bold text-slate-400">Тренировка<select name="trainingSessionId" defaultValue="" className={field}><option value="">Без привязки</option>{options.sessions.slice(0, 30).map((session) => <option key={session.id} value={session.id}>{formatCoachDate(session.startsAt)} · {session.title}</option>)}</select></label>
          <label className="text-xs font-bold text-slate-400">Комментарий<input name="coachComment" maxLength={2000} placeholder="Необязательно" className={field} /></label>
          <button disabled={pending || !options.athletes.length} className="min-h-12 self-end rounded-xl bg-orange-500 px-5 text-sm font-black text-white disabled:opacity-50">{pending ? '…' : 'Записать'}</button>
        </form>
        {message ? <p role="status" className="mt-3 text-sm font-bold text-emerald-300">{message}</p> : null}{error ? <p role="alert" className="mt-3 text-sm text-red-300">{error}</p> : null}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
        <section className="rounded-3xl border border-white/10 bg-white/[.035] p-4 sm:p-6"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-xs font-black uppercase tracking-[.18em] text-cyan-300">Динамика</p><h2 className="mt-1 font-heading text-3xl text-white">График прогресса</h2></div>{athleteIds.length ? <select value={graphPlayerId} onChange={(event) => setGraphPlayerId(event.target.value)} className="min-h-11 rounded-xl border border-white/10 bg-[#0b111b] px-3 text-sm text-white">{athleteIds.map((id) => <option key={id} value={id}>{challenge.attempts.find((item) => item.playerId === id)?.athleteName}</option>)}</select> : null}</div>
          {graphAttempts.length ? <><svg viewBox="0 0 600 180" role="img" aria-label="График результатов" className="mt-5 w-full overflow-visible"><line x1="25" y1="155" x2="575" y2="155" stroke="rgba(255,255,255,.12)" /><polyline points={points} fill="none" stroke="#22d3ee" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />{points.split(' ').map((point, index) => { const [cx, cy] = point.split(','); return <circle key={graphAttempts[index].id} cx={cx} cy={cy} r="6" fill={graphAttempts[index].isPersonalRecord ? '#f97316' : '#22d3ee'}><title>{formatChallengeScore(graphAttempts[index].score, graphAttempts[index].maxScore, challenge.unitLabel)}</title></circle>; })}</svg><div className="flex justify-between text-xs text-slate-600"><span>{formatCoachDate(graphAttempts[0].completedAt)}</span><span>{formatCoachDate(graphAttempts.at(-1)?.completedAt ?? '')}</span></div></> : <p className="mt-5 rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-500">Запишите первую попытку — график появится автоматически.</p>}
        </section>
        <section className="rounded-3xl border border-white/10 bg-white/[.035] p-4 sm:p-6"><p className="text-xs font-black uppercase tracking-[.18em] text-orange-300">🏆 PR</p><h2 className="mt-1 font-heading text-3xl text-white">Лидеры</h2>{leaderboard.length ? <ol className="mt-5 space-y-2">{leaderboard.map((attempt, index) => <li key={attempt.playerId} className="flex min-h-14 items-center gap-3 rounded-2xl bg-black/15 p-3"><span className="grid h-8 w-8 place-items-center rounded-xl bg-white/5 text-xs font-black text-slate-500">{index + 1}</span><CoachAvatar name={attempt.athleteName} photoUrl={attempt.athletePhotoUrl} size="sm" /><span className="min-w-0 flex-1 truncate text-sm font-bold text-white">{attempt.athleteName}</span><b className="text-sm text-orange-300">{formatChallengeScore(attempt.score, attempt.maxScore, challenge.unitLabel)}</b></li>)}</ol> : <p className="mt-5 text-sm text-slate-500">Рекорды появятся после первой попытки.</p>}</section>
      </div>

      <section className="rounded-3xl border border-white/10 bg-white/[.035] p-4 sm:p-6"><p className="text-xs font-black uppercase tracking-[.18em] text-cyan-300">История</p><h2 className="mt-1 font-heading text-3xl text-white">Последние попытки</h2>{challenge.attempts.length ? <div className="mt-5 space-y-2">{challenge.attempts.map((attempt) => <article key={attempt.id} className="flex min-h-16 flex-wrap items-center gap-3 rounded-2xl border border-white/8 bg-black/15 p-3"><CoachAvatar name={attempt.athleteName} photoUrl={attempt.athletePhotoUrl} size="sm" /><div className="min-w-36 flex-1"><Link href={`/coach/athletes/${attempt.playerId}`} className="font-bold text-white hover:text-cyan-300">{attempt.athleteName}</Link><small className="block text-slate-600">{formatCoachDate(attempt.completedAt, true)}{attempt.trainingSessionTitle ? ` · ${attempt.trainingSessionTitle}` : ''}</small></div><b className="font-heading text-2xl text-cyan-300">{formatChallengeScore(attempt.score, attempt.maxScore, challenge.unitLabel)}</b>{attempt.deltaFromPrevious != null ? <span className={`rounded-lg px-2 py-1 text-xs font-black ${attempt.deltaFromPrevious > 0 ? 'bg-emerald-500/10 text-emerald-300' : attempt.deltaFromPrevious < 0 ? 'bg-red-500/10 text-red-300' : 'bg-white/5 text-slate-500'}`}>{attempt.deltaFromPrevious > 0 ? '+' : ''}{attempt.deltaFromPrevious}</span> : null}{attempt.isPersonalRecord ? <span className="rounded-lg bg-orange-500/10 px-2 py-1 text-xs font-black text-orange-300">PR</span> : null}{attempt.coachComment ? <p className="w-full pl-0 text-xs text-slate-500 sm:pl-14">{attempt.coachComment}</p> : null}</article>)}</div> : <p className="mt-5 text-sm text-slate-500">История пока пуста.</p>}</section>

      <details className="rounded-3xl border border-white/10 bg-white/[.025] p-4 sm:p-6"><summary className="min-h-11 cursor-pointer py-2 font-black text-slate-300">Настроить конструктор</summary><div className="mt-5"><ChallengeForm challenge={challenge} skills={skills} issues={issues} /></div></details>
    </div>
  );
}
