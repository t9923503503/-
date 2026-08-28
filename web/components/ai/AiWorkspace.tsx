'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

type Job = {
  id: string; kind: 'match' | 'training'; status: string; title: string;
  sourceFileName: string; sourceSizeBytes: number; progressPercent: number;
  progressStage: string; errorMessage: string | null; createdAt: string;
};
type Player = { id: string; name: string };
type Point = { key: string; label: string; x: number; y: number };

const CALIBRATION_STEPS = [
  ['nearLeft', 'Ближний левый угол'], ['nearRight', 'Ближний правый угол'],
  ['farRight', 'Дальний правый угол'], ['farLeft', 'Дальний левый угол'],
  ['netLeft', 'Левый край сетки'], ['netRight', 'Правый край сетки'],
  ['A1', 'Игрок A1'], ['A2', 'Игрок A2'], ['B1', 'Игрок B1'], ['B2', 'Игрок B2'],
] as const;

function statusTone(status: string) {
  if (status === 'review') return 'border-amber-300/40 bg-amber-300/10 text-amber-100';
  if (status === 'failed') return 'border-red-400/40 bg-red-400/10 text-red-100';
  if (status === 'confirmed') return 'border-emerald-400/40 bg-emerald-400/10 text-emerald-100';
  return 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100';
}

