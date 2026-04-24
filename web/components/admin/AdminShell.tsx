'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
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
      { href: '/admin/requests', label: 'Заявки', icon: '✉️' },
      { href: '/admin/roster', label: 'Ростер', icon: '👥' },
    ],
  },
  {
    title: 'Игроки',
    items: [
      { href: '/admin/players', label: 'Игроки', icon: '🏐' },
      { href: '/admin/merge', label: 'Склейка', icon: '🧩', minRole: 'operator' },
    ],
  },
  {
    title: 'Турниры',
    items: [
      { href: '/admin/tournaments', label: 'Турниры', icon: '📅', tone: 'primary' },
      { href: '/admin/archive', label: 'Архив / рейтинги', icon: '🏆', tone: 'primary' },
    ],
  },
  {
    title: 'Контроль / аудит',
    items: [
      { href: '/admin/reports', label: 'Отчёты', icon: '📤', tone: 'muted' },
      { href: '/admin/audit', label: 'Audit', icon: '🧾', tone: 'muted' },
      { href: '/admin/overrides', label: 'Overrides', icon: '🛠', minRole: 'operator', tone: 'muted' },
    ],
  },
];

function getRoleRank(role: AdminRole): number {
  switch (role) {
    case 'admin':
      return 3;
    case 'operator':
      return 2;
    default:
      return 1;
  }
}

function canAccess(role: AdminRole, minRole: AdminRole = 'viewer'): boolean {
  return getRoleRank(role) >= getRoleRank(minRole);
}

function isActivePath(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function getItemClasses(active: boolean, tone: NavItem['tone'] = 'default'): string {
  if (active) {
    return 'border-brand bg-brand text-surface shadow-lg shadow-orange-500/25';
  }

  if (tone === 'primary') {
    return 'border-orange-400/30 bg-orange-500/10 hover:border-orange-300/60 hover:bg-orange-500/15';
  }

  if (tone === 'muted') {
    return 'border-white/10 bg-white/[0.03] text-text-secondary hover:border-white/25 hover:bg-white/7 hover:text-text-primary';
  }

  return 'border-white/20 bg-white/5 hover:border-brand hover:bg-orange-500/10';
}

function getRoleLabel(role: AdminRole): string {
  switch (role) {
    case 'admin':
      return 'Администратор';
    case 'operator':
      return 'Оператор';
    default:
      return 'Наблюдатель';
  }
}

export default function AdminShell({ role, actorId, children }: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);
    await fetch('/api/admin/auth', { method: 'DELETE' });
    router.push('/admin/login');
    router.refresh();
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 md:py-8">
      <div className="rounded-3xl border border-white/15 bg-gradient-to-br from-white/10 via-orange-500/10 to-transparent p-4 md:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-200/80">Admin shell</p>
            <h1 className="mt-2 font-heading text-4xl leading-none tracking-wide">LPVOLLEY Admin</h1>
            <p className="mt-3 text-sm text-text-secondary">
              Роль: <span className="font-semibold text-text-primary">{getRoleLabel(role)}</span>
            </p>
            <p className="mt-1 text-sm text-text-secondary">
              Actor: <span className="font-semibold text-text-primary">{actorId}</span>
            </p>
          </div>

          <button
            type="button"
            onClick={logout}
            disabled={loggingOut}
            className="rounded-xl border border-white/20 px-4 py-2 transition-colors hover:border-brand disabled:opacity-60"
          >
            {loggingOut ? 'Выход…' : 'Выйти'}
          </button>
        </div>
      </div>

      <nav className="grid gap-3 lg:grid-cols-4" data-admin-shell-nav>
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
                      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-all ${getItemClasses(active, item.tone)}`}
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

      <section>{children}</section>
    </div>
  );
}
