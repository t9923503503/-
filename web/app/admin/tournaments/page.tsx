'use client';

import { useEffect, useMemo, useState } from 'react';

type Row = {
  id: string;
  name: string;
  date: string;
  time: string;
  location: string;
  format: string;
  division: string;
  level: string;
  capacity: number;
  status: string;
  participantCount: number;
};

const emptyForm: Row = {
  id: '',
  name: '',
  date: '',
  time: '',
  location: '',
  format: 'thai',
  division: 'mix',
  level: 'open',
  capacity: 0,
  status: 'open',
  participantCount: 0,
};

export default function AdminTournamentsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<Row>(emptyForm);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const isEdit = useMemo(() => Boolean(form.id), [form.id]);

  async function load() {
    const res = await fetch(`/api/admin/tournaments?q=${encodeURIComponent(query)}`, { cache: 'no-store' });
    const data = await res.json();
    setRows(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    const method = isEdit ? 'PUT' : 'POST';
    const res = await fetch('/api/admin/tournaments', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setLoading(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setMessage(err?.error || 'Ошибка сохранения');
      return;
    }
    setForm(emptyForm);
    setMessage('Сохранено');
    await load();
  }

  async function remove(id: string) {
    if (!confirm('Удалить турнир?')) return;
    const res = await fetch('/api/admin/tournaments', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, reason: 'manual delete from admin' }),
    });
    if (!res.ok) {
      setMessage('Удаление запрещено или не удалось');
      return;
    }
    await load();
  }

  return (
    <div className="grid lg:grid-cols-[1.2fr_1fr] gap-4">
      <div className="rounded-xl border border-white/15 bg-white/5 p-4">
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по турнирам"
            className="flex-1 px-3 py-2 rounded-lg bg-surface border border-white/20"
          />
          <button
            type="button"
            onClick={() => void load()}
            className="px-3 py-2 rounded-lg border border-white/20 hover:border-brand"
          >
            Найти
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-secondary border-b border-white/10">
                <th className="py-2 pr-3">Название</th>
                <th className="py-2 pr-3">Дата</th>
                <th className="py-2 pr-3">Статус</th>
                <th className="py-2 pr-3">Участники</th>
                <th className="py-2 pr-3">Действия</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-white/5">
                  <td className="py-2 pr-3">{row.name}</td>
                  <td className="py-2 pr-3">{row.date}</td>
                  <td className="py-2 pr-3">{row.status}</td>
                  <td className="py-2 pr-3">{row.participantCount}</td>
                  <td className="py-2 pr-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setForm(row)}
                      className="px-2 py-1 rounded border border-white/20 hover:border-brand"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(row.id)}
                      className="px-2 py-1 rounded border border-red-500/60 text-red-300"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr><td className="py-3 text-text-secondary" colSpan={5}>Нет данных</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <form onSubmit={save} className="rounded-xl border border-white/15 bg-white/5 p-4 flex flex-col gap-3">
        <h2 className="font-heading text-3xl leading-none">{isEdit ? 'Редактировать' : 'Новый турнир'}</h2>
        <input value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} placeholder="Название" className="px-3 py-2 rounded-lg bg-surface border border-white/20" required />
        <div className="grid grid-cols-2 gap-2">
          <input type="date" value={form.date} onChange={(e) => setForm((s) => ({ ...s, date: e.target.value }))} className="px-3 py-2 rounded-lg bg-surface border border-white/20" />
          <input type="time" value={form.time} onChange={(e) => setForm((s) => ({ ...s, time: e.target.value }))} className="px-3 py-2 rounded-lg bg-surface border border-white/20" />
        </div>
        <input value={form.location} onChange={(e) => setForm((s) => ({ ...s, location: e.target.value }))} placeholder="Локация" className="px-3 py-2 rounded-lg bg-surface border border-white/20" />
        <div className="grid grid-cols-2 gap-2">
          <input value={form.format} onChange={(e) => setForm((s) => ({ ...s, format: e.target.value }))} placeholder="Формат" className="px-3 py-2 rounded-lg bg-surface border border-white/20" />
          <input value={form.division} onChange={(e) => setForm((s) => ({ ...s, division: e.target.value }))} placeholder="Дивизион" className="px-3 py-2 rounded-lg bg-surface border border-white/20" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <input value={form.level} onChange={(e) => setForm((s) => ({ ...s, level: e.target.value }))} placeholder="Уровень" className="px-3 py-2 rounded-lg bg-surface border border-white/20" />
          <input type="number" value={form.capacity} onChange={(e) => setForm((s) => ({ ...s, capacity: Number(e.target.value || 0) }))} placeholder="Capacity" className="px-3 py-2 rounded-lg bg-surface border border-white/20" />
          <input value={form.status} onChange={(e) => setForm((s) => ({ ...s, status: e.target.value }))} placeholder="Статус" className="px-3 py-2 rounded-lg bg-surface border border-white/20" />
        </div>
        <div className="flex gap-2">
          <button type="submit" disabled={loading} className="px-4 py-2 rounded-lg bg-brand text-surface font-semibold disabled:opacity-60">
            {loading ? 'Сохраняем...' : 'Сохранить'}
          </button>
          <button type="button" onClick={() => setForm(emptyForm)} className="px-4 py-2 rounded-lg border border-white/20 hover:border-brand">
            Сброс
          </button>
        </div>
        {message ? <p className="text-sm text-text-secondary">{message}</p> : null}
      </form>
    </div>
  );
}
