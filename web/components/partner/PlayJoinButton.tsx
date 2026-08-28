'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { PlayParticipantStatus } from '@/lib/play-core';
import { PLAY_STATUS_LABELS } from '@/lib/play-ui';

export default function PlayJoinButton({
  postId,
  initialStatus,
  authenticated,
  joinPolicy,
  returnTo,
  compact = false,
}: {
  postId: string;
  initialStatus: PlayParticipantStatus | null;
  authenticated: boolean;
  joinPolicy: 'request' | 'open' | 'closed';
  returnTo?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [sessionDetected, setSessionDetected] = useState(authenticated);
  const [checkingSession, setCheckingSession] = useState(!authenticated);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const active = status === 'pending' || status === 'confirmed' || status === 'reserve';
  const baseClass = compact
    ? 'rounded-xl px-3 py-2 text-xs'
    : 'rounded-2xl px-5 py-3 text-sm';

  useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);

  useEffect(() => {
    if (authenticated) {
      setSessionDetected(true);
      setCheckingSession(false);
      return;
    }

    const controller = new AbortController();
    void fetch('/api/auth/me', { cache: 'no-store', signal: controller.signal })
      .then((response) => {
        if (!response.ok) return;
        setSessionDetected(true);
        router.refresh();
      })
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) setCheckingSession(false);
      });
    return () => controller.abort();
  }, [authenticated, router]);

  if (joinPolicy === 'closed') {
    return <span className={`${baseClass} border border-amber-300/30 bg-amber-300/10 font-semibold text-amber-100`}>Запись через организатора</span>;
  }
  if (sessionDetected && !authenticated) {
    return <span className={`${baseClass} border border-cyan-300/20 bg-cyan-300/10 font-semibold text-cyan-100`}>Обновляем статус записи…</span>;
  }
  if (!sessionDetected) {
    return (
      <Link
        href={`/login?returnTo=${encodeURIComponent(returnTo ?? `/partner/${postId}`)}`}
        prefetch={false}
        className={`${baseClass} inline-flex items-center justify-center bg-brand font-semibold text-white transition hover:brightness-110`}
      >
        {checkingSession ? 'Проверяем вход…' : 'Войти и записаться'}
      </Link>
    );
  }

  async function submit() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/play-posts/${postId}/join`, {
        method: active ? 'DELETE' : 'POST',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || 'Не удалось изменить запись');
        return;
      }
      const nextStatus = active
        ? 'cancelled'
        : (['pending', 'confirmed', 'reserve'].includes(String(data.status))
            ? (data.status as PlayParticipantStatus)
            : 'pending');
      setStatus(nextStatus);
      router.refresh();
    } catch {
      setError('Ошибка сети');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        disabled={loading}
        onClick={() => void submit()}
        className={`${baseClass} inline-flex items-center justify-center border font-semibold transition disabled:opacity-60 ${
          active
            ? 'border-white/15 bg-white/5 text-text-secondary hover:border-red-300/40 hover:text-red-200'
            : 'border-brand bg-brand text-white hover:brightness-110'
        }`}
      >
        {loading ? 'Сохраняем…' : active ? `${PLAY_STATUS_LABELS[status]} · отменить` : 'Подать заявку'}
      </button>
      {error ? <span className="max-w-xs text-xs text-red-300">{error}</span> : null}
    </div>
  );
}
