"use client";

import { useState } from 'react';

export default function PartnerRequestButton({
  sourceRequestId,
}: {
  sourceRequestId: string;
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function onClick() {
    setState('loading');
    setMessage('');
    try {
      const res = await fetch('/api/partner/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceRequestId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState('error');
        setMessage(data?.error || 'Не удалось отправить запрос');
        return;
      }
      setState('done');
      setMessage('Запрос отправлен');
    } catch {
      setState('error');
      setMessage('Ошибка сети');
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={state === 'loading' || state === 'done'}
        className={[
          'inline-flex items-center justify-center px-3 py-1.5 rounded-lg text-xs font-body font-semibold border transition-colors',
          state === 'done'
            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 cursor-default'
            : state === 'loading'
              ? 'bg-white/10 border-white/15 text-text-secondary cursor-wait'
              : 'bg-brand/20 border-brand/40 text-brand-light hover:bg-brand/30',
        ].join(' ')}
      >
        {state === 'loading' ? 'Отправка...' : state === 'done' ? 'Отправлено' : 'Откликнуться'}
      </button>
      {message ? (
        <span
          className={[
            'text-[11px] font-body',
            state === 'error' ? 'text-red-300' : 'text-text-secondary',
          ].join(' ')}
        >
          {message}
        </span>
      ) : null}
    </div>
  );
}
