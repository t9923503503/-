'use client';

import { useState } from 'react';

export default function AdminReportsPage() {
  const [telegramText, setTelegramText] = useState('');
  const [message, setMessage] = useState('');

  async function loadTelegram() {
    const res = await fetch('/api/admin/reports/telegram', { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    setTelegramText(String(data?.text || ''));
  }

  async function copyTelegram() {
    if (!telegramText) return;
    await navigator.clipboard.writeText(telegramText);
    setMessage('Telegram payload скопирован');
    setTimeout(() => setMessage(''), 1500);
  }

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="rounded-xl border border-white/15 bg-white/5 p-4 flex flex-col gap-3">
        <h2 className="font-heading text-3xl leading-none">CSV экспорт</h2>
        <a
          href="/api/admin/reports/tournaments"
          className="px-3 py-2 rounded-lg border border-white/20 hover:border-brand inline-block"
        >
          Скачать турниры CSV
        </a>
        <a
          href="/api/admin/reports/players"
          className="px-3 py-2 rounded-lg border border-white/20 hover:border-brand inline-block"
        >
          Скачать игроки CSV
        </a>
      </div>

      <div className="rounded-xl border border-white/15 bg-white/5 p-4 flex flex-col gap-3">
        <h2 className="font-heading text-3xl leading-none">Telegram payload</h2>
        <div className="flex gap-2">
          <button type="button" onClick={() => void loadTelegram()} className="px-3 py-2 rounded-lg bg-brand text-surface font-semibold">
            Сгенерировать
          </button>
          <button type="button" onClick={() => void copyTelegram()} className="px-3 py-2 rounded-lg border border-white/20 hover:border-brand">
            Копировать
          </button>
        </div>
        <textarea
          value={telegramText}
          onChange={(e) => setTelegramText(e.target.value)}
          rows={14}
          className="w-full px-3 py-2 rounded-lg bg-surface border border-white/20 text-sm"
          placeholder="Нажмите “Сгенерировать”"
        />
        {message ? <p className="text-sm text-text-secondary">{message}</p> : null}
      </div>
    </div>
  );
}
