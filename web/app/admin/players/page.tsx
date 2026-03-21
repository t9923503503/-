'use client';

import { useEffect, useMemo, useState } from 'react';

type Row = {
  id: string;
  name: string;
  gender: 'M' | 'W';
  status: 'active' | 'temporary';
  ratingM: number;
  ratingW: number;
  ratingMix: number;
  wins: number;
  totalPts: number;
};

const emptyForm: Row = {
  id: '',
  name: '',
  gender: 'M',
  status: 'active',
  ratingM: 0,
  ratingW: 0,
  ratingMix: 0,
  wins: 0,
  totalPts: 0,
};

export default function AdminPlayersPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<Row>(emptyForm);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const isEdit = useMemo(() => Boolean(form.id), [form.id]);

  async function load() {
    const res = await fetch(`/api/admin/players?q=${encodeURIComponent(query)}`, { cache: 'no-store' });
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
    const res = await fetch('/api/admin/players', {
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
    if (!confirm('Удалить игрока?')) return;
    const res = await fetch('/api/admin/players', {
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
            placeholder="Поиск игроков"
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
                <th className="py-2 pr-3">Имя</th>
                <th className="py-2 pr-3">Пол</th>
                <th className="py-2 pr-3">Mix</th>
                <th className="py-2 pr-3">Статус</th>
                <th className="py-2 pr-3">Действия</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-white/5">
                  <td className="py-2 pr-3">{row.name}</td>
                  <td className="py-2 pr-3">{row.gender}</td>
                  <td className="py-2 pr-3">{row.ratingMix}</td>
                  <td className="py-2 pr-3">{row.status}</td>
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
        <h2 className="font-heading text-3xl leading-none">{isEdit ? 'Редактировать' : 'Новый игрок'}</h2>
        <input value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} placeholder="Имя" className="px-3 py-2 rounded-lg bg-surface border border-white/20" required />
        <div className="grid grid-cols-2 gap-2">
          <select value={form.gender} onChange={(e) => setForm((s) => ({ ...s, gender: e.target.value as 'M' | 'W' }))} className="px-3 py-2 rounded-lg bg-surface border border-white/20">
            <option value="M">M</option>
            <option value="W">W</option>
          </select>
          <select value={form.status} onChange={(e) => setForm((s) => ({ ...s, status: e.target.value as 'active' | 'temporary' }))} className="px-3 py-2 rounded-lg bg-surface border border-white/20">
            <option value="active">active</option>
            <option value="temporary">temporary</option>
          </select>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <input type="number" value={form.ratingM} onChange={(e) => setForm((s) => ({ ...s, ratingM: Number(e.target.value || 0) }))} placeholder="ratingM" className="px-3 py-2 rounded-lg bg-surface border border-white/20" />
          <input type="number" value={form.ratingW} onChange={(e) => setForm((s) => ({ ...s, ratingW: Number(e.target.value || 0) }))} placeholder="ratingW" className="px-3 py-2 rounded-lg bg-surface border border-white/20" />
          <input type="number" value={form.ratingMix} onChange={(e) => setForm((s) => ({ ...s, ratingMix: Number(e.target.value || 0) }))} placeholder="ratingMix" className="px-3 py-2 rounded-lg bg-surface border border-white/20" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input type="number" value={form.wins} onChange={(e) => setForm((s) => ({ ...s, wins: Number(e.target.value || 0) }))} placeholder="wins" className="px-3 py-2 rounded-lg bg-surface border border-white/20" />
          <input type="number" value={form.totalPts} onChange={(e) => setForm((s) => ({ ...s, totalPts: Number(e.target.value || 0) }))} placeholder="totalPts" className="px-3 py-2 rounded-lg bg-surface border border-white/20" />
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
