'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type AttendanceStatus = 'unknown' | 'going' | 'not_going' | 'attended' | 'no_show' | null;

export default function PlayAttendanceButtons({
  postId,
  initialStatus,
}: {
  postId: string;
  initialStatus: AttendanceStatus;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function respond(response: 'going' | 'not_going') {
    setBusy(true);
    setError('');
    try {
      const request = await fetch(`/api/play-posts/${postId}/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response }),
      });
      const data = await request.json().catch(() => ({}));
      if (!request.ok) throw new Error(data.error || 'Не удалось сохранить ответ');
      setStatus(response);
      setConfirmLeave(false);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Ошибка сети');
    } finally {
      setBusy(false);
    }
  }

  if (status === 'not_going') return <p className="text-sm font-semibold text-amber-200">Вы сообщили, что не сможете прийти. Место освобождено.</p>;
  return (
    <div id="attendance" className="scroll-mt-24">
      <p className="text-sm font-semibold text-text-primary">Подтвердите присутствие</p>
      <p className="mt-1 text-xs leading-5 text-text-secondary">Ответ помогает организатору вовремя собрать полный состав.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || status === 'going'}
          onClick={() => void respond('going')}
          className={`min-h-11 rounded-xl px-4 text-sm font-bold disabled:opacity-65 ${status === 'going' ? 'bg-emerald-400/20 text-emerald-100' : 'bg-emerald-500 text-white'}`}
        >
          {status === 'going' ? '✓ Буду' : 'Буду'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirmLeave(true)}
          className="min-h-11 rounded-xl border border-amber-300/30 px-4 text-sm font-bold text-amber-100 disabled:opacity-50"
        >
          Не смогу
        </button>
      </div>
      {confirmLeave ? (
        <div className="mt-3 rounded-xl border border-amber-300/25 bg-amber-300/10 p-3 text-xs text-amber-50">
          <p>Вы выйдете из состава, а место автоматически получит первый игрок из резерва.</p>
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={busy} onClick={() => void respond('not_going')} className="min-h-10 rounded-lg bg-amber-300 px-3 font-bold text-slate-950">Да, освободить место</button>
            <button type="button" disabled={busy} onClick={() => setConfirmLeave(false)} className="min-h-10 rounded-lg border border-white/15 px-3 font-semibold text-text-primary">Оставить участие</button>
          </div>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-xs text-rose-200" role="alert">{error}</p> : null}
    </div>
  );
}
