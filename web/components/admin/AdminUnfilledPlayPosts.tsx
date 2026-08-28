'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatPlayDate, formatPlayTime } from '@/lib/play-ui';

type UnfilledPlayPost = {
  id: string;
  title: string;
  status: 'draft' | 'published' | 'cancelled' | 'completed';
  startsAt: string;
  endsAt: string;
  organizerName: string;
  capacity: number;
  confirmedCount: number;
  participantCount: number;
  inviteCount: number;
  liveCommandCount: number;
};

const STATUS_LABELS: Record<UnfilledPlayPost['status'], string> = {
  draft: 'Черновик',
  published: 'Прошла без счёта',
  cancelled: 'Отменена',
  completed: 'Завершена без счёта',
};

export default function AdminUnfilledPlayPosts({ canDelete }: { canDelete: boolean }) {
  const [rows, setRows] = useState<UnfilledPlayPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState('');
  const [reason, setReason] = useState('');
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/play-posts', { cache: 'no-store' });
      const body = await response.json().catch(() => []);
      if (!response.ok) throw new Error(body.error || 'Не удалось загрузить игры без результата');
      setRows(Array.isArray(body) ? body : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить игры без результата');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function toggleDelete(id: string) {
    setOpenId((current) => current === id ? '' : id);
    setReason('');
    setError('');
    setMessage('');
  }

  async function remove(post: UnfilledPlayPost) {
    if (busyId || reason.trim().length < 5) return;
    setBusyId(post.id);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/admin/play-posts/${post.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Не удалось удалить игру');
      setRows((current) => current.filter((item) => item.id !== post.id));
      setOpenId('');
      setReason('');
      setMessage(`Игра «${post.title}» удалена.`);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Не удалось удалить игру');
    } finally {
      setBusyId('');
    }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-5" aria-labelledby="unfilled-play-title">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="unfilled-play-title" className="font-heading text-3xl text-text-primary">Игры без результата</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-text-secondary">
            Здесь только прошедшие, отменённые игры и черновики без счёта. Будущие опубликованные и активные live-игры защищены от удаления.
          </p>
        </div>
        {!loading ? <span className="w-fit rounded-full bg-white/5 px-2.5 py-1 text-xs font-semibold text-text-secondary">{rows.length}</span> : null}
      </div>

      {!canDelete ? <p className="mt-3 text-xs text-text-secondary">Удаление доступно только роли администратора.</p> : null}
      {error ? <p className="mt-3 text-sm text-red-200" role="alert">{error}</p> : null}
      {message ? <p className="mt-3 text-sm text-emerald-200" role="status">{message}</p> : null}

      {loading ? (
        <p className="mt-5 text-sm text-text-secondary" role="status">Загружаем список…</p>
      ) : rows.length ? (
        <div className="mt-5 grid gap-2.5">
          {rows.map((post) => {
            const confirming = openId === post.id;
            return (
              <article key={post.id} className="rounded-xl border border-white/10 bg-surface/60 p-3.5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/partner/${post.id}`} className="font-semibold text-text-primary hover:text-brand hover:underline">{post.title}</Link>
                      <span className="rounded-full bg-amber-300/10 px-2 py-0.5 text-[11px] font-semibold text-amber-200">{STATUS_LABELS[post.status]}</span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-text-secondary">
                      {formatPlayDate(post.startsAt, { day: 'numeric', month: 'short', year: 'numeric' })} · {formatPlayTime(post.startsAt)} · {post.organizerName} · состав {post.confirmedCount}/{post.capacity}
                    </p>
                    <p className="mt-0.5 text-[11px] text-text-secondary">
                      Активных записей: {post.participantCount} · приглашений: {post.inviteCount}{post.liveCommandCount ? ` · live-команд: ${post.liveCommandCount}` : ''}
                    </p>
                  </div>
                  {canDelete ? (
                    <button
                      type="button"
                      aria-expanded={confirming}
                      aria-controls={`delete-unfilled-play-${post.id}`}
                      onClick={() => toggleDelete(post.id)}
                      className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg border border-red-300/25 px-3 text-xs font-semibold text-red-200 hover:bg-red-300/10"
                    >
                      Удалить
                    </button>
                  ) : null}
                </div>

                {confirming ? (
                  <div id={`delete-unfilled-play-${post.id}`} className="mt-3 rounded-xl border border-red-300/25 bg-red-300/10 p-3" role="alert">
                    <p className="text-sm font-semibold text-red-100">Удалить «{post.title}» без возможности восстановления?</p>
                    <p className="mt-1 text-xs leading-5 text-red-100/75">Удалятся заявки, приглашения и незавершённые live-данные этой игры. Игры с сохранённым результатом сервер не удалит.</p>
                    <label className="mt-3 block text-xs font-semibold text-red-100">
                      Причина удаления
                      <input
                        autoFocus
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder="Например: тестовая или дублирующая игра"
                        className="mt-1.5 w-full rounded-lg border border-red-200/25 bg-surface px-3 py-2.5 text-sm text-text-primary outline-none focus:border-red-200/60"
                      />
                    </label>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busyId === post.id || reason.trim().length < 5}
                        onClick={() => void remove(post)}
                        className="min-h-10 rounded-lg bg-red-500 px-3 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {busyId === post.id ? 'Удаляем…' : 'Да, удалить игру'}
                      </button>
                      <button type="button" disabled={busyId === post.id} onClick={() => toggleDelete(post.id)} className="min-h-10 rounded-lg border border-white/15 px-3 text-xs font-semibold text-text-primary disabled:opacity-50">
                        Оставить игру
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-dashed border-white/10 p-5 text-sm text-text-secondary">Игр без результата для очистки сейчас нет.</div>
      )}
    </section>
  );
}
