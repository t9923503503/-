'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const PRIMARY = [
  { href: '/admin', label: 'Обзор', icon: 'dashboard' },
  { href: '/admin/play', label: 'Игры', icon: 'play' },
  { href: '/admin/tournaments', label: 'Турниры', icon: 'trophy' },
  { href: '/admin/players', label: 'Игроки', icon: 'players' },
] as const;

const SECONDARY = [
  { href: '/coach', label: 'LP Coach', note: 'Тренировки и упражнения' },
  { href: '/admin/requests', label: 'Заявки', note: 'Регистрации и обращения' },
  { href: '/admin/archive', label: 'Архив', note: 'История и рейтинги' },
  { href: '/admin/content', label: 'Контент', note: 'VK/TG и результаты' },
  { href: '/admin/reports', label: 'Отчёты', note: 'Выгрузки и Telegram' },
  { href: '/admin/ai', label: 'LPVolley AI', note: 'Разбор материалов' },
  { href: '/admin/audit', label: 'Аудит', note: 'Журнал действий' },
  { href: '/admin/merge', label: 'Склейка', note: 'Объединение игроков' },
  { href: '/admin/overrides', label: 'Переопределения', note: 'Ручные настройки' },
] as const;

function isActive(pathname: string, href: string) {
  if (href === '/admin') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function AdminIcon({ name }: { name: (typeof PRIMARY)[number]['icon'] | 'more' }) {
  if (name === 'dashboard') return <path d="M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z" />;
  if (name === 'play') return <path d="M8 5.2v13.6L19 12 8 5.2Z" />;
  if (name === 'trophy') return <path d="M8 4h8v3.5c0 3-1.55 5.5-4 5.5s-4-2.5-4-5.5V4Zm0 2H4.5v1.5c0 2.2 1.35 3.5 3.7 3.5M16 6h3.5v1.5c0 2.2-1.35 3.5-3.7 3.5M12 13v4m-4 3h8m-6-3h4" />;
  if (name === 'players') return <path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7-1a2.7 2.7 0 1 0 0-5.4M3 20c.4-4 2.35-6 6-6s5.6 2 6 6m1-7c2.9.2 4.55 1.85 5 5" />;
  return <path d="M5 12h.01M12 12h.01M19 12h.01" />;
}

function Icon({ name }: { name: (typeof PRIMARY)[number]['icon'] | 'more' }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill={name === 'dashboard' || name === 'play' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <AdminIcon name={name} />
    </svg>
  );
}

export default function AdminMobileBottomNav() {
  const pathname = usePathname() || '/admin';
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = SECONDARY.some((item) => isActive(pathname, item.href));
  const tournamentLive = /^\/admin\/tournaments\/[^/]+\/(thai-live|kotcn-live)$/.test(pathname);

  if (tournamentLive) return null;

  return (
    <>
      {moreOpen ? (
        <div className="fixed inset-0 z-[105] md:hidden" role="dialog" aria-modal="true" aria-label="Дополнительные разделы админки">
          <button type="button" className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={() => setMoreOpen(false)} aria-label="Закрыть дополнительное меню" />
          <div className="admin-more-sheet absolute inset-x-0 mx-auto max-w-lg rounded-t-[1.75rem] border border-white/15 bg-card p-4 shadow-[0_-24px_60px_rgba(0,0,0,0.38)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-brand">Администрирование</p>
                <h2 className="mt-1 text-xl font-black text-text-primary">Все разделы</h2>
              </div>
              <button type="button" onClick={() => setMoreOpen(false)} className="grid h-10 w-10 place-items-center rounded-full border border-white/15 text-xl text-text-primary" aria-label="Закрыть">×</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {SECONDARY.map((item) => (
                <Link key={item.href} href={item.href} onClick={() => setMoreOpen(false)} className={`rounded-2xl border p-3 transition-colors ${isActive(pathname, item.href) ? 'border-brand bg-brand/10' : 'border-white/10 bg-surface-light/40 hover:border-brand/40'}`}>
                  <span className="block text-sm font-black text-text-primary">{item.label}</span>
                  <span className="mt-1 block text-[10px] leading-4 text-text-secondary">{item.note}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <nav className="mobile-bottom-nav admin-mobile-bottom-nav md:hidden" aria-label="Навигация главного администратора">
        <div className="mx-auto grid h-[4.25rem] max-w-md grid-cols-5 px-1.5">
          {PRIMARY.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} className={`relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[10px] font-bold transition-colors ${active ? 'text-brand' : 'text-text-secondary hover:text-text-primary'}`}>
                {active ? <span className="absolute top-0 h-0.5 w-8 rounded-full bg-brand" /> : null}
                <span className={`grid h-8 w-9 place-items-center rounded-xl ${active ? 'bg-brand/10' : ''}`}><Icon name={item.icon} /></span>
                <span className="truncate leading-none">{item.label}</span>
              </Link>
            );
          })}
          <button type="button" onClick={() => setMoreOpen(true)} aria-expanded={moreOpen} className={`relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[10px] font-bold transition-colors ${moreActive || moreOpen ? 'text-brand' : 'text-text-secondary hover:text-text-primary'}`}>
            {moreActive || moreOpen ? <span className="absolute top-0 h-0.5 w-8 rounded-full bg-brand" /> : null}
            <span className={`grid h-8 w-9 place-items-center rounded-xl ${moreActive || moreOpen ? 'bg-brand/10' : ''}`}><Icon name="more" /></span>
            <span className="leading-none">Ещё</span>
          </button>
        </div>
      </nav>
    </>
  );
}
