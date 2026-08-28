'use client';

import { useEffect, useState } from 'react';

type ResultRow = { id: string; postId: string; title: string; status: string; createdAt: string; enteredBy: string; ratedPlayers: number; ratingMovement: number; reversalReason: string };

export default function AdminPlayResults({ canReverse }: { canReverse: boolean }) {
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [openId, setOpenId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const load = async () => { const response = await fetch('/api/admin/play-results', { cache: 'no-store' }); if (response.ok) setRows(await response.json()); };
  useEffect(() => { void load(); }, []);
  async function reverse(id: string) {
    setError('');
    const response = await fetch(`/api/admin/play-results/${id}/reverse`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setError(body.error || 'Не удалось отменить результат'); return; }
    setOpenId(''); setReason(''); await load();
  }
  return <section className="rounded-2xl border border-white/10 bg-white/5 p-5"><h2 className="font-heading text-3xl text-text-primary">Результаты обычных игр</h2><p className="mt-1 text-sm text-text-secondary">Начисления игрового рейтинга и безопасная отмена ошибочных результатов.</p>{error ? <p className="mt-3 text-sm text-red-200">{error}</p> : null}<div className="mt-5 grid gap-2">{rows.map((row) => <div key={row.id} className="rounded-xl border border-white/10 bg-surface/60 p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><a href={`/partner/${row.postId}`} className="font-semibold text-text-primary hover:text-brand">{row.title}</a><p className="mt-1 text-xs text-text-secondary">{new Date(row.createdAt).toLocaleDateString('ru-RU')} · внёс {row.enteredBy} · {row.ratedPlayers} игроков</p></div><div className="flex items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs ${row.status === 'confirmed' ? 'bg-emerald-400/15 text-emerald-200' : row.status === 'cancelled' ? 'bg-slate-400/15 text-slate-200' : 'bg-amber-300/15 text-amber-100'}`}>{row.status === 'confirmed' ? `Подтверждён · движение ${row.ratingMovement}` : row.status === 'cancelled' ? 'Аннулирован' : row.status}</span>{canReverse && row.status === 'confirmed' ? <button onClick={() => setOpenId(openId === row.id ? '' : row.id)} className="rounded-lg border border-red-300/25 px-3 py-1.5 text-xs text-red-200">Отменить</button> : null}</div></div>{row.status === 'cancelled' && row.reversalReason ? <p className="mt-2 text-xs text-text-secondary">Причина: {row.reversalReason}</p> : null}{openId === row.id ? <div className="mt-3 flex flex-col gap-2 border-t border-white/10 pt-3 sm:flex-row"><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Причина отмены начисления" className="flex-1 rounded-lg border border-white/15 bg-surface px-3 py-2 text-sm" /><button onClick={() => void reverse(row.id)} disabled={reason.trim().length < 5} className="rounded-lg bg-red-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">Подтвердить отмену</button></div> : null}</div>)}</div></section>;
}
