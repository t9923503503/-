'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function TournamentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (error?.name === 'ChunkLoadError') {
      window.location.reload();
    }
  }, [error]);

  return (
    <main className="max-w-6xl mx-auto px-4 py-20 text-center">
      <p className="font-body text-text-secondary mb-6">
        {error?.name === 'ChunkLoadError'
          ? 'Обновление сайта — перезагрузка...'
          : 'Не удалось загрузить страницу турнира.'}
      </p>
      <div className="flex gap-4 justify-center">
        <button
          onClick={reset}
          className="px-6 py-2 rounded-lg bg-brand text-white font-body font-semibold hover:bg-brand-light transition-colors"
        >
          Попробовать снова
        </button>
        <Link
          href="/calendar"
          className="px-6 py-2 rounded-lg border border-white/10 text-text-primary font-body hover:border-brand transition-colors"
        >
          ← Календарь
        </Link>
      </div>
    </main>
  );
}
