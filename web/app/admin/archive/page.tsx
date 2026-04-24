'use client';

import { useEffect, useState, type ClipboardEvent } from 'react';
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
  results: Array<ResultRow & { ratingLevel?: TournamentRatingLevel; ratingPts?: number }>;
};

const LEVEL_OPTIONS: Array<{ value: TournamentRatingLevel; label: string }> = [
  { value: 'hard', label: 'HARD' },
  { value: 'advance', label: 'ADVANCE' },
  { value: 'medium', label: 'MEDIUM' },
  { value: 'lite', label: 'LITE' },
];

const PLAYER_LEVEL_OPTIONS = LEVEL_OPTIONS;

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
  return ratingPointsForLevelPlace(row.placement, row.ratingLevel, row.ratingPool);
}

function formatIssues(prefix: string, issues: string[]): string {
  if (!issues.length) return '';
  return `${prefix}: ${issues.join(' ')}`;
}

function buildRowsFromPlainList(text: string, startPlacement: number, level: TournamentRatingLevel): ResultRow[] {
  return String(text ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((playerName, index) => ({
      ...emptyResult(level, startPlacement + index),
      playerName,
    }));
}

function escapeTsvValue(value: string | number): string {
  const text = String(value ?? '');
  return text.replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
}

function toTsv(rows: ResultRow[], withHeader = true): string {
  const header = 'Имя\tПол\tУровень\tПул\tМесто\tОчки\tRatingPts';
  const body = rows.map((row) =>
    [
      escapeTsvValue(row.playerName),
      row.gender === 'W' ? 'Ж' : 'М',
      row.ratingLevel.toUpperCase(),
      row.ratingPool,
      row.placement,
      row.points,
      row.ratingPts ?? '',
    ].join('\t'),
  );
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
  const [photoInput, setPhotoInput] = useState('');
  const [photoTarget, setPhotoTarget] = useState<string | null>(null);
  const [importText, setImportText] = useState('');
  const [parsedImport, setParsedImport] = useState<ArchiveImportResult | null>(null);

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

  useEffect(() => {
    void load();
  }, []);

  function openResults(t: Tournament) {
    const tournamentLevel = normalizeTournamentRatingLevel(t.level);
    setExpanded(t.id);
    setResultsLevel(tournamentLevel);
    setBulkLevel(tournamentLevel);
    setBulkPool('pro');
    setParsedImport(null);
    setImportText('');
    setResultsForm(
      t.results.length > 0
        ? t.results.map((r) => {
            const normalized = sanitizeArchiveRow(r as unknown as Record<string, unknown>, tournamentLevel);
            const autoPts = ratingPointsForLevelPlace(
              Number(normalized.placement) || 0,
              normalized.ratingLevel,
              normalized.ratingPool,
            );
            return {
              ...normalized,
              ratingPts:
                typeof r.ratingPts === 'number' && r.ratingPts > 0 && r.ratingPts !== autoPts
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
    setResultsForm((prev) => [...prev, { ...emptyResult(resultsLevel), placement: prev.length + 1 }]);
  }

  function renumberRows() {
    setResultsForm((prev) => renumberArchivePlacements(prev));
  }

  function removeRow(idx: number) {
    setResultsForm((prev) => {
      const filtered = prev.filter((_, i) => i !== idx);
      return filtered.length ? renumberArchivePlacements(filtered) : [emptyResult(resultsLevel)];
    });
  }

  function duplicateRow(idx: number) {
    setResultsForm((prev) => {
      const next = [...prev];
      const source = prev[idx] ?? emptyResult(resultsLevel, idx + 1);
      next.splice(idx + 1, 0, { ...source });
      return renumberArchivePlacements(next);
    });
  }

  function updateRow(
    idx: number,
    field: keyof ResultRow,
    value: string | number | 'pro' | 'novice' | TournamentRatingLevel,
  ) {
    setResultsForm((prev) => prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row)));
  }

  function updateManualRating(idx: number, value: string) {
    const parsed = Number(value);
    setResultsForm((prev) =>
      prev.map((row, i) =>
        i === idx
          ? {
              ...row,
              ratingPts: Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : undefined,
            }
          : row,
      ),
    );
  }

  function clearManualRating(idx: number) {
    setResultsForm((prev) => prev.map((row, i) => (i === idx ? { ...row, ratingPts: undefined } : row)));
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
    if (parsed.errors.length) {
      setMessage(formatIssues('Импорт не разобран', parsed.errors));
      return;
    }
    setMessage(
      `Разобрано строк: ${parsed.rows.length}. ${parsed.hasHeader ? 'Заголовок найден.' : 'Без заголовка.'} ${
        parsed.warnings.length ? formatIssues('Предупреждения', parsed.warnings) : ''
      }`.trim(),
    );
  }

  function applyParsedImport(mode: 'replace' | 'append') {
    if (!parsedImport || parsedImport.errors.length || !parsedImport.rows.length) return;
    setResultsForm((prev) => {
      const next = mode === 'replace' ? parsedImport.rows : [...prev, ...parsedImport.rows];
      return renumberArchivePlacements(next);
    });
    setMessage(mode === 'replace' ? 'TSV заменил текущую таблицу.' : 'TSV добавлен к текущей таблице.');
  }

  function handleNamePaste(e: ClipboardEvent<HTMLInputElement>, idx: number) {
    const text = e.clipboardData.getData('text/plain');
    const looksLikeTable = text.includes('\t') || text.includes('\n');
    if (!looksLikeTable) return;

    const parsed = text.includes('\t')
      ? parseArchiveResultsTsv(text, resultsLevel)
      : {
          rows: buildRowsFromPlainList(text, idx + 1, resultsLevel),
          errors: [] as string[],
          warnings: [] as string[],
          hasHeader: false,
        };

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
        if (target < next.length) {
          next[target] = { ...next[target], ...row };
        } else {
          next.push(row);
        }
      });
      return renumberArchivePlacements(next);
    });
    setMessage(
      `Вставлено строк: ${parsed.rows.length}.${parsed.warnings.length ? ` ${formatIssues('Предупреждения', parsed.warnings)}` : ''}`,
    );
  }

  async function saveResults(tournamentId: string) {
    const validation = validateArchiveRows(resultsForm);
    if (validation.errors.length) {
      setMessage(formatIssues('Сохранение остановлено', validation.errors));
      return;
    }
    if (
      validation.warnings.length &&
      !confirm(`Есть предупреждения:\n\n${validation.warnings.join('\n')}\n\nСохранить всё равно?`)
    ) {
      return;
    }

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
      const serverWarnings = Array.isArray(data.validation?.warnings) ? data.validation.warnings : [];
      setMessage(
        `Сохранено ${data.inserted} результатов.${serverWarnings.length ? ` ${formatIssues('Предупреждения', serverWarnings)}` : ''}`,
      );
      await load();
    } else {
      const serverErrors = Array.isArray(data.validation?.errors) ? data.validation.errors : [];
      setMessage(
        formatIssues('Ошибка', serverErrors.length ? serverErrors : [data.error ?? 'неизвестно']) ||
          `Ошибка: ${data.error ?? 'неизвестно'}`,
      );
    }
  }

  async function clearResults(tournamentId: string) {
    if (!confirm('Очистить все результаты этого турнира?')) return;
    setLoading(true);
    await fetch(`/api/admin/tournaments/${tournamentId}/results`, { method: 'DELETE' });
    setLoading(false);
    setMessage('Результаты удалены');
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
      setMessage(data.error ?? 'Ошибка сохранения фото');
    }
  }

  const validation = validateArchiveRows(resultsForm);
  const rowsTotal = resultsForm.length;
  const proCount = resultsForm.filter((row) => row.ratingPool === 'pro').length;
  const noviceCount = rowsTotal - proCount;
  const manualOverridesCount = resultsForm.filter((row) => typeof row.ratingPts === 'number' && row.ratingPts > 0).length;

  useEffect(() => {
    if (!expanded) return;
    const tournamentId = expanded;
    function onKeydown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveResults(tournamentId);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        parseImport();
      }
    }
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  }, [expanded, importText, resultsForm, resultsLevel]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-2xl">Архив турниров</h2>
        <button
          type="button"
          onClick={load}
          className="px-3 py-1.5 text-sm rounded-lg border border-white/20 hover:border-brand transition-colors"
        >
          Обновить
        </button>
      </div>

      {message ? <p className="text-sm px-3 py-2 rounded-lg border border-white/20 bg-white/5">{message}</p> : null}

      {photoTarget ? (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-surface p-6 flex flex-col gap-4">
            <h3 className="font-heading text-lg">Ссылка на фото</h3>
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
      ) : null}

      {rows.length === 0 ? (
        <p className="text-text-secondary text-sm">
          Нет завершённых турниров. Переведите турнир в статус &quot;finished&quot; через страницу турниров.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((t) => (
            <div key={t.id} className="rounded-2xl border border-white/15 bg-white/5 p-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{t.name}</p>
                  <p className="text-sm text-text-secondary">
                    {t.date} · {t.format} · {t.division}
                    {t.level ? ` · ${String(t.level).toUpperCase()}` : ''}
                  </p>
                  {t.photoUrl ? (
                    <a
                      href={t.photoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-brand underline mt-1 inline-block"
                    >
                      Смотреть фото
                    </a>
                  ) : null}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => openPhoto(t)}
                    className="px-3 py-1.5 text-xs rounded-lg border border-white/20 hover:border-brand transition-colors"
                  >
                    {t.photoUrl ? 'Изм. фото' : 'Добавить фото'}
                  </button>
                  <button
                    type="button"
                    onClick={() => (expanded === t.id ? closeResults() : openResults(t))}
                    className="px-3 py-1.5 text-xs rounded-lg border border-white/20 hover:border-brand transition-colors"
                  >
                    {expanded === t.id ? 'Скрыть' : `Результаты (${t.results.length})`}
                  </button>
                </div>
              </div>

              {expanded === t.id ? (
                <div className="flex flex-col gap-4 border-t border-white/10 pt-3">
                  <p className="text-xs text-text-secondary leading-relaxed">
                    Для каждой строки можно выбрать свой уровень результата. Рейтинг считается от уровня строки, места и
                    пула игрока: профи получает полные очки, новичок — 50% с округлением. Ручной `ratingPts`
                    используется только как override поверх авторасчёта.
                  </p>

                  <div className="flex flex-wrap gap-3 items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-secondary">Уровень турнира:</span>
                      <select
                        value={resultsLevel}
                        onChange={(e) => setResultsLevel(normalizeTournamentRatingLevel(e.target.value))}
                        className="px-2 py-1 text-sm rounded bg-white/10 border border-white/20"
                      >
                        {LEVEL_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-secondary">Массовый уровень:</span>
                      <select
                        value={bulkLevel}
                        onChange={(e) => setBulkLevel(normalizeTournamentRatingLevel(e.target.value))}
                        className="px-2 py-1 text-sm rounded bg-white/10 border border-white/20"
                      >
                        {LEVEL_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={applyBulkLevel}
                        className="px-2 py-1 text-xs rounded border border-white/20 hover:border-brand"
                      >
                        Применить уровень всем
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-secondary">Массовый пул:</span>
                      <select
                        value={bulkPool}
                        onChange={(e) => setBulkPool(e.target.value === 'novice' ? 'novice' : 'pro')}
                        className="px-2 py-1 text-sm rounded bg-white/10 border border-white/20"
                      >
                        {POOL_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={applyBulkPool}
                        className="px-2 py-1 text-xs rounded border border-white/20 hover:border-brand"
                      >
                        Применить пул всем
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={renumberRows}
                      className="px-3 py-1.5 text-xs rounded-lg border border-white/20 hover:border-brand transition-colors"
                    >
                      Перенумеровать
                    </button>
                    <button
                      type="button"
                      onClick={clearAllManualRatings}
                      className="px-3 py-1.5 text-xs rounded-lg border border-white/20 hover:border-brand transition-colors"
                    >
                      Очистить overrides
                    </button>
                    <button
                      type="button"
                      onClick={addRow}
                      className="px-3 py-1.5 text-xs rounded-lg border border-white/20 hover:border-brand transition-colors"
                    >
                      + Добавить игрока
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => downloadTextFile('archive-results-template.tsv', toTsv([], true))}
                      className="px-3 py-1.5 text-xs rounded-lg border border-white/20 hover:border-brand transition-colors"
                    >
                      Скачать шаблон TSV
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadTextFile('archive-results-export.tsv', toTsv(resultsForm, true))}
                      className="px-3 py-1.5 text-xs rounded-lg border border-white/20 hover:border-brand transition-colors"
                    >
                      Экспорт текущей таблицы
                    </button>
                  </div>

                  <div className="text-xs text-text-secondary rounded-xl border border-white/10 bg-black/10 px-3 py-2">
                    Строк: {rowsTotal} · Профи: {proCount} · Новичок: {noviceCount} · Ручных overrides: {manualOverridesCount}
                    {' · '}Горячие клавиши: Ctrl+S сохранить, Ctrl+Enter разобрать TSV
                  </div>

                  <p className="text-xs text-text-secondary">
                    HARD: 100 / 90 / 82 / 76 · ADVANCE: 70 / 65 / 60 / 56 / 52 · MEDIUM: 48 / 44 / 42 / 40 · LITE:
                    38 / 36 / 34 / 32
                  </p>

                  {validation.errors.length || validation.warnings.length ? (
                    <div className="rounded-xl border border-white/10 bg-black/10 p-3 text-xs flex flex-col gap-1">
                      {validation.errors.length ? (
                        <p className="text-red-300">{formatIssues('Ошибки', validation.errors)}</p>
                      ) : null}
                      {validation.warnings.length ? (
                        <p className="text-amber-200">{formatIssues('Предупреждения', validation.warnings)}</p>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-2">
                    {resultsForm.map((r, idx) => {
                      const autoPts = ratingPreview(r);
                      const previewPts = typeof r.ratingPts === 'number' && r.ratingPts > 0 ? r.ratingPts : autoPts;
                      return (
                        <div key={idx} className="flex gap-2 items-center flex-wrap">
                          <span className="text-text-secondary text-xs w-5 text-right">{idx + 1}.</span>
                          <input
                            type="text"
                            value={r.playerName}
                            onChange={(e) => updateRow(idx, 'playerName', e.target.value)}
                            onPaste={(e) => handleNamePaste(e, idx)}
                            placeholder="Фамилия Имя"
                            className="flex-1 min-w-[160px] px-2 py-1 text-sm rounded bg-white/10 border border-white/20"
                          />
                          <select
                            value={r.gender}
                            onChange={(e) => updateRow(idx, 'gender', e.target.value === 'W' ? 'W' : 'M')}
                            className="px-2 py-1 text-sm rounded bg-white/10 border border-white/20"
                          >
                            <option value="M">М</option>
                            <option value="W">Ж</option>
                          </select>
                          <select
                            value={r.ratingPool}
                            onChange={(e) => updateRow(idx, 'ratingPool', e.target.value as 'pro' | 'novice')}
                            className="px-2 py-1 text-sm rounded bg-white/10 border border-white/20 max-w-[170px]"
                          >
                            {POOL_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <select
                            value={r.ratingLevel}
                            onChange={(e) =>
                              updateRow(idx, 'ratingLevel', normalizeTournamentRatingLevel(e.target.value))
                            }
                            className="px-2 py-1 text-sm rounded bg-white/10 border border-white/20 max-w-[120px]"
                          >
                            {PLAYER_LEVEL_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
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
                            className="w-20 px-2 py-1 text-sm rounded bg-white/10 border border-white/20"
                            title="Ручная правка рейтинговых очков. Оставьте пустым для авторасчёта."
                          />
                          <span className="text-xs text-text-secondary tabular-nums min-w-[5rem]">
                            {previewPts > 0 ? `R:${previewPts}` : ''}
                          </span>
                          {typeof r.ratingPts === 'number' && r.ratingPts > 0 ? (
                            <button
                              type="button"
                              onClick={() => clearManualRating(idx)}
                              className="px-2 py-1 text-[11px] rounded border border-white/20 text-text-secondary hover:border-brand"
                              title="Сбросить ручную правку и вернуться к авторасчёту"
                            >
                              Авто
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => duplicateRow(idx)}
                            className="text-xs px-2 py-1 rounded border border-white/20 hover:border-brand"
                            title="Дублировать строку"
                          >
                            Копия
                          </button>
                          <button
                            type="button"
                            onClick={() => removeRow(idx)}
                            className="text-red-400 hover:text-red-300 text-sm px-1"
                            title="Удалить строку"
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <div className="grid gap-3 lg:grid-cols-2">
                    <div className="rounded-xl border border-white/10 bg-black/10 p-3 flex flex-col gap-3">
                      <div>
                        <p className="text-sm font-semibold">Вставка списком (TSV)</p>
                        <p className="text-xs text-text-secondary">
                          Формат: Имя, Пол, Уровень, Пул, Место, Очки, RatingPts. Можно вставлять из Excel или Google
                          Sheets с заголовком или без него.
                        </p>
                      </div>
                      <textarea
                        value={importText}
                        onChange={(e) => setImportText(e.target.value)}
                        rows={8}
                        placeholder={'Имя\tПол\tУровень\tПул\tМесто\tОчки\tRatingPts'}
                        className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-sm font-mono"
                      />
                      <div className="flex gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={parseImport}
                          className="px-3 py-1.5 text-xs rounded-lg border border-white/20 hover:border-brand transition-colors"
                        >
                          Разобрать TSV
                        </button>
                        <button
                          type="button"
                          onClick={() => applyParsedImport('replace')}
                          disabled={!parsedImport || parsedImport.errors.length > 0 || parsedImport.rows.length === 0}
                          className="px-3 py-1.5 text-xs rounded-lg border border-white/20 hover:border-brand transition-colors disabled:opacity-50"
                        >
                          Заменить текущую таблицу
                        </button>
                        <button
                          type="button"
                          onClick={() => applyParsedImport('append')}
                          disabled={!parsedImport || parsedImport.errors.length > 0 || parsedImport.rows.length === 0}
                          className="px-3 py-1.5 text-xs rounded-lg border border-white/20 hover:border-brand transition-colors disabled:opacity-50"
                        >
                          Добавить к текущей таблице
                        </button>
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/10 p-3 flex flex-col gap-3">
                      <div>
                        <p className="text-sm font-semibold">Preview</p>
                        <p className="text-xs text-text-secondary">
                          Горячая вставка в таблицу тоже работает: вставьте несколько строк прямо в поле имени игрока.
                        </p>
                      </div>
                      {parsedImport ? (
                        <div className="text-xs flex flex-col gap-2">
                          {parsedImport.errors.length ? (
                            <p className="text-red-300">{formatIssues('Ошибки импорта', parsedImport.errors)}</p>
                          ) : null}
                          {parsedImport.warnings.length ? (
                            <p className="text-amber-200">
                              {formatIssues('Предупреждения импорта', parsedImport.warnings)}
                            </p>
                          ) : null}
                          <div className="max-h-56 overflow-auto rounded-lg border border-white/10">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-white/5 sticky top-0">
                                <tr>
                                  <th className="px-2 py-1">Игрок</th>
                                  <th className="px-2 py-1">Пол</th>
                                  <th className="px-2 py-1">Уровень</th>
                                  <th className="px-2 py-1">Пул</th>
                                  <th className="px-2 py-1">Место</th>
                                  <th className="px-2 py-1">R</th>
                                </tr>
                              </thead>
                              <tbody>
                                {parsedImport.rows.map((row, idx) => {
                                  const autoPts = ratingPreview(row);
                                  return (
                                    <tr key={`${row.playerName}-${idx}`} className="border-t border-white/5">
                                      <td className="px-2 py-1">{row.playerName}</td>
                                      <td className="px-2 py-1">{row.gender}</td>
                                      <td className="px-2 py-1">{row.ratingLevel.toUpperCase()}</td>
                                      <td className="px-2 py-1">{row.ratingPool}</td>
                                      <td className="px-2 py-1">{row.placement}</td>
                                      <td className="px-2 py-1">{row.ratingPts ?? autoPts}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-text-secondary">Сначала нажмите “Разобрать TSV”.</p>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => saveResults(t.id)}
                      disabled={loading}
                      className="px-3 py-1.5 text-xs rounded-lg bg-brand text-surface font-semibold disabled:opacity-60"
                    >
                      {loading ? 'Сохранение...' : 'Сохранить результаты'}
                    </button>
                    <button
                      type="button"
                      onClick={() => clearResults(t.id)}
                      disabled={loading}
                      className="px-3 py-1.5 text-xs rounded-lg border border-red-500/40 text-red-400 hover:border-red-400 transition-colors disabled:opacity-60"
                    >
                      Очистить
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
