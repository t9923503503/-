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
  subtitle: '\u0420\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044f',
};

function resolveTitle(summary: SummaryPayload): string {
  const playerName = String(summary.player?.displayName || '').trim();
  if (playerName) {
    return playerName;
  }
  if (summary.admin?.role === 'admin') {
    return '\u0410\u0434\u043c\u0438\u043d-\u0434\u043e\u0441\u0442\u0443\u043f';
  }
  if (summary.admin?.role === 'operator') {
    return '\u041e\u043f\u0435\u0440\u0430\u0442\u043e\u0440';
  }
  if (summary.admin?.role === 'viewer') {
    return '\u041d\u0430\u0431\u043b\u044e\u0434\u0430\u0442\u0435\u043b\u044c';
  }
  if (summary.judgeApproved) {
    return '\u0421\u0443\u0434\u0435\u0439\u0441\u043a\u0438\u0439 \u0434\u043e\u0441\u0442\u0443\u043f';
  }
  return '\u0412\u0445\u043e\u0434 \u043d\u0430 \u0441\u0430\u0439\u0442';
}

function hasAnyAccess(summary: SummaryPayload): boolean {
  return Boolean(summary.player || summary.admin || summary.judgeApproved);
}

function AccountIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M10 2.5a4.25 4.25 0 1 1 0 8.5 4.25 4.25 0 0 1 0-8.5Zm0 10.75c3.25 0 5.89 1.63 5.89 3.64 0 .34-.28.61-.62.61H4.73a.61.61 0 0 1-.62-.61c0-2.01 2.64-3.64 5.89-3.64Z"
        fill="currentColor"
      />
    </svg>
  );
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
  const subtitle = loading
    ? '\u041f\u0440\u043e\u0432\u0435\u0440\u044f\u0435\u043c \u0434\u043e\u0441\u0442\u0443\u043f...'
    : summary.subtitle || '\u0420\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044f';
  const active = hasAnyAccess(summary);

  if (mobile) {
    return (
      <Link
        href="/cabinet"
        className="mt-2 flex items-center justify-between rounded-2xl border border-white/10 bg-[#121722] px-4 py-3 text-left shadow-[0_14px_34px_rgba(0,0,0,0.22)] transition-colors hover:border-brand/30"
      >
        <div>
          <div className="text-[10px] uppercase tracking-[0.24em] text-white/75">
            {active
              ? '\u041b\u0438\u0447\u043d\u044b\u0439 \u043a\u0430\u0431\u0438\u043d\u0435\u0442'
              : '\u0412\u0445\u043e\u0434 \u043d\u0430 \u0441\u0430\u0439\u0442'}
          </div>
          <div className="mt-1 text-sm font-semibold text-white">{title}</div>
          <div className="mt-1 text-[11px] text-white/80">{subtitle}</div>
        </div>
        <span className="rounded-full border border-white/20 bg-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-white">
          {active ? '\u041e\u0442\u043a\u0440\u044b\u0442\u044c' : '\u0412\u0445\u043e\u0434'}
        </span>
      </Link>
    );
  }

  return (
    <Link
      href="/cabinet"
      className="group relative flex min-w-[164px] max-w-[190px] items-center gap-3 overflow-hidden rounded-2xl border border-white/10 bg-[#121722] px-3 py-2.5 text-left shadow-[0_10px_26px_rgba(0,0,0,0.22)] transition-all duration-200 hover:border-brand/30 hover:bg-[#171d28] hover:shadow-[0_14px_32px_rgba(0,0,0,0.28)]"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-brand/20 bg-brand/10 text-brand">
        <AccountIcon />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[9px] uppercase tracking-[0.22em] text-white/52">
          {active
            ? '\u041b\u0438\u0447\u043d\u044b\u0439 \u043a\u0430\u0431\u0438\u043d\u0435\u0442'
            : '\u0412\u0445\u043e\u0434 \u043d\u0430 \u0441\u0430\u0439\u0442'}
        </div>
        <div className="mt-1 truncate text-[12px] font-semibold uppercase tracking-[0.08em] text-white">
          {title}
        </div>
        <div className="mt-0.5 truncate text-[10px] text-white/58">{subtitle}</div>
      </div>
      <span className="shrink-0 rounded-full border border-white/12 bg-white/6 px-2 py-1 text-[9px] uppercase tracking-[0.18em] text-white/80 transition-colors group-hover:border-brand/30 group-hover:text-white">
        {active ? '\u041e\u0442\u043a\u0440\u044b\u0442\u044c' : '\u0412\u0445\u043e\u0434'}
      </span>
    </Link>
  );
}
