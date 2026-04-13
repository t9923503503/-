'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type SummaryPayload = {
  player: { displayName?: string | null } | null;
  admin: { role: 'admin' | 'operator' | 'viewer' } | null;
  judgeApproved: boolean;
  accessLabels: string[];
  subtitle: string;
};

const fallbackSummary: SummaryPayload = {
  player: null,
  admin: null,
  judgeApproved: false,
  accessLabels: [],
  subtitle: 'Регистрация',
};

function resolveTitle(summary: SummaryPayload): string {
  const playerName = String(summary.player?.displayName || '').trim();
  if (playerName) {
    return playerName;
  }
  if (summary.admin?.role === 'admin') {
    return 'Админ-доступ';
  }
  if (summary.admin?.role === 'operator') {
    return 'Оператор';
  }
  if (summary.admin?.role === 'viewer') {
    return 'Наблюдатель';
  }
  if (summary.judgeApproved) {
    return 'Судейский доступ';
  }
  return 'Вход на сайт';
}

function hasAnyAccess(summary: SummaryPayload): boolean {
  return Boolean(summary.player || summary.admin || summary.judgeApproved);
}

export default function HeaderAccountEntry({ mobile = false }: { mobile?: boolean }) {
  const [summary, setSummary] = useState<SummaryPayload>(fallbackSummary);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/auth/summary', { cache: 'no-store' });
        const data = (await res.json().catch(() => null)) as SummaryPayload | null;
        if (!cancelled && data) {
          setSummary(data);
        }
      } catch {
        if (!cancelled) {
          setSummary(fallbackSummary);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const title = resolveTitle(summary);
  const subtitle = loading ? 'Проверяем доступ...' : summary.subtitle || 'Регистрация';
  const active = hasAnyAccess(summary);

  if (mobile) {
    return (
      <Link
        href="/cabinet"
        className="mt-2 flex items-center justify-between rounded-2xl border border-cyan-400/25 bg-[linear-gradient(135deg,rgba(7,24,40,0.98),rgba(9,65,90,0.94)_68%,rgba(255,90,0,0.92))] px-4 py-3 text-left shadow-[0_14px_34px_rgba(0,0,0,0.28)]"
      >
        <div>
          <div className="text-[10px] uppercase tracking-[0.24em] text-white/75">
            {active ? 'Личный кабинет' : 'Вход на сайт'}
          </div>
          <div className="mt-1 text-sm font-semibold text-white">{title}</div>
          <div className="mt-1 text-[11px] text-white/80">{subtitle}</div>
        </div>
        <span className="rounded-full border border-white/20 bg-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-white">
          {active ? 'Открыть' : 'Вход'}
        </span>
      </Link>
    );
  }

  return (
    <Link
      href="/cabinet"
      className="group relative flex min-w-[200px] items-center justify-between gap-3 overflow-hidden rounded-[20px] border border-cyan-400/25 bg-[linear-gradient(135deg,rgba(7,24,40,0.98),rgba(9,65,90,0.94)_68%,rgba(255,90,0,0.92))] px-4 py-3 text-left shadow-[0_14px_34px_rgba(0,0,0,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_42px_rgba(0,0,0,0.34)]"
    >
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-[0.28em] text-white/75">
          {active ? 'Личный кабинет' : 'Вход на сайт'}
        </div>
        <div className="mt-1 truncate text-sm font-semibold uppercase tracking-[0.06em] text-white">
          {title}
        </div>
        <div className="mt-1 truncate text-[11px] text-white/80">{subtitle}</div>
      </div>
      <span className="shrink-0 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-white transition-colors group-hover:bg-white/16">
        {active ? 'Открыть' : 'Вход'}
      </span>
    </Link>
  );
}
