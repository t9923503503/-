'use client';

import { useEffect, useState } from 'react';

type ThaiInlineActionConfirmTone = 'danger' | 'warn' | 'accent';

function toneClasses(tone: ThaiInlineActionConfirmTone) {
  if (tone === 'danger') {
    return {
      button:
        'border-red-400/30 bg-red-500/10 text-red-100 hover:border-red-300/50 hover:bg-red-500/20',
      panel: 'border-red-400/30 bg-red-500/10 text-red-100',
      confirm: 'border-red-400/45 bg-red-500/20 text-red-50 hover:bg-red-500/30',
    };
  }
  if (tone === 'warn') {
    return {
      button:
        'border-amber-400/35 bg-amber-500/10 text-amber-100 hover:border-amber-300/50 hover:bg-amber-500/20',
      panel: 'border-amber-400/30 bg-amber-500/10 text-amber-100',
      confirm: 'border-amber-400/45 bg-amber-500/20 text-amber-50 hover:bg-amber-500/30',
    };
  }
  return {
    button:
      'border-[#5b4713] bg-[#ffd24a] text-[#17130b] hover:bg-[#ffe07f]',
    panel: 'border-sky-400/30 bg-sky-500/10 text-sky-100',
    confirm: 'border-sky-400/45 bg-sky-500/20 text-sky-50 hover:bg-sky-500/30',
  };
}

export function ThaiInlineActionConfirm({
  label,
  armedLabel,
  description,
  onConfirm,
  disabled = false,
  busy = false,
  tone = 'danger',
  className = '',
}: {
  label: string;
  armedLabel?: string;
  description: string;
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
  busy?: boolean;
  tone?: ThaiInlineActionConfirmTone;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  const [expiresAt, setExpiresAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const styles = toneClasses(tone);

  useEffect(() => {
    if (!armed) return;
    const tickId = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(tickId);
  }, [armed]);

  useEffect(() => {
    if (!armed) return;
    if (busy || disabled) {
      setArmed(false);
      setExpiresAt(0);
      return;
    }
    if (expiresAt > 0 && now >= expiresAt) {
      setArmed(false);
      setExpiresAt(0);
    }
  }, [armed, busy, disabled, expiresAt, now]);

  const secondsLeft = Math.max(0, Math.ceil((expiresAt - now) / 1000));

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => {
          setArmed(true);
          setExpiresAt(Date.now() + 5000);
          setNow(Date.now());
        }}
        disabled={disabled || busy}
        className={`inline-flex rounded-full border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${styles.button} ${className}`}
      >
        {busy ? 'Сохраняем…' : label}
      </button>
    );
  }

  return (
    <div className={`rounded-2xl border px-4 py-3 ${styles.panel}`}>
      <div className="text-xs font-semibold uppercase tracking-[0.18em]">
        Подтвердите действие {secondsLeft > 0 ? `· ${secondsLeft}с` : ''}
      </div>
      <p className="mt-2 text-sm leading-relaxed">{description}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void onConfirm()}
          disabled={disabled || busy}
          className={`rounded-full border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles.confirm}`}
        >
          {busy ? 'Сохраняем…' : armedLabel ?? `Подтвердить: ${label}`}
        </button>
        <button
          type="button"
          onClick={() => {
            setArmed(false);
            setExpiresAt(0);
          }}
          disabled={busy}
          className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition hover:border-white/20 hover:bg-white/10 disabled:opacity-50"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
