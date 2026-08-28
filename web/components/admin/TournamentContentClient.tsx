'use client';

import { useEffect, useState } from 'react';

type Draft = { id: string; tournament_id: string; tournament_name: string; vk_text: string; telegram_text: string; status: string };
type Media = { id: string; tournament_name: string; kind: string; storage_url: string; caption: string };

export default function TournamentContentClient() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [media, setMedia] = useState<Media[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [regeneratingDraftId, setRegeneratingDraftId] = useState('');

  async function load() {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/tournament-content', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(data.error || `Ошибка загрузки (${response.status})`));
      setDrafts(Array.isArray(data.drafts) ? data.drafts : []);
      setMedia(Array.isArray(data.pendingMedia) ? data.pendingMedia : []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось загрузить контент.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  async function moderate(id: string, status: 'approved' | 'rejected') {
    const response = await fetch(`/api/admin/tournament-media/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    });
    const data = await response.json().catch(() => ({}));
    setMessage(response.ok ? 'Материал обработан.' : String(data.error || `Не удалось изменить статус (${response.status})`));
    if (response.ok) await load();
  }

  async function save(draft: Draft) {
    const response = await fetch('/api/admin/tournament-content', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draftId: draft.id, vkText: draft.vk_text, telegramText: draft.telegram_text }),
    });
    const data = await response.json().catch(() => ({}));
    setMessage(response.ok ? 'Черновик сохранён.' : String(data.error || `Не удалось сохранить черновик (${response.status})`));
  }

  async function regenerate(draft: Draft) {
    if (!confirm('Пересобрать пост с местами в уровнях и новой статистикой? Текущий текст останется в истории.')) return;
    setRegeneratingDraftId(draft.id);
    try {
      const response = await fetch('/api/admin/tournament-content', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate', tournamentId: draft.tournament_id }),
      });
      const data = await response.json();
      setMessage(response.ok ? 'Новый черновик с уровнями и статистикой готов.' : String(data.error || 'Не удалось пересобрать пост.'));
      if (response.ok) await load();
    } finally {
      setRegeneratingDraftId('');
    }
  }

  async function publish(draftId: string) {
    if (!confirm('Опубликовать итоги в VK и Telegram?')) return;
    const response = await fetch('/api/admin/tournament-content', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'publish', draftId }),
    });
    const data = await response.json();
    setMessage(response.ok ? 'Итоги опубликованы.' : String(data.error || 'Ошибка публикации.'));
    if (response.ok) await load();
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-heading text-5xl uppercase tracking-wide text-text-primary">Контент турниров</h1>
      <p className="mt-2 text-text-secondary">Модерация альбомов и публикация итогов в VK/TG.</p>
      {message ? <div className="mt-5 rounded-xl border border-white/10 bg-card p-4 text-sm text-text-primary">{message}</div> : null}
      {loading ? <div className="mt-5 rounded-xl border border-white/10 bg-card p-4 text-sm text-text-secondary">Загружаем драфты и медиа…</div> : null}

      <section className="mt-9">
        <h2 className="font-heading text-3xl uppercase text-text-primary">Ожидают модерации · {media.length}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {!loading && media.length === 0 ? <p className="mt-4 rounded-xl border border-dashed border-white/15 p-5 text-sm text-text-secondary">Новых материалов на модерацию нет.</p> : null}
          {media.map((item) => (
            <article key={item.id} className="overflow-hidden rounded-2xl border border-white/10 bg-card">
              {item.kind === 'video' ? (
                <video src={item.storage_url} controls className="aspect-video w-full object-cover" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.storage_url} alt={item.caption || item.tournament_name} className="aspect-video w-full object-cover" />
              )}
              <div className="p-4"><div className="font-bold text-text-primary">{item.tournament_name}</div><p className="mt-1 text-sm text-text-secondary">{item.caption}</p>
                <div className="mt-4 flex gap-2"><button onClick={() => moderate(item.id, 'approved')} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white">Одобрить</button><button onClick={() => moderate(item.id, 'rejected')} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-bold text-white">Отклонить</button></div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-heading text-3xl uppercase text-text-primary">Итоговые посты</h2>
        <p className="mt-2 text-sm text-text-secondary">Новый шаблон показывает призёров каждого уровня и самые интересные цифры турнира.</p>
        <div className="mt-4 grid gap-5">
          {!loading && drafts.length === 0 ? <p className="mt-4 rounded-xl border border-dashed border-white/15 p-5 text-sm text-text-secondary">Драфтов с результатами пока нет.</p> : null}
          {drafts.map((draft, index) => (
            <article key={draft.id} className="rounded-2xl border border-white/10 bg-card p-5">
              <div className="flex items-center justify-between gap-3"><h3 className="text-lg font-bold text-text-primary">{draft.tournament_name}</h3><span className="text-xs uppercase text-text-secondary">{draft.status}</span></div>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <label className="text-sm text-text-secondary">VK<textarea disabled={draft.status !== 'draft'} value={draft.vk_text} onChange={(event) => setDrafts((rows) => rows.map((row, i) => i === index ? { ...row, vk_text: event.target.value } : row))} className="mt-2 h-[32rem] w-full rounded-xl border border-white/10 bg-black/20 p-3 text-text-primary" /></label>
                <label className="text-sm text-text-secondary">Telegram<textarea disabled={draft.status !== 'draft'} value={draft.telegram_text} onChange={(event) => setDrafts((rows) => rows.map((row, i) => i === index ? { ...row, telegram_text: event.target.value } : row))} className="mt-2 h-[32rem] w-full rounded-xl border border-white/10 bg-black/20 p-3 text-text-primary" /></label>
              </div>
              {draft.status === 'draft' ? <div className="mt-4 flex flex-wrap gap-2"><button onClick={() => save(draft)} className="rounded-lg border border-white/15 px-4 py-2 font-bold text-text-primary">Сохранить</button><button disabled={regeneratingDraftId === draft.id} onClick={() => regenerate(draft)} className="rounded-lg border border-brand/60 px-4 py-2 font-bold text-brand disabled:cursor-wait disabled:opacity-60">{regeneratingDraftId === draft.id ? 'Собираем…' : 'Пересобрать по уровням'}</button><button onClick={() => publish(draft.id)} className="rounded-lg bg-brand px-4 py-2 font-bold text-white">Опубликовать VK + TG</button></div> : null}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
