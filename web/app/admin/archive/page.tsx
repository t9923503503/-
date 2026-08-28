'use client';

import { useEffect, useState, type ClipboardEvent } from 'react';
import TournamentMediaManager from '@/components/admin/TournamentMediaManager';
import {
  parseArchiveResultsTsv,
  renumberArchivePlacements,
  sanitizeArchiveRow,
  validateArchiveRows,
  type ArchiveImportResult,
  type ArchiveResultRow,
} from '@/lib/archive-results';
import {
  normalizeTournamentRatingLevel,
  ratingPointsForLevelPlace,
  type TournamentRatingLevel,
} from '@/lib/rating-points';

type ResultRow = ArchiveResultRow;

type Tournament = {
  id: string;
  name: string;
  date: string;
  format: string;
  division: string;
  level?: string;
  photoUrl: string;
  results: ResultRow[];
};

const LEVEL_OPTIONS: Array<{ value: TournamentRatingLevel; label: string }> = [
  { value: 'hard', label: 'HARD' },
  { value: 'advance', label: 'ADVANCE' },
  { value: 'medium', label: 'MEDIUM' },
  { value: 'lite', label: 'LITE' },
];

const POOL_OPTIONS = [
  { value: 'pro', label: 'Рейтинг: профи' },
  { value: 'novice', label: 'Рейтинг: новичок (50%)' },
] as const;

const emptyResult = (level: TournamentRatingLevel, placement = 1): ResultRow => ({
  playerName: '',
  gender: 'M',
  placement,
  points: 0,
  ratingPool: 'pro',
  ratingLevel: level,
});

function ratingPreview(row: ResultRow): number {
  if (row.ratingExcluded) return 0;
  return ratingPointsForLevelPlace(row.placement, row.ratingLevel, row.ratingPool);
}

function formatIssues(prefix: string, issues: string[]): string {
  return issues.length ? `${prefix}: ${issues.join(' ')}` : '';
}

