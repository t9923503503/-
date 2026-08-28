'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CoachLoginForm() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/admin/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: form.get('id'), pin: form.get('pin') }),
    });
    const payload = await response.json().catch(() => ({})) as { actor?: { role?: string }; error?: string };
    if (!response.ok) {
      setError(response.status === 401 ? 'Неверный ID или PIN' : payload.error || 'Не удалось войти');
      setPending(false);
      return;
    }
    if (payload.actor?.role !== 'admin') {
      await fetch('/api/admin/auth', { method: 'DELETE' });
      setError('Для LP Coach нужен доступ администратора');
      setPending(false);
      return;
    }
    router.replace('/coach');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/[0.045] p-6 shadow-2xl shadow-black/30 sm:p-8">
      <div className="mb-7">
        <span className="inline-flex rounded-full border border-orange-400/25 bg-orange-500/10 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-orange-300">LPVOLLEY</span>
        <h1 className="mt-4 font-heading text-5xl leading-none tracking-wide text-white">LP COACH</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">Рабочее место тренера: ученики, навыки и проблемы без выдуманных данных.</p>
      </div>
      <div className="space-y-4">
        <label className="block text-sm font-bold text-slate-300">
          ID сотрудника
          <input name="id" autoComplete="username" placeholder="Если настроен" className="mt-2 min-h-12 w-full rounded-xl border border-white/15 bg-black/20 px-4 text-white outline-none transition placeholder:text-slate-600 focus:border-orange-400" />
        </label>
        <label className="block text-sm font-bold text-slate-300">
          PIN
          <input name="pin" type="password" autoComplete="current-password" required inputMode="numeric" placeholder="••••" className="mt-2 min-h-12 w-full rounded-xl border border-white/15 bg-black/20 px-4 text-lg tracking-[0.3em] text-white outline-none transition placeholder:text-slate-600 focus:border-orange-400" />
        </label>
      </div>
      {error ? <p role="alert" className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-300">{error}</p> : null}
      <button type="submit" disabled={pending} className="mt-6 min-h-12 w-full rounded-xl bg-orange-500 px-4 font-black text-white shadow-lg shadow-orange-600/20 transition hover:bg-orange-400 disabled:opacity-60">
        {pending ? 'Проверяем…' : 'Войти в LP Coach'}
      </button>
    </form>
  );
}
