'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { CoachRecommendationContext } from '@/lib/coach/recommendation-types';
import type { CoachWorkoutPlan, CoachWorkoutWorkspaceData } from '@/lib/coach/workout-types';

const LEVEL_LABELS = { auto: 'По уровню группы', light: 'Лёгкий', medium: 'Средний', hard: 'Сложный' } as const;
const INTENSITY_LABELS = { auto: 'Сбалансированная', low: 'Низкая', medium: 'Средняя', high: 'Высокая' } as const;

type Props = {
  sessionId: string;
  context: CoachRecommendationContext;
  participants: CoachWorkoutWorkspaceData['eligibleParticipants'];
  exerciseCount: number;
  currentItemCount: number;
  hasExecutions: boolean;
  busy: boolean;
  onGenerated: (plan: CoachWorkoutPlan) => void;
};

function participantName(participant: Props['participants'][number]): string {
  return participant.playerName || participant.displayName || 'Участник';
}

export default function WorkoutRecommendationBuilder(props: Props) {
  const initialFocus = props.context.skills.find((skill) => skill.activeAthleteCount > 0)?.id ?? '';
  const [durationMinutes, setDurationMinutes] = useState(props.context.defaultDurationMinutes);
  const [courtCount, setCourtCount] = useState(props.context.defaultCourtCount);
  const [participantIds, setParticipantIds] = useState(() => props.participants.map((participant) => participant.id));
  const [focusSkillId, setFocusSkillId] = useState(initialFocus);
  const [levelCode, setLevelCode] = useState<'auto' | 'light' | 'medium' | 'hard'>('auto');
  const [intensity, setIntensity] = useState<'auto' | 'low' | 'medium' | 'high'>('auto');
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const activeNeeds = useMemo(() => props.context.skills.filter((skill) => skill.activeAthleteCount > 0).slice(0, 5), [props.context.skills]);

  function toggleParticipant(id: string) {
    setParticipantIds((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]);
  }

  async function generate() {
    if (!participantIds.length) return setError('Выберите хотя бы одного участника.');
    if (props.currentItemCount > 0 && !window.confirm('Заменить текущий черновик новым? Фактические результаты не затрагиваются.')) return;
    setWorking(true);
    setError('');
    setMessage('');
    const response = await fetch(`/api/coach/sessions/${props.sessionId}/recommendations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        durationMinutes,
        courtCount,
        participantIds,
        focusSkillId: focusSkillId || null,
        levelCode,
        intensity,
        replaceExisting: props.currentItemCount > 0,
      }),
    });
    const data = await response.json().catch(() => ({}));
    setWorking(false);
    if (!response.ok) return setError(String(data.error || 'Не удалось собрать тренировку.'));
    const plan = data.plan as CoachWorkoutPlan;
    props.onGenerated(plan);
    setMessage(`Черновик собран: ${plan.items.length} упражнений на ${Math.round(plan.plannedDurationSeconds / 60)} мин. Его можно менять вручную.`);
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-orange-400/25 bg-gradient-to-br from-orange-500/[0.12] via-white/[0.035] to-cyan-500/[0.06]">
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2"><p className="text-xs font-black uppercase tracking-[.18em] text-orange-300">Конструктор тренировки</p><span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-cyan-200">По правилам · не AI</span></div>
            <h2 className="mt-2 font-heading text-3xl text-white">Собрать объяснимый черновик</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">Учитывает проблемы группы, состав, корты, уровень, интенсивность, историю повторов, оценку тренера и баланс навыков.</p>
          </div>
        </div>

        {activeNeeds.length ? <div className="mt-4 flex flex-wrap gap-2">{activeNeeds.map((skill) => <span key={skill.id} className="rounded-xl border border-white/10 bg-black/15 px-3 py-2 text-xs font-bold text-slate-200">{skill.name}: {skill.activeAthleteCount}{skill.highPriorityCount ? ` · ${skill.highPriorityCount} высокий` : ''}</span>)}</div> : <p className="mt-4 rounded-xl border border-white/10 bg-black/15 px-4 py-3 text-xs text-slate-400">У выбранной группы пока нет связанных активных проблем — подбор опирается на совместимость, историю и баланс нагрузки.</p>}

        {!props.exerciseCount ? <div className="mt-5 rounded-2xl border border-dashed border-amber-400/25 bg-amber-400/[0.06] p-5"><p className="font-bold text-amber-100">Библиотека упражнений пуста — собирать план пока не из чего.</p><p className="mt-1 text-sm text-amber-100/60">Добавьте реальные упражнения, навыки и ограничения. Генератор не создаёт вымышленные данные.</p><Link href="/coach/exercises/new" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-orange-500 px-4 text-sm font-black text-white">Добавить упражнение</Link></div> : <>
          <p className="mt-5 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.05] px-4 py-3 text-sm text-cyan-100">По умолчанию соберём тренировку автоматически для всей группы — с подходящей нагрузкой и балансом навыков.</p>

          <details className="mt-4 rounded-2xl border border-white/10 bg-black/15 px-4">
            <summary className="flex min-h-12 cursor-pointer items-center py-2 text-sm font-black text-slate-200">Дополнительные настройки</summary>
            <div className="pb-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-xs font-bold text-slate-400">Продолжительность, мин<input type="number" min={15} max={360} value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#0b111b] px-3 text-sm text-white" /></label>
            <label className="text-xs font-bold text-slate-400">Количество кортов<input type="number" min={1} max={20} value={courtCount} onChange={(event) => setCourtCount(Number(event.target.value))} className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#0b111b] px-3 text-sm text-white" /></label>
            <label className="text-xs font-bold text-slate-400">Основной фокус<select value={focusSkillId} onChange={(event) => setFocusSkillId(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#0b111b] px-3 text-sm text-white"><option value="">Баланс всех навыков</option>{props.context.skills.map((skill) => <option key={skill.id} value={skill.id}>{skill.parentName ? `${skill.parentName} → ` : ''}{skill.name}{skill.activeAthleteCount ? ` · ${skill.activeAthleteCount}` : ''}</option>)}</select></label>
            <label className="text-xs font-bold text-slate-400">Уровень<select value={levelCode} onChange={(event) => setLevelCode(event.target.value as typeof levelCode)} className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#0b111b] px-3 text-sm text-white">{Object.entries(LEVEL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}{value === 'auto' ? ` · сейчас ${LEVEL_LABELS[props.context.inferredLevel]}` : ''}</option>)}</select></label>
            <label className="text-xs font-bold text-slate-400">Интенсивность<select value={intensity} onChange={(event) => setIntensity(event.target.value as typeof intensity)} className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#0b111b] px-3 text-sm text-white">{Object.entries(INTENSITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <div className="rounded-xl border border-white/10 bg-black/15 px-4 py-3"><p className="text-xs font-bold text-slate-400">Участники</p><p className="mt-1 text-lg font-black text-white">{participantIds.length} из {props.participants.length}</p></div>
          </div>

          {props.participants.length ? <fieldset className="mt-5"><div className="flex flex-wrap items-center justify-between gap-2"><legend className="text-xs font-black uppercase tracking-[.16em] text-slate-400">Кто тренируется</legend><div className="flex gap-2"><button type="button" onClick={() => setParticipantIds(props.participants.map((participant) => participant.id))} className="min-h-11 rounded-xl border border-white/10 px-3 text-xs font-black text-slate-300">Все</button><button type="button" onClick={() => setParticipantIds([])} className="min-h-11 rounded-xl border border-white/10 px-3 text-xs font-black text-slate-400">Снять</button></div></div><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{props.participants.map((participant) => <label key={participant.id} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 text-sm font-bold ${participantIds.includes(participant.id) ? 'border-orange-400/40 bg-orange-400/10 text-white' : 'border-white/10 text-slate-400'}`}><input type="checkbox" checked={participantIds.includes(participant.id)} onChange={() => toggleParticipant(participant.id)} className="h-5 w-5 accent-orange-500" /><span>{participantName(participant)}</span></label>)}</div></fieldset> : null}
            </div>
          </details>

          {error ? <p role="alert" className="mt-4 rounded-xl border border-rose-400/25 bg-rose-400/10 p-3 text-sm font-bold text-rose-100">{error}</p> : null}
          {message ? <p role="status" className="mt-4 rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-3 text-sm font-bold text-emerald-100">{message}</p> : null}
          {props.hasExecutions ? <p className="mt-4 text-sm font-bold text-amber-200">Тренировка уже начата: генератор не заменяет план с фактическими выполнениями.</p> : <button type="button" disabled={working || props.busy} onClick={generate} className="mt-5 min-h-14 w-full rounded-2xl bg-orange-500 px-5 text-base font-black text-white shadow-lg shadow-orange-700/25 disabled:opacity-50">{working ? 'Собираем по правилам…' : `⚡ ${props.currentItemCount ? 'Пересобрать тренировку' : 'Собрать тренировку'}`}</button>}
        </>}
      </div>
    </div>
  );
}
