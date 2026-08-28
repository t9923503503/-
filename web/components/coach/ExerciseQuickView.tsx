import type { CoachExerciseDetail } from '@/lib/coach/exercise-types';
import {
  COACH_EXERCISE_CATEGORY_LABELS,
  COACH_EXERCISE_LEVEL_LABELS,
  formatExercisePlayers,
} from '@/lib/coach/exercise-ui';

export default function ExerciseQuickView({ exercise }: { exercise: CoachExerciseDetail }) {
  const photo = exercise.photos[0] ?? null;
  const video = exercise.videos[0] ?? null;
  const steps = exercise.steps.filter(Boolean).slice(0, 6);
  const cues = exercise.coachCues.filter(Boolean).slice(0, 4);

  return (
    <section className="overflow-hidden rounded-[2rem] border border-orange-400/25 bg-gradient-to-b from-orange-500/[0.10] to-white/[0.035]">
      <div className="grid lg:grid-cols-[minmax(280px,.9fr)_minmax(0,1.1fr)]">
        <div className="relative min-h-64 bg-black/25 lg:min-h-[430px]">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo.storageUrl} alt={photo.title || exercise.title} className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 grid place-items-center p-8 text-center">
              <div><span className="text-6xl">🏐</span><p className="mt-4 text-sm font-bold text-slate-400">Добавьте одну понятную картинку-схему</p></div>
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-4 pt-16">
            <div className="flex flex-wrap gap-2 text-xs font-black">
              <span className="rounded-lg bg-orange-500 px-2.5 py-1 text-white">{COACH_EXERCISE_LEVEL_LABELS[exercise.levelCode]}</span>
              <span className="rounded-lg bg-black/65 px-2.5 py-1 text-white">{exercise.durationMinutes} минут</span>
              <span className="rounded-lg bg-black/65 px-2.5 py-1 text-white">{formatExercisePlayers(exercise.playerMin, exercise.playerMax)}</span>
              <span className="rounded-lg bg-black/65 px-2.5 py-1 text-white">{exercise.ballCount} мяч.</span>
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-7">
          <p className="text-xs font-black uppercase tracking-[.18em] text-orange-300">{COACH_EXERCISE_CATEGORY_LABELS[exercise.category]} · готово к проведению</p>
          <h2 className="mt-3 font-heading text-4xl leading-none text-white sm:text-5xl">{exercise.title}</h2>
          <p className="mt-4 text-base font-bold leading-7 text-slate-200">{exercise.goal || exercise.shortDescription || 'Проведите упражнение по коротким шагам ниже.'}</p>

          <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs font-black uppercase tracking-[.16em] text-cyan-300">Подготовка</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">{exercise.organization || `Возьмите ${exercise.ballCount || 1} мяч и распределите игроков по парам.`}</p>
          </div>

          <a href="#exercise-steps" className="mt-5 inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-orange-500 px-5 text-base font-black text-white shadow-lg shadow-orange-700/25">Начать упражнение ↓</a>
          {video ? <a href={video.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-12 w-full items-center justify-center rounded-2xl border border-white/10 px-5 text-sm font-black text-cyan-200">Посмотреть видео ↗</a> : null}
        </div>
      </div>

      <div id="exercise-steps" className="scroll-mt-24 border-t border-white/10 p-5 sm:p-7">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(260px,.65fr)]">
          <div>
            <p className="text-xs font-black uppercase tracking-[.18em] text-orange-300">Что делать</p>
            <ol className="mt-4 space-y-3">
              {(steps.length ? steps : ['Начните из удобной стойки.', 'Выполните действие спокойно и точно.', 'Повторите и поменяйтесь ролями.']).map((step, index) => (
                <li key={`${index}-${step}`} className="flex gap-3 rounded-2xl border border-white/8 bg-black/15 p-4 text-sm font-bold leading-6 text-white">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-orange-500 text-sm font-black text-white">{index + 1}</span>
                  <span className="pt-1">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.05] p-4">
            <p className="text-xs font-black uppercase tracking-[.16em] text-cyan-300">Скажите игрокам</p>
            <ul className="mt-3 space-y-3 text-sm font-bold leading-6 text-slate-200">
              {(cues.length ? cues : ['Не спешим.', 'Сначала точность, потом скорость.', 'После касания сразу готовы к следующему мячу.']).map((cue) => <li key={cue} className="flex gap-2"><span className="text-cyan-300">•</span><span>{cue}</span></li>)}
            </ul>
          </div>
        </div>

        {(exercise.simplification || exercise.complication || exercise.typicalErrors.length) ? (
          <details className="mt-5 rounded-2xl border border-white/10 bg-black/15 px-4">
            <summary className="flex min-h-12 cursor-pointer items-center py-2 text-sm font-black text-slate-200">Если не получается / слишком легко</summary>
            <div className="grid gap-4 pb-4 text-sm leading-6 text-slate-300 sm:grid-cols-2">
              {exercise.simplification ? <div><b className="text-emerald-300">Упростить</b><p className="mt-1">{exercise.simplification}</p></div> : null}
              {exercise.complication ? <div><b className="text-orange-300">Усложнить</b><p className="mt-1">{exercise.complication}</p></div> : null}
              {exercise.typicalErrors.length ? <div className="sm:col-span-2"><b className="text-rose-300">Частая ошибка</b><p className="mt-1">{exercise.typicalErrors.slice(0, 3).join(' · ')}</p></div> : null}
            </div>
          </details>
        ) : null}
      </div>
    </section>
  );
}
