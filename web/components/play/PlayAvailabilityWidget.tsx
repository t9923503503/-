'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { PlayAvailabilityView } from '@/lib/play-service';

function toLocalInput(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// «🟢 Я свободен»: 1 активная запись, срок жизни обязателен (TZ §1.6)
export default function PlayAvailabilityWidget({ current }: { current: PlayAvailabilityView | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dateFrom, setDateFrom] = useState(() => toLocalInput(new Date().toISOString()));
  const [dateTo, setDateTo] = useState(() => {
    const end = new Date(Date.now() + 5 * 60 * 60 * 1000);
    return toLocalInput(end.toISOString());
  });
  const [note, setNote] = useState('');

  async function save() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/me/play-availability', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateFrom: new Date(dateFrom).toISOString(),
          dateTo: new Date(dateTo).toISOString(),
          note,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || 'Не удалось сохранить');
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError('Ошибка сети');
    } finally {
      setLoading(false);
    }
  }

  async function clear() {
    setLoading(true);
    try {
      await fetch('/api/me/play-availability', { method: 'DELETE' });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (current && !open) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-300/25 bg-emerald-300/10 px-4 py-3">
        <span className="text-sm font-semibold text-emerald-200">
          🟢 Ты свободен: {new Date(current.dateFrom).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          {' — '}
          {new Date(current.dateTo).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
        </span>
        {current.note ? <span className="text-xs text-text-secondary">{current.note}</span> : null}
        <button onClick={clear} disabled={loading} className="ml-auto text-xs font-semibold text-text-secondary underline-offset-2 hover:text-white hover:underline">
          Снять отметку
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-2xl border border-emerald-300/30 bg-emerald-300/10 px-5 py-3 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-300/20"
      >
        🟢 Я свободен
      </button>
    );
  }

  return (
    <div className="grid gap-3 rounded-2xl border border-emerald-300/25 bg-emerald-300/5 p-4">
      <p className="text-sm font-semibold text-emerald-100">Когда ты свободен? Организаторы увидят тебя в «Пригласить подходящих».</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs text-text-secondary">
          С
          <input type="datetime-local" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-xl border border-white/10 bg-surface px-3 py-2.5 text-sm text-text-primary" />
        </label>
        <label className="grid gap-1 text-xs text-text-secondary">
          До
          <input type="datetime-local" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded-xl border border-white/10 bg-surface px-3 py-2.5 text-sm text-text-primary" />
        </label>
      </div>
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={140}
        placeholder="Комментарий (необязательно, до 140 символов)"
        className="rounded-xl border border-white/10 bg-surface px-3 py-2.5 text-sm text-text-primary"
      />
      {error ? <p className="text-xs text-rose-200">{error}</p> : null}
      <div className="flex gap-2">
        <button onClick={save} disabled={loading} className="rounded-xl bg-emerald-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:opacity-50">
          {loading ? 'Сохраняю…' : 'Отметиться'}
        </button>
        <button onClick={() => setOpen(false)} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-text-secondary">
          Отмена
        </button>
      </div>
    </div>
  );
}
