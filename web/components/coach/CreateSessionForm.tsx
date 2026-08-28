'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

function localInputValue(date: Date): string {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export default function CreateSessionForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(20, 0, 0, 0);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

  async function submit(formData: FormData) {
    setSaving(true);
    setError('');
    const payload = Object.fromEntries(formData.entries());
    const response = await fetch('/api/coach/sessions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setError(String(data.error || 'Не удалось создать тренировку'));
      return;
    }
    router.push(`/coach/sessions/${data.session.id}`);
    router.refresh();
  }

  if (!open) return <button type="button" onClick={() => setOpen(true)} className="min-h-12 rounded-2xl bg-orange-500 px-5 text-sm font-black text-white shadow-lg shadow-orange-600/20">+ Новая тренировка</button>;

  return (
    <section className="rounded-3xl border border-orange-400/25 bg-white/[0.035] p-5 lg:min-w-[44rem]">
      <div className="flex items-start justify-between gap-4">
        <div><p className="text-[11px] font-black uppercase tracking-[.18em] text-orange-300">Новая тренировка</p><h2 className="mt-1 font-heading text-3xl text-white">Создать вручную</h2></div>
        <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-xl border border-white/10 px-4 text-sm font-bold text-slate-400">Закрыть</button>
      </div>
      <form action={submit} className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-xs font-bold text-slate-400 sm:col-span-2">Название<input name="title" required minLength={3} defaultValue="Тренировка по пляжному волейболу" className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-black/20 px-4 text-white" /></label>
        <label className="text-xs font-bold text-slate-400">Начало<input name="startsAt" type="datetime-local" required defaultValue={localInputValue(start)} className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-black/20 px-4 text-white [color-scheme:dark]" /></label>
        <label className="text-xs font-bold text-slate-400">Окончание<input name="endsAt" type="datetime-local" required defaultValue={localInputValue(end)} className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-black/20 px-4 text-white [color-scheme:dark]" /></label>
        <label className="text-xs font-bold text-slate-400 sm:col-span-2">Место<input name="location" placeholder="Площадка или адрес" className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-black/20 px-4 text-white" /></label>
        <label className="text-xs font-bold text-slate-400">Кортов<input name="courtCount" type="number" min="0" max="20" defaultValue="1" className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-black/20 px-4 text-white" /></label>
        <label className="text-xs font-bold text-slate-400">Мест<input name="capacity" type="number" min="1" max="200" placeholder="8" className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-black/20 px-4 text-white" /></label>
        <input type="hidden" name="status" value="scheduled" />
        {error ? <p className="text-sm text-rose-300 sm:col-span-2" role="alert">{error}</p> : null}
        <button disabled={saving} className="min-h-12 rounded-2xl bg-orange-500 px-5 text-sm font-black text-white disabled:opacity-60 sm:col-span-2">{saving ? 'Создаю…' : 'Создать и открыть'}</button>
      </form>
    </section>
  );
}
