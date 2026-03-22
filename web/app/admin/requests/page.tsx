'use client';

import { useEffect, useState } from 'react';

type Tournament = { id: string; name: string };
type PlayerRequest = {
  id: string;
  name: string;
  gender: 'M' | 'W';
  phone: string;
  tournamentId: string;
  tournamentName: string;
  status: string;
  createdAt: string;
  reviewedAt: string | null;
};

export default function AdminRequestsPage() {
  const [requests, setRequests] = useState<PlayerRequest[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [filterTid, setFilterTid] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function loadRequests(tid?: string) {
    const qs = tid ? `?tournamentId=${encodeURIComponent(tid)}` : '';
    const res = await fetch(`/api/admin/requests${qs}`, { cache: 'no-store' });
    setRequests(await res.json().catch(() => []));
  }

  useEffect(() => {
    void (async () => {
      const tRes = await fetch('/api/admin/tournaments', { cache: 'no-store' });
      setTournaments(await tRes.json().catch(() => []));
      await loadRequests();
    })();
  }, []);

  function onFilterChange(tid: string) {
    setFilterTid(tid);
    void loadRequests(tid || undefined);
  }

  async function handleAction(action: 'approve' | 'reject', requestId: string) {
    setLoading(true);
    setMessage('');
    const res = await fetch('/api/admin/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, requestId }),
    });
    setLoading(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setMessage(err?.error || 'Ошибка');
      return;
    }
    setMessage(action === 'approve' ? 'Заявка одобрена' : 'Заявка отклонена');
    await loadRequests(filterTid || undefined);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 items-end">
        <select
          value={filterTid}
          onChange={(e) => onFilterChange(e.target.value)}
          className="flex-1 px-3 py-2 rounded-lg bg-surface border border-white/20"
        >
          <option value="">Все турниры</option>
          {tournaments.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      <div className="rounded-xl border border-white/15 bg-white/5 p-4">
        <h2 className="font-heading text-3xl leading-none mb-3">Ожидающие заявки</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-secondary border-b border-white/10">
                <th className="py-2 pr-3">Имя</th>
                <th className="py-2 pr-3">Пол</th>
                <th className="py-2 pr-3">Телефон</th>
                <th className="py-2 pr-3">Турнир</th>
                <th className="py-2 pr-3">Дата</th>
                <th className="py-2 pr-3">Действия</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} className="border-b border-white/5">
                  <td className="py-2 pr-3">{r.name}</td>
                  <td className="py-2 pr-3">{r.gender === 'W' ? '♀️' : '♂️'}</td>
                  <td className="py-2 pr-3 text-text-secondary">{r.phone || '—'}</td>
                  <td className="py-2 pr-3">{r.tournamentName}</td>
                  <td className="py-2 pr-3 text-text-secondary">
                    {new Date(r.createdAt).toLocaleDateString('ru-RU')}
                  </td>
                  <td className="py-2 pr-3 flex gap-1">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => void handleAction('approve', r.id)}
                      className="px-2 py-1 rounded border border-green-500/60 text-green-300 text-xs"
                    >
                      Принять
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => void handleAction('reject', r.id)}
                      className="px-2 py-1 rounded border border-red-500/60 text-red-300 text-xs"
                    >
                      Отклонить
                    </button>
                  </td>
                </tr>
              ))}
              {requests.length === 0 ? (
                <tr><td className="py-3 text-text-secondary" colSpan={6}>Нет ожидающих заявок</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {message ? (
        <div className="rounded-xl border border-white/15 bg-white/5 p-3 text-sm text-text-secondary">{message}</div>
      ) : null}
    </div>
  );
}
