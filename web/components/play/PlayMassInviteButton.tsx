'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

// «Пригласить всех подходящих»: 1 раз на игру, ≤ 20 получателей (TZ §4)
export default function PlayMassInviteButton({ postId }: { postId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function run() {
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/play-posts/${postId}/invites/mass`, { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || 'Не удалось отправить приглашения');
        return;
      }
      setMessage(data.invited ? `Отправлено приглашений: ${data.invited}` : 'Подходящих игроков не нашлось');
      router.refresh();
    } catch {
      setError('Ошибка сети');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button onClick={run} disabled={loading} className="rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2.5 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/20 disabled:opacity-50">
        {loading ? 'Ищу игроков…' : '📣 Пригласить всех подходящих'}
      </button>
      {message ? <p className="mt-2 text-xs text-emerald-200">{message}</p> : null}
      {error ? <p className="mt-2 text-xs text-rose-200">{error}</p> : null}
      <p className="mt-2 text-xs text-text-secondary">Один раз на игру. Уйдёт тем, кто подходит по уровню и свободен или играл с тобой.</p>
    </div>
  );
}
