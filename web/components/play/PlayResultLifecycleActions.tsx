'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface CorrectionRequest {
  id: string;
  revision: number;
  requestedByUserId: number;
  comment: string;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  resolutionComment: string;
  createdAt: string;
  resolvedAt: string | null;
}

interface PlayResultLifecycleActionsProps {
  resultId: string;
  revision: number;
  status: string;
  isManager: boolean;
  isParticipant: boolean;
  approvalBlocker?: string | null;
  correctionRequests?: CorrectionRequest[];
  viewerUserId?: number | null;
}

export default function PlayResultLifecycleActions({
  resultId,
  revision,
  status,
  isManager,
  isParticipant,
  approvalBlocker,
  correctionRequests = [],
  viewerUserId,
}: PlayResultLifecycleActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionComment, setCorrectionComment] = useState('');

  async function approve() {
    setBusy('approve');
    setError('');
    try {
      const response = await fetch(`/api/play-results/${resultId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedRevision: revision }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Не удалось утвердить результат');
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Ошибка сети');
    } finally {
      setBusy('');
    }
  }

  async function requestCorrection() {
    if (correctionComment.trim().length < 3) {
      setError('Коротко опишите, что нужно исправить');
      return;
    }
    setBusy('request');
    setError('');
    try {
      const response = await fetch(`/api/play-results/${resultId}/correction-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedRevision: revision, comment: correctionComment }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Не удалось отправить сообщение');
      setCorrectionOpen(false);
      setCorrectionComment('');
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Ошибка сети');
    } finally {
      setBusy('');
    }
  }

  async function resolveCorrection(requestId: string, decision: 'accept' | 'reject') {
    setBusy(`${decision}:${requestId}`);
    setError('');
    try {
      const response = await fetch(`/api/play-results/${resultId}/correction-requests/${requestId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedRevision: revision, decision }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Не удалось обработать запрос');
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Ошибка сети');
    } finally {
      setBusy('');
    }
  }

  const pendingCorrections = correctionRequests.filter((request) => request.status === 'pending');

  return (
    <div className="mt-4 grid gap-3">
      {status === 'pending' && isManager ? (
        <div className="rounded-xl border border-amber-300/25 bg-amber-300/10 p-3">
          <p className="text-sm font-semibold text-amber-100">Счёт предложен участником и ждёт вашего решения.</p>
          {approvalBlocker ? <p className="mt-1 text-xs text-amber-100/80">{approvalBlocker}</p> : null}
          <button
            type="button"
            disabled={Boolean(busy) || Boolean(approvalBlocker)}
            onClick={() => void approve()}
            className="mt-3 min-h-11 rounded-xl bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy === 'approve' ? 'Утверждаем…' : 'Утвердить счёт'}
          </button>
        </div>
      ) : null}

      {status === 'pending' && isParticipant && !isManager ? (
        <p className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-3 text-xs text-amber-100">Счёт отправлен организатору. После проверки он станет официальным.</p>
      ) : null}

      {status === 'confirmed' && isParticipant && !pendingCorrections.some((request) => request.requestedByUserId === viewerUserId) ? (
        <div>
          {!correctionOpen ? (
            <button type="button" onClick={() => setCorrectionOpen(true)} className="min-h-10 rounded-xl border border-white/15 px-3 text-xs font-semibold text-text-primary">Есть ошибка</button>
          ) : (
            <div className="rounded-xl border border-rose-300/20 bg-rose-300/5 p-3">
              <label className="text-xs font-semibold text-text-primary">Что нужно исправить?
                <textarea value={correctionComment} onChange={(event) => setCorrectionComment(event.target.value)} maxLength={500} className="mt-2 min-h-20 w-full rounded-xl border border-white/10 bg-surface p-3 text-sm text-text-primary outline-none focus:border-rose-300/50" />
              </label>
              <div className="mt-2 flex gap-2">
                <button type="button" disabled={Boolean(busy)} onClick={() => void requestCorrection()} className="min-h-10 rounded-lg bg-rose-500 px-3 text-xs font-semibold text-white">Отправить организатору</button>
                <button type="button" onClick={() => setCorrectionOpen(false)} className="min-h-10 rounded-lg border border-white/15 px-3 text-xs font-semibold text-text-primary">Отмена</button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {isManager && pendingCorrections.map((request) => (
        <article key={request.id} className="rounded-xl border border-rose-300/25 bg-rose-300/5 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-rose-200">Запрос исправления</p>
          <p className="mt-1 text-sm text-text-primary">{request.comment}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={Boolean(busy)} onClick={() => void resolveCorrection(request.id, 'accept')} className="min-h-10 rounded-lg bg-rose-500 px-3 text-xs font-semibold text-white">Принять и исправить</button>
            <button type="button" disabled={Boolean(busy)} onClick={() => void resolveCorrection(request.id, 'reject')} className="min-h-10 rounded-lg border border-white/15 px-3 text-xs font-semibold text-text-primary">Отклонить</button>
          </div>
        </article>
      ))}

      {error ? <p className="text-xs text-rose-200" role="alert">{error}</p> : null}
    </div>
  );
}
