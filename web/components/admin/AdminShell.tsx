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
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/tournaments', label: 'Турниры' },
  { href: '/admin/players', label: 'Игроки' },
  { href: '/admin/roster', label: 'Ростер' },
  { href: '/admin/requests', label: 'Заявки' },
  { href: '/admin/merge', label: 'Склейка' },
  { href: '/admin/overrides', label: 'Overrides' },
  { href: '/admin/audit', label: 'Audit' },
  { href: '/admin/reports', label: 'Отчеты' },
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
    <div className="max-w-7xl mx-auto px-4 py-6 md:py-8 flex flex-col gap-6">
      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 md:p-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-heading text-4xl leading-none tracking-wide">Admin Panel</h1>
          <p className="text-sm text-text-secondary mt-2">Роль: <span className="text-text-primary font-semibold">{role}</span></p>
          <p className="text-sm text-text-secondary mt-1">Actor: <span className="text-text-primary font-semibold">{actorId}</span></p>
        </div>
        <button
          type="button"
          onClick={logout}
          disabled={loggingOut}
          className="px-4 py-2 rounded-lg border border-white/20 hover:border-brand transition-colors disabled:opacity-60"
        >
          {loggingOut ? 'Выход...' : 'Выйти'}
        </button>
      </div>

      <nav className="flex flex-wrap gap-2">
        {links.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
                active
                  ? 'bg-brand text-surface border-brand'
                  : 'border-white/20 hover:border-brand'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <section>{children}</section>
    </div>
  );
}
