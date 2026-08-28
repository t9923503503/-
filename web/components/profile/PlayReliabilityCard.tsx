import type { PlayReliabilityView } from '@/lib/play-service';

const LABELS = { new: 'Пока мало данных', reliable: 'Очень надёжно', stable: 'Стабильно', attention: 'Можно улучшить' } as const;

export default function PlayReliabilityCard({ value }: { value: PlayReliabilityView }) {
  return (
    <section className="rounded-2xl border border-emerald-300/20 bg-emerald-300/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-200">Надёжность на играх</p>
          <h3 className="mt-1 text-2xl font-black text-text-primary">{value.score == null ? 'Новый участник' : `${value.score}%`}</h3>
          <p className="mt-1 text-sm text-text-secondary">{LABELS[value.label]} · учтено игр: {value.trackedGames}</p>
        </div>
        <span className="rounded-full bg-emerald-300/10 px-3 py-1 text-xs font-bold text-emerald-100">Без влияния на рейтинг</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-surface/55 p-3"><strong className="block text-xl text-text-primary">{value.attended}</strong><span className="text-[11px] text-text-secondary">посещено</span></div>
        <div className="rounded-xl bg-surface/55 p-3"><strong className="block text-xl text-text-primary">{value.lateCancellations}</strong><span className="text-[11px] text-text-secondary">поздних отмен</span></div>
        <div className="rounded-xl bg-surface/55 p-3"><strong className="block text-xl text-text-primary">{value.noShows}</strong><span className="text-[11px] text-text-secondary">неявок</span></div>
      </div>
    </section>
  );
}
