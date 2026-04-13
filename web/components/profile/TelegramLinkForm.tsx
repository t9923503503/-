"use client";

import { useState } from 'react';

export default function TelegramLinkForm({ embedded = false }: { embedded?: boolean }) {
  const [chatId, setChatId] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegram_chat_id: chatId.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(data?.error || 'Не удалось сохранить');
        return;
      }
      setStatus('Telegram chat id сохранен');
    } catch {
      setStatus('Ошибка сети');
    } finally {
      setLoading(false);
    }
  }

  const rootClass = embedded
    ? ''
    : 'rounded-xl border border-white/10 bg-surface-light/20 p-4';

  return (
    <section className={rootClass}>
      <h3 className="font-heading text-lg text-text-primary tracking-wide">Уведомления в Telegram</h3>
      <p className="mt-1.5 text-sm font-body text-text-secondary">
        Укажите `chat_id`, чтобы получать подтверждения по запросам пары.
      </p>
      <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          value={chatId}
          onChange={(e) => setChatId(e.target.value)}
          placeholder="Напр. 123456789"
          className="flex-1 rounded-lg border border-white/10 bg-surface px-3 py-2.5 font-body text-text-primary outline-none transition-colors focus:border-brand"
        />
        <button
          type="submit"
          disabled={loading || chatId.trim().length === 0}
          className="inline-flex items-center justify-center rounded-lg bg-brand px-4 py-2 text-sm font-body font-semibold text-white transition-colors hover:bg-brand-light disabled:opacity-50"
        >
          {loading ? 'Сохранение...' : 'Сохранить'}
        </button>
      </form>
      {status ? <p className="mt-2 text-xs font-body text-text-secondary">{status}</p> : null}
    </section>
  );
}
