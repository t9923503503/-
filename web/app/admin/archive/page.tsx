'use client';

import { useEffect, useState } from 'react';

type ResultRow = {
  playerName: string;
  gender: 'M' | 'W';
  placement: number;
  points: number;
};

type Tournament = {
  id: string;
  name: string;
  date: string;
  format: string;
  division: string;
  photoUrl: string;
  results: ResultRow[];
};

const emptyResult: ResultRow = { playerName: '', gender: 'M', placement: 1, points: 0 };

export default function AdminArchivePage() {
  const [rows, setRows] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [resultsForm, setResultsForm] = useState<ResultRow[]>([{ ...emptyResult }]);
  const [photoInput, setPhotoInput] = useState('');
  const [photoTarget, setPhotoTarget] = useState<string | null>(null);

  async function load() {
    const res = await fetch('/api/archive', { cache: 'no-store' });
    const data = await res.json();
    setRows(Array.isArray(data) ? data : []);
  }

  useEffect(() => { void load(); }, []);

  function openResults(t: Tournament) {
    setExpanded(t.id);
    setResultsForm(
      t.results.length > 0
        ? t.results.map((r) => ({ ...r }))
        : [{ ...emptyResult }]
    );
    setMessage('');
  }

  function closeResults() {
    setExpanded(null);
    setResultsForm([{ ...emptyResult }]);
  }

  function addRow() {
    setResultsForm((prev) => [
      ...prev,
      { playerName: '', gender: 'M', placement: prev.length + 1, points: 0 },
    ]);
  }

  function removeRow(idx: number) {
    setResultsForm((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateRow(idx: number, field: keyof ResultRow, value: string | number) {
    setResultsForm((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r))
    );
  }

  async function saveResults(tournamentId: string) {
    setLoading(true);
    setMessage('');
    const res = await fetch(`/api/admin/tournaments/${tournamentId}/results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ results: resultsForm }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      setMessage(`✅ Сохранено ${data.inserted} результатов`);
      await load();
    } else {
      setMessage(`❌ Ошибка: ${data.error ?? 'неизвестно'}`);
    }
  }

  async function clearResults(tournamentId: string) {
    if (!confirm('Очистить все результаты этого турнира?')) return;
    setLoading(true);
    await fetch(`/api/admin/tournaments/${tournamentId}/results`, { method: 'DELETE' });
    setLoading(false);
    setMessage('✅ Результаты удалены');
    closeResults();
    await load();
  }

  function openPhoto(t: Tournament) {
    setPhotoTarget(t.id);
    setPhotoInput(t.photoUrl ?? '');
  }

  async function savePhoto() {
    if (!photoTarget) return;
    setLoading(true);
    const res = await fetch(`/api/admin/tournaments/${photoTarget}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photo_url: photoInput }),
    });
    setLoading(false);
    if (res.ok) {
      setPhotoTarget(null);
      await load();
    } else {
      const data = await res.json();
      setMessage(`❌ ${data.error ?? 'Ошибка сохранения фото'}`);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-2xl">📚 Архив турниров</h2>
        <button
          type="button"
          onClick={load}
          className="px-3 py-1.5 text-sm rounded-lg border border-white/20 hover:border-brand transition-colors"
        >
          Обновить
        </button>
      </div>

      {message && (
        <p className="text-sm px-3 py-2 rounded-lg border border-white/20 bg-white/5">{message}</p>
      )}

      {/* Photo modal */}
      {photoTarget && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-surface p-6 flex flex-col gap-4">
            <h3 className="font-heading text-lg">📸 Ссылка на фото</h3>
            <input
              type="url"
              value={photoInput}
              onChange={(e) => setPhotoInput(e.target.value)}
              placeholder="https://drive.google.com/..."
              className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-sm"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={savePhoto}
                disabled={loading}
                className="flex-1 px-4 py-2 rounded-lg bg-brand text-surface text-sm font-semibold disabled:opacity-60"
              >
                {loading ? 'Сохранение...' : 'Сохранить'}
              </button>
              <button
                type="button"
                onClick={() => setPhotoTarget(null)}
                className="px-4 py-2 rounded-lg border border-white/20 text-sm"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-text-secondary text-sm">
          Нет завершённых турниров. Переведите турнир в статус &quot;finished&quot; через страницу Турниры.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((t) => (
            <div
              key={t.id}
              className="rounded-2xl border border-white/15 bg-white/5 p-4 flex flex-col gap-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{t.name}</p>
                  <p className="text-sm text-text-secondary">
                    {t.date} · {t.format} · {t.division}
                  </p>
                  {t.photoUrl && (
                    <a
                      href={t.photoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-brand underline mt-1 inline-block"
                    >
                      📸 Смотреть фото
                    </a>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => openPhoto(t)}
                    className="px-3 py-1.5 text-xs rounded-lg border border-white/20 hover:border-brand transition-colors"
                  >
                    {t.photoUrl ? '✏️ Изм. фото' : '📸 Добавить фото'}
                  </button>
                  <button
                    type="button"
                    onClick={() => expanded === t.id ? closeResults() : openResults(t)}
                    className="px-3 py-1.5 text-xs rounded-lg border border-white/20 hover:border-brand transition-colors"
                  >
                    {expanded === t.id ? '▲ Скрыть' : `👥 Результаты (${t.results.length})`}
                  </button>
                </div>
              </div>

              {expanded === t.id && (
                <div className="flex flex-col gap-3 border-t border-white/10 pt-3">
                  <div className="flex flex-col gap-2">
                    {resultsForm.map((r, idx) => (
                      <div key={idx} className="flex gap-2 items-center flex-wrap">
                        <span className="text-text-secondary text-xs w-5 text-right">{idx + 1}.</span>
                        <input
                          type="text"
                          value={r.playerName}
                          onChange={(e) => updateRow(idx, 'playerName', e.target.value)}
                          placeholder="Фамилия Имя"
                          className="flex-1 min-w-[120px] px-2 py-1 text-sm rounded bg-white/10 border border-white/20"
                        />
                        <select
                          value={r.gender}
                          onChange={(e) => updateRow(idx, 'gender', e.target.value)}
                          className="px-2 py-1 text-sm rounded bg-white/10 border border-white/20"
                        >
                          <option value="M">М</option>
                          <option value="W">Ж</option>
                        </select>
                        <input
                          type="number"
                          value={r.placement}
                          onChange={(e) => updateRow(idx, 'placement', Number(e.target.value))}
                          placeholder="Место"
                          min={1}
                          className="w-16 px-2 py-1 text-sm rounded bg-white/10 border border-white/20"
                        />
                        <input
                          type="number"
                          value={r.points}
                          onChange={(e) => updateRow(idx, 'points', Number(e.target.value))}
                          placeholder="Очки"
                          min={0}
                          className="w-16 px-2 py-1 text-sm rounded bg-white/10 border border-white/20"
                        />
                        <button
                          type="button"
                          onClick={() => removeRow(idx)}
                          className="text-red-400 hover:text-red-300 text-sm px-1"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={addRow}
                      className="px-3 py-1.5 text-xs rounded-lg border border-white/20 hover:border-brand transition-colors"
                    >
                      + Добавить игрока
                    </button>
                    <button
                      type="button"
                      onClick={() => saveResults(t.id)}
                      disabled={loading}
                      className="px-3 py-1.5 text-xs rounded-lg bg-brand text-surface font-semibold disabled:opacity-60"
                    >
                      {loading ? 'Сохранение...' : '💾 Сохранить результаты'}
                    </button>
                    <button
                      type="button"
                      onClick={() => clearResults(t.id)}
                      disabled={loading}
                      className="px-3 py-1.5 text-xs rounded-lg border border-red-500/40 text-red-400 hover:border-red-400 transition-colors disabled:opacity-60"
                    >
                      🗑 Очистить
                    </button>
                  </div>
                  {message && <p className="text-xs text-text-secondary">{message}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
