'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import WorkoutRecommendationBuilder from '@/components/coach/WorkoutRecommendationBuilder';
import type { CoachExerciseSummary } from '@/lib/coach/exercise-types';
import type { CoachRecommendationContext } from '@/lib/coach/recommendation-types';
import type { CoachWorkoutPlan, CoachWorkoutWorkspaceData } from '@/lib/coach/workout-types';

const CATEGORY_LABELS: Record<string, string> = {
  warmup: 'Разминка', ball_control: 'Контроль мяча', reception: 'Приём', setting: 'Передача',
  attack: 'Атака', serve: 'Подача', defense: 'Защита', block: 'Блок', transitions: 'Переходы',
  tactics: 'Тактика', game: 'Игра', physical: 'Физика', coordination: 'Координация', combined: 'Комбинированное',
};

function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function participantName(participant: WorkoutWorkspaceProps['initialData']['eligibleParticipants'][number]): string {
  return participant.playerName || participant.displayName || 'Участник';
}

type WorkoutWorkspaceProps = { initialData: CoachWorkoutWorkspaceData; recommendationContext: CoachRecommendationContext };

export default function WorkoutWorkspace({ initialData, recommendationContext }: WorkoutWorkspaceProps) {
  const [plan, setPlan] = useState(initialData.plan);
  const [serverNow, setServerNow] = useState(initialData.serverNow);
  const [clock, setClock] = useState(() => Date.now());
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [exerciseId, setExerciseId] = useState(initialData.exercises[0]?.id ?? '');
  const [durationMinutes, setDurationMinutes] = useState(initialData.exercises[0]?.durationMinutes ?? 10);
  const [courtLabel, setCourtLabel] = useState('');
  const [coachNote, setCoachNote] = useState('');
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>(() => initialData.eligibleParticipants.map((participant) => participant.id));
  const [confirmComplete, setConfirmComplete] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const selectedExercise = useMemo(
    () => initialData.exercises.find((exercise) => exercise.id === exerciseId) ?? null,
    [exerciseId, initialData.exercises],
  );
  const active = plan.activeExecution;
  const elapsed = active
    ? active.liveElapsedSeconds + (active.status === 'running' ? Math.max(0, Math.floor((clock - new Date(serverNow).getTime()) / 1000)) : 0)
    : 0;
  const remaining = active ? active.targetDurationSeconds - elapsed : 0;
  const activeItem = active?.planItemId ? plan.items.find((item) => item.id === active.planItemId) ?? null : null;
  const nextItem = activeItem ? plan.items.find((item) => item.sortOrder > activeItem.sortOrder && item.executionStatus !== 'completed') ?? null : null;

  function resetForm(exercise?: CoachExerciseSummary) {
    const fallback = exercise ?? initialData.exercises[0] ?? null;
    setEditingId(null);
    setExerciseId(fallback?.id ?? '');
    setDurationMinutes(fallback?.durationMinutes ?? 10);
    setCourtLabel('');
    setCoachNote('');
    setSelectedParticipants(initialData.eligibleParticipants.map((participant) => participant.id));
  }

  async function planCommand(payload: Record<string, unknown>, key: string) {
    setBusy(key);
    setError('');
    const response = await fetch(`/api/coach/sessions/${initialData.session.id}/workout`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    setBusy('');
    if (!response.ok) { setError(String(data.error || 'Не удалось изменить план')); return null; }
    setPlan(data.plan as CoachWorkoutPlan);
    setServerNow(new Date().toISOString());
    return data.plan as CoachWorkoutPlan;
  }

  async function executionCommand(payload: Record<string, unknown>, key: string) {
    setBusy(key);
    setError('');
    const response = await fetch(`/api/coach/sessions/${initialData.session.id}/workout/execution`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    setBusy('');
    if (!response.ok) { setError(String(data.error || 'Не удалось изменить таймер')); return null; }
    setPlan(data.plan as CoachWorkoutPlan);
    setServerNow(String(data.serverNow || new Date().toISOString()));
    setClock(Date.now());
    return data.plan as CoachWorkoutPlan;
  }

  async function saveItem(event: React.FormEvent) {
    event.preventDefault();
    if (!exerciseId) return setError('Сначала создайте или выберите упражнение');
    const action = editingId ? 'update_item' : 'add_item';
    const result = await planCommand({ action, itemId: editingId, exerciseId, durationMinutes, courtLabel, coachNote, participantIds: selectedParticipants }, 'save-item');
    if (result) resetForm();
  }

  function editItem(item: CoachWorkoutPlan['items'][number]) {
    setEditingId(item.id);
    setExerciseId(item.exerciseId);
    setDurationMinutes(Math.round(item.plannedDurationSeconds / 60));
    setCourtLabel(item.courtLabel);
    setCoachNote(item.coachNote);
    setSelectedParticipants(item.assignees.map((assignee) => assignee.participantId));
    document.getElementById('coach-workout-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function toggleParticipant(participantId: string) {
    setSelectedParticipants((current) => current.includes(participantId) ? current.filter((id) => id !== participantId) : [...current, participantId]);
  }

  return (
    <section id="workout" className="space-y-5">
      <div className="flex flex-col justify-between gap-3 rounded-3xl border border-cyan-400/20 bg-cyan-400/[0.05] p-4 sm:flex-row sm:items-center sm:p-5">
        <div>
          <p className="text-xs font-black uppercase tracking-[.18em] text-cyan-300">Карточки упражнений</p>
          <p className="mt-1 text-sm text-slate-300">Фоторазбор, видео и подсказки тренера — в библиотеке.</p>
        </div>
        <Link href="/coach/exercises" className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 text-sm font-black text-cyan-100 hover:bg-cyan-300/15">Открыть карточки →</Link>
      </div>
      {error ? <p role="alert" className="rounded-2xl border border-rose-400/25 bg-rose-400/10 p-4 text-sm font-bold text-rose-100">{error}</p> : null}

      {active ? (
        <div className="overflow-hidden rounded-[2rem] border border-orange-400/30 bg-gradient-to-b from-orange-500/[0.16] to-white/[0.035] shadow-2xl shadow-orange-950/30">
          <div className="border-b border-white/10 p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-xs font-black uppercase tracking-[.2em] text-orange-300">Текущее упражнение</p><h2 className="mt-2 font-heading text-4xl leading-none text-white sm:text-5xl">{active.exerciseTitle}</h2></div>
              <span className={`rounded-full px-3 py-2 text-xs font-black uppercase tracking-wide ${active.status === 'running' ? 'bg-emerald-400/15 text-emerald-200' : 'bg-amber-400/15 text-amber-200'}`}>{active.status === 'running' ? '▶ Идёт' : '⏸ Пауза'}</span>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(220px,.7fr)] sm:items-center">
              <div className={`rounded-3xl border p-5 text-center ${remaining < 0 ? 'border-rose-400/40 bg-rose-400/10' : 'border-white/10 bg-black/20'}`}>
                <p className="text-xs font-black uppercase tracking-[.18em] text-slate-400">{remaining < 0 ? 'Сверх плана' : 'Осталось'}</p>
                <p aria-live="off" className={`mt-2 font-mono text-6xl font-black tabular-nums sm:text-7xl ${remaining < 0 ? 'text-rose-200' : 'text-white'}`}>{formatDuration(Math.abs(remaining))}</p>
                <p className="mt-2 text-sm text-slate-400">Прошло {formatDuration(elapsed)} · план {formatDuration(active.targetDurationSeconds)}</p>
              </div>
              {activeItem?.photoUrl ? <Image src={activeItem.photoUrl} alt={active.exerciseTitle} width={960} height={540} unoptimized className="aspect-video w-full rounded-3xl border border-white/10 object-cover" /> : <div className="grid aspect-video place-items-center rounded-3xl border border-dashed border-white/15 bg-black/15 px-5 text-center text-sm text-slate-500">Фото появится из карточки упражнения</div>}
            </div>
          </div>

          <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-7">
            <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
              <p className="text-xs font-black uppercase tracking-[.16em] text-cyan-300">Ключевые подсказки</p>
              {activeItem?.coachCues.length ? <ul className="mt-3 space-y-2 text-sm text-slate-200">{activeItem.coachCues.slice(0, 5).map((cue) => <li key={cue} className="flex gap-2"><span className="text-cyan-300">•</span><span>{cue}</span></li>)}</ul> : <p className="mt-3 text-sm text-slate-500">Добавьте подсказки в карточку упражнения.</p>}
              {activeItem?.videoUrl ? <a href={activeItem.videoUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-white/15 px-4 text-sm font-black text-white">Открыть видео ↗</a> : null}
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
              <p className="text-xs font-black uppercase tracking-[.16em] text-amber-300">Кому уделить внимание</p>
              <p className="mt-3 text-sm font-bold text-slate-200">{active.assignees.length ? active.assignees.map((person) => person.name).join(' · ') : 'Вся группа'}</p>
              {active.courtLabel ? <p className="mt-3 text-xs text-slate-500">Площадка: {active.courtLabel}</p> : null}
              {nextItem ? <div className="mt-4 border-t border-white/10 pt-4"><p className="text-[10px] font-black uppercase tracking-[.16em] text-slate-500">Следующее</p><p className="mt-1 font-bold text-white">{nextItem.title} · {Math.round(nextItem.plannedDurationSeconds / 60)} мин</p></div> : <p className="mt-4 border-t border-white/10 pt-4 text-xs text-slate-500">Это последнее упражнение плана.</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 border-t border-white/10 bg-black/15 p-4 sm:grid-cols-5 sm:p-5">
            <button type="button" disabled={Boolean(busy)} onClick={() => executionCommand({ action: active.status === 'running' ? 'pause' : 'resume', executionId: active.id, revision: active.revision }, 'toggle')} className="min-h-14 rounded-2xl bg-white text-base font-black text-slate-950 disabled:opacity-50">{active.status === 'running' ? '⏸ Пауза' : '▶ Продолжить'}</button>
            <button type="button" disabled={Boolean(busy)} onClick={() => executionCommand({ action: 'adjust', executionId: active.id, revision: active.revision, deltaSeconds: 120 }, 'plus')} className="min-h-14 rounded-2xl border border-white/15 text-base font-black text-white disabled:opacity-50">+2 мин</button>
            <button type="button" disabled={Boolean(busy)} onClick={() => executionCommand({ action: 'adjust', executionId: active.id, revision: active.revision, deltaSeconds: -120 }, 'minus')} className="min-h-14 rounded-2xl border border-white/15 text-base font-black text-white disabled:opacity-50">−2 мин</button>
            <button type="button" disabled={Boolean(busy)} onClick={() => executionCommand({ action: 'finish', executionId: active.id, revision: active.revision }, 'finish')} className="min-h-14 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 text-base font-black text-emerald-100 disabled:opacity-50">Завершить</button>
            <button type="button" disabled={Boolean(busy)} onClick={() => executionCommand({ action: 'next', executionId: active.id, revision: active.revision }, 'next')} className="col-span-2 min-h-14 rounded-2xl bg-orange-500 text-base font-black text-white shadow-lg shadow-orange-700/20 disabled:opacity-50 sm:col-span-1">Следующее →</button>
          </div>
        </div>
      ) : null}

      {plan.status !== 'completed' ? <WorkoutRecommendationBuilder
        sessionId={initialData.session.id}
        context={recommendationContext}
        participants={initialData.eligibleParticipants}
        exerciseCount={initialData.exercises.length}
        currentItemCount={plan.items.length}
        hasExecutions={plan.executions.length > 0}
        busy={Boolean(busy)}
        onGenerated={(nextPlan) => { setPlan(nextPlan); setServerNow(new Date().toISOString()); resetForm(); }}
      /> : null}

      <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><p className="text-xs font-black uppercase tracking-[.18em] text-orange-300">План тренировки</p><h2 className="mt-1 font-heading text-3xl text-white">{plan.items.length} упражнений · {Math.round(plan.plannedDurationSeconds / 60)} мин</h2><p className="mt-2 text-sm text-slate-500">План можно менять. В статистику попадёт только фактически проведённое.</p></div>
          {plan.status !== 'completed' ? <button type="button" disabled={Boolean(busy) || !plan.items.length || Boolean(active)} onClick={() => planCommand({ action: 'start_session' }, 'start-session')} className="min-h-12 rounded-2xl bg-orange-500 px-5 text-sm font-black text-white shadow-lg shadow-orange-700/20 disabled:opacity-40">▶ {plan.executions.length ? 'Продолжить занятие' : 'Начать занятие'}</button> : <span className="rounded-2xl bg-emerald-400/10 px-4 py-3 text-sm font-black text-emerald-200">Занятие завершено</span>}
        </div>

        <div className="mt-5 space-y-3">
          {plan.items.map((item, index) => (
            <article key={item.id} className={`rounded-2xl border p-4 ${item.executionStatus === 'completed' ? 'border-emerald-400/20 bg-emerald-400/[0.06]' : 'border-white/10 bg-black/15'}`}>
              <div className="flex gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5 font-black text-slate-300">{index + 1}</span>{item.photoUrl ? <Image src={item.photoUrl} alt={item.title} width={160} height={96} unoptimized className="h-16 w-24 shrink-0 rounded-xl border border-white/10 object-cover" /> : null}<div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-white">{item.title}</h3>{item.recommendationSource === 'deterministic' ? <span className="rounded-lg bg-cyan-400/10 px-2 py-1 text-[10px] font-black uppercase text-cyan-200">Подобрано по правилам</span> : null}{item.executionStatus === 'completed' ? <span className="rounded-lg bg-emerald-400/10 px-2 py-1 text-[10px] font-black uppercase text-emerald-200">Проведено</span> : null}</div><p className="mt-1 text-xs text-slate-500">{CATEGORY_LABELS[item.category] || item.category} · {Math.round(item.plannedDurationSeconds / 60)} мин{item.courtLabel ? ` · ${item.courtLabel}` : ''}</p><p className="mt-2 text-xs text-slate-400">{item.assignees.length ? item.assignees.map((person) => person.name).join(' · ') : 'Вся группа'}</p>{item.coachNote ? <p className="mt-2 text-xs text-amber-100/70">{item.coachNote}</p> : null}{item.recommendationReasons.length ? <details className="mt-3 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.05] px-3 py-2"><summary className="min-h-7 cursor-pointer text-xs font-black text-cyan-200">Почему?</summary><ul className="mt-2 space-y-1.5 pb-1 text-xs leading-relaxed text-slate-300">{item.recommendationReasons.map((reason) => <li key={reason} className="flex gap-2"><span className="text-cyan-300">•</span><span>{reason}</span></li>)}</ul></details> : null}</div></div>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                <Link href={`/coach/exercises/${item.exerciseId}`} className="col-span-2 inline-flex min-h-11 items-center justify-center rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-3 text-xs font-black text-cyan-100 hover:bg-cyan-300/15 sm:col-span-1">Карточка упражнения</Link>
                {plan.status !== 'completed' ? <>
                <button type="button" disabled={Boolean(busy) || Boolean(active)} onClick={() => executionCommand({ action: 'start', itemId: item.id }, `start-${item.id}`)} className="min-h-11 rounded-xl bg-orange-500/15 px-3 text-xs font-black text-orange-100 disabled:opacity-40">▶ Запустить</button>
                <button type="button" disabled={Boolean(busy) || Boolean(active)} onClick={() => editItem(item)} className="min-h-11 rounded-xl border border-white/10 px-3 text-xs font-black text-slate-300 disabled:opacity-40">Заменить / настроить</button>
                <button type="button" disabled={Boolean(busy) || index === 0 || Boolean(active)} onClick={() => planCommand({ action: 'move_item', itemId: item.id, direction: 'up' }, `up-${item.id}`)} className="min-h-11 rounded-xl border border-white/10 px-3 text-xs font-black text-slate-300 disabled:opacity-40">↑ Выше</button>
                <button type="button" disabled={Boolean(busy) || index === plan.items.length - 1 || Boolean(active)} onClick={() => planCommand({ action: 'move_item', itemId: item.id, direction: 'down' }, `down-${item.id}`)} className="min-h-11 rounded-xl border border-white/10 px-3 text-xs font-black text-slate-300 disabled:opacity-40">↓ Ниже</button>
                <button type="button" disabled={Boolean(busy) || Boolean(active)} onClick={() => planCommand({ action: 'remove_item', itemId: item.id }, `remove-${item.id}`)} className="min-h-11 rounded-xl border border-rose-400/20 px-3 text-xs font-black text-rose-200 disabled:opacity-40">Убрать</button>
                </> : null}
              </div>
            </article>
          ))}
          {!plan.items.length ? <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center"><p className="font-heading text-2xl text-slate-200">План пока пуст</p><p className="mt-2 text-sm text-slate-500">Добавьте упражнения ниже — первое станет стартовым.</p></div> : null}
        </div>
      </div>

      {plan.status !== 'completed' ? (
        <form id="coach-workout-editor" onSubmit={saveItem} className="scroll-mt-24 rounded-3xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.18em] text-cyan-300">{editingId ? 'Замена и настройка' : 'Добавить в план'}</p><h2 className="mt-1 font-heading text-3xl text-white">Упражнение и группа</h2></div>{editingId ? <button type="button" onClick={() => resetForm()} className="min-h-11 rounded-xl border border-white/10 px-3 text-xs font-black text-slate-300">Отмена</button> : null}</div>
          {initialData.exercises.length ? <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-400 sm:col-span-2">Упражнение<select value={exerciseId} onChange={(event) => { const id = event.target.value; setExerciseId(id); const exercise = initialData.exercises.find((entry) => entry.id === id); if (exercise && !editingId) setDurationMinutes(exercise.durationMinutes); }} className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#0b111b] px-3 text-sm text-white">{initialData.exercises.map((exercise) => <option key={exercise.id} value={exercise.id}>{exercise.title} · {CATEGORY_LABELS[exercise.category] || exercise.category} · {exercise.durationMinutes} мин</option>)}</select></label>
            <label className="text-xs font-bold text-slate-400">Минуты<input type="number" min={1} max={360} value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#0b111b] px-3 text-sm text-white" /></label>
            <label className="text-xs font-bold text-slate-400">Корт / зона<input value={courtLabel} maxLength={80} onChange={(event) => setCourtLabel(event.target.value)} placeholder="Корт 1" className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#0b111b] px-3 text-sm text-white" /></label>
            <label className="text-xs font-bold text-slate-400 sm:col-span-2">Заметка тренера<textarea value={coachNote} maxLength={1000} onChange={(event) => setCoachNote(event.target.value)} rows={2} placeholder="На что обратить внимание" className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b111b] p-3 text-sm text-white" /></label>
          </div> : <div className="mt-5 rounded-2xl border border-dashed border-amber-400/20 bg-amber-400/[0.05] p-5"><p className="font-bold text-amber-100">Сначала добавьте упражнение в библиотеку.</p><Link href="/coach/exercises" className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-orange-500 px-4 text-sm font-black text-white">Открыть упражнения</Link></div>}

          {initialData.eligibleParticipants.length ? <fieldset className="mt-5"><div className="flex flex-wrap items-center justify-between gap-2"><legend className="text-xs font-black uppercase tracking-[.16em] text-slate-400">Кто выполняет</legend><div className="flex gap-2"><button type="button" onClick={() => setSelectedParticipants(initialData.eligibleParticipants.map((participant) => participant.id))} className="min-h-11 rounded-xl border border-white/10 px-3 text-xs font-black text-slate-300">Вся группа</button><button type="button" onClick={() => setSelectedParticipants([])} className="min-h-11 rounded-xl border border-white/10 px-3 text-xs font-black text-slate-400">Снять</button></div></div><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{initialData.eligibleParticipants.map((participant) => <label key={participant.id} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 text-sm font-bold ${selectedParticipants.includes(participant.id) ? 'border-orange-400/40 bg-orange-400/10 text-white' : 'border-white/10 text-slate-400'}`}><input type="checkbox" checked={selectedParticipants.includes(participant.id)} onChange={() => toggleParticipant(participant.id)} className="h-5 w-5 accent-orange-500" /><span>{participantName(participant)}</span></label>)}</div></fieldset> : <p className="mt-5 text-sm text-slate-500">Состав пока пуст — упражнение будет назначено всей группе, которая появится к началу.</p>}
          {selectedExercise ? <p className="mt-4 text-xs text-slate-500">Подходит для {selectedExercise.playerMin}–{selectedExercise.playerMax} игроков · {selectedExercise.courtCount} корт · интенсивность {selectedExercise.intensity}</p> : null}
          {initialData.exercises.length ? <button type="submit" disabled={Boolean(busy)} className="mt-5 min-h-12 w-full rounded-2xl bg-orange-500 px-5 text-sm font-black text-white shadow-lg shadow-orange-700/20 disabled:opacity-50">{busy === 'save-item' ? 'Сохраняем…' : editingId ? 'Сохранить пункт' : 'Добавить в план'}</button> : null}
        </form>
      ) : null}

      {plan.status !== 'completed' && (plan.executions.length || plan.items.length) ? (
        <div className="rounded-3xl border border-rose-400/15 bg-rose-400/[0.04] p-5 sm:p-6">
          {!confirmComplete ? <button type="button" onClick={() => setConfirmComplete(true)} className="min-h-11 text-sm font-black text-rose-200">Завершить всё занятие</button> : <div><p className="font-bold text-rose-100">Завершить тренировку? Непроведённые пункты останутся только в плане и не попадут в статистику.</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={Boolean(busy)} onClick={async () => { const result = await planCommand({ action: 'complete_session' }, 'complete-session'); if (result) setConfirmComplete(false); }} className="min-h-11 rounded-xl bg-rose-500 px-4 text-sm font-black text-white disabled:opacity-50">Да, завершить</button><button type="button" onClick={() => setConfirmComplete(false)} className="min-h-11 rounded-xl border border-white/10 px-4 text-sm font-black text-slate-300">Отмена</button></div></div>}
        </div>
      ) : null}

      {plan.executions.length ? <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-5 sm:p-6"><p className="text-xs font-black uppercase tracking-[.18em] text-emerald-300">Фактически проведено</p><div className="mt-4 space-y-2">{plan.executions.filter((execution) => execution.status === 'completed').map((execution) => <div key={execution.id} className="flex items-center justify-between gap-4 rounded-xl bg-black/15 px-4 py-3"><div><p className="text-sm font-bold text-white">{execution.exerciseTitle}</p><p className="mt-1 text-xs text-slate-500">{execution.assignees.length ? execution.assignees.map((person) => person.name).join(' · ') : 'Вся группа'}</p></div><span className="shrink-0 font-mono text-sm font-black text-emerald-200">{formatDuration(execution.durationSeconds ?? 0)}</span></div>)}</div></div> : null}
    </section>
  );
}