function buildRowsFromPlainList(text: string, startPlacement: number, level: TournamentRatingLevel): ResultRow[] {
  return String(text ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((playerName, index) => ({ ...emptyResult(level, startPlacement + index), playerName }));
}

function escapeTsvValue(value: string | number | boolean): string {
  return String(value ?? '').replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
}

function toTsv(rows: ResultRow[], withHeader = true): string {
  const header = 'Имя\tПол\tУровень\tПул\tМесто\tОчки\tRatingPts\tБез рейтинга';
  const body = rows.map((row) => [
    escapeTsvValue(row.playerName),
    row.gender === 'W' ? 'Ж' : 'М',
    row.ratingLevel.toUpperCase(),
    row.ratingPool,
    row.placement,
    row.points,
    row.ratingPts ?? '',
    row.ratingExcluded ? 'да' : '',
  ].join('\t'));
  return withHeader ? [header, ...body].join('\n') : body.join('\n');
}

export default function AdminArchivePage() {
  const [rows, setRows] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [resultsForm, setResultsForm] = useState<ResultRow[]>([emptyResult('hard')]);
  const [resultsLevel, setResultsLevel] = useState<TournamentRatingLevel>('hard');
  const [bulkLevel, setBulkLevel] = useState<TournamentRatingLevel>('hard');
  const [bulkPool, setBulkPool] = useState<'pro' | 'novice'>('pro');
  const [importText, setImportText] = useState('');
  const [parsedImport, setParsedImport] = useState<ArchiveImportResult | null>(null);
  const [photoTarget, setPhotoTarget] = useState<string | null>(null);

  function downloadTextFile(fileName: string, content: string) {
    const blob = new Blob([content], { type: 'text/tab-separated-values;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }

  async function load() {
    const res = await fetch('/api/archive', { cache: 'no-store' });
    const data = await res.json();
    setRows(Array.isArray(data) ? data : []);
  }

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!expanded || (!event.ctrlKey && !event.metaKey)) return;
      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveResults(expanded);
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        addRow();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  function openResults(t: Tournament) {
    const tournamentLevel = normalizeTournamentRatingLevel(t.level);
    setExpanded(t.id);
    setResultsLevel(tournamentLevel);
    setBulkLevel(tournamentLevel);
    setBulkPool('pro');
    setImportText('');
    setParsedImport(null);
    setResultsForm(
      t.results.length > 0
        ? t.results.map((r) => {
            const normalized = sanitizeArchiveRow(r as unknown as Record<string, unknown>, tournamentLevel);
            const autoPts = ratingPointsForLevelPlace(normalized.placement, normalized.ratingLevel, normalized.ratingPool);
            return {
              ...normalized,
              ratingPts: typeof r.ratingPts === 'number' && r.ratingPts > 0 && r.ratingPts !== autoPts
                ? r.ratingPts
                : undefined,
            };
          })
        : [emptyResult(tournamentLevel)]
    );
    setMessage('');
  }

  function closeResults() {
    setExpanded(null);
    setResultsForm([emptyResult('hard')]);
    setResultsLevel('hard');
    setBulkLevel('hard');
    setBulkPool('pro');
    setImportText('');
    setParsedImport(null);
  }

  function addRow() {
    setResultsForm((prev) => [...prev, emptyResult(resultsLevel, prev.length + 1)]);
  }

  function renumberRows() {
    setResultsForm((prev) => renumberArchivePlacements(prev));
  }

  function removeRow(idx: number) {
    setResultsForm((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      return next.length ? renumberArchivePlacements(next) : [emptyResult(resultsLevel)];
    });
  }

  function duplicateRow(idx: number) {
    setResultsForm((prev) => {
      const next = [...prev];
      next.splice(idx + 1, 0, { ...(prev[idx] ?? emptyResult(resultsLevel)) });
      return renumberArchivePlacements(next);
    });
  }

  function updateRow(idx: number, field: keyof ResultRow, value: string | number | boolean) {
    setResultsForm((prev) => prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row)));
  }

  function updateManualRating(idx: number, value: string) {
    const parsed = Number(value);
    updateRow(idx, 'ratingPts', Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0);
    if (!value.trim()) clearManualRating(idx);
  }

  function clearManualRating(idx: number) {
    setResultsForm((prev) => prev.map((row, i) => i === idx ? { ...row, ratingPts: undefined } : row));
  }

  function clearAllManualRatings() {
    setResultsForm((prev) => prev.map((row) => ({ ...row, ratingPts: undefined })));
  }

  function applyBulkLevel() {
    setResultsForm((prev) => prev.map((row) => ({ ...row, ratingLevel: bulkLevel })));
  }

  function applyBulkPool() {
    setResultsForm((prev) => prev.map((row) => ({ ...row, ratingPool: bulkPool })));
  }

  function parseImport() {
    const parsed = parseArchiveResultsTsv(importText, resultsLevel);
    setParsedImport(parsed);
    setMessage(parsed.errors.length
      ? formatIssues('Импорт не разобран', parsed.errors)
      : `Разобрано строк: ${parsed.rows.length}.${parsed.warnings.length ? ` ${formatIssues('Предупреждения', parsed.warnings)}` : ''}`);
  }

  function applyParsedImport(mode: 'replace' | 'append') {
    if (!parsedImport || parsedImport.errors.length || !parsedImport.rows.length) return;
    setResultsForm((prev) => renumberArchivePlacements(mode === 'replace' ? parsedImport.rows : [...prev, ...parsedImport.rows]));
    setMessage(mode === 'replace' ? 'TSV заменил текущую таблицу.' : 'TSV добавлен к текущей таблице.');
  }

  function handleNamePaste(e: ClipboardEvent<HTMLInputElement>, idx: number) {
    const text = e.clipboardData.getData('text/plain');
    if (!text.includes('\t') && !text.includes('\n')) return;
    const parsed = text.includes('\t')
      ? parseArchiveResultsTsv(text, resultsLevel)
      : { rows: buildRowsFromPlainList(text, idx + 1, resultsLevel), errors: [], warnings: [], hasHeader: false };
    if (!parsed.rows.length) return;
    e.preventDefault();
    setParsedImport(parsed);
    if (parsed.errors.length) {
      setMessage(formatIssues('Вставка не применена', parsed.errors));
      return;
    }
    setResultsForm((prev) => {
      const next = [...prev];
      parsed.rows.forEach((row, offset) => {
        const target = idx + offset;
        next[target] = target < next.length ? { ...next[target], ...row } : row;
      });
      return renumberArchivePlacements(next);
    });
  }

  async function saveResults(tournamentId: string) {
    const validation = validateArchiveRows(resultsForm);
    if (validation.errors.length) {
      setMessage(formatIssues('Сохранение остановлено', validation.errors));
      return;
    }
    if (validation.warnings.length && !confirm(`Есть предупреждения:\n\n${validation.warnings.join('\n')}\n\nСохранить всё равно?`)) return;
    setLoading(true);
    setMessage('');
    const res = await fetch(`/api/admin/tournaments/${tournamentId}/results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level: resultsLevel, results: resultsForm }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      const warnings = Array.isArray(data.validation?.warnings) ? data.validation.warnings : [];
      setMessage(`Сохранено ${data.inserted} результатов.${warnings.length ? ` ${formatIssues('Предупреждения', warnings)}` : ''}`);
      await load();
    } else {
      const errors = Array.isArray(data.validation?.errors) ? data.validation.errors : [data.error ?? 'неизвестно'];
      setMessage(formatIssues('Ошибка', errors));
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
  }

  const photoTournament = rows.find((tournament) => tournament.id === photoTarget) ?? null;

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

      {photoTournament ? (
        <TournamentMediaManager
          tournamentId={photoTournament.id}
          tournamentName={photoTournament.name}
          initialAlbumUrl={photoTournament.photoUrl || ''}
          onClose={() => setPhotoTarget(null)}
          onChanged={load}
        />
      ) : null}

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
                    📸 Фото и галерея
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
                  <p className="text-xs text-text-secondary leading-relaxed">
                    Рейтинговые очки считаются по уровню и месту; ручное значение имеет приоритет. Ctrl+S сохраняет,
                    Ctrl+Enter добавляет строку. Слоты с заменой можно оставить в истории без авто-бонуса.
                  </p>
                  <div className="grid gap-3 rounded-xl border border-white/10 bg-black/10 p-3 md:grid-cols-[minmax(0,1fr)_auto]">
                    <label className="flex flex-col gap-1 text-xs text-text-secondary">
                      Уровень турнира
                      <select
                        value={resultsLevel}
                        onChange={(e) => setResultsLevel(normalizeTournamentRatingLevel(e.target.value))}
                        className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-text-primary"
                      >
                        {LEVEL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                    <div className="flex flex-wrap items-end gap-2">
                      <button type="button" onClick={renumberRows} className="rounded-lg border border-white/20 px-3 py-2 text-xs hover:border-brand">
                        Перенумеровать
                      </button>
                      <button type="button" onClick={clearAllManualRatings} className="rounded-lg border border-white/20 px-3 py-2 text-xs hover:border-brand">
                        Сбросить ручной рейтинг
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadTextFile(`${t.id}-results.tsv`, toTsv(resultsForm))}
                        className="rounded-lg border border-white/20 px-3 py-2 text-xs hover:border-brand"
                      >
                        Экспорт текущей таблицы
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadTextFile('lpvolley-results-template.tsv', toTsv([emptyResult(resultsLevel)]))}
                        className="rounded-lg border border-white/20 px-3 py-2 text-xs hover:border-brand"
                      >
                        Скачать шаблон TSV
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 rounded-xl border border-white/10 bg-black/10 p-3">
                    <select value={bulkLevel} onChange={(e) => setBulkLevel(normalizeTournamentRatingLevel(e.target.value))} className="rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-xs">
                      {LEVEL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    <button type="button" onClick={applyBulkLevel} className="rounded-lg border border-white/20 px-3 py-1.5 text-xs hover:border-brand">Применить уровень всем</button>
                    <select value={bulkPool} onChange={(e) => setBulkPool(e.target.value === 'novice' ? 'novice' : 'pro')} className="rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-xs">
                      {POOL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    <button type="button" onClick={applyBulkPool} className="rounded-lg border border-white/20 px-3 py-1.5 text-xs hover:border-brand">Применить пул всем</button>
                  </div>
                  <div className="flex flex-col gap-2">
                    {resultsForm.map((r, idx) => {
                      const autoPts = ratingPointsForLevelPlace(r.placement, r.ratingLevel, r.ratingPool);
                      const previewPts = typeof r.ratingPts === 'number' && r.ratingPts > 0 ? r.ratingPts : ratingPreview(r);
                      return (
                      <div key={idx} className="flex gap-2 items-center flex-wrap rounded-xl border border-white/10 p-2">
                        <span className="text-text-secondary text-xs w-5 text-right">{idx + 1}.</span>
                        <input
                          type="text"
                          value={r.playerName}
                          onChange={(e) => updateRow(idx, 'playerName', e.target.value)}
                          onPaste={(e) => handleNamePaste(e, idx)}
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
                        <select
                          value={r.ratingLevel}
                          onChange={(e) =>
                            updateRow(idx, 'ratingLevel', normalizeTournamentRatingLevel(e.target.value))
                          }
                          title="Уровень рейтинга"
                          className="px-2 py-1 text-sm rounded bg-white/10 border border-white/20"
                        >
                          {LEVEL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                        <select
                          value={r.ratingPool}
                          onChange={(e) => updateRow(idx, 'ratingPool', e.target.value as 'pro' | 'novice')}
                          title="Пул для рейтинга"
                          className="px-2 py-1 text-sm rounded bg-white/10 border border-white/20 max-w-[140px]"
                        >
                          <option value="pro">Рейтинг: профи</option>
                          <option value="novice">Рейтинг: новичок (½)</option>
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
                        <input
                          type="number"
                          value={typeof r.ratingPts === 'number' ? r.ratingPts : ''}
                          onChange={(e) => updateManualRating(idx, e.target.value)}
                          placeholder={String(autoPts)}
                          min={1}
                          disabled={Boolean(r.ratingExcluded)}
                          title="Ручные рейтинговые очки; пусто означает авторасчёт"
                          className="w-20 px-2 py-1 text-sm rounded bg-white/10 border border-white/20 disabled:opacity-50"
                        />
                        <span
                          className="text-xs text-text-secondary tabular-nums min-w-[5rem]"
                          title="Итоговые очки в общий рейтинг"
                        >
                          {r.ratingExcluded
                            ? 'без авто-бонуса'
                            : `R:${previewPts}`}
                        </span>
                        <label className="inline-flex items-center gap-1 text-[11px] text-text-secondary">
                          <input type="checkbox" checked={Boolean(r.ratingExcluded)} onChange={(e) => updateRow(idx, 'ratingExcluded', e.target.checked)} />
                          Без рейтинга
                        </label>
                        {typeof r.ratingPts === 'number' && r.ratingPts > 0 ? (
                          <button type="button" onClick={() => clearManualRating(idx)} className="rounded border border-white/20 px-2 py-1 text-[11px] hover:border-brand">Авто</button>
                        ) : null}
                        <button type="button" onClick={() => duplicateRow(idx)} className="rounded border border-white/20 px-2 py-1 text-[11px] hover:border-brand">Копия</button>
                        <button
                          type="button"
                          onClick={() => removeRow(idx)}
                          className="text-red-400 hover:text-red-300 text-sm px-1"
                        >
                          ✕
                        </button>
                      </div>
                      );
                    })}
                  </div>
                  <div className="grid gap-3 rounded-xl border border-white/10 bg-black/10 p-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                    <textarea
                      value={importText}
                      onChange={(e) => setImportText(e.target.value)}
                      rows={6}
                      placeholder={'Имя\tПол\tУровень\tПул\tМесто\tОчки\tRatingPts'}
                      className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 font-mono text-sm"
                    />
                    <div className="flex flex-col items-stretch gap-2">
                      <button type="button" onClick={parseImport} className="rounded-lg border border-white/20 px-3 py-1.5 text-xs hover:border-brand">Разобрать TSV</button>
                      <button type="button" onClick={() => applyParsedImport('replace')} disabled={!parsedImport || Boolean(parsedImport.errors.length)} className="rounded-lg border border-white/20 px-3 py-1.5 text-xs hover:border-brand disabled:opacity-40">Заменить текущую таблицу</button>
                      <button type="button" onClick={() => applyParsedImport('append')} disabled={!parsedImport || Boolean(parsedImport.errors.length)} className="rounded-lg border border-white/20 px-3 py-1.5 text-xs hover:border-brand disabled:opacity-40">Добавить к текущей таблице</button>
                    </div>
                  </div>
                  {parsedImport ? (
                    <p className="text-xs text-text-secondary">
                      Preview: {parsedImport.rows.length} строк. {formatIssues('Ошибки', parsedImport.errors)} {formatIssues('Предупреждения', parsedImport.warnings)}
                    </p>
                  ) : null}
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
