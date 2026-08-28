'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

// Ответ на приглашение: accept = вход напрямую (confirmed/reserve) (TZ §4)
export default function PlayInviteRespond({ inviteId }: { inviteId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function respond(action: 'accept' | 'decline') {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/play-invites/${inviteId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || 'Не удалось ответить');
        return;
      }
      router.refresh();
    } catch {
      setError('Ошибка сети');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-orange-300/30 bg-orange-300/10 p-4">
      <p className="text-sm font-semibold text-orange-100">Тебя пригласили на эту игру</p>
      {error ? <p className="mt-1 text-xs text-rose-200">{error}</p> : null}
      <div className="mt-3 flex gap-2">
        <button onClick={() => respond('accept')} disabled={loading} className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50">
          Принять
        </button>
        <button onClick={() => respond('decline')} disabled={loading} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-text-secondary">
          Отклонить
        </button>
      </div>
    </div>
  );
}
