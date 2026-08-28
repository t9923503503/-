'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function PlayGuestClaimClient({ participantId, token }: { participantId: string; token: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [postId, setPostId] = useState('');
  const returnTo = `/play/claim?participant=${encodeURIComponent(participantId)}&token=${encodeURIComponent(token)}`;

  async function claim() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/play-participants/${participantId}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || 'Не удалось привязать участие');
        return;
      }
      setPostId(String(data.postId || ''));
    } catch {
      setError('Ошибка сети. Попробуйте ещё раз.');
    } finally {
      setLoading(false);
    }
  }

  if (postId) {
    return (
      <div className="rounded-2xl border border-emerald-300/25 bg-emerald-300/10 p-5 text-center">
        <div className="text-3xl" aria-hidden>✓</div>
        <h2 className="mt-2 text-xl font-black text-text-primary">Участие привязано</h2>
        <p className="mt-1 text-sm text-text-secondary">Игра и результат теперь будут отображаться в вашем кабинете.</p>
        <Link href={`/partner/${postId}`} className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-brand px-5 text-sm font-semibold text-white">Открыть игру</Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-card p-5">
      <p className="text-sm leading-6 text-text-secondary">Войдите в свой аккаунт LPVOLLEY и подтвердите, что указанное гостевое место принадлежит вам.</p>
      {error ? <p className="mt-3 text-sm text-rose-200" role="alert">{error}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={loading} onClick={() => void claim()} className="min-h-11 rounded-xl bg-brand px-5 text-sm font-semibold text-white disabled:opacity-60">{loading ? 'Привязываем…' : 'Это моё участие'}</button>
        <Link href={`/login?returnTo=${encodeURIComponent(returnTo)}`} className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-4 text-sm font-semibold text-text-primary">Войти или зарегистрироваться</Link>
      </div>
    </div>
  );
}
