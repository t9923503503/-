const STEPS = [
  { number: 1, label: 'Старт' },
  { number: 2, label: 'Счёт' },
  { number: 3, label: 'Готово' },
] as const;

export default function PlayGameFlowSteps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol
      className="grid grid-cols-3 gap-2"
      aria-label="Этапы проведения игры"
    >
      {STEPS.map((step) => {
        const active = step.number === current;
        const complete = step.number < current;
        return (
          <li
            key={step.number}
            aria-current={active ? 'step' : undefined}
            className={`flex min-w-0 items-center gap-2 rounded-xl border px-2.5 py-2 text-xs font-bold sm:px-3 ${
              active
                ? 'border-brand/50 bg-brand/10 text-text-primary'
                : complete
                  ? 'border-emerald-300/25 bg-emerald-300/5 text-emerald-100'
                  : 'border-white/10 text-text-secondary'
            }`}
          >
            <span
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] ${
                active ? 'bg-brand text-white' : complete ? 'bg-emerald-300/15 text-emerald-100' : 'bg-white/5'
              }`}
              aria-hidden="true"
            >
              {complete ? '✓' : step.number}
            </span>
            <span className="truncate">{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
