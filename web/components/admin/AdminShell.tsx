'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import AdminMobileBottomNav from '@/components/admin/AdminMobileBottomNav';
import type { AdminRole } from '@/lib/admin-auth';

interface AdminShellProps {
  role: AdminRole;
  actorId: string;
  children: React.ReactNode;
}

type NavItem = {
  href: string;
  label: string;
  icon: string;
  minRole?: AdminRole;
  tone?: 'primary' | 'default' | 'muted';
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    title: 'Операции',
    items: [
      { href: '/admin', label: 'Dashboard', icon: '📊' },
      { href: '/admin/play', label: 'Игры / тренировки', icon: '▶' },
      { href: '/admin/requests', label: 'Заявки', icon: '✉️' },
      { href: '/admin/ai', label: 'LPVolley AI', icon: 'AI' },
      { href: '/coach', label: 'LP Coach', icon: '◫', minRole: 'admin' },
    ],
  },
  {
    title: 'Игроки',
    items: [
      { href: '/admin/players', label: 'Игроки', icon: '🏐' },
      { href: '/admin/roster', label: 'Ростер', icon: '👥' },
      { href: '/admin/merge', label: 'Склейка', icon: '🧩', minRole: 'operator' },
    ],
  },
  {
    title: 'Турниры',
    items: [
      { href: '/admin/tournaments', label: 'Турниры', icon: '📅', tone: 'primary' },
      { href: '/admin/archive', label: 'Архив / рейтинги', icon: '🏆', tone: 'primary' },
      { href: '/admin/content', label: 'Контент', icon: '📣' },
    ],
  },
  {
    title: 'Контроль / аудит',
    items: [
      { href: '/admin/reports', label: 'Отчёты', icon: '📤', tone: 'muted' },
      { href: '/admin/audit', label: 'Аудит', icon: '🧾', tone: 'muted' },
      { href: '/admin/overrides', label: 'Переопределения', icon: '🛠', minRole: 'operator', tone: 'muted' },
    ],
  },
];

function roleRank(role: AdminRole): number {
  if (role === 'admin') return 3;
  if (role === 'operator') return 2;
  return 1;
}

function canAccess(role: AdminRole, minRole: AdminRole = 'viewer'): boolean {
  return roleRank(role) >= roleRank(minRole);
}

function isActivePath(pathname: string, href: string): boolean {
  return href === '/admin' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function navItemClasses(active: boolean, tone: NavItem['tone'] = 'default'): string {
  if (active) return 'border-brand bg-brand text-surface shadow-lg shadow-orange-500/25';
  if (tone === 'primary') return 'border-orange-400/30 bg-orange-500/10 hover:border-orange-300/60 hover:bg-orange-500/15';
  if (tone === 'muted') return 'border-white/10 bg-white/[0.03] text-text-secondary hover:border-white/25 hover:text-text-primary';
  return 'border-white/20 bg-white/5 hover:border-brand hover:bg-orange-500/10';
}

export default function AdminShell({ role, actorId, children }: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const showAdminMobileNav = role === 'admin';

  async function logout() {
    setLoggingOut(true);
    await fetch('/api/admin/auth', { method: 'DELETE' });
    router.push('/admin/login');
    router.refresh();
  }

  return (
    <div className={`admin-shell mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-4 overflow-x-clip px-4 py-3 md:gap-6 md:py-8 ${showAdminMobileNav ? 'site-mobile-nav-space' : ''}`}>
      <div className="rounded-2xl border border-white/15 bg-white/[0.04] px-3 py-2.5 md:bg-gradient-to-br md:from-white/10 md:to-orange-500/10 md:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-brand md:hidden">{role === 'admin' ? 'Администратор' : role}</p>
            <h1 className="mt-0.5 font-heading text-xl leading-none tracking-wide md:mt-0 md:text-4xl">Панель управления</h1>
            <p className="mt-2 hidden truncate text-sm text-text-secondary md:block">
              Роль: <strong className="text-text-primary">{role}</strong> · Пользователь: <strong className="text-text-primary">{actorId}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={logout}
            disabled={loggingOut}
            className="min-h-10 shrink-0 rounded-xl border border-white/20 px-3.5 py-2 text-xs font-semibold transition-colors hover:border-brand disabled:opacity-60 md:min-h-11 md:px-4 md:text-sm"
          >
            {loggingOut ? 'Выход...' : 'Выйти'}
          </button>
        </div>
      </div>

      <nav className="hidden gap-3 md:grid lg:grid-cols-4" data-admin-shell-nav>
        {navGroups.map((group) => {
          const visibleItems = group.items.filter((item) => canAccess(role, item.minRole));
          if (!visibleItems.length) return null;
          return (
            <div key={group.title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-secondary">{group.title}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {visibleItems.map((item) => {
                  const active = isActivePath(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-all ${navItemClasses(active, item.tone)}`}
                    >
                      <span aria-hidden="true">{item.icon}</span>
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <section className="min-w-0">{children}</section>
      {showAdminMobileNav ? <AdminMobileBottomNav /> : null}
    </div>
  );
}
