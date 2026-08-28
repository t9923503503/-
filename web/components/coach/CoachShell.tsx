'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

const links = [
  { href: '/coach/media', label: 'Видео', short: 'Видео', icon: '▶' },
  { href: '/coach', label: 'Обзор', short: 'Обзор', icon: '◫' },
  { href: '/coach/athletes', label: 'Ученики', short: 'Ученики', icon: '◎' },
  { href: '/coach/exercises', label: 'Упражнения', short: 'База', icon: '◇' },
  { href: '/coach/sessions', label: 'Тренировки', short: 'Занятия', icon: '◷' },
  { href: '/coach/analytics', label: 'Аналитика', short: 'Статы', icon: '⌁' },
  { href: '/coach/challenges', label: 'Challenges', short: 'Тесты', icon: '🎯' },
];

export default function CoachShell({ actorId, children }: { actorId: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const isActive = (href: string) => href === '/coach' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  async function logout() {
    setLoggingOut(true);
    await fetch('/api/admin/auth', { method: 'DELETE' });
    router.replace('/coach/login');
    router.refresh();
  }

  return (
    <div className="coach-dark-surface min-h-screen bg-[#070b14] text-slate-100">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#070b14]/95 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/coach" className="flex min-h-11 items-center gap-3" aria-label="LP Coach — обзор">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 font-heading text-xl text-white shadow-lg shadow-orange-600/25">LP</span>
            <span>
              <span className="block font-heading text-xl leading-none tracking-[0.08em]">COACH</span>
              <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">тренерский штаб</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-2 md:flex" aria-label="Навигация LP Coach">
            {links.map((item) => (
              <Link key={item.href} href={item.href} className={`min-h-11 rounded-xl px-4 py-3 text-sm font-bold transition ${isActive(item.href) ? 'bg-orange-500 text-white shadow-lg shadow-orange-600/20' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <span className="hidden max-w-40 truncate text-xs text-slate-500 sm:block" title={actorId}>{actorId}</span>
            <button type="button" onClick={logout} disabled={loggingOut} className="min-h-11 rounded-xl border border-white/15 px-3 text-sm font-bold text-slate-300 transition hover:border-orange-400/50 hover:text-white disabled:opacity-60">
              {loggingOut ? 'Выходим…' : 'Выйти'}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 pb-28 pt-6 sm:px-6 md:pb-10 md:pt-8">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0a101b]/95 px-3 pb-[max(0.65rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl md:hidden" aria-label="Мобильная навигация LP Coach">
        <div className="mx-auto grid max-w-lg grid-cols-7 gap-1">
          {links.map((item) => (
            <Link key={item.href} href={item.href} className={`flex min-h-14 flex-col items-center justify-center rounded-2xl text-xs font-bold transition ${isActive(item.href) ? 'bg-orange-500 text-white' : 'text-slate-500'}`}>
              <span className="text-lg leading-none" aria-hidden="true">{item.icon}</span>
              <span className="mt-1">{item.short}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
