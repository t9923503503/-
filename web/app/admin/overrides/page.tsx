'use client';

import { useState } from 'react';

export default function AdminOverridesPage() {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const [statusTournamentId, setStatusTournamentId] = useState('');
  const [statusValue, setStatusValue] = useState('open');
  const [statusReason, setStatusReason] = useState('');

  const [ratingPlayerId, setRatingPlayerId] = useState('');
  const [ratingMix, setRatingMix] = useState('');
  const [ratingReason, setRatingReason] = useState('');

  const [recalcPlayerId, setRecalcPlayerId] = useState('');
  const [recalcReason, setRecalcReason] = useState('');

  async function runOverride(payload: Record<string, unknown>) {
    setLoading(true);
    setMessage('');
    const res = await fetch('/api/admin/overrides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setLoading(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setMessage(err?.error || 'Ошибка override');
      return;
    }
    setMessage('Override выполнен');
  }

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void runOverride({
            type: 'tournament_status',
            tournamentId: statusTournamentId,
            status: statusValue,
            reason: statusReason,
          });
        }}
        className="rounded-xl border border-white/15 bg-white/5 p-4 flex flex-col gap-3"
      >
        <h2 className="font-heading text-3xl leading-none">Статус турнира</h2>
        <input value={statusTournamentId} onChange={(e) => setStatusTournamentId(e.target.value)} placeholder="tournamentId" className="px-3 py-2 rounded-lg bg-surface border border-white/20" required />
        <select value={statusValue} onChange={(e) => setStatusValue(e.target.value)} className="px-3 py-2 rounded-lg bg-surface border border-white/20">
          <option value="open">open</option>
          <option value="full">full</option>
          <option value="finished">finished</option>
          <option value="cancelled">cancelled</option>
        </select>
        <input value={statusReason} onChange={(e) => setStatusReason(e.target.value)} placeholder="Причина (обязательно)" className="px-3 py-2 rounded-lg bg-surface border border-white/20" required />
        <button type="submit" disabled={loading} className="px-4 py-2 rounded-lg bg-brand text-surface font-semibold disabled:opacity-60">
          Применить
        </button>
      </form>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void runOverride({
            type: 'player_rating',
            playerId: ratingPlayerId,
            ratingMix: Number(ratingMix || 0),
            reason: ratingReason,
          });
        }}
        className="rounded-xl border border-white/15 bg-white/5 p-4 flex flex-col gap-3"
      >
        <h2 className="font-heading text-3xl leading-none">Рейтинг игрока</h2>
        <input value={ratingPlayerId} onChange={(e) => setRatingPlayerId(e.target.value)} placeholder="playerId" className="px-3 py-2 rounded-lg bg-surface border border-white/20" required />
        <input type="number" value={ratingMix} onChange={(e) => setRatingMix(e.target.value)} placeholder="Новый ratingMix" className="px-3 py-2 rounded-lg bg-surface border border-white/20" />
        <input value={ratingReason} onChange={(e) => setRatingReason(e.target.value)} placeholder="Причина (обязательно)" className="px-3 py-2 rounded-lg bg-surface border border-white/20" required />
        <button type="submit" disabled={loading} className="px-4 py-2 rounded-lg bg-brand text-surface font-semibold disabled:opacity-60">
          Применить
        </button>
      </form>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void runOverride({
            type: 'player_recalc',
            playerId: recalcPlayerId,
            reason: recalcReason,
          });
        }}
        className="rounded-xl border border-white/15 bg-white/5 p-4 flex flex-col gap-3"
      >
        <h2 className="font-heading text-3xl leading-none">Пересчет игрока</h2>
        <input value={recalcPlayerId} onChange={(e) => setRecalcPlayerId(e.target.value)} placeholder="playerId" className="px-3 py-2 rounded-lg bg-surface border border-white/20" required />
        <input value={recalcReason} onChange={(e) => setRecalcReason(e.target.value)} placeholder="Причина (обязательно)" className="px-3 py-2 rounded-lg bg-surface border border-white/20" required />
        <button type="submit" disabled={loading} className="px-4 py-2 rounded-lg bg-brand text-surface font-semibold disabled:opacity-60">
          Запустить пересчет
        </button>
      </form>

      {message ? (
        <div className="lg:col-span-3 rounded-xl border border-white/15 bg-white/5 p-3 text-sm text-text-secondary">
          {message}
        </div>
      ) : null}
    </div>
  );
}
