'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import type { CoachSkill } from '@/lib/coach/types';
import { COACH_EXERCISE_CATEGORIES } from '@/lib/coach/exercise-types';
import { COACH_EXERCISE_CATEGORY_LABELS } from '@/lib/coach/exercise-ui';

export default function CreateExerciseForm({ skills }: { skills: CoachSkill[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const leafSkills = skills.filter((skill) => skill.parentId);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/coach/exercises', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: form.get('title'),
        shortDescription: form.get('shortDescription'),
        category: form.get('category'),
        primarySkillId: form.get('primarySkillId'),
        levelCode: form.get('levelCode'),
        playerMin: form.get('playerMin'),
        playerMax: form.get('playerMax'),
        courtCount: form.get('courtCount'),
        ballCount: form.get('ballCount'),
        durationMinutes: form.get('durationMinutes'),
        intensity: form.get('intensity'),
        coachRequired: form.get('coachRequired') === 'on',
      }),
    });
    const payload = await response.json().catch(() => ({})) as { exercise?: { id?: string }; error?: string };
    setPending(false);
    if (!response.ok || !payload.exercise?.id) {
      setError(payload.error || 'Не удалось создать упражнение');
      return;
    }
    router.push(`/coach/exercises/${payload.exercise.id}`);
    router.refresh();
  }

  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-orange-500 px-5 text-sm font-black text-white shadow-lg shadow-orange-600/20 transition hover:bg-orange-400 sm:w-auto">+ Новое упражнение</button>;
  }

  return (
    <section className="w-full rounded-3xl border border-orange-400/25 bg-[#0b111b] p-4 shadow-2xl sm:max-w-2xl sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-xs font-black uppercase tracking-[.18em] text-orange-300">Новая карточка</p><h2 className="mt-1 font-heading text-3xl text-white">Основа упражнения</h2></div>
        <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-xl border border-white/10 px-3 text-sm text-slate-300">Закрыть</button>
      </div>
      <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-xs font-bold text-slate-400 sm:col-span-2">Название
          <input name="title" required minLength={3} maxLength={160} autoFocus className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-black/20 px-4 text-white outline-none focus:border-cyan-400" />
        </label>
        <label className="text-xs font-bold text-slate-400 sm:col-span-2">Короткое описание
          <textarea name="shortDescription" rows={2} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 p-4 text-white outline-none focus:border-cyan-400" />
        </label>
        <label className="text-xs font-bold text-slate-400">Категория
          <select name="category" defaultValue="combined" className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#070b14] px-3 text-white">{COACH_EXERCISE_CATEGORIES.map((category) => <option key={category} value={category}>{COACH_EXERCISE_CATEGORY_LABELS[category]}</option>)}</select>
        </label>
        <label className="text-xs font-bold text-slate-400">Основной навык
          <select name="primarySkillId" required defaultValue="" className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#070b14] px-3 text-white"><option value="" disabled>Выберите</option>{leafSkills.map((skill) => <option key={skill.id} value={skill.id}>{skill.parentName} · {skill.name}</option>)}</select>
        </label>
        <label className="text-xs font-bold text-slate-400">Уровень
          <select name="levelCode" defaultValue="all" className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#070b14] px-3 text-white"><option value="all">Совсем новичок</option><option value="light">FIRST</option><option value="medium">NEXT</option><option value="hard">ADVANCED</option></select>
        </label>
        <label className="text-xs font-bold text-slate-400">Интенсивность
          <select name="intensity" defaultValue="medium" className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#070b14] px-3 text-white"><option value="low">Низкая</option><option value="medium">Средняя</option><option value="high">Высокая</option></select>
        </label>
        <div className="grid grid-cols-2 gap-3 sm:col-span-2 lg:grid-cols-5">
          <label className="text-xs font-bold text-slate-400">Игроков от<input name="playerMin" type="number" min="1" max="100" defaultValue="2" className="mt-2 min-h-11 w-full rounded-xl bg-black/20 px-3 text-white" /></label>
          <label className="text-xs font-bold text-slate-400">до<input name="playerMax" type="number" min="1" max="100" defaultValue="4" className="mt-2 min-h-11 w-full rounded-xl bg-black/20 px-3 text-white" /></label>
          <label className="text-xs font-bold text-slate-400">Кортов<input name="courtCount" type="number" min="0" max="20" defaultValue="1" className="mt-2 min-h-11 w-full rounded-xl bg-black/20 px-3 text-white" /></label>
          <label className="text-xs font-bold text-slate-400">Мячей<input name="ballCount" type="number" min="0" max="200" defaultValue="4" className="mt-2 min-h-11 w-full rounded-xl bg-black/20 px-3 text-white" /></label>
          <label className="text-xs font-bold text-slate-400">Минут<input name="durationMinutes" type="number" min="1" max="360" defaultValue="15" className="mt-2 min-h-11 w-full rounded-xl bg-black/20 px-3 text-white" /></label>
        </div>
        <label className="flex min-h-12 items-center gap-3 rounded-xl border border-white/10 px-4 text-sm text-slate-300 sm:col-span-2"><input name="coachRequired" type="checkbox" className="h-5 w-5 accent-orange-500" /> Тренер участвует в упражнении</label>
        {error ? <p role="alert" className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200 sm:col-span-2">{error}</p> : null}
        <button disabled={pending} className="min-h-12 rounded-xl bg-orange-500 px-5 font-black text-white disabled:opacity-60 sm:col-span-2">{pending ? 'Создаём…' : 'Создать и открыть карточку'}</button>
      </form>
    </section>
  );
}
