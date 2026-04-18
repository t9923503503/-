'use client';

import type { GoOperatorStage } from '@/lib/go-next/types';

const STAGES: Array<{ key: GoOperatorStage; label: string }> = [
  { key: 'setup', label: 'Настройка' },
  { key: 'groups_live', label: 'Группы' },
  { key: 'bracket_live', label: 'Сетка' },
  { key: 'finished', label: 'Завершено' },
];

function stageIndex(stage: GoOperatorStage): number {
  if (stage === 'finished') return 3;
  if (stage.startsWith('bracket')) return 2;
  if (stage.startsWith('groups')) return 1;
  return 0;
}

export function GoProgressBar({ stage }: { stage: GoOperatorStage }) {
  const current = stageIndex(stage);
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="grid grid-cols-4 gap-2">
        {STAGES.map((item, index) => {
          const isDone = index < current;
          const isCurrent = index === current;
          return (
            <div
              key={item.key}
              className={`rounded-lg border px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide ${
                isDone
                  ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
                  : isCurrent
                    ? 'border-brand/50 bg-brand/20 text-brand'
                    : 'border-white/10 bg-white/5 text-white/45'
              }`}
            >
              {isDone ? '✓ ' : ''}
              {item.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}
