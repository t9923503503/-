'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CoachVideoOptions } from '@/lib/coach/video-types';

const field='mt-1 min-h-12 w-full rounded-xl border border-white/12 bg-[#0b111b] px-3 text-sm text-white outline-none focus:border-orange-400';

export default function CreateVideoAssetForm({options}:{options:CoachVideoOptions}){
  const router=useRouter();const [pending,setPending]=useState(false);const [error,setError]=useState('');
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setPending(true);setError('');const form=new FormData(event.currentTarget);const payload=Object.fromEntries(form.entries()) as Record<string,unknown>;payload.durationMs=payload.durationSeconds?Number(payload.durationSeconds)*1000:null;delete payload.durationSeconds;const response=await fetch('/api/coach/media',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const result=await response.json().catch(()=>({})) as {error?:string;asset?:{id:string}};setPending(false);if(!response.ok||!result.asset){setError(result.error||'Не удалось добавить видео');return;}router.push(`/coach/media/${result.asset.id}`);router.refresh();}
  return <form onSubmit={submit} className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
    <label className="text-xs font-bold text-slate-400 md:col-span-2">Название<input name="title" required minLength={3} maxLength={160} placeholder="Приём Маши — боковой ветер" className={field}/></label>
    <label className="text-xs font-bold text-slate-400">Источник<select name="source" defaultValue="own_video" className={field}><option value="own_video">Моё видео</option><option value="youtube">YouTube</option><option value="instagram">Instagram</option><option value="telegram">Telegram</option><option value="upload">Загруженный файл</option><option value="other">Другое</option></select></label>
    <label className="text-xs font-bold text-slate-400">Длительность, сек<input name="durationSeconds" type="number" min="0" max="86400" placeholder="45" className={field}/></label>
    <label className="text-xs font-bold text-slate-400 md:col-span-2">Ссылка на видео<input name="originalUrl" type="url" required placeholder="https://…" className={field}/></label>
    <label className="text-xs font-bold text-slate-400">Ученик<select name="athleteId" defaultValue="" className={field}><option value="">Без привязки</option>{options.athletes.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label className="text-xs font-bold text-slate-400">Дата съёмки<input name="recordedAt" type="datetime-local" className={field}/></label>
    <label className="text-xs font-bold text-slate-400 md:col-span-2">Тренировка<select name="trainingSessionId" defaultValue="" className={field}><option value="">Без привязки</option>{options.sessions.map((item)=><option key={item.id} value={item.id}>{new Date(item.startsAt).toLocaleDateString('ru-RU')} · {item.title}</option>)}</select></label>
    <label className="text-xs font-bold text-slate-400 md:col-span-2">Упражнение<select name="exerciseId" defaultValue="" className={field}><option value="">Без привязки</option>{options.exercises.map((item)=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
    <label className="text-xs font-bold text-slate-400 md:col-span-2">Теги<input name="tags" placeholder="приём, турнир, до" className={field}/></label>
    <label className="text-xs font-bold text-slate-400 md:col-span-2">Заметка<input name="notes" maxLength={4000} placeholder="Что именно хотим разобрать" className={field}/></label>
    <div className="md:col-span-2 xl:col-span-4"><button disabled={pending} className="min-h-12 rounded-xl bg-orange-500 px-6 text-sm font-black text-white disabled:opacity-50">{pending?'Добавляем…':'Добавить и разметить'}</button>{error?<p role="alert" className="mt-3 text-sm text-red-300">{error}</p>:null}</div>
  </form>;
}
