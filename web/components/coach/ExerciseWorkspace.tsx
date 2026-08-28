'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import ExerciseQuickView from '@/components/coach/ExerciseQuickView';
import type { CoachSkill } from '@/lib/coach/types';
import type { CoachExerciseDetail, CoachIssueOption } from '@/lib/coach/exercise-types';
import type { CoachExerciseAnalytics } from '@/lib/coach/analytics-types';
import { COACH_EXERCISE_CATEGORIES, COACH_EXERCISE_PHOTO_TYPES, COACH_EXERCISE_VIDEO_PLATFORMS } from '@/lib/coach/exercise-types';
import { COACH_EXERCISE_CATEGORY_LABELS, COACH_EXERCISE_PHOTO_TYPE_LABELS, COACH_EXERCISE_VIDEO_PLATFORM_LABELS, formatExerciseDuration } from '@/lib/coach/exercise-ui';

type Draft = {
  title: string;
  shortDescription: string;
  goal: string;
  category: CoachExerciseDetail['category'];
  levelCode: CoachExerciseDetail['levelCode'];
  playerMin: number;
  playerMax: number;
  courtCount: number;
  ballCount: number;
  equipment: string;
  durationMinutes: number;
  intensity: CoachExerciseDetail['intensity'];
  coachRequired: boolean;
  organization: string;
  steps: string;
  coachCues: string;
  typicalErrors: string;
  progression: string;
  simplification: string;
  complication: string;
  variants: string;
  tags: string;
  favorite: boolean;
  recommended: boolean;
  coachRating: number | null;
  coachComment: string;
  archived: boolean;
  primarySkillId: string;
  additionalSkillIds: string[];
  issueIds: string[];
};

function toDraft(exercise: CoachExerciseDetail): Draft {
  return {
    title: exercise.title,
    shortDescription: exercise.shortDescription,
    goal: exercise.goal,
    category: exercise.category,
    levelCode: exercise.levelCode,
    playerMin: exercise.playerMin,
    playerMax: exercise.playerMax,
    courtCount: exercise.courtCount,
    ballCount: exercise.ballCount,
    equipment: exercise.equipment.join('\n'),
    durationMinutes: exercise.durationMinutes,
    intensity: exercise.intensity,
    coachRequired: exercise.coachRequired,
    organization: exercise.organization,
    steps: exercise.steps.join('\n'),
    coachCues: exercise.coachCues.join('\n'),
    typicalErrors: exercise.typicalErrors.join('\n'),
    progression: exercise.progression,
    simplification: exercise.simplification,
    complication: exercise.complication,
    variants: exercise.variants.join('\n'),
    tags: exercise.tags.join(', '),
    favorite: exercise.favorite,
    recommended: exercise.recommended,
    coachRating: exercise.coachRating,
    coachComment: exercise.coachComment,
    archived: exercise.archived,
    primarySkillId: exercise.primarySkill?.id || '',
    additionalSkillIds: exercise.skills.filter((skill) => !skill.isPrimary).map((skill) => skill.id),
    issueIds: exercise.issues.map((issue) => issue.id),
  };
}

const field = 'mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#070b14] px-4 text-sm text-white outline-none transition focus:border-cyan-400';
const area = 'mt-2 w-full rounded-xl border border-white/10 bg-[#070b14] p-4 text-sm leading-6 text-white outline-none transition focus:border-cyan-400';
const label = 'text-xs font-bold text-slate-400';

