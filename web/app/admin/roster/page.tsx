'use client';

import { useEffect, useState } from 'react';

type Tournament = {
  id: string;
  name: string;
  date: string;
  status: string;
  capacity: number;
  format: string;
};

type Participant = {
  id: string;
  playerId: string;
  playerName: string;
  gender: 'M' | 'W';
  isWaitlist: boolean;
  position: number;
  registeredAt: string;
};

type Player = { id: string; name: string; gender: string };

function normalizeJudgeFormat(format: string): 'ipt' | 'thai' | 'kotc' {
  const normalized = String(format || '').trim().toLowerCase();
  if (normalized.includes('ipt')) return 'ipt';
  if (normalized.includes('thai')) return 'thai';
  return 'kotc';
}

function buildSudyamHref(tournament: Pick<Tournament, 'id' | 'format'>): string {
  const format = normalizeJudgeFormat(tournament.format);
  return `/sudyam?tournamentId=${encodeURIComponent(tournament.id)}&format=${encodeURIComponent(format)}`;
}

export default function AdminRosterPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      const [tRes, pRes] = await Promise.all([
        fetch('/api/admin/tournaments', { cache: 'no-store' }),
        fetch('/api/admin/players', { cache: 'no-store' }),
      ]);
      setTournaments(await tRes.json().catch(() => []));
      setAllPlayers(await pRes.json().catch(() => []));
    })();
  }, []);

  async function loadParticipants(tid: string) {
    if (!tid) {
      setParticipants([]);
      return;
    }
    const res = await fetch(`/api/admin/roster?tournamentId=${encodeURIComponent(tid)}`, {
      cache: 'no-store',
    });
    setParticipants(await res.json().catch(() => []));
  }

  function selectTournament(tid: string) {
    setSelectedId(tid);
    void loadParticipants(tid);
  }

  async function rosterAction(action: string, playerId: string) {
    setLoading(true);
    setMessage('');
    const res = await fetch('/api/admin/roster', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, tournamentId: selectedId, playerId }),
    });
    setLoading(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setMessage(err?.error || 'Ошибка');
      return;
    }
    setMessage(action === 'add' ? 'Добавлен' : action === 'remove' ? 'Удалён' : 'Повышен');
    await loadParticipants(selectedId);
  }

  const main = participants.filter((p) => !p.isWaitlist);
  const waitlist = participants.filter((p) => p.isWaitlist);
  const selectedT = tournaments.find((t) => t.id === selectedId);
  const registeredIds = new Set(participants.map((p) => p.playerId));
  const filtered = allPlayers
    .filter((p) => !registeredIds.has(p.id))
    .filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 items-end">
        <select
          value={selectedId}
          onChange={(e) => selectTournament(e.target.value)}
          className="flex-1 px-3 py-2 rounded-lg bg-surface border border-white/20"
        >
          <option value="">Выберите турнир</option>
          {tournaments.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.date}) - {t.status}
            </option>
          ))}
        </select>
      </div>

      {selectedT ? (
        <div className="flex flex-wrap items-center gap-3 text-sm text-text-secondary">
          <span>
            Capacity: {main.length} / {selectedT.capacity}
            {waitlist.length > 0 ? ` (+${waitlist.length} в ожидании)` : ''}
          </span>
          <a
            href={buildSudyamHref(selectedT)}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-xl border border-brand/40 bg-brand/10 text-brand-light text-sm font-semibold"
          >
            Open in Sudyam
          </a>
        </div>
      ) : null}

      <div className="grid lg:grid-cols-[1.2fr_1fr] gap-4">
        <div className="rounded-xl border border-white/15 bg-white/5 p-4">
          <h2 className="font-heading text-3xl leading-none mb-3">Основной состав</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text-secondary border-b border-white/10">
                  <th className="py-2 pr-3">#</th>
                  <th className="py-2 pr-3">Игрок</th>
                  <th className="py-2 pr-3">Пол</th>
                  <th className="py-2 pr-3">Действия</th>
                </tr>
              </thead>
              <tbody>
                {main.map((p, i) => (
                  <tr key={p.id} className="border-b border-white/5">
                    <td className="py-2 pr-3">{i + 1}</td>
                    <td className="py-2 pr-3">{p.playerName}</td>
                    <td className="py-2 pr-3">{p.gender === 'W' ? '♀️' : '♂️'}</td>
                    <td className="py-2 pr-3">
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => void rosterAction('remove', p.playerId)}
                        className="px-2 py-1 rounded border border-red-500/60 text-red-300 text-xs"
                      >
                        Удалить
                      </button>
                    </td>
                  </tr>
                ))}
                {main.length === 0 ? (
                  <tr>
                    <td className="py-3 text-text-secondary" colSpan={4}>
                      Пусто
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {waitlist.length > 0 ? (
            <>
              <h3 className="font-heading text-2xl leading-none mt-6 mb-2">Лист ожидания</h3>
              <table className="w-full text-sm">
                <tbody>
                  {waitlist.map((p, i) => (
                    <tr key={p.id} className="border-b border-white/5">
                      <td className="py-2 pr-3 text-text-secondary">⏳ {i + 1}</td>
                      <td className="py-2 pr-3">{p.playerName}</td>
                      <td className="py-2 pr-3">{p.gender === 'W' ? '♀️' : '♂️'}</td>
                      <td className="py-2 pr-3 flex gap-1">
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => void rosterAction('promote', p.playerId)}
                          className="px-2 py-1 rounded border border-white/20 hover:border-brand text-xs"
                        >
                          Повысить
                        </button>
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => void rosterAction('remove', p.playerId)}
                          className="px-2 py-1 rounded border border-red-500/60 text-red-300 text-xs"
                        >
                          Удалить
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}
        </div>

        <div className="rounded-xl border border-white/15 bg-white/5 p-4 flex flex-col gap-3">
          <h2 className="font-heading text-3xl leading-none">Добавить игрока</h2>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по имени"
            className="px-3 py-2 rounded-lg bg-surface border border-white/20"
          />
          <div className="max-h-80 overflow-y-auto flex flex-col gap-1">
            {filtered.slice(0, 50).map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={loading || !selectedId}
                onClick={() => void rosterAction('add', p.id)}
                className="text-left px-3 py-2 rounded-lg border border-white/10 hover:border-brand transition-colors text-sm disabled:opacity-40"
              >
                {p.name} <span className="text-text-secondary">{p.gender === 'W' ? '♀️' : '♂️'}</span>
              </button>
            ))}
            {filtered.length === 0 ? <p className="text-sm text-text-secondary">Нет игроков</p> : null}
          </div>
        </div>
      </div>

      {message ? (
        <div className="rounded-xl border border-white/15 bg-white/5 p-3 text-sm text-text-secondary">{message}</div>
      ) : null}
    </div>
  );
}
