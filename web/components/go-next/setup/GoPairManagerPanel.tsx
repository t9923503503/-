'use client';

import { useEffect, useMemo, useState } from 'react';

type RosterRow = { playerId: string; playerName: string; gender: 'M' | 'W'; isWaitlist: boolean; position: number };

export function GoPairManagerPanel({ tournamentId, onChanged }: { tournamentId: string; onChanged: () => void }) {
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const active = useMemo(() => roster.filter((row) => !row.isWaitlist).sort((a, b) => a.position - b.position), [roster]);
  const waiting = useMemo(() => roster.filter((row) => row.isWaitlist).sort((a, b) => a.position - b.position), [roster]);
  const pairs = useMemo(() => Array.from({ length: Math.ceil(active.length / 2) }, (_, index) => active.slice(index * 2, index * 2 + 2)), [active]);

  async function load() {
    const response = await fetch(`/api/admin/tournaments/${encodeURIComponent(tournamentId)}/go-pairs`, { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setError(data.error ?? 'Не удалось загрузить состав');
    setRoster(data.roster ?? []);
    setError('');
  }

  useEffect(() => { void load(); }, [tournamentId]);

  async function mutate(body: Record<string, unknown>) {
    setPending(true); setError('');
    try {
      const response = await fetch(`/api/admin/tournaments/${encodeURIComponent(tournamentId)}/go-pairs`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, reason: 'Изменение состава в день турнира' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return setError(data.error ?? 'Не удалось сохранить состав');
      setRoster(data.roster ?? []); onChanged();
    } finally { setPending(false); }
  }

  return <section className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
    <div className="flex items-center justify-between gap-2"><div><h2 className="font-bold">Пары на сегодня</h2><p className="text-xs text-slate-500">{pairs.length}/16 пар. Изменения доступны только до первого матча.</p></div><button type="button" onClick={() => void load()} className="text-xs text-blue-700">Обновить</button></div>
    {error ? <p className="mt-2 rounded bg-red-50 p-2 text-xs text-red-700">{error}</p> : null}
    <div className="mt-3 space-y-2">
      {pairs.map((pair, index) => <article key={index} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2 text-sm">
        <span><b>Пара {index + 1}</b>: {pair.map((row) => `${row.playerName} (${row.gender})`).join(' + ') || 'неполная'}</span>
        <div className="flex gap-2">
          {waiting.length ? <select aria-label={`Замена для пары ${index + 1}`} defaultValue="" onChange={(event) => { if (event.target.value) void mutate({ action: 'replace_player', pairIndex: index + 1, playerSlot: 1, replacementPlayerId: event.target.value }); }} className="rounded border px-1 text-xs"><option value="">Заменить игрока…</option>{waiting.map((row) => <option key={row.playerId} value={row.playerId}>{row.playerName} ({row.gender})</option>)}</select> : null}
          <button type="button" disabled={pending || pairs.length <= 4} onClick={() => void mutate({ action: 'remove_pair', pairIndex: index + 1 })} className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 disabled:opacity-40">Снять пару</button>
        </div>
      </article>)}
    </div>
    {waiting.length >= 2 ? <button type="button" disabled={pending} onClick={() => void mutate({ action: 'promote_waitlist_pair', playerIds: waiting.slice(0, 2).map((row) => row.playerId) })} className="mt-3 rounded border border-emerald-300 px-2 py-1 text-xs text-emerald-700">Добавить первую пару из ожидания</button> : null}
  </section>;
}
