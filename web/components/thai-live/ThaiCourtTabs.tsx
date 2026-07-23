'use client';

import { Children, useState, type ReactNode } from 'react';

export interface ThaiCourtTabItem {
  label: string;
  sublabel?: string;
}

/**
 * Табы кортов/зон для зрительского табло: показывает один активный корт.
 * Тяжёлый контент отрисован на сервере и передан через children —
 * неактивные панели скрыты (не размонтированы), чтобы сохранять их состояние.
 */
export function ThaiCourtTabs({
  tabs,
  children,
}: {
  tabs: ThaiCourtTabItem[];
  children: ReactNode;
}) {
  const [active, setActive] = useState(0);
  const panels = Children.toArray(children);

  if (panels.length <= 1) {
    return <>{children}</>;
  }

  return (
    <div>
      <div
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
        style={{ scrollbarWidth: 'none' }}
        role="tablist"
      >
        {tabs.map((tab, index) => {
          const isActive = index === active;
          return (
            <button
              key={`${tab.label}-${index}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(index)}
              className={`flex shrink-0 flex-col items-center rounded-2xl border px-4 py-2.5 text-center transition ${
                isActive
                  ? 'border-[#ffd24a] bg-[#ffd24a] text-[#17130b] shadow-[0_8px_24px_rgba(255,210,74,0.25)]'
                  : 'border-white/12 bg-white/5 text-white/70 hover:text-white'
              }`}
            >
              <span className="text-sm font-black uppercase tracking-[0.08em]">{tab.label}</span>
              {tab.sublabel ? (
                <span className={`mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${isActive ? 'text-[#17130b]/70' : 'text-white/45'}`}>
                  {tab.sublabel}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mt-3">
        {panels.map((panel, index) => (
          <div key={index} hidden={index !== active}>
            {panel}
          </div>
        ))}
      </div>
    </div>
  );
}
