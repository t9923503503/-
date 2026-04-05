'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLoginPage() {
  const router = useRouter();
  const [id, setId] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, pin }),
      });
      if (!res.ok) {
        setError('Неверный PIN');
        setLoading(false);
        return;
      }
      router.push('/admin');
      router.refresh();
    } catch {
      setError('Ошибка сети');
      setLoading(false);
    }
  }

  return (
    <main className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-2xl border border-white/15 bg-white/5 p-6 flex flex-col gap-4"
      >
        <h1 className="font-heading text-4xl leading-none tracking-wide text-center">Admin Login</h1>
        <input
          type="text"
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="ID (если настроен)"
          autoComplete="username"
          className="px-4 py-3 rounded-lg bg-surface border border-white/20 focus:outline-none focus:border-brand text-center"
        />
        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="Введите PIN"
          autoComplete="current-password"
          className="px-4 py-3 rounded-lg bg-surface border border-white/20 focus:outline-none focus:border-brand text-center text-xl"
        />
        {error ? <p className="text-sm text-red-400 text-center">{error}</p> : null}
        <button
          type="submit"
          disabled={loading || !pin}
          className="px-4 py-3 rounded-lg bg-brand text-surface font-semibold disabled:opacity-60"
        >
          {loading ? 'Проверяем...' : 'Войти'}
        </button>
      </form>
    </main>
  );
}
