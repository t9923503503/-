import Link from 'next/link';
import CreateExerciseForm from '@/components/coach/CreateExerciseForm';
import CoachSetupNotice from '@/components/coach/CoachSetupNotice';
import { listCoachExercises, listCoachIssueOptions } from '@/lib/coach/exercise-service';
import { COACH_EXERCISE_CATEGORIES } from '@/lib/coach/exercise-types';
import { COACH_EXERCISE_CATEGORY_LABELS, COACH_EXERCISE_INTENSITY_LABELS, COACH_EXERCISE_LEVEL_LABELS, formatExercisePlayers } from '@/lib/coach/exercise-ui';
import { normalizeCoachExerciseFilters } from '@/lib/coach/exercise-validators';
import { listCoachSkills } from '@/lib/coach/service';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CoachExercisesPage({ searchParams }: { searchParams: SearchParams }) {
  const rawFilters = await searchParams;
  const filters = Object.fromEntries(Object.entries(rawFilters).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value || '']));
  const normalizedFilters = normalizeCoachExerciseFilters(new URLSearchParams(filters));
  let exercises;
  let skills;
  let issues;
  try {
    [exercises, skills, issues] = await Promise.all([
      listCoachExercises(normalizedFilters),
      listCoachSkills(),
      listCoachIssueOptions(),
    ]);
  } catch (error) {
    return <CoachSetupNotice detail={error instanceof Error ? error.message : undefined} />;
  }
  const leafSkills = skills.filter((skill) => skill.parentId);
  const levelChoices = [
    { value: 'all', label: 'Совсем новичок', hint: 'Первые касания и простые правила', emoji: '🌱' },
    { value: 'light', label: 'FIRST', hint: 'Базовая техника и движение', emoji: '🏐' },
    { value: 'medium', label: 'NEXT', hint: 'Три касания и игровые решения', emoji: '⚡' },
    { value: 'hard', label: 'ADVANCED', hint: 'Скорость, давление и тактика', emoji: '🔥' },
  ] as const;

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-400">Библиотека тренера</p>
          <h1 className="mt-2 font-heading text-4xl leading-none tracking-wide text-white sm:text-5xl">Упражнения</h1>
          <p className="mt-3 max-w-2xl text-sm text-slate-400">Выберите уровень, откройте карточку и сразу проводите упражнение.</p>
        </div>
        <CreateExerciseForm skills={skills} />
      </section>

      <nav className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Уровень упражнений">
        {levelChoices.map((item) => {
          const active = filters.level === item.value;
          return <Link key={item.value} href={`/coach/exercises?level=${item.value}`} className={`rounded-2xl border p-4 transition ${active ? 'border-orange-400/50 bg-orange-500/15' : 'border-white/10 bg-white/[.035] hover:border-white/20'}`}><span className="text-2xl">{item.emoji}</span><b className="ml-3 text-base text-white">{item.label}</b><small className="mt-2 block text-xs leading-5 text-slate-500">{item.hint}</small></Link>;
        })}
      </nav>

      <details className="rounded-2xl border border-white/10 bg-white/[0.025] px-4">
        <summary className="flex min-h-12 cursor-pointer items-center py-2 text-sm font-black text-slate-300">Поиск и дополнительные фильтры</summary>
      <form className="grid gap-3 border-t border-white/8 py-4 md:grid-cols-2 xl:grid-cols-4" action="/coach/exercises">
        <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500 xl:col-span-2">Поиск
          <input name="q" defaultValue={filters.q} placeholder="Название, цель или тег" className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none focus:border-cyan-400" />
        </label>
        <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Категория
          <select name="category" defaultValue={filters.category} className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#0b111b] px-3 text-sm text-white"><option value="">Все</option>{COACH_EXERCISE_CATEGORIES.map((category) => <option key={category} value={category}>{COACH_EXERCISE_CATEGORY_LABELS[category]}</option>)}</select>
        </label>
        <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Уровень
          <select name="level" defaultValue={filters.level} className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#0b111b] px-3 text-sm text-white"><option value="">Все</option><option value="all">Совсем новичок</option><option value="light">FIRST</option><option value="medium">NEXT</option><option value="hard">ADVANCED</option></select>
        </label>
        <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Навык
          <select name="skillId" defaultValue={filters.skillId} className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#0b111b] px-3 text-sm text-white"><option value="">Все</option>{leafSkills.map((skill) => <option key={skill.id} value={skill.id}>{skill.parentName} · {skill.name}</option>)}</select>
        </label>
        <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Проблема ученика
          <select name="issueId" defaultValue={filters.issueId} className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#0b111b] px-3 text-sm text-white"><option value="">Все</option>{issues.map((issue) => <option key={issue.id} value={issue.id}>{issue.title}{issue.activeAthleteCount ? ` · ${issue.activeAthleteCount}` : ''}</option>)}</select>
        </label>
        <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Игроков
          <input name="players" type="number" min="1" max="100" defaultValue={filters.players} placeholder="например, 4" className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-black/20 px-4 text-sm text-white" />
        </label>
        <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Не дольше, мин
          <input name="duration" type="number" min="1" max="360" defaultValue={filters.duration} placeholder="15" className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-black/20 px-4 text-sm text-white" />
        </label>
        <div className="flex flex-wrap items-center gap-3 md:col-span-2 xl:col-span-4">
          <label className="flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-3 text-sm text-slate-300"><input name="favorite" value="1" type="checkbox" defaultChecked={filters.favorite === '1'} className="h-5 w-5 accent-orange-500" /> Избранное</label>
          <label className="flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-3 text-sm text-slate-300"><input name="noEquipment" value="1" type="checkbox" defaultChecked={filters.noEquipment === '1'} className="h-5 w-5 accent-orange-500" /> Без оборудования</label>
          <label className="flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-3 text-sm text-slate-300"><input name="coachRequired" value="1" type="checkbox" defaultChecked={filters.coachRequired === '1'} className="h-5 w-5 accent-orange-500" /> Тренер участвует</label>
          <button className="min-h-11 rounded-xl bg-cyan-400/15 px-5 text-sm font-black text-cyan-200">Применить</button>
          <Link href="/coach/exercises" className="inline-flex min-h-11 items-center px-3 text-sm text-slate-500 hover:text-white">Сбросить</Link>
        </div>
      </form>
      </details>

      {exercises.length ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {exercises.map((exercise) => (
            <Link key={exercise.id} href={`/coach/exercises/${exercise.id}`} className="group flex min-h-64 flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] transition hover:-translate-y-0.5 hover:border-orange-400/35 hover:bg-orange-400/[0.035]">
              {exercise.coverPhotoUrl ? <div className="aspect-[16/10] overflow-hidden bg-black/20">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={exercise.coverPhotoUrl} alt={exercise.title} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" /></div> : <div className="grid aspect-[16/10] place-items-center bg-black/20 text-5xl">🏐</div>}
              <div className="flex flex-1 flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-[11px] font-black uppercase tracking-[.16em] text-orange-300">{COACH_EXERCISE_CATEGORY_LABELS[exercise.category]}</p><h2 className="mt-2 text-xl font-black text-white">{exercise.title}</h2></div>
                <span className="text-2xl" aria-label={exercise.favorite ? 'В избранном' : 'Не в избранном'}>{exercise.favorite ? '★' : '☆'}</span>
              </div>
              <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-400">{exercise.shortDescription || exercise.goal || 'Добавьте описание и цель упражнения.'}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="rounded-lg bg-cyan-400/10 px-2.5 py-1 font-bold text-cyan-200">{exercise.primarySkill?.name || 'Без навыка'}</span>
                <span className="rounded-lg bg-white/5 px-2.5 py-1 text-slate-300">{COACH_EXERCISE_LEVEL_LABELS[exercise.levelCode]}</span>
                <span className="rounded-lg bg-white/5 px-2.5 py-1 text-slate-300">{formatExercisePlayers(exercise.playerMin, exercise.playerMax)}</span>
                <span className="rounded-lg bg-white/5 px-2.5 py-1 text-slate-300">{exercise.durationMinutes} мин</span>
                <span className="rounded-lg bg-white/5 px-2.5 py-1 text-slate-300">{COACH_EXERCISE_INTENSITY_LABELS[exercise.intensity]}</span>
              </div>
              <div className="mt-auto grid grid-cols-3 gap-2 border-t border-white/8 pt-4 text-center text-xs text-slate-500"><span><b className="block text-base text-white">{exercise.issueCount}</b>проблем</span><span><b className="block text-base text-white">{exercise.photoCount}</b>фото</span><span><b className="block text-base text-white">{exercise.videoCount}</b>видео</span></div>
              </div>
            </Link>
          ))}
        </section>
      ) : (
        <section className="rounded-3xl border border-dashed border-white/10 p-10 text-center"><p className="font-heading text-3xl text-slate-200">Ничего не найдено</p><p className="mt-2 text-sm text-slate-500">Сбросьте фильтры или создайте первое упражнение.</p></section>
      )}
    </div>
  );
}
