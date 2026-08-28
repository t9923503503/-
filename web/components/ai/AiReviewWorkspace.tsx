'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

type Rally = {
  id: string; rallyNo: number; startSec: number; endSec: number;
  winnerTeam: 'A' | 'B' | null; confidence: number; reviewStatus: string;
};
type Detail = {
  job: { id: string; title: string; kind: string; status: string; progressStage: string; result: any };
  players: Array<{ slot: string; displayName: string }>;
  rallies: Rally[];
  events: Array<{ id: string; eventType: string; eventTimeSec: number; outcome: string | null; confidence: number; reviewStatus: string }>;
  artifacts: Array<{ id: string; kind: string; url: string; fileName: string }>;
};

async function json(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

export default function AiReviewWorkspace({ jobId }: { jobId: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [message, setMessage] = useState('');
  const video = useRef<HTMLVideoElement>(null);

  async function refresh() {
    try { setDetail(await json(await fetch(`/api/admin/ai/jobs/${jobId}`, { cache: 'no-store' }))); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Не удалось загрузить анализ'); }
  }
  useEffect(() => { void refresh(); }, [jobId]);

  function seek(time: number) {
    if (!video.current) return;
    video.current.currentTime = Math.max(0, time); void video.current.play();
  }

  async function saveRally(rally: Rally, patch: Partial<Rally>) {
    setMessage(`Сохраняю розыгрыш ${rally.rallyNo}...`);
    try {
      await json(await fetch(`/api/admin/ai/jobs/${jobId}/rallies/${rally.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      }));
      await refresh(); setMessage('Исправление сохранено в обучающую разметку.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Ошибка сохранения'); }
  }

  async function confirm() {
    if (!window.confirm('Подтвердить анализ и удалить исходное видео и proxy? Это действие необратимо.')) return;
    try {
      await json(await fetch(`/api/admin/ai/jobs/${jobId}/confirm`, { method: 'POST' }));
      await refresh(); setMessage('Анализ подтвержден, временные видео удалены.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Ошибка подтверждения'); }
  }

  if (!detail) return <div className="rounded-2xl border border-white/10 p-8 text-slate-300">{message || 'Загрузка анализа...'}</div>;
  const proxy = detail.artifacts.find((artifact) => artifact.kind === 'proxy') || detail.artifacts.find((artifact) => artifact.kind === 'diagnostic');
  const reviewCount = detail.rallies.filter((rally) => rally.reviewStatus === 'review').length + detail.events.filter((event) => event.reviewStatus === 'review').length;
  return <div className="space-y-6">
    <header className="rounded-3xl border border-white/15 bg-[linear-gradient(120deg,rgba(6,182,212,.14),rgba(251,146,60,.08))] p-5">
      <Link href="/admin/ai" className="text-sm text-cyan-200">← Все задания</Link>
      <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><p className="text-xs uppercase tracking-[.25em] text-slate-400">{detail.job.kind} · {detail.job.status}</p><h2 className="font-heading text-5xl leading-none">{detail.job.title}</h2><p className="mt-2 text-sm text-slate-300">На проверке: {reviewCount}. AI ничего не публикует автоматически.</p></div>{detail.job.status === 'review' ? <button onClick={() => void confirm()} className="rounded-xl border border-emerald-300/40 bg-emerald-300/10 px-4 py-3 font-bold text-emerald-100">Подтвердить и удалить видео</button> : null}</div>
      {message ? <p className="mt-3 rounded-xl bg-black/20 px-3 py-2 text-sm text-slate-200">{message}</p> : null}
    </header>

    <section className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
      <div className="overflow-hidden rounded-3xl border border-white/15 bg-black">{proxy ? <video ref={video} src={proxy.url} controls playsInline className="aspect-video w-full object-contain" /> : <div className="grid aspect-video place-items-center p-6 text-center text-slate-400">Proxy появится после обработки worker-ом.</div>}</div>
      <aside className="rounded-3xl border border-white/10 bg-white/[.04] p-5"><p className="text-xs uppercase tracking-[.2em] text-slate-400">Состав</p><div className="mt-3 grid grid-cols-2 gap-2">{detail.players.map((player) => <div key={player.slot} className="rounded-xl border border-white/10 p-3"><span className="text-xs text-cyan-200">{player.slot}</span><p className="font-bold">{player.displayName}</p></div>)}</div><p className="mt-5 text-xs uppercase tracking-[.2em] text-slate-400">Модель</p><p className="mt-2 break-all text-sm text-slate-300">{detail.job.result?.model || detail.job.result?.ball_backend || 'ожидается'}</p></aside>
    </section>

    <section><div className="flex items-end justify-between"><div><p className="text-xs uppercase tracking-[.22em] text-orange-200">Review timeline</p><h3 className="font-heading text-4xl">Розыгрыши</h3></div><span className="text-sm text-slate-400">{detail.rallies.length} найдено</span></div><div className="mt-4 grid gap-3">{detail.rallies.map((rally) => <RallyEditor key={rally.id} rally={rally} onSeek={seek} onSave={saveRally} />)}{!detail.rallies.length ? <p className="rounded-2xl border border-dashed border-white/15 p-6 text-slate-400">Розыгрыши пока не рассчитаны.</p> : null}</div></section>

    <section><p className="text-xs uppercase tracking-[.22em] text-cyan-200">Evidence</p><h3 className="font-heading text-4xl">События</h3><div className="mt-4 overflow-x-auto rounded-2xl border border-white/10"><table className="w-full min-w-[680px] text-sm"><thead className="bg-white/[.06] text-left text-slate-400"><tr><th className="p-3">Время</th><th className="p-3">Тип</th><th className="p-3">Результат</th><th className="p-3">Уверенность</th><th className="p-3">Статус</th></tr></thead><tbody>{detail.events.map((event) => <tr key={event.id} onClick={() => seek(event.eventTimeSec)} className="cursor-pointer border-t border-white/10 hover:bg-white/[.04]"><td className="p-3 font-mono">{event.eventTimeSec.toFixed(2)}</td><td className="p-3 font-bold">{event.eventType}</td><td className="p-3">{event.outcome || '—'}</td><td className="p-3">{Math.round(event.confidence*100)}%</td><td className="p-3">{event.reviewStatus}</td></tr>)}</tbody></table></div></section>
  </div>;
}

function RallyEditor({ rally, onSeek, onSave }: { rally: Rally; onSeek: (time: number) => void; onSave: (rally: Rally, patch: Partial<Rally>) => Promise<void> }) {
  const [startSec, setStartSec] = useState(String(rally.startSec));
  const [endSec, setEndSec] = useState(String(rally.endSec));
  const [winnerTeam, setWinnerTeam] = useState(rally.winnerTeam || '');
  useEffect(() => { setStartSec(String(rally.startSec)); setEndSec(String(rally.endSec)); setWinnerTeam(rally.winnerTeam || ''); }, [rally]);
  return <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/[.035] p-4 md:grid-cols-[auto_1fr_auto] md:items-center"><button onClick={() => onSeek(rally.startSec)} className="grid h-12 w-12 place-items-center rounded-full bg-cyan-300 font-black text-slate-950">▶</button><div><div className="flex flex-wrap items-center gap-2"><span className="font-heading text-2xl">#{rally.rallyNo}</span><span className="rounded-full border border-white/10 px-2 py-1 text-xs">AI {Math.round(rally.confidence*100)}%</span><span className="text-xs text-slate-400">{rally.reviewStatus}</span></div><div className="mt-2 flex flex-wrap gap-2"><label className="text-xs text-slate-400">Начало<input value={startSec} onChange={(event) => setStartSec(event.target.value)} className="ml-2 w-20 rounded-lg bg-slate-950 px-2 py-1 text-white" /></label><label className="text-xs text-slate-400">Конец<input value={endSec} onChange={(event) => setEndSec(event.target.value)} className="ml-2 w-20 rounded-lg bg-slate-950 px-2 py-1 text-white" /></label><label className="text-xs text-slate-400">Победитель<select value={winnerTeam} onChange={(event) => setWinnerTeam(event.target.value)} className="ml-2 rounded-lg bg-slate-950 px-2 py-1 text-white"><option value="">Review</option><option value="A">A</option><option value="B">B</option></select></label></div></div><div className="flex gap-2"><button onClick={() => void onSave(rally, { startSec: Number(startSec), endSec: Number(endSec), winnerTeam: (winnerTeam || null) as any, reviewStatus: 'confirmed' as any })} className="rounded-xl bg-orange-400 px-4 py-2 font-bold text-slate-950">Принять</button><button onClick={() => void onSave(rally, { reviewStatus: 'rejected' as any })} className="rounded-xl border border-white/15 px-3 py-2 text-slate-300">Отклонить</button></div></div>;
}
