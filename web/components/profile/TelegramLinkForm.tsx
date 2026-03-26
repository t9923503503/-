"use client";

import { useState } from 'react';

export default function TelegramLinkForm() {
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

  return (
    <section className="mt-8 glass-panel rounded-2xl p-6 border border-white/10">
      <h2 className="font-heading text-2xl text-text-primary tracking-wide">
        Уведомления в Telegram
      </h2>
      <p className="mt-2 text-text-secondary font-body text-sm">
        Укажите `chat_id`, чтобы получать подтверждения по запросам пары.
      </p>
      <form onSubmit={onSubmit} className="mt-4 flex flex-col sm:flex-row gap-2">
        <input
          value={chatId}
          onChange={(e) => setChatId(e.target.value)}
          placeholder="Напр. 123456789"
          className="flex-1 rounded-lg bg-surface text-text-primary border border-white/10 px-3 py-2.5 outline-none focus:border-brand transition-colors font-body"
        />
        <button
          type="submit"
          disabled={loading || chatId.trim().length === 0}
          className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-brand text-white hover:bg-brand-light disabled:opacity-50 transition-colors text-sm font-body font-semibold"
        >
          {loading ? 'Сохранение...' : 'Сохранить'}
        </button>
      </form>
      {status ? <p className="mt-2 text-xs text-text-secondary font-body">{status}</p> : null}
    </section>
  );
}
