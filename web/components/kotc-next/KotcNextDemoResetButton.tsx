'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function KotcNextDemoResetButton({ slug }: { slug: string }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState('');

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          if (!window.confirm('Сбросить demo-турнир обратно в обучающее состояние?')) return;
          setError('');
          setSuccess('');
          startTransition(() => {
            void (async () => {
              try {
                const response = await fetch(`/api/demo/kotc-next/${encodeURIComponent(slug)}/reset`, {
                  method: 'POST',
                });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) {
                  setError(String(payload.error || 'Demo reset failed'));
                  return;
                }
                setSuccess('Demo reset выполнен.');
                router.refresh();
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Demo reset failed');
              }
            })();
          });
        }}
        className="rounded-lg border border-amber-400/40 bg-amber-500/15 px-4 py-3 text-sm font-semibold text-amber-100 transition-colors hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? 'Resetting…' : 'Сбросить demo'}
      </button>
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
      {success ? <p className="text-xs text-emerald-300">{success}</p> : null}
    </div>
  );
}
