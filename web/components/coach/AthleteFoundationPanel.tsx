'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import CoachAvatar from '@/components/coach/CoachAvatar';
import { confidenceLabel, latestEvaluationsBySkill } from '@/lib/coach/core';
import type { CoachAthleteDetail, CoachAthleteIssue, CoachIssueStatus, CoachSkill } from '@/lib/coach/types';
import type { CoachAthleteAnalytics } from '@/lib/coach/analytics-types';
import { COACH_ATHLETE_STATUS_LABELS, COACH_ISSUE_STATUS_LABELS, COACH_LEVEL_LABELS, COACH_SOURCE_LABELS, formatCoachDate } from '@/lib/coach/ui';

const inputClass = 'mt-2 min-h-12 w-full rounded-xl border border-white/15 bg-[#0b111b] px-4 font-normal text-white outline-none transition focus:border-cyan-400';
const textareaClass = 'mt-2 w-full rounded-xl border border-white/15 bg-black/20 p-4 font-normal text-white outline-none transition focus:border-cyan-400';

async function readError(response: Response): Promise<string> {
  const payload = await response.json().catch(() => ({})) as { error?: string };
  return payload.error || 'Не удалось сохранить изменения';
}

function IssueRow({ athleteId, issue }: { athleteId: string; issue: CoachAthleteIssue }) {
  const router = useRouter();
  const [status, setStatus] = useState<CoachIssueStatus>(issue.status);
  const [priority, setPriority] = useState(issue.priority);
  const [comment, setComment] = useState(issue.coachComment);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');

  async function save(markWorked = false) {
    setPending(true);
    setMessage('');
    const response = await fetch(`/api/coach/athletes/${athleteId}/issues/${issue.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status, priority, coachComment: comment, markWorked }),
    });
    if (!response.ok) {
      setMessage(await readError(response));
      setPending(false);
      return;
    }
    setMessage(markWorked ? 'Работа отмечена' : 'Сохранено');
    setPending(false);
    router.refresh();
  }

  return (
    <article className={`rounded-2xl border p-4 ${issue.priority >= 5 && !['resolved', 'archived'].includes(issue.status) ? 'border-red-400/25 bg-red-500/[0.045]' : 'border-white/10 bg-black/15'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-black text-white">{issue.title}</h3>
            <span className="rounded-lg bg-white/5 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{COACH_ISSUE_STATUS_LABELS[issue.status]}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">{issue.skillName || 'Общая'} · обнаружена {formatCoachDate(issue.detectedAt)}</p>
          {issue.description ? <p className="mt-3 text-sm leading-6 text-slate-400">{issue.description}</p> : null}
        </div>
        <span className={`rounded-xl px-3 py-2 text-xs font-black ${issue.priority >= 5 ? 'bg-red-500/15 text-red-300' : issue.priority >= 4 ? 'bg-orange-500/15 text-orange-300' : 'bg-cyan-500/10 text-cyan-300'}`}>P{issue.priority}</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-[170px_110px_1fr]">
        <label className="text-xs font-bold text-slate-500">Статус
          <select value={status} onChange={(event) => setStatus(event.target.value as CoachIssueStatus)} className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-[#0b111b] px-3 text-sm text-white">
            {Object.entries(COACH_ISSUE_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-slate-500">Приоритет
          <select value={priority} onChange={(event) => setPriority(Number(event.target.value))} className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-[#0b111b] px-3 text-sm text-white">
            {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}/5</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-slate-500">Комментарий тренера
          <input value={comment} onChange={(event) => setComment(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-cyan-400" />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => save(false)} disabled={pending} className="min-h-11 rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-4 text-xs font-black text-cyan-200 disabled:opacity-60">Сохранить</button>
        <button type="button" onClick={() => save(true)} disabled={pending} className="min-h-11 rounded-xl border border-white/10 px-4 text-xs font-bold text-slate-300 disabled:opacity-60">Отметить работу</button>
        {issue.lastWorkedAt ? <span className="text-xs text-slate-600">Работали: {formatCoachDate(issue.lastWorkedAt, true)}</span> : null}
        {message ? <span role="status" className="text-xs text-amber-300">{message}</span> : null}
      </div>
    </article>
  );
}

export default function AthleteFoundationPanel({ athlete, skills, analytics }: { athlete: CoachAthleteDetail; skills: CoachSkill[]; analytics: CoachAthleteAnalytics }) {
  const router = useRouter();
  const [profilePending, setProfilePending] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [evaluationPending, setEvaluationPending] = useState(false);
  const [evaluationMessage, setEvaluationMessage] = useState('');
  const [issuePending, setIssuePending] = useState(false);
  const [issueMessage, setIssueMessage] = useState('');
  const currentEvaluations = useMemo(() => latestEvaluationsBySkill(athlete.evaluations), [athlete.evaluations]);
  const leafSkills = skills.filter((skill) => skill.parentId);
  const selectableSkills = leafSkills.length ? leafSkills : skills;

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfilePending(true);
    setProfileMessage('');
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/coach/athletes/${athlete.playerId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(form.entries())),
    });
    if (!response.ok) setProfileMessage(await readError(response));
    else {
      setProfileMessage('Карточка сохранена');
      router.refresh();
    }
    setProfilePending(false);
  }

  async function addEvaluation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setEvaluationPending(true);
    setEvaluationMessage('');
    const form = new FormData(formElement);
    const response = await fetch(`/api/coach/athletes/${athlete.playerId}/evaluations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(form.entries())),
    });
    if (!response.ok) setEvaluationMessage(await readError(response));
    else {
      setEvaluationMessage('Оценка добавлена в историю');
      formElement.reset();
      router.refresh();
    }
    setEvaluationPending(false);
  }

  async function addIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setIssuePending(true);
    setIssueMessage('');
    const form = new FormData(formElement);
    const response = await fetch(`/api/coach/athletes/${athlete.playerId}/issues`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(form.entries())),
    });
    if (!response.ok) setIssueMessage(await readError(response));
    else {
      setIssueMessage('Проблема добавлена');
      formElement.reset();
      router.refresh();
    }
    setIssuePending(false);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(0,209,255,0.08),transparent_35%),rgba(255,255,255,0.035)] p-4 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <CoachAvatar name={athlete.name} photoUrl={athlete.photoUrl} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">Карточка ученика</p>
            <h1 className="mt-1 font-heading text-4xl leading-none tracking-wide text-white sm:text-5xl">{athlete.name}</h1>
            <p className="mt-3 text-sm text-slate-400">{athlete.gender} · рейтинг {Math.round(athlete.rating)} · {athlete.tournamentsPlayed} турниров · в Coach с {formatCoachDate(athlete.joinedAt)}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-xl bg-orange-500/10 px-3 py-1.5 text-xs font-black text-orange-300">{COACH_LEVEL_LABELS[athlete.levelCode]}</span>
              <span className="rounded-xl bg-white/5 px-3 py-1.5 text-xs text-slate-400">{COACH_ATHLETE_STATUS_LABELS[athlete.status]}</span>
              <span className="rounded-xl bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-300">{athlete.evaluationCount} оценок</span>
              <span className="rounded-xl bg-red-500/10 px-3 py-1.5 text-xs text-red-300">{athlete.activeIssueCount} проблем</span>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-cyan-400/15 bg-cyan-400/[0.035] p-4 sm:p-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-300">Тренировочный факт</p><h2 className="mt-1 font-heading text-3xl tracking-wide">Нагрузка ученика</h2></div><a href="/coach/analytics" className="min-h-11 py-3 text-xs font-bold text-cyan-300">Вся аналитика →</a></div>
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">{[['Тренировок', analytics.trainingCount], ['Упражнений', analytics.exerciseCount], ['Минут', analytics.trainingMinutes], ['Последний факт', analytics.lastTrainingAt ? formatCoachDate(analytics.lastTrainingAt) : '—']].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-white/8 bg-black/15 p-4"><b className="block font-heading text-2xl text-white">{value}</b><span className="mt-1 block text-[10px] font-bold uppercase tracking-wide text-slate-600">{label}</span></div>)}</div>
        {analytics.favoriteExercises.length || analytics.trainedSkills.length ? <div className="mt-5 grid gap-4 lg:grid-cols-2"><div><h3 className="text-xs font-black uppercase tracking-wide text-slate-500">Чаще упражнения</h3><div className="mt-2 flex flex-wrap gap-2">{analytics.favoriteExercises.map((item) => <a key={item.exerciseId} href={`/coach/exercises/${item.exerciseId}`} className="rounded-xl bg-white/5 px-3 py-2 text-xs text-slate-300">{item.title} · {item.trainingMinutes} мин</a>)}</div></div><div><h3 className="text-xs font-black uppercase tracking-wide text-slate-500">Навыки по факту</h3><div className="mt-2 flex flex-wrap gap-2">{analytics.trainedSkills.map((item) => <span key={item.skillId} className="rounded-xl bg-cyan-400/10 px-3 py-2 text-xs text-cyan-200">{item.name} · {item.trainingMinutes} мин</span>)}</div></div></div> : <p className="mt-5 text-sm text-slate-500">Пока нет завершённых упражнений, назначенных этому ученику.</p>}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <form onSubmit={saveProfile} className="rounded-3xl border border-white/10 bg-white/[0.035] p-4 sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-orange-300">Профиль</p>
          <h2 className="mt-1 font-heading text-3xl tracking-wide">Уровень и цель</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-bold text-slate-300">Уровень
              <select name="levelCode" defaultValue={athlete.levelCode} className={inputClass}>{Object.entries(COACH_LEVEL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            </label>
            <label className="text-sm font-bold text-slate-300">Статус
              <select name="status" defaultValue={athlete.status} className={inputClass}>{Object.entries(COACH_ATHLETE_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            </label>
            <label className="text-sm font-bold text-slate-300">Дата начала
              <input name="joinedAt" type="date" defaultValue={athlete.joinedAt} className={inputClass} />
            </label>
            <span className="hidden sm:block" />
            <label className="text-sm font-bold text-slate-300">Цель
              <textarea name="goals" rows={3} defaultValue={athlete.goals} className={textareaClass} />
            </label>
            <label className="text-sm font-bold text-slate-300">Ограничения
              <textarea name="limitations" rows={3} defaultValue={athlete.limitations} className={textareaClass} />
            </label>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button disabled={profilePending} className="min-h-12 rounded-xl bg-orange-500 px-5 text-sm font-black text-white disabled:opacity-60">{profilePending ? 'Сохраняем…' : 'Сохранить карточку'}</button>
            {profileMessage ? <span role="status" className="text-xs text-amber-300">{profileMessage}</span> : null}
          </div>
        </form>

        <form onSubmit={addEvaluation} className="rounded-3xl border border-cyan-400/15 bg-cyan-400/[0.035] p-4 sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-300">Наблюдение</p>
          <h2 className="mt-1 font-heading text-3xl tracking-wide">Оценить навык</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-bold text-slate-300 sm:col-span-2">Навык
              <select name="skillId" required defaultValue="" className={inputClass}>
                <option value="" disabled>Выберите навык</option>
                {selectableSkills.map((skill) => <option key={skill.id} value={skill.id}>{skill.parentName ? `${skill.parentName} · ` : ''}{skill.name}</option>)}
              </select>
            </label>
            <label className="text-sm font-bold text-slate-300">Оценка 1–5
              <select name="score" defaultValue="3" className={inputClass}>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}/5</option>)}</select>
            </label>
            <label className="text-sm font-bold text-slate-300">Уверенность
              <select name="confidence" defaultValue="0.8" className={inputClass}><option value="0.4">Низкая</option><option value="0.65">Средняя</option><option value="0.8">Высокая</option><option value="1">Точно</option></select>
            </label>
            <label className="text-sm font-bold text-slate-300 sm:col-span-2">Комментарий
              <textarea name="coachComment" rows={3} placeholder="Что увидел тренер" className={textareaClass} />
            </label>
          </div>
          <input type="hidden" name="source" value="coach" />
          <div className="mt-4 flex items-center gap-3">
            <button disabled={evaluationPending} className="min-h-12 rounded-xl bg-cyan-500 px-5 text-sm font-black text-[#071018] disabled:opacity-60">{evaluationPending ? 'Добавляем…' : 'Добавить оценку'}</button>
            {evaluationMessage ? <span role="status" className="text-xs text-cyan-200">{evaluationMessage}</span> : null}
          </div>
        </form>
      </div>

      <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-4 sm:p-6">
        <div className="flex items-end justify-between gap-3">
          <div><p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-300">Срез навыков</p><h2 className="mt-1 font-heading text-3xl tracking-wide">Текущая оценка</h2></div>
          <span className="text-xs text-slate-600">{currentEvaluations.length} навыков</span>
        </div>
        {currentEvaluations.length ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {currentEvaluations.map((evaluation) => (
              <article key={evaluation.skillId} className="rounded-2xl border border-white/8 bg-black/15 p-4">
                <div className="flex items-start justify-between gap-3"><div><p className="text-xs text-slate-600">{evaluation.parentName || 'Навык'}</p><h3 className="mt-1 text-sm font-black text-white">{evaluation.skillName}</h3></div><span className="font-heading text-3xl text-cyan-300">{evaluation.score}</span></div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/5"><span className="block h-full rounded-full bg-cyan-400" style={{ width: `${evaluation.score * 20}%` }} /></div>
                <p className="mt-3 text-xs text-slate-500">{evaluation.trend === 'up' ? '↑ растёт' : evaluation.trend === 'down' ? '↓ снизился' : evaluation.trend === 'flat' ? '→ без изменений' : 'первая оценка'} · {confidenceLabel(evaluation.confidence)}</p>
              </article>
            ))}
          </div>
        ) : <p className="mt-5 rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-500">Навыки ещё не оценивались.</p>}
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <form onSubmit={addIssue} className="rounded-3xl border border-orange-400/15 bg-orange-500/[0.035] p-4 sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-orange-300">Диагностика</p>
          <h2 className="mt-1 font-heading text-3xl tracking-wide">Добавить проблему</h2>
          <div className="mt-5 space-y-4">
            <label className="block text-sm font-bold text-slate-300">Название
              <input name="title" required minLength={3} placeholder="Например: поздний выход к мячу" className={inputClass} />
            </label>
            <label className="block text-sm font-bold text-slate-300">Связанный навык
              <select name="skillId" defaultValue="" className={inputClass}><option value="">Общая проблема</option>{selectableSkills.map((skill) => <option key={skill.id} value={skill.id}>{skill.parentName ? `${skill.parentName} · ` : ''}{skill.name}</option>)}</select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm font-bold text-slate-300">Приоритет
                <select name="priority" defaultValue="3" className={inputClass}>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}/5</option>)}</select>
              </label>
              <label className="text-sm font-bold text-slate-300">Уверенность
                <select name="confidence" defaultValue="0.8" className={inputClass}><option value="0.4">Низкая</option><option value="0.65">Средняя</option><option value="0.8">Высокая</option><option value="1">Точно</option></select>
              </label>
            </div>
            <label className="block text-sm font-bold text-slate-300">Описание
              <textarea name="description" rows={3} className={textareaClass} />
            </label>
            <label className="block text-sm font-bold text-slate-300">Комментарий тренера
              <textarea name="coachComment" rows={2} className={textareaClass} />
            </label>
          </div>
          <input type="hidden" name="source" value="coach" /><input type="hidden" name="status" value="active" />
          <button disabled={issuePending} className="mt-4 min-h-12 w-full rounded-xl bg-orange-500 px-5 text-sm font-black text-white disabled:opacity-60">{issuePending ? 'Добавляем…' : 'Добавить проблему'}</button>
          {issueMessage ? <p role="status" className="mt-3 text-xs text-amber-300">{issueMessage}</p> : null}
        </form>

        <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-4 sm:p-6">
          <div className="flex items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-orange-300">Проблемы</p><h2 className="mt-1 font-heading text-3xl tracking-wide">Работа тренера</h2></div><span className="text-xs text-slate-600">{athlete.issues.length}</span></div>
          {athlete.issues.length ? <div className="mt-5 space-y-3">{athlete.issues.map((issue) => <IssueRow key={issue.id} athleteId={athlete.playerId} issue={issue} />)}</div> : <p className="mt-5 rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-500">Зафиксированных проблем пока нет.</p>}
        </section>
      </div>

      <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-4 sm:p-6">
        <div className="flex items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Журнал</p><h2 className="mt-1 font-heading text-3xl tracking-wide">История оценок</h2></div><span className="text-xs text-slate-600">append-only</span></div>
        {athlete.evaluations.length ? (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-white/10 text-[10px] uppercase tracking-[0.12em] text-slate-600"><tr><th className="px-3 py-3">Дата</th><th className="px-3 py-3">Навык</th><th className="px-3 py-3">Оценка</th><th className="px-3 py-3">Источник</th><th className="px-3 py-3">Комментарий</th></tr></thead>
              <tbody className="divide-y divide-white/5">{athlete.evaluations.map((evaluation) => <tr key={evaluation.id}><td className="whitespace-nowrap px-3 py-4 text-slate-500">{formatCoachDate(evaluation.evaluatedAt, true)}</td><td className="px-3 py-4"><span className="block font-bold text-white">{evaluation.skillName}</span><span className="text-xs text-slate-600">{evaluation.parentName}</span></td><td className="px-3 py-4 font-heading text-2xl text-cyan-300">{evaluation.score}/5</td><td className="px-3 py-4 text-slate-400">{COACH_SOURCE_LABELS[evaluation.source]}</td><td className="max-w-md px-3 py-4 text-slate-400">{evaluation.coachComment || '—'}</td></tr>)}</tbody>
            </table>
          </div>
        ) : <p className="mt-5 text-sm text-slate-500">История появится после первой оценки.</p>}
      </section>
    </div>
  );
}