export default function ExerciseWorkspace({ exercise, skills, issueOptions, analytics }: { exercise: CoachExerciseDetail; skills: CoachSkill[]; issueOptions: CoachIssueOption[]; analytics: CoachExerciseAnalytics }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => toDraft(exercise));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const leafSkills = skills.filter((skill) => skill.parentId);

  async function persist(next: Draft, successMessage = 'Карточка сохранена') {
    setPending(true);
    setError('');
    setMessage('');
    const response = await fetch(`/api/coach/exercises/${exercise.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(next),
    });
    const payload = await response.json().catch(() => ({})) as { exercise?: CoachExerciseDetail; error?: string };
    setPending(false);
    if (!response.ok || !payload.exercise) {
      setError(payload.error || 'Не удалось сохранить упражнение');
      return false;
    }
    setDraft(toDraft(payload.exercise));
    setMessage(successMessage);
    router.refresh();
    return true;
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await persist(draft);
  }

  function toggleList(key: 'additionalSkillIds' | 'issueIds', id: string) {
    setDraft((current) => ({ ...current, [key]: current[key].includes(id) ? current[key].filter((item) => item !== id) : [...current[key], id] }));
  }

  async function addPhoto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setPending(true); setError(''); setMessage('');
    const response = await fetch(`/api/coach/exercises/${exercise.id}/photos`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(form.entries())),
    });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    setPending(false);
    if (!response.ok) { setError(payload.error || 'Не удалось добавить фото'); return; }
    formElement.reset();
    setMessage('Фото добавлено');
    router.refresh();
  }

  async function addVideo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setPending(true); setError(''); setMessage('');
    const response = await fetch(`/api/coach/exercises/${exercise.id}/videos`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(form.entries())),
    });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    setPending(false);
    if (!response.ok) { setError(payload.error || 'Не удалось добавить видео'); return; }
    formElement.reset();
    setMessage('Видео добавлено');
    router.refresh();
  }

  async function removeMedia(kind: 'photos' | 'videos', id: string) {
    setPending(true); setError(''); setMessage('');
    const response = await fetch(`/api/coach/exercises/${exercise.id}/${kind}/${id}`, { method: 'DELETE' });
    setPending(false);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      setError(payload.error || 'Не удалось удалить материал');
      return;
    }
    setMessage(kind === 'photos' ? 'Фото удалено' : 'Видео удалено');
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <Link href="/coach/exercises" className="inline-flex min-h-11 items-center text-sm text-slate-400 transition hover:text-white">← Библиотека</Link>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending} onClick={() => void persist({ ...draft, favorite: !draft.favorite }, draft.favorite ? 'Убрано из избранного' : 'Добавлено в избранное')} className="min-h-12 rounded-xl border border-orange-400/25 bg-orange-400/10 px-4 font-black text-orange-200 disabled:opacity-60">{draft.favorite ? '★ В избранном' : '☆ В избранное'}</button>
        </div>
      </section>

      <ExerciseQuickView exercise={exercise} />

      <details className="rounded-3xl border border-white/10 bg-white/[.025] px-4 sm:px-6">
        <summary className="flex min-h-14 cursor-pointer items-center py-3 text-sm font-black text-slate-300">Статистика упражнения</summary>
      <section className="border-t border-white/8 py-4 sm:py-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-xs font-black uppercase tracking-[.18em] text-orange-300">Тренировочный факт</p><h2 className="mt-1 font-heading text-3xl text-white">Как упражнение работает</h2></div><Link href="/coach/analytics" className="min-h-11 py-3 text-xs font-bold text-orange-300">Вся аналитика →</Link></div>
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">{[['Выполнений', analytics.executionCount], ['Учеников', analytics.athleteCount], ['Минут', analytics.trainingMinutes], ['Оценка', analytics.averageRating == null ? '—' : `${analytics.averageRating}/5`], ['Последний факт', analytics.lastUsedAt ? new Date(analytics.lastUsedAt).toLocaleDateString('ru-RU') : '—']].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-white/8 bg-black/15 p-4"><b className="block font-heading text-2xl text-white">{value}</b><span className="mt-1 block text-[10px] font-bold uppercase tracking-wide text-slate-600">{label}</span></div>)}</div>
        {analytics.recentRatings.length ? <div className="mt-5 space-y-2">{analytics.recentRatings.map((item) => <div key={`${item.endedAt}-${item.rating}`} className="rounded-xl border border-white/8 bg-black/10 p-3 text-sm"><b className="text-orange-300">{item.rating}/5</b><span className="ml-3 text-slate-400">{item.comment || 'Без комментария'}</span></div>)}</div> : <p className="mt-5 text-sm text-slate-500">Оценки появятся после завершения упражнения и быстрой оценки тренера.</p>}
      </section>
      </details>

      {message ? <p role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-200">{message}</p> : null}
      {error ? <p role="alert" className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">{error}</p> : null}

      <details className="rounded-3xl border border-white/10 bg-white/[.025] px-4 sm:px-6">
        <summary className="flex min-h-14 cursor-pointer items-center py-3 text-sm font-black text-slate-300">Редактировать карточку</summary>
      <form id="exercise-card-form" onSubmit={save} className="space-y-6 border-t border-white/8 py-4 sm:py-6">
        <section className="grid gap-4 rounded-3xl border border-white/10 bg-white/[.035] p-4 sm:p-6 lg:grid-cols-2">
          <div className="lg:col-span-2"><p className="text-xs font-black uppercase tracking-[.18em] text-cyan-300">Основа</p><h2 className="mt-2 font-heading text-3xl text-white">Что и зачем делаем</h2></div>
          <label className={label}>Название<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required minLength={3} maxLength={160} className={field} /></label>
          <label className={label}>Категория<select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as Draft['category'] })} className={field}>{COACH_EXERCISE_CATEGORIES.map((category) => <option key={category} value={category}>{COACH_EXERCISE_CATEGORY_LABELS[category]}</option>)}</select></label>
          <label className={`${label} lg:col-span-2`}>Краткое описание<textarea value={draft.shortDescription} onChange={(event) => setDraft({ ...draft, shortDescription: event.target.value })} rows={2} className={area} /></label>
          <label className={`${label} lg:col-span-2`}>Цель<textarea value={draft.goal} onChange={(event) => setDraft({ ...draft, goal: event.target.value })} rows={3} className={area} /></label>
          <label className={label}>Основной навык<select value={draft.primarySkillId} onChange={(event) => setDraft({ ...draft, primarySkillId: event.target.value, additionalSkillIds: draft.additionalSkillIds.filter((id) => id !== event.target.value) })} required className={field}><option value="">Выберите</option>{leafSkills.map((skill) => <option key={skill.id} value={skill.id}>{skill.parentName} · {skill.name}</option>)}</select></label>
          <label className={label}>Уровень<select value={draft.levelCode} onChange={(event) => setDraft({ ...draft, levelCode: event.target.value as Draft['levelCode'] })} className={field}><option value="all">Совсем новичок</option><option value="light">FIRST</option><option value="medium">NEXT</option><option value="hard">ADVANCED</option></select></label>
          <div className="grid grid-cols-2 gap-3 lg:col-span-2 sm:grid-cols-4 xl:grid-cols-7">
            <label className={label}>Игроков от<input type="number" min="1" max="100" value={draft.playerMin} onChange={(event) => setDraft({ ...draft, playerMin: Number(event.target.value) })} className={field} /></label>
            <label className={label}>до<input type="number" min="1" max="100" value={draft.playerMax} onChange={(event) => setDraft({ ...draft, playerMax: Number(event.target.value) })} className={field} /></label>
            <label className={label}>Кортов<input type="number" min="0" max="20" value={draft.courtCount} onChange={(event) => setDraft({ ...draft, courtCount: Number(event.target.value) })} className={field} /></label>
            <label className={label}>Мячей<input type="number" min="0" max="200" value={draft.ballCount} onChange={(event) => setDraft({ ...draft, ballCount: Number(event.target.value) })} className={field} /></label>
            <label className={label}>Минут<input type="number" min="1" max="360" value={draft.durationMinutes} onChange={(event) => setDraft({ ...draft, durationMinutes: Number(event.target.value) })} className={field} /></label>
            <label className={label}>Интенсивность<select value={draft.intensity} onChange={(event) => setDraft({ ...draft, intensity: event.target.value as Draft['intensity'] })} className={field}><option value="low">Низкая</option><option value="medium">Средняя</option><option value="high">Высокая</option></select></label>
            <label className="flex min-h-12 items-center gap-2 self-end rounded-xl border border-white/10 px-3 text-xs text-slate-300"><input type="checkbox" checked={draft.coachRequired} onChange={(event) => setDraft({ ...draft, coachRequired: event.target.checked })} className="h-5 w-5 accent-orange-500" /> Тренер участвует</label>
          </div>
          <label className={label}>Оборудование · по строке<textarea value={draft.equipment} onChange={(event) => setDraft({ ...draft, equipment: event.target.value })} rows={4} className={area} /></label>
          <label className={label}>Теги · через запятую<textarea value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} rows={4} className={area} /></label>
        </section>

        <section className="grid gap-4 rounded-3xl border border-white/10 bg-white/[.035] p-4 sm:p-6 lg:grid-cols-2">
          <div className="lg:col-span-2"><p className="text-xs font-black uppercase tracking-[.18em] text-orange-300">Методика</p><h2 className="mt-2 font-heading text-3xl text-white">Как провести</h2></div>
          <label className={`${label} lg:col-span-2`}>Организация<textarea value={draft.organization} onChange={(event) => setDraft({ ...draft, organization: event.target.value })} rows={3} className={area} /></label>
          <label className={label}>Шаги · по строке<textarea value={draft.steps} onChange={(event) => setDraft({ ...draft, steps: event.target.value })} rows={8} className={area} /></label>
          <label className={label}>Подсказки тренера · по строке<textarea value={draft.coachCues} onChange={(event) => setDraft({ ...draft, coachCues: event.target.value })} rows={8} className={area} /></label>
          <label className={label}>Типичные ошибки · по строке<textarea value={draft.typicalErrors} onChange={(event) => setDraft({ ...draft, typicalErrors: event.target.value })} rows={6} className={area} /></label>
          <label className={label}>Варианты · по строке<textarea value={draft.variants} onChange={(event) => setDraft({ ...draft, variants: event.target.value })} rows={6} className={area} /></label>
          <label className={label}>Упрощение<textarea value={draft.simplification} onChange={(event) => setDraft({ ...draft, simplification: event.target.value })} rows={3} className={area} /></label>
          <label className={label}>Усложнение<textarea value={draft.complication} onChange={(event) => setDraft({ ...draft, complication: event.target.value })} rows={3} className={area} /></label>
          <label className={`${label} lg:col-span-2`}>Прогрессия<textarea value={draft.progression} onChange={(event) => setDraft({ ...draft, progression: event.target.value })} rows={3} className={area} /></label>
        </section>

        <section className="grid gap-4 rounded-3xl border border-white/10 bg-white/[.035] p-4 sm:p-6 lg:grid-cols-2">
          <div className="lg:col-span-2"><p className="text-xs font-black uppercase tracking-[.18em] text-cyan-300">Связи</p><h2 className="mt-2 font-heading text-3xl text-white">Навыки и проблемы учеников</h2><p className="mt-2 text-sm text-slate-500">Связь с каталогом проблемы автоматически относится ко всем ученикам, у которых эта проблема активна.</p></div>
          <div><h3 className="text-sm font-black text-white">Дополнительные навыки</h3><div className="mt-3 max-h-72 space-y-2 overflow-y-auto rounded-2xl border border-white/8 p-3">{leafSkills.map((skill) => <label key={skill.id} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm ${skill.id === draft.primarySkillId ? 'bg-cyan-400/10 text-cyan-200' : 'text-slate-300 hover:bg-white/5'}`}><input type="checkbox" disabled={skill.id === draft.primarySkillId} checked={skill.id === draft.primarySkillId || draft.additionalSkillIds.includes(skill.id)} onChange={() => toggleList('additionalSkillIds', skill.id)} className="h-5 w-5 accent-cyan-400" /><span>{skill.parentName} · <b>{skill.name}</b></span></label>)}</div></div>
          <div><h3 className="text-sm font-black text-white">Какие проблемы исправляет</h3><div className="mt-3 max-h-72 space-y-2 overflow-y-auto rounded-2xl border border-white/8 p-3">{issueOptions.length ? issueOptions.map((issue) => <label key={issue.id} className="flex min-h-11 items-start gap-3 rounded-xl px-3 py-2 text-sm text-slate-300 hover:bg-white/5"><input type="checkbox" checked={draft.issueIds.includes(issue.id)} onChange={() => toggleList('issueIds', issue.id)} className="mt-0.5 h-5 w-5 accent-orange-500" /><span><b className="text-white">{issue.title}</b><small className="mt-1 block text-slate-500">{issue.skillName || 'Общая'}{issue.activeAthleteCount ? ` · учеников: ${issue.activeAthleteCount}` : ''}</small></span></label>) : <p className="p-3 text-sm text-slate-500">Каталог появится после добавления первых проблем ученикам.</p>}</div></div>
        </section>

        <section className="grid gap-4 rounded-3xl border border-white/10 bg-white/[.035] p-4 sm:p-6 lg:grid-cols-3">
          <div className="lg:col-span-3"><p className="text-xs font-black uppercase tracking-[.18em] text-slate-400">Оценка тренера</p><h2 className="mt-2 font-heading text-3xl text-white">Статус карточки</h2></div>
          <label className={label}>Рейтинг 1–5<select value={draft.coachRating ?? ''} onChange={(event) => setDraft({ ...draft, coachRating: event.target.value ? Number(event.target.value) : null })} className={field}><option value="">Без оценки</option>{[1,2,3,4,5].map((rating) => <option key={rating} value={rating}>{rating}</option>)}</select></label>
          <label className="flex min-h-12 items-center gap-3 self-end rounded-xl border border-white/10 px-4 text-sm text-slate-300"><input type="checkbox" checked={draft.recommended} onChange={(event) => setDraft({ ...draft, recommended: event.target.checked })} className="h-5 w-5 accent-cyan-400" /> Рекомендовано</label>
          <label className="flex min-h-12 items-center gap-3 self-end rounded-xl border border-red-400/15 px-4 text-sm text-slate-300"><input type="checkbox" checked={draft.archived} onChange={(event) => setDraft({ ...draft, archived: event.target.checked })} className="h-5 w-5 accent-red-400" /> В архиве</label>
          <label className={`${label} lg:col-span-3`}>Комментарий<textarea value={draft.coachComment} onChange={(event) => setDraft({ ...draft, coachComment: event.target.value })} rows={3} className={area} /></label>
        </section>
        <button type="submit" disabled={pending} className="min-h-12 w-full rounded-2xl bg-orange-500 px-5 font-black text-white shadow-lg shadow-orange-600/20 disabled:opacity-60">{pending ? 'Сохраняем…' : 'Сохранить изменения'}</button>
      </form>
      </details>

      <details className="rounded-3xl border border-white/10 bg-white/[.025] px-4 sm:px-6">
        <summary className="flex min-h-14 cursor-pointer items-center py-3 text-sm font-black text-slate-300">Управление фото и видео</summary>
        <div className="space-y-6 border-t border-white/8 py-4 sm:py-6">
      <section className="rounded-3xl border border-white/10 bg-white/[.035] p-4 sm:p-6">
        <p className="text-xs font-black uppercase tracking-[.18em] text-cyan-300">Фоторазбор</p><div className="mt-2 flex flex-col justify-between gap-2 sm:flex-row sm:items-end"><div><h2 className="font-heading text-3xl text-white">Правильно · ошибка · фазы</h2><p className="mt-2 text-sm text-slate-500">Добавлено {exercise.photos.length}. Для полного разбора цель — 3–5 кадров.</p></div><span className="font-heading text-4xl text-cyan-300">{exercise.photos.length}/5</span></div>
        {exercise.photos.length ? (
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {exercise.photos.map((photo) => (
              <article key={photo.id} className="overflow-hidden rounded-2xl border border-white/10 bg-[#070b14]">
                <div className="aspect-video bg-black/30">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.storageUrl} alt={photo.title || photo.caption || COACH_EXERCISE_PHOTO_TYPE_LABELS[photo.type]} className="h-full w-full object-cover" />
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-lg bg-cyan-400/10 px-2 py-1 text-xs font-bold text-cyan-200">{COACH_EXERCISE_PHOTO_TYPE_LABELS[photo.type]}{photo.phaseIndex ? ` ${photo.phaseIndex}` : ''}</span>
                    <button type="button" disabled={pending} onClick={() => void removeMedia('photos', photo.id)} className="min-h-10 px-2 text-xs text-red-300">Удалить</button>
                  </div>
                  <h3 className="mt-3 font-bold text-white">{photo.title || 'Без названия'}</h3>
                  {photo.caption ? <p className="mt-2 text-sm leading-6 text-slate-400">{photo.caption}</p> : null}
                  {photo.relatedIssueTitle ? <p className="mt-2 text-xs text-orange-300">Проблема: {photo.relatedIssueTitle}</p> : null}
                </div>
              </article>
            ))}
          </div>
        ) : null}
        <form onSubmit={addPhoto} className="mt-5 grid gap-3 rounded-2xl border border-white/8 bg-black/15 p-4 md:grid-cols-2 xl:grid-cols-4">
          <label className={`${label} md:col-span-2 xl:col-span-4`}>HTTPS-ссылка или локальный путь<input name="storageUrl" required placeholder="https://…/frame-1.webp" className={field} /></label>
          <label className={label}>Тип<select name="type" defaultValue="phase" className={field}>{COACH_EXERCISE_PHOTO_TYPES.map((type) => <option key={type} value={type}>{COACH_EXERCISE_PHOTO_TYPE_LABELS[type]}</option>)}</select></label>
          <label className={label}>Номер фазы<input name="phaseIndex" type="number" min="1" max="50" defaultValue={Math.min(50, exercise.photos.length + 1)} className={field} /></label>
          <label className={label}>Название<input name="title" className={field} /></label>
          <label className={label}>Связанная проблема<select name="relatedIssueId" defaultValue="" className={field}><option value="">Без связи</option>{exercise.issues.map((issue) => <option key={issue.id} value={issue.id}>{issue.title}</option>)}</select></label>
          <label className={`${label} md:col-span-2 xl:col-span-3`}>Подпись<input name="caption" className={field} /></label>
          <button disabled={pending} className="min-h-12 self-end rounded-xl bg-cyan-400/15 px-4 font-black text-cyan-200 disabled:opacity-60">Добавить фото</button>
        </form>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[.035] p-4 sm:p-6">
        <p className="text-xs font-black uppercase tracking-[.18em] text-orange-300">Видеотека</p><h2 className="mt-2 font-heading text-3xl text-white">Внешние видео</h2><p className="mt-2 text-sm text-slate-500">YouTube, Telegram, Instagram или другая HTTPS-ссылка. Чужие материалы храним как URL + metadata.</p>
        {exercise.videos.length ? <div className="mt-5 grid gap-3 lg:grid-cols-2">{exercise.videos.map((video) => <article key={video.id} className="rounded-2xl border border-white/10 bg-[#070b14] p-4"><div className="flex items-start justify-between gap-3"><div><span className="text-xs font-black uppercase tracking-wide text-orange-300">{COACH_EXERCISE_VIDEO_PLATFORM_LABELS[video.platform]}</span><h3 className="mt-2 font-bold text-white">{video.title || video.url}</h3></div><button type="button" disabled={pending} onClick={() => void removeMedia('videos', video.id)} className="min-h-10 px-2 text-xs text-red-300">Удалить</button></div><div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">{video.author ? <span>{video.author}</span> : null}{video.durationSeconds != null ? <span>{formatExerciseDuration(video.durationSeconds)}</span> : null}{video.timestampStartSec ? <span>с {formatExerciseDuration(video.timestampStartSec)}</span> : null}{video.rating ? <span>★ {video.rating}/5</span> : null}</div>{video.coachNote ? <p className="mt-3 text-sm leading-6 text-slate-400">{video.coachNote}</p> : null}<a href={video.url} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-white/10 px-4 text-sm font-bold text-cyan-200">Открыть ↗</a></article>)}</div> : null}
        <form onSubmit={addVideo} className="mt-5 grid gap-3 rounded-2xl border border-white/8 bg-black/15 p-4 md:grid-cols-2 xl:grid-cols-4">
          <label className={`${label} md:col-span-2 xl:col-span-3`}>HTTPS-ссылка<input name="url" type="url" required placeholder="https://youtube.com/…" className={field} /></label>
          <label className={label}>Платформа<select name="platform" defaultValue="youtube" className={field}>{COACH_EXERCISE_VIDEO_PLATFORMS.map((platform) => <option key={platform} value={platform}>{COACH_EXERCISE_VIDEO_PLATFORM_LABELS[platform]}</option>)}</select></label>
          <label className={`${label} md:col-span-2`}>Название<input name="title" className={field} /></label>
          <label className={label}>Автор<input name="author" className={field} /></label>
          <label className={label}>Язык<input name="language" placeholder="ru / en" className={field} /></label>
          <label className={label}>Длительность, сек<input name="durationSeconds" type="number" min="0" max="86400" className={field} /></label>
          <label className={label}>Смотреть с, сек<input name="timestampStartSec" type="number" min="0" max="86400" defaultValue="0" className={field} /></label>
          <label className={label}>Рейтинг<select name="rating" defaultValue="" className={field}><option value="">Без оценки</option>{[1,2,3,4,5].map((rating) => <option key={rating} value={rating}>{rating}</option>)}</select></label>
          <label className={label}>Теги<input name="tags" placeholder="приём, перемещение" className={field} /></label>
          <label className={`${label} md:col-span-2 xl:col-span-3`}>Комментарий тренера<input name="coachNote" className={field} /></label>
          <button disabled={pending} className="min-h-12 self-end rounded-xl bg-orange-500 px-4 font-black text-white disabled:opacity-60">Добавить видео</button>
        </form>
      </section>
        </div>
      </details>
    </div>
  );
}
