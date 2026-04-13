import type { Metadata, Viewport } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Судейское табло | LPVOLLEY',
  description: 'Табло судьи для пляжного волейбола — выбери корт.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Табло судьи',
  },
};

export function generateViewport(): Viewport {
  return {
    themeColor: '#050914',
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  };
}

const COURTS = ['1', '2', '3', '4'];

export default function JudgeScoreboardIndexPage() {
  return (
    <div
      className="flex min-h-[100dvh] w-full flex-col items-center justify-center bg-[#050914] px-5 py-10 text-white"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 24px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
        paddingLeft: 'calc(env(safe-area-inset-left, 0px) + 20px)',
        paddingRight: 'calc(env(safe-area-inset-right, 0px) + 20px)',
      }}
    >
      <header className="mb-8 text-center">
        <h1
          className="text-4xl font-bold uppercase tracking-wide sm:text-5xl"
          style={{ fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.05em' }}
        >
          Табло судьи
        </h1>
        <p className="mt-2 text-sm text-white/60 sm:text-base">
          Выберите корт
        </p>
      </header>

      <div className="grid w-full max-w-2xl grid-cols-2 gap-4 sm:gap-6">
        {COURTS.map((courtId) => (
          <Link
            key={courtId}
            href={`/judge-scoreboard/${courtId}`}
            prefetch={false}
            className="group flex aspect-square flex-col items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-white/0 text-center transition active:scale-[0.97] sm:rounded-3xl"
            style={{ minHeight: 140, touchAction: 'manipulation' }}
          >
            <span
              className="text-6xl font-black leading-none text-white sm:text-7xl"
              style={{ fontFamily: 'Bebas Neue, sans-serif' }}
            >
              {courtId}
            </span>
            <span className="mt-2 text-xs uppercase tracking-widest text-white/60 sm:text-sm">
              Корт
            </span>
          </Link>
        ))}
      </div>

      <p className="mt-10 max-w-md text-center text-xs leading-relaxed text-white/40">
        Инструмент работает оффлайн. Счёт сохраняется в памяти браузера
        отдельно для каждого корта.
      </p>
    </div>
  );
}