async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function checkedJson(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

export default function AiWorkspace() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<'match' | 'training'>('match');
  const [title, setTitle] = useState('');
  const [selectedPlayers, setSelectedPlayers] = useState<Record<string, string>>({});
  const [points, setPoints] = useState<Point[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);

  async function refresh() {
    const response = await fetch('/api/admin/ai/jobs?limit=100', { cache: 'no-store' });
    if (response.ok) setJobs(await response.json());
  }

  useEffect(() => {
    void refresh();
    void fetch('/api/admin/players').then((response) => response.ok ? response.json() : []).then(setPlayers);
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!file) {
      setPreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function selectFile(next: File | null) {
    setFile(next); setPoints([]); setProgress(0);
    setMessage(next
      ? `Файл выбран: ${next.name} · ${(next.size / 1024 / 1024).toFixed(1)} МБ. Можно загружать сразу.`
      : '');
    if (next && !title) setTitle(next.name.replace(/\.[^.]+$/, ''));
  }

  function addPoint(event: React.MouseEvent<HTMLVideoElement>) {
    if (!file || points.length >= CALIBRATION_STEPS.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const [key, label] = CALIBRATION_STEPS[points.length];
    setPoints((current) => [...current, {
      key, label,
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    }]);
  }

  async function upload() {
    if (!file || !title.trim()) return;
    setBusy(true); setMessage('Создаю задание...');
    try {
      const resumeKey = `lp-ai-upload:${file.name}:${file.size}:${file.lastModified}`;
      let session: any = null;
      const saved = localStorage.getItem(resumeKey);
      if (saved) {
        const statusResponse = await fetch(`/api/admin/ai/uploads/${saved}`);
        if (statusResponse.ok) session = await statusResponse.json();
      }
      if (!session || session.status !== 'open') {
        const pointMap = Object.fromEntries(points.map((point) => [point.key, { x: point.x, y: point.y }]));
        const slots = kind === 'match' ? ['A1', 'A2', 'B1', 'B2'] : ['A1'];
        const created = await checkedJson(await fetch('/api/admin/ai/jobs', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind, title: title.trim(), fileName: file.name,
            contentType: file.type || 'application/octet-stream', sizeBytes: file.size,
            calibration: { version: 1, normalized: true, points: pointMap },
            players: slots.map((slot) => {
              const player = players.find((item) => item.id === selectedPlayers[slot]);
              const seed = pointMap[slot];
              return { slot, playerId: player?.id || null, displayName: player?.name || slot,
                seedX: seed?.x ?? null, seedY: seed?.y ?? null };
            }),
          }),
        }));
        session = {
          id: created.upload.id, jobId: created.job.id,
          chunkSizeBytes: created.upload.chunk_size_bytes,
          totalChunks: created.upload.total_chunks, receivedChunks: [], status: 'open',
        };
        localStorage.setItem(resumeKey, session.id);
      }
      const received = new Set<number>((session.receivedChunks || []).map(Number));
      for (let index = 0; index < session.totalChunks; index += 1) {
        if (received.has(index)) continue;
        const start = index * session.chunkSizeBytes;
        const chunk = file.slice(start, Math.min(file.size, start + session.chunkSizeBytes));
        setMessage(`Загрузка части ${index + 1} из ${session.totalChunks}`);
        const hash = await sha256(chunk);
        let lastError: unknown;
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          try {
            await checkedJson(await fetch(`/api/admin/ai/uploads/${session.id}/chunks/${index}`, {
              method: 'PUT', headers: { 'Content-Type': 'application/octet-stream', 'X-Chunk-SHA256': hash }, body: chunk,
            }));
            lastError = null; break;
          } catch (error) { lastError = error; await new Promise((resolve) => setTimeout(resolve, attempt * 700)); }
        }
        if (lastError) throw lastError;
        setProgress(Math.round(((index + 1) / session.totalChunks) * 100));
      }
      setMessage('Проверяю и собираю файл...');
      await checkedJson(await fetch(`/api/admin/ai/uploads/${session.id}/complete`, { method: 'POST' }));
      localStorage.removeItem(resumeKey);
      setMessage('Задание поставлено в очередь AI.');
      setFile(null); setPoints([]); setProgress(100); await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Загрузка не удалась');
    } finally { setBusy(false); }
  }

  const nextStep = CALIBRATION_STEPS[points.length];
  return (
    <div className="space-y-6">
      <header className="overflow-hidden rounded-3xl border border-cyan-200/20 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,.22),transparent_34%),linear-gradient(135deg,rgba(8,20,31,.98),rgba(15,23,42,.9))] p-5 md:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.32em] text-cyan-200">Private video intelligence</p>
        <h2 className="mt-3 font-heading text-5xl leading-none md:text-7xl">LPVolley AI</h2>
        <p className="mt-4 max-w-2xl text-sm text-slate-300 md:text-base">Матчи, тренировки и доказуемая аналитика. AI готовит черновик, решение остается за человеком.</p>
      </header>

      <section className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
        <div className="rounded-3xl border border-white/15 bg-white/[.05] p-4 md:p-6">
          <div className="flex flex-wrap gap-2">
            {(['match', 'training'] as const).map((value) => <button key={value} type="button" onClick={() => setKind(value)} className={`rounded-full px-4 py-2 text-sm font-bold ${kind === value ? 'bg-cyan-300 text-slate-950' : 'border border-white/15 text-slate-300'}`}>{value === 'match' ? 'Матч 2x2' : 'Тренировка'}</button>)}
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <label className="text-sm text-slate-300">Название<input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 w-full rounded-xl border border-white/15 bg-slate-950/60 px-3 py-3 text-white" /></label>
            <label className="text-sm text-slate-300">Видео MOV/MP4<input type="file" accept="video/quicktime,video/mp4,.mov,.mp4" onChange={(event) => selectFile(event.target.files?.[0] || null)} className="mt-1 block w-full rounded-xl border border-dashed border-cyan-300/30 bg-cyan-300/5 px-3 py-2 text-sm" /></label>
          </div>
          {kind === 'match' ? <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">{['A1','A2','B1','B2'].map((slot) => <label key={slot} className="text-xs text-slate-400">{slot}<select value={selectedPlayers[slot] || ''} onChange={(event) => setSelectedPlayers((state) => ({ ...state, [slot]: event.target.value }))} className="mt-1 w-full rounded-lg border border-white/15 bg-slate-950 px-2 py-2 text-white"><option value="">Без профиля</option>{players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>)}</div> : null}
          <div className="mt-5 grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center"><button type="button" disabled={!file || !title.trim() || busy} onClick={() => void upload()} className="min-h-12 w-full rounded-xl bg-orange-400 px-5 py-3 font-black text-slate-950 disabled:opacity-40 sm:w-auto">{busy ? 'Загрузка...' : 'Загрузить видео в AI'}</button><div className="min-w-0 flex-1"><div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-cyan-300 transition-all" style={{ width: `${progress}%` }} /></div><p aria-live="polite" className="mt-2 break-words text-sm text-slate-300">{message || 'Сначала выберите MOV или MP4.'}</p></div></div>
          {file ? <details className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-3">
            <summary className="cursor-pointer font-bold text-cyan-100">Калибровка площадки и игроков <span className="font-normal text-slate-400">(необязательно)</span></summary>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">Без калибровки AI выполнит базовый трекинг мяча. Точки нужны для сторон площадки, приземлений и привязки четырех игроков.</p>
            <div className="mt-3">
              <div className="mb-2 flex items-center justify-between gap-3 text-sm"><span>{nextStep ? `Нажмите на видео: ${nextStep[1]}` : 'Калибровка заполнена'}</span><button type="button" onClick={() => setPoints([])} className="text-cyan-200">Сбросить</button></div>
              <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-black">
                <video ref={videoRef} src={previewUrl} muted playsInline controls onClick={addPoint} className="aspect-video w-full object-contain" />
                <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1000 1000" preserveAspectRatio="none">{points.map((point, index) => <g key={point.key}><circle cx={point.x*1000} cy={point.y*1000} r="14" fill={index >= 6 ? '#fb923c' : '#67e8f9'} stroke="#08141f" strokeWidth="5" /><text x={point.x*1000+18} y={point.y*1000-18} fill="white" fontSize="32">{point.key}</text></g>)}</svg>
              </div>
            </div>
          </details> : null}
        </div>
        <aside className="rounded-3xl border border-orange-300/20 bg-orange-300/[.06] p-5"><p className="text-xs font-bold uppercase tracking-[.25em] text-orange-200">Съемка</p><h3 className="mt-3 font-heading text-3xl">Качество важнее скорости</h3><ul className="mt-4 space-y-3 text-sm text-slate-300"><li>Горизонтально, без Telegram-сжатия.</li><li>Матч: вся площадка и четыре игрока.</li><li>Техника: 1080p/60 FPS и заданный ракурс.</li><li>Низкая уверенность всегда уходит на проверку.</li></ul></aside>
      </section>

      <section><div className="flex items-end justify-between"><div><p className="text-xs uppercase tracking-[.25em] text-slate-400">Queue</p><h3 className="font-heading text-4xl">Задания</h3></div><button onClick={() => void refresh()} className="text-sm text-cyan-200">Обновить</button></div><div className="mt-4 grid gap-3">{jobs.map((job) => <Link key={job.id} href={`/admin/ai/${job.id}`} className="group grid gap-3 rounded-2xl border border-white/10 bg-white/[.04] p-4 transition hover:border-cyan-300/40 md:grid-cols-[1fr_auto] md:items-center"><div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2 py-1 text-xs font-bold ${statusTone(job.status)}`}>{job.status}</span><span className="text-xs uppercase tracking-wider text-slate-500">{job.kind}</span></div><h4 className="mt-2 text-lg font-bold group-hover:text-cyan-100">{job.title}</h4><p className="text-xs text-slate-400">{job.sourceFileName} · {(job.sourceSizeBytes/1024/1024).toFixed(1)} MB</p>{job.errorMessage ? <p className="mt-1 text-xs text-red-300">{job.errorMessage}</p> : null}</div><div className="w-full md:w-52"><div className="flex justify-between text-xs text-slate-400"><span>{job.progressStage}</span><span>{Math.round(job.progressPercent)}%</span></div><div className="mt-2 h-2 rounded-full bg-white/10"><div className="h-2 rounded-full bg-gradient-to-r from-cyan-300 to-orange-400" style={{ width: `${job.progressPercent}%` }} /></div></div></Link>)}{!jobs.length ? <p className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-slate-400">Очередь пуста</p> : null}</div></section>
    </div>
  );
}
