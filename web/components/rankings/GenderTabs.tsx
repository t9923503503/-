'use client';

import type { RatingType } from '@/lib/types';

const TABS: { value: RatingType; label: string }[] = [
  { value: 'M', label: 'Мужской' },
  { value: 'W', label: 'Женский' },
  { value: 'Mix', label: 'Микст' },
];

interface GenderTabsProps {
  value: RatingType;
  onChange: (value: RatingType) => void;
}

export default function GenderTabs({ value, onChange }: GenderTabsProps) {
  return (
    <div className="flex gap-2">
      {TABS.map((tab) => {
        const isActive = tab.value === value;
        return (
          <button
            key={tab.value}
            onClick={() => onChange(tab.value)}
            className={[
              'px-5 py-2 rounded font-condensed font-semibold text-sm uppercase tracking-wide transition-colors',
              isActive
                ? 'bg-brand text-white'
                : 'bg-surface-light text-text-secondary hover:text-text-primary hover:bg-surface-lighter',
            ].join(' ')}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
