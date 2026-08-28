'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CoachChallengeDetail, CoachChallengeIssueLink } from '@/lib/coach/challenge-types';
import { COACH_CHALLENGE_SCORING_TYPES, COACH_CHALLENGE_TYPES } from '@/lib/coach/challenge-types';
import { COACH_CHALLENGE_SCORING_LABELS, COACH_CHALLENGE_TYPE_LABELS } from '@/lib/coach/challenge-ui';
import type { CoachSkill } from '@/lib/coach/types';

const field = 'mt-1 min-h-12 w-full rounded-xl border border-white/12 bg-[#0b111b] px-3 text-sm text-white outline-none focus:border-cyan-400';
const area = `${field} py-3`;
const label = 'text-xs font-bold text-slate-400';

export default function ChallengeForm({ skills, issues, challenge }: { skills: CoachSkill[]; issues: CoachChallengeIssueLink[]; challenge?: CoachChallengeDetail }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [type, setType] = useState(challenge?.type ?? 'control');
  const [scoringType, setScoringType] = useState(challenge?.scoringType ?? 'score');
  const [unitLabel, setUnitLabel] = useState(challenge?.unitLabel ?? 'балл');
  const [repeatIntervalDays, setRepeatIntervalDays] = useState(challenge?.repeatIntervalDays == null ? (challenge ? '' : '21') : String(challenge.repeatIntervalDays));
  const [higherIsBetter, setHigherIsBetter] = useState(challenge?.higherIsBetter ?? true);
  const leafSkills = skills.filter((skill) => skill.parentId);
  const selectedSkillIds = new Set(challenge?.skills.map((skill) => skill.id) ?? []);
  const selectedIssueIds = new Set(challenge?.issues.map((issue) => issue.id) ?? []);

  function changeType(nextType: typeof type) {
    setType(nextType);
    if (!challenge) setRepeatIntervalDays(nextType === 'control' ? '21' : '');
  }

  function changeScoringType(nextType: typeof scoringType) {
    setScoringType(nextType);
    if (challenge) return;
    if (nextType === 'time') { setUnitLabel('сек'); setHigherIsBetter(false); }
    else if (nextType === 'distance') { setUnitLabel('м'); setHigherIsBetter(true); }
    else if (nextType === 'percent') { setUnitLabel('%'); setHigherIsBetter(true); }
    else { setUnitLabel(nextType === 'count' ? 'раз' : 'балл'); setHigherIsBetter(true); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError(''); setMessage('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = {
      ...Object.fromEntries(form.entries()),
      type,
      scoringType,
      higherIsBetter: form.get('higherIsBetter') === 'on',
      archived: form.get('archived') === 'on',
      additionalSkillIds: form.getAll('additionalSkillIds'),
      issueIds: form.getAll('issueIds'),
    };
    const response = await fetch(challenge ? `/api/coach/challenges/${challenge.id}` : '/api/coach/challenges', {
      method: challenge ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({})) as { error?: string; challenge?: { id: string } };
    setPending(false);
    if (!response.ok || !result.challenge) { setError(result.error || 'Не удалось сохранить Challenge'); return; }
    if (challenge) { setMessage('Конструктор сохранён'); router.refresh(); }
    else router.push(`/coach/challenges/${result.challenge.id}`);
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <label className={`${label} md:col-span-2`}>Название<input name="title" required minLength={3} maxLength={160} defaultValue={challenge?.title ?? ''} placeholder="Приём 10 коротких подач" className={field} /></label>
        <label className={label}>Тип<select name="type" value={type} onChange={(event) => changeType(event.target.value as typeof type)} className={field}>{COACH_CHALLENGE_TYPES.map((value) => <option key={value} value={value}>{COACH_CHALLENGE_TYPE_LABELS[value]}</option>)}</select></label>
        <label className={label}>Как считаем<select name="scoringType" value={scoringType} onChange={(event) => changeScoringType(event.target.value as typeof scoringType)} className={field}>{COACH_CHALLENGE_SCORING_TYPES.map((value) => <option key={value} value={value}>{COACH_CHALLENGE_SCORING_LABELS[value]}</option>)}</select></label>
        <label className={label}>Количество действий<input name="attemptCount" type="number" min="1" max="500" defaultValue={challenge?.attemptCount ?? 10} className={field} /></label>
        <label className={label}>Максимальный результат<input name="maxScore" type="number" min="0.001" step="0.001" defaultValue={challenge?.maxScore ?? ''} placeholder="30" className={field} /></label>
        <label className={label}>Единица<input name="unitLabel" maxLength={40} value={unitLabel} onChange={(event) => setUnitLabel(event.target.value)} className={field} /></label>
        <label className={label}>Повторять через, дней<input name="repeatIntervalDays" type="number" min="1" max="3650" value={repeatIntervalDays} onChange={(event) => setRepeatIntervalDays(event.target.value)} placeholder="Без напоминания" className={field} /></label>
        <label className={`${label} md:col-span-2`}>Описание<textarea name="description" rows={3} maxLength={4000} defaultValue={challenge?.description ?? ''} className={area} /></label>
        <label className={label}>Метрики · по строке<textarea name="metrics" rows={5} defaultValue={challenge?.metrics.join('\n') ?? ''} placeholder={'Идеальных\nХороших\nОшибок'} className={area} /></label>
        <label className={label}>Правила · по строке<textarea name="rules" rows={5} defaultValue={challenge?.rules.join('\n') ?? ''} placeholder="Каждый приём оценивается 0–3" className={area} /></label>
        <label className={`${label} md:col-span-2`}>Основной навык<select name="primarySkillId" required defaultValue={challenge?.primarySkill?.id ?? ''} className={field}><option value="">Выберите навык</option>{leafSkills.map((skill) => <option key={skill.id} value={skill.id}>{skill.parentName} · {skill.name}</option>)}</select></label>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <fieldset className="rounded-2xl border border-white/8 p-3"><legend className="px-2 text-xs font-black uppercase tracking-wide text-slate-500">Дополнительные навыки</legend><div className="max-h-48 space-y-1 overflow-y-auto">{leafSkills.map((skill) => <label key={skill.id} className="flex min-h-11 items-center gap-3 rounded-xl px-2 text-sm text-slate-300 hover:bg-white/5"><input name="additionalSkillIds" type="checkbox" value={skill.id} defaultChecked={selectedSkillIds.has(skill.id) && skill.id !== challenge?.primarySkill?.id} className="h-5 w-5 accent-cyan-400" />{skill.parentName} · {skill.name}</label>)}</div></fieldset>
        <fieldset className="rounded-2xl border border-white/8 p-3"><legend className="px-2 text-xs font-black uppercase tracking-wide text-slate-500">Какие проблемы контролирует</legend><div className="max-h-48 space-y-1 overflow-y-auto">{issues.length ? issues.map((issue) => <label key={issue.id} className="flex min-h-11 items-start gap-3 rounded-xl px-2 py-2 text-sm text-slate-300 hover:bg-white/5"><input name="issueIds" type="checkbox" value={issue.id} defaultChecked={selectedIssueIds.has(issue.id)} className="mt-0.5 h-5 w-5 accent-orange-400" /><span><b className="text-white">{issue.title}</b><small className="block text-slate-600">{issue.skillName || 'Общая'}</small></span></label>) : <p className="p-3 text-sm text-slate-500">Сначала добавьте проблему ученику.</p>}</div></fieldset>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-h-12 items-center gap-3 rounded-xl border border-white/10 px-4 text-sm text-slate-300"><input name="higherIsBetter" type="checkbox" checked={higherIsBetter} onChange={(event) => setHigherIsBetter(event.target.checked)} className="h-5 w-5 accent-cyan-400" />Больше — лучше</label>
        {challenge ? <label className="flex min-h-12 items-center gap-3 rounded-xl border border-red-400/15 px-4 text-sm text-slate-300"><input name="archived" type="checkbox" defaultChecked={challenge.archived} className="h-5 w-5 accent-red-400" />В архиве</label> : null}
        <button disabled={pending} className="min-h-12 rounded-xl bg-orange-500 px-5 text-sm font-black text-white disabled:opacity-60">{pending ? 'Сохраняем…' : challenge ? 'Сохранить конструктор' : 'Создать Challenge'}</button>
        {message ? <span role="status" className="text-sm text-emerald-300">{message}</span> : null}
        {error ? <span role="alert" className="text-sm text-red-300">{error}</span> : null}
      </div>
    </form>
  );
}
