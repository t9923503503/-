"use client";

import { useEffect, useState } from 'react';

type PartnerRequestItem = {
  id: string;
  tournamentId: string;
  tournamentName: string;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled' | string;
  createdAt: string;
  requesterName: string;
  recipientName: string;
  direction: 'incoming' | 'outgoing';
};

export default function PartnerInbox() {
  const [items, setItems] = useState<PartnerRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/partner/requests', { cache: 'no-store' });
      const data = await res.json().catch(() => []);
      if (!res.ok) {
        setError(data?.error || 'Не удалось загрузить запросы');
        setItems([]);
        return;
      }
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setError('Ошибка сети');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function respond(id: string, action: 'accept' | 'reject') {
    const res = await fetch(`/api/partner/requests/${id}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    if (res.ok) {
      await load();
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (loading) {
    return (
      <section className="mt-8 glass-panel rounded-2xl p-6 border border-white/10">
        <h2 className="font-heading text-2xl text-text-primary tracking-wide">
          Запросы на пару
        </h2>
        <p className="mt-2 text-text-secondary font-body text-sm">Загрузка...</p>
      </section>
    );
  }

  return (
    <section className="mt-8 glass-panel rounded-2xl p-6 border border-white/10">
      <h2 className="font-heading text-2xl text-text-primary tracking-wide">
        Запросы на пару
      </h2>
      {error ? (
        <p className="mt-2 text-red-300 font-body text-sm">{error}</p>
      ) : null}
      {items.length === 0 ? (
        <p className="mt-2 text-text-secondary font-body text-sm">
          Пока нет запросов.
        </p>
      ) : (
        <div className="mt-4 grid gap-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border border-white/10 bg-surface-light/30 px-4 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-body text-text-primary font-semibold">
                    {item.tournamentName || 'Турнир'}
                  </div>
                  <div className="mt-1 text-xs text-text-secondary font-body">
                    {item.direction === 'incoming'
                      ? `От: ${item.requesterName}`
                      : `Кому: ${item.recipientName}`}
                  </div>
                </div>
                <span className="text-xs rounded-full px-2.5 py-1 bg-white/10 border border-white/15 text-text-secondary font-body">
                  {item.status}
                </span>
              </div>
              {item.direction === 'incoming' && item.status === 'pending' ? (
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void respond(item.id, 'accept')}
                    className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-body font-semibold hover:bg-emerald-500/30"
                  >
                    Подтвердить
                  </button>
                  <button
                    type="button"
                    onClick={() => void respond(item.id, 'reject')}
                    className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/40 text-red-200 text-xs font-body font-semibold hover:bg-red-500/30"
                  >
                    Отклонить
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
