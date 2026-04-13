'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  label: string;
  initialValue: string;
  maxLength?: number;
  onSave: (value: string) => void;
  onCancel: () => void;
}

export function EditFieldModal({
  label,
  initialValue,
  maxLength = 40,
  onSave,
  onCancel,
}: Props) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
    return () => window.clearTimeout(id);
  }, []);

  const trimmed = value.trim();
  const canSave = trimmed.length > 0 && trimmed.length <= maxLength;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-5"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 20px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)',
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#0b1222] p-6 text-white shadow-2xl">
        <label
          className="block text-center text-sm uppercase tracking-widest text-white/60"
          style={{ fontFamily: 'Bebas Neue, sans-serif' }}
        >
          {label}
        </label>
        <input
          ref={inputRef}
          type="text"
          value={value}
          maxLength={maxLength}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canSave) onSave(trimmed);
            if (e.key === 'Escape') onCancel();
          }}
          className="mt-3 w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-4 text-center text-2xl font-bold text-white outline-none focus:border-white/40"
          style={{ fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.03em' }}
        />
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[56px] flex-1 rounded-2xl border border-white/15 bg-white/5 text-base font-bold uppercase tracking-wide text-white/80 active:scale-[0.98] active:bg-white/10"
            style={{ fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.05em' }}
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() => canSave && onSave(trimmed)}
            disabled={!canSave}
            className="min-h-[56px] flex-1 rounded-2xl bg-emerald-600 text-base font-bold uppercase tracking-wide text-white transition active:scale-[0.98] active:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-900/40 disabled:text-white/40"
            style={{ fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.05em' }}
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}
