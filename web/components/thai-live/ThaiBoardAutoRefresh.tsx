'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const DEFAULT_INTERVAL_MS = 15_000;

function formatClock(date: Date | null): string {
  if (!date) return '—';
  return date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Тихо обновляет серверный рендер табло через router.refresh().
 * Пауза при скрытой вкладке; при возврате фокуса — немедленный refresh.
 */
export function ThaiBoardAutoRefresh({ intervalMs = DEFAULT_INTERVAL_MS }: { intervalMs?: number }) {
  const router = useRouter();
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  useEffect(() => {
    setLastRefresh(new Date());

    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      router.refresh();
      setLastRefresh(new Date());
    };

    let timerId = window.setInterval(tick, intervalMs);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        tick();
        window.clearInterval(timerId);
        timerId = window.setInterval(tick, intervalMs);
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(timerId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [router, intervalMs]);

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-100">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
      </span>
      <span className="tabular-nums">обновлено {formatClock(lastRefresh)}</span>
    </span>
  );
}
