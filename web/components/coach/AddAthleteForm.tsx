'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CoachCandidate } from '@/lib/coach/types';

export default function AddAthleteForm({ candidates }: { candidates: CoachCandidate[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ru');
    return normalized ? candidates.filter((item) => item.name.toLocaleLowerCase('ru').includes(normalized)).slice(0, 60) : candidates.slice(0, 60);
  }, [candidates, query]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage('');
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/coach/athletes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        playerId: form.get('playerId'),
        levelCode: form.get('levelCode'),
        joinedAt: form.get('joinedAt'),
        goals: form.get('goals'),
        limitations: form.get('limitations'),
      }),
    });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) {
      setMessage(payload.error || 'Не удалось добавить ученика');
      setPending(false);
      return;
    }
    setMessage('Ученик добавлен');
    setPending(false);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-orange-500 px-5 text-sm font-black text-white shadow-lg shadow-orange-600/20 transition hover:bg-orange-400 sm:w-auto">+ Добавить ученика</button>
    );
  }

  return (
    <section className="rounded-3xl border border-orange-400/25 bg-orange-500/[0.055] p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-orange-300">Новый ученик</p>
          <h2 className="mt-1 font-heading text-3xl tracking-wide">Из базы LPVOLLEY</h2>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-xl border border-white/10 px-3 text-sm text-slate-400">Закрыть</button>
      </div>
      {candidates.length ? (
        <form onSubmit={submit} className="mt-5 grid gap-4 lg:grid-cols-2">
          <label className="text-sm font-bold text-slate-300 lg:col-span-2">Быстрый поиск
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Начните вводить имя" className="mt-2 min-h-12 w-full rounded-xl border border-white/15 bg-black/20 px-4 font-normal outline-none focus:border-orange-400" />
          </label>
          <label className="text-sm font-bold text-slate-300 lg:col-span-2">Игрок
            <select name="playerId" required defaultValue="" className="mt-2 min-h-12 w-full rounded-xl border border-white/15 bg-[#0b111b] px-4 font-normal outline-none focus:border-orange-400">
              <option value="" disabled>Выберите игрока ({filtered.length})</option>
              {filtered.map((candidate) => <option key={candidate.playerId} value={candidate.playerId}>{candidate.name} · {candidate.gender} · {candidate.tournamentsPlayed} турн.</option>)}
            </select>
          </label>
          <label className="text-sm font-bold text-slate-300">Уровень
            <select name="levelCode" defaultValue="medium" className="mt-2 min-h-12 w-full rounded-xl border border-white/15 bg-[#0b111b] px-4 font-normal outline-none focus:border-orange-400">
              <option value="light">Лайт</option><option value="medium">Медиум</option><option value="hard">Хард</option>
            </select>
          </label>
          <label className="text-sm font-bold text-slate-300">Дата начала
            <input name="joinedAt" type="date" className="mt-2 min-h-12 w-full rounded-xl border border-white/15 bg-[#0b111b] px-4 font-normal outline-none focus:border-orange-400" />
          </label>
          <label className="text-sm font-bold text-slate-300">Цель
            <textarea name="goals" rows={3} placeholder="Чего хочет добиться ученик" className="mt-2 w-full rounded-xl border border-white/15 bg-black/20 p-4 font-normal outline-none focus:border-orange-400" />
          </label>
          <label className="text-sm font-bold text-slate-300">Ограничения
            <textarea name="limitations" rows={3} placeholder="Травмы, режим, ограничения" className="mt-2 w-full rounded-xl border border-white/15 bg-black/20 p-4 font-normal outline-none focus:border-orange-400" />
          </label>
          {message ? <p role="status" className="text-sm text-amber-300 lg:col-span-2">{message}</p> : null}
          <button type="submit" disabled={pending} className="min-h-12 rounded-xl bg-orange-500 px-5 font-black text-white disabled:opacity-60 lg:col-span-2">{pending ? 'Добавляем…' : 'Добавить в LP Coach'}</button>
        </form>
      ) : (
        <p className="mt-5 rounded-2xl border border-dashed border-white/10 p-6 text-sm text-slate-500">Все доступные игроки уже добавлены в LP Coach.</p>
      )}
    </section>
  );
}
