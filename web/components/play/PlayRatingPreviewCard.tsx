'use client';

import { useEffect, useState } from 'react';

type Preview = { userId: number; ratingBefore: number; delta: number; ratingAfter: number; confidence: number };

export default function PlayRatingPreviewCard({ postId, names }: { postId: string; names: Record<number, string> }) {
  const [rows, setRows] = useState<Preview[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/play-posts/${postId}/rating-preview`, { cache: 'no-store', signal: controller.signal })
      .then((response) => response.ok ? response.json() : [])
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch(() => undefined);
    return () => controller.abort();
  }, [postId]);
  if (!rows.length) return null;
  return (
    <section className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-300/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-black text-text-primary">Изменение игрового рейтинга</h3><span className="text-[11px] text-text-secondary">предварительный расчёт до утверждения</span></div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">{rows.map((row) => <div key={row.userId} className="flex items-center justify-between rounded-xl bg-surface/55 px-3 py-2"><span className="text-sm font-semibold text-text-primary">{names[row.userId] || `Игрок #${row.userId}`}<small className="ml-2 font-normal text-text-secondary">{row.confidence < .35 ? 'новый рейтинг' : 'устоявшийся'}</small></span><strong className={row.delta >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{row.delta >= 0 ? '+' : ''}{row.delta} → {row.ratingAfter}</strong></div>)}</div>
      <p className="mt-3 text-[11px] leading-5 text-text-secondary">Учитываются сила соперников, опыт игрока, повторные встречи одной группы и баланс пар. Турнирный рейтинг не меняется.</p>
    </section>
  );
}

