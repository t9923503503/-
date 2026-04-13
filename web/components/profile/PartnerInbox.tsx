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

export default function PartnerInbox({ embedded = false }: { embedded?: boolean }) {
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

  const rootClass = embedded
    ? ''
    : 'rounded-xl border border-white/10 bg-surface-light/20 p-4';

  if (loading) {
    return (
      <section className={rootClass}>
        <h3 className="font-heading text-lg text-text-primary tracking-wide">Запросы на пару</h3>
        <p className="mt-1.5 text-sm font-body text-text-secondary">Загрузка...</p>
      </section>
    );
  }

  return (
    <section className={rootClass}>
      <h3 className="font-heading text-lg text-text-primary tracking-wide">Запросы на пару</h3>
      {error ? <p className="mt-1.5 text-sm font-body text-red-300">{error}</p> : null}
      {items.length === 0 ? (
        <p className="mt-1.5 text-sm font-body text-text-secondary">Пока нет запросов.</p>
      ) : (
        <div className="mt-3 grid gap-2.5">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border border-white/10 bg-surface-light/30 px-3.5 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-body text-sm font-semibold text-text-primary">
                    {item.tournamentName || 'Турнир'}
                  </div>
                  <div className="mt-1 text-xs font-body text-text-secondary">
                    {item.direction === 'incoming'
                      ? `От: ${item.requesterName}`
                      : `Кому: ${item.recipientName}`}
                  </div>
                </div>
                <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-body text-text-secondary">
                  {item.status}
                </span>
              </div>
              {item.direction === 'incoming' && item.status === 'pending' ? (
                <div className="mt-2.5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void respond(item.id, 'accept')}
                    className="inline-flex items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-500/20 px-3 py-1.5 text-xs font-body font-semibold text-emerald-300 hover:bg-emerald-500/30"
                  >
                    Подтвердить
                  </button>
                  <button
                    type="button"
                    onClick={() => void respond(item.id, 'reject')}
                    className="inline-flex items-center justify-center rounded-lg border border-red-500/40 bg-red-500/20 px-3 py-1.5 text-xs font-body font-semibold text-red-200 hover:bg-red-500/30"
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
