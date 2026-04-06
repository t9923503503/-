'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

interface AdminShellProps {
  role: string;
  actorId: string;
  children: React.ReactNode;
}

const links = [
  { href: '/admin', label: 'Dashboard', icon: '📊' },
  { href: '/admin/players', label: 'Игроки', icon: '🏐' },
  { href: '/admin/tournaments', label: 'Турниры', icon: '📅' },
  { href: '/admin/archive', label: 'Архив / рейтинги', icon: '🏆' },
  { href: '/admin/roster', label: 'Ростер', icon: '👥' },
  { href: '/admin/requests', label: 'Заявки', icon: '✉️' },
  { href: '/admin/merge', label: 'Склейка', icon: '👥' },
  { href: '/admin/overrides', label: 'Overrides', icon: '🛠' },
  { href: '/admin/audit', label: 'Audit', icon: '🧾' },
  { href: '/admin/reports', label: 'Отчёты', icon: '📤' },
];

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
      <div className="rounded-2xl border border-white/15 bg-gradient-to-br from-white/10 to-orange-500/10 p-4 md:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="font-heading text-4xl leading-none tracking-wide">Admin Panel</h1>
            <p className="mt-2 text-sm text-text-secondary">
              Роль: <span className="font-semibold text-text-primary">{role}</span>
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
            {loggingOut ? 'Выход...' : 'Выйти'}
          </button>
        </div>
      </div>

      <nav className="flex flex-wrap gap-2">
        {links.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-all ${
                active
                  ? 'border-brand bg-brand text-surface shadow-lg shadow-orange-500/25'
                  : 'border-white/20 bg-white/5 hover:border-brand hover:bg-orange-500/10'
              }`}
            >
              <span aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <section>{children}</section>
    </div>
  );
}
