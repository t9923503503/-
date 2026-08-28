'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type NavItem = {
  href: string;
  label: string;
  matches: (pathname: string) => boolean;
  icon: React.ReactNode;
};

const iconClassName = 'h-5 w-5';

const ITEMS: NavItem[] = [
  {
    href: '/',
    label: 'Главная',
    matches: (pathname) => pathname === '/',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className={iconClassName} aria-hidden="true">
        <path d="m3.5 10.5 8.5-7 8.5 7v9a1 1 0 0 1-1 1h-5v-6h-5v6h-5a1 1 0 0 1-1-1v-9Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: '/partner',
    label: 'Игры',
    matches: (pathname) => pathname === '/partner' || pathname.startsWith('/partner/') || pathname === '/play' || pathname.startsWith('/play/'),
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className={iconClassName} aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 3.5c1.1 2.7.7 5.1-1.2 7.1-1.8 2-4.2 2.6-7 1.7M20.2 9.5c-2.9-.4-5.1.5-6.5 2.8-1.3 2.3-1.2 4.8.3 7.3M6.2 18.3c1.7-2.4 3.9-3.4 6.6-2.8 2.6.5 4.4 2.2 5.5 4.9" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: '/calendar',
    label: 'Турниры',
    matches: (pathname) => pathname === '/calendar' || pathname.startsWith('/calendar/'),
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className={iconClassName} aria-hidden="true">
        <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
        <path d="M7.5 3.5v3M16.5 3.5v3M3.5 9.5h17M7.5 13h2M14.5 13h2M7.5 17h2M14.5 17h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: '/rankings',
    label: 'Рейтинг',
    matches: (pathname) => pathname === '/rankings' || pathname.startsWith('/players/'),
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className={iconClassName} aria-hidden="true">
        <path d="M5 20v-6h4v6M10 20V9h4v11M15 20V4h4v16M3.5 20.5h17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: '/cabinet',
    label: 'Профиль',
    matches: (pathname) => pathname === '/cabinet' || pathname === '/profile' || pathname === '/login' || pathname.startsWith('/reset-password'),
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className={iconClassName} aria-hidden="true">
        <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8" />
        <path d="M5 20c.55-4 2.9-6 7-6s6.45 2 7 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function MobileBottomNav() {
  const pathname = usePathname() || '/';

  return (
    <nav className="mobile-bottom-nav md:hidden" aria-label="Основная мобильная навигация">
      <div className="mx-auto grid h-[4.25rem] max-w-md grid-cols-5 px-1.5">
        {ITEMS.map((item) => {
          const active = item.matches(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[10px] font-bold transition-colors ${active ? 'text-brand' : 'text-text-secondary hover:text-text-primary'}`}
            >
              {active ? <span className="absolute top-0 h-0.5 w-8 rounded-full bg-brand" /> : null}
              <span className={`grid h-8 w-9 place-items-center rounded-xl transition-colors ${active ? 'bg-brand/10' : ''}`}>{item.icon}</span>
              <span className="truncate leading-none">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
