'use client';

import { useState } from 'react';

function normalizeReturnTo(value: string | null): string {
  const next = String(value || '').trim();
  if (!next.startsWith('/')) return '/sudyam';
  if (next.startsWith('//')) return '/sudyam';
  return next;
}

export default function SudyamLoginPage() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const res = await fetch('/api/sudyam-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });

    if (res.ok) {
      const returnTo = typeof window !== 'undefined'
        ? normalizeReturnTo(new URL(window.location.href).searchParams.get('returnTo'))
        : '/sudyam';
      window.location.href = returnTo;
    } else {
      setError('Неверный PIN');
      setLoading(false);
    }
  }

  return (
    <main className="flex flex-col items-center justify-center h-[calc(100vh-4rem)] gap-6 px-4">
      <div className="text-5xl">🏐</div>
      <h1 className="font-heading text-4xl text-text-primary uppercase tracking-wide text-center">
        Вход для судей
      </h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-xs">
        <input
          type="password"
          inputMode="numeric"
          placeholder="Введите PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          className="px-4 py-3 rounded-xl bg-surface-2 text-text-primary font-body text-center text-2xl tracking-widest border border-border focus:outline-none focus:border-brand"
          autoFocus
        />
        {error && (
          <p className="font-body text-sm text-red-500 text-center">{error}</p>
        )}
        <button
          type="submit"
          disabled={loading || pin.length < 1}
          className="px-8 py-3 rounded-xl bg-brand text-surface font-body font-semibold hover:bg-brand/90 transition-colors disabled:opacity-50"
        >
          {loading ? 'Проверяем...' : 'Войти'}
        </button>
      </form>
    </main>
  );
}
