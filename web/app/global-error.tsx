'use client';

import { useEffect } from 'react';

export default function GlobalError({
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

  if (error?.name === 'ChunkLoadError') {
    return (
      <html lang="ru">
        <body>
          <div style={{ textAlign: 'center', padding: '4rem' }}>
            Обновление сайта — перезагрузка...
          </div>
        </body>
      </html>
    );
  }

  return (
    <html lang="ru">
      <body>
        <div style={{ textAlign: 'center', padding: '4rem' }}>
          <h2>Что-то пошло не так</h2>
          <button onClick={reset} style={{ marginTop: '1rem', padding: '0.5rem 1.5rem' }}>
            Попробовать снова
          </button>
        </div>
      </body>
    </html>
  );
}
