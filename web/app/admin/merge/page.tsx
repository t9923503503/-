'use client';

import { useEffect, useState } from 'react';

type TempPlayer = { id: string; name: string; gender: string; tournamentsPlayed: number };
type Player = { id: string; name: string; gender: string };

export default function AdminMergePage() {
  const [tempPlayers, setTempPlayers] = useState<TempPlayer[]>([]);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [selectedTemp, setSelectedTemp] = useState<TempPlayer | null>(null);
  const [selectedReal, setSelectedReal] = useState<Player | null>(null);
  const [search, setSearch] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function loadTempPlayers() {
    const res = await fetch('/api/admin/merge', { cache: 'no-store' });
    setTempPlayers(await res.json().catch(() => []));
  }

  useEffect(() => {
    void (async () => {
      const [, pRes] = await Promise.all([
        loadTempPlayers(),
        fetch('/api/admin/players', { cache: 'no-store' }),
      ]);
      setAllPlayers(await pRes.json().catch(() => []));
    })();
  }, []);

  const filtered = allPlayers
    .filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()))
    .filter((p) => selectedTemp ? p.id !== selectedTemp.id : true);

  async function doMerge() {
    if (!selectedTemp || !selectedReal) return;
    if (!reason.trim()) {
      setMessage('Укажите причину склейки');
      return;
    }
    if (!confirm(`Склеить "${selectedTemp.name}" → "${selectedReal.name}"? Это действие необратимо.`)) return;

    setLoading(true);
    setMessage('');
    const res = await fetch('/api/admin/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tempId: selectedTemp.id, realId: selectedReal.id, reason: reason.trim() }),
    });
    setLoading(false);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setMessage(err?.error || 'Ошибка склейки');
      return;
    }

    const result = await res.json();
    setMessage(`Склейка выполнена. Перенесено записей: ${result.moved ?? 0}`);
    setSelectedTemp(null);
    setSelectedReal(null);
    setReason('');
    await loadTempPlayers();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Left: temp players */}
        <div className="rounded-xl border border-white/15 bg-white/5 p-4 flex flex-col gap-3">
          <h2 className="font-heading text-3xl leading-none">Временные игроки</h2>
          <div className="max-h-96 overflow-y-auto flex flex-col gap-1">
            {tempPlayers.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedTemp(p)}
                className={`text-left px-3 py-2 rounded-lg border transition-colors text-sm ${
                  selectedTemp?.id === p.id
                    ? 'border-brand bg-brand/10'
                    : 'border-white/10 hover:border-brand'
                }`}
              >
                <span>{p.name}</span>
                <span className="text-text-secondary ml-2">
                  {p.gender === 'W' ? '♀️' : '♂️'} · {p.tournamentsPlayed} турнир(ов)
                </span>
              </button>
            ))}
            {tempPlayers.length === 0 ? (
              <p className="text-sm text-text-secondary">Нет временных игроков</p>
            ) : null}
          </div>
        </div>

        {/* Right: target player search */}
        <div className="rounded-xl border border-white/15 bg-white/5 p-4 flex flex-col gap-3">
          <h2 className="font-heading text-3xl leading-none">Целевой игрок</h2>
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
                onClick={() => setSelectedReal(p)}
                className={`text-left px-3 py-2 rounded-lg border transition-colors text-sm ${
                  selectedReal?.id === p.id
                    ? 'border-brand bg-brand/10'
                    : 'border-white/10 hover:border-brand'
                }`}
              >
                {p.name} <span className="text-text-secondary">{p.gender === 'W' ? '♀️' : '♂️'}</span>
              </button>
            ))}
            {filtered.length === 0 ? (
              <p className="text-sm text-text-secondary">Нет игроков</p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Merge panel */}
      {selectedTemp || selectedReal ? (
        <div className="rounded-xl border border-white/15 bg-white/5 p-4 flex flex-col gap-3">
          <h3 className="font-heading text-2xl leading-none">Склейка</h3>
          <div className="text-sm flex gap-4">
            <div>
              <span className="text-text-secondary">Временный: </span>
              {selectedTemp ? selectedTemp.name : <span className="text-text-secondary">не выбран</span>}
            </div>
            <div>
              <span className="text-text-secondary">→ Целевой: </span>
              {selectedReal ? selectedReal.name : <span className="text-text-secondary">не выбран</span>}
            </div>
          </div>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Причина склейки (обязательно)"
            className="px-3 py-2 rounded-lg bg-surface border border-white/20"
          />
          <button
            type="button"
            disabled={loading || !selectedTemp || !selectedReal || !reason.trim()}
            onClick={() => void doMerge()}
            className="self-start px-4 py-2 rounded-lg bg-brand text-white font-medium disabled:opacity-40"
          >
            Склеить
          </button>
        </div>
      ) : null}

      {message ? (
        <div className="rounded-xl border border-white/15 bg-white/5 p-3 text-sm text-text-secondary">{message}</div>
      ) : null}
    </div>
  );
}
