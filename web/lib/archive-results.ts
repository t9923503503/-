import {
  normalizeTournamentRatingLevel,
  ratingPointsForLevelPlace,
  RATING_LEVEL_TABLES,
  type RatingPool,
  type TournamentRatingLevel,
} from './rating-points';

export type ArchiveResultRow = {
  playerName: string;
  gender: 'M' | 'W';
  placement: number;
  points: number;
  ratingPool: RatingPool;
  ratingLevel: TournamentRatingLevel;
  ratingPts?: number;
};

export type ArchiveValidationResult = {
  errors: string[];
  warnings: string[];
};

export type ArchiveImportResult = ArchiveValidationResult & {
  rows: ArchiveResultRow[];
  hasHeader: boolean;
};

const HEADER_ALIASES: Record<string, string> = {
  'имя': 'playerName',
  'игрок': 'playerName',
  'фамилия имя': 'playerName',
  'player': 'playerName',
  'playername': 'playerName',
  'name': 'playerName',
  'пол': 'gender',
  'gender': 'gender',
  'уровень': 'ratingLevel',
  'level': 'ratingLevel',
  'пул': 'ratingPool',
  'тип': 'ratingPool',
  'pool': 'ratingPool',
  'место': 'placement',
  'place': 'placement',
  'placement': 'placement',
  'очки': 'points',
  'points': 'points',
  'ratingpts': 'ratingPts',
  'rating_pts': 'ratingPts',
  'рейтинг': 'ratingPts',
};

const DEFAULT_COLUMN_ORDER: Array<keyof ArchiveResultRow> = [
  'playerName',
  'gender',
  'ratingLevel',
  'ratingPool',
  'placement',
  'points',
  'ratingPts',
];

function normalizeHeaderCell(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normalizeArchiveGender(value: unknown): 'M' | 'W' {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'w' || normalized === 'ж' || normalized === 'f' || normalized === 'жен' || normalized === 'female') {
    return 'W';
  }
  return 'M';
}

export function normalizeArchiveRatingPool(value: unknown): RatingPool | null {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return null;
  if (['novice', 'новичок', 'нов', 'n', '50', '50%'].includes(normalized)) return 'novice';
  if (['pro', 'профи', 'проф', 'p'].includes(normalized)) return 'pro';
  return null;
}

export function normalizeArchivePlacement(value: unknown): number {
  const parsed = Number(value ?? Number.NaN);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.trunc(parsed));
}

export function normalizeArchivePoints(value: unknown): number {
  const parsed = Number(value ?? Number.NaN);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.trunc(parsed));
}

export function normalizeArchiveRatingPts(value: unknown): number | undefined {
  const parsed = Number(value ?? Number.NaN);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.trunc(parsed);
}

export function sanitizeArchiveRow(
  raw: Record<string, unknown>,
  fallbackLevel: TournamentRatingLevel = 'hard',
): ArchiveResultRow {
  return {
    playerName: String(raw.playerName ?? raw.player_name ?? '').trim(),
    gender: normalizeArchiveGender(raw.gender),
    placement: normalizeArchivePlacement(raw.placement),
    points: normalizeArchivePoints(raw.points),
    ratingPool: normalizeArchiveRatingPool(raw.ratingPool ?? raw.rating_pool) ?? 'pro',
    ratingLevel: normalizeTournamentRatingLevel(String(raw.ratingLevel ?? raw.rating_level ?? fallbackLevel)),
    ratingPts: normalizeArchiveRatingPts(raw.ratingPts ?? raw.rating_pts),
  };
}

export function sanitizeArchiveRows(
  rawRows: Array<Record<string, unknown>>,
  fallbackLevel: TournamentRatingLevel = 'hard',
): ArchiveResultRow[] {
  return rawRows.map((row) => sanitizeArchiveRow(row, fallbackLevel));
}

function collectDuplicates(values: string[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value);
}

export function validateArchiveRows(rows: ArchiveResultRow[]): ArchiveValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  rows.forEach((row, index) => {
    const line = index + 1;
    if (!row.playerName.trim()) errors.push(`Строка ${line}: заполните имя игрока.`);
    if (row.placement < 1) errors.push(`Строка ${line}: место должно быть больше 0.`);
    if (row.points < 0) errors.push(`Строка ${line}: очки не могут быть отрицательными.`);
    if (!['pro', 'novice'].includes(row.ratingPool)) errors.push(`Строка ${line}: невалидный пул рейтинга.`);
    if (!['hard', 'advance', 'medium', 'lite'].includes(row.ratingLevel)) {
      errors.push(`Строка ${line}: невалидный уровень рейтинга.`);
    }

    const levelSize = RATING_LEVEL_TABLES[row.ratingLevel]?.length ?? 0;
    if (row.placement > levelSize) {
      warnings.push(`Строка ${line}: место ${row.placement} выходит за таблицу уровня ${row.ratingLevel.toUpperCase()}.`);
    }

    if (typeof row.ratingPts === 'number') {
      const autoPts = ratingPointsForLevelPlace(row.placement, row.ratingLevel, row.ratingPool);
      if (row.ratingPts !== autoPts) {
        warnings.push(`Строка ${line}: ручной рейтинг ${row.ratingPts} отличается от авто ${autoPts}.`);
      }
    }
  });

  const duplicateNames = collectDuplicates(
    rows.map((row) => row.playerName.trim().toLowerCase()).filter(Boolean),
  );
  if (duplicateNames.length) {
    warnings.push(`Дубликаты игроков: ${duplicateNames.join(', ')}.`);
  }

  const duplicatePlaces = collectDuplicates(rows.map((row) => String(row.placement)).filter((value) => value !== '0'));
  if (duplicatePlaces.length) {
    warnings.push(`Повторяющиеся места: ${duplicatePlaces.join(', ')}.`);
  }

  const places = [...new Set(rows.map((row) => row.placement).filter((placement) => placement > 0))].sort((a, b) => a - b);
  if (places.length > 1) {
    const missing: number[] = [];
    for (let expected = 1; expected <= places[places.length - 1]; expected += 1) {
      if (!places.includes(expected)) missing.push(expected);
    }
    if (missing.length) warnings.push(`Есть пропуски по местам: ${missing.join(', ')}.`);
  }

  return { errors, warnings };
}

function detectHeader(columns: string[]): Array<keyof ArchiveResultRow> | null {
  const mapped = columns.map((column) => HEADER_ALIASES[normalizeHeaderCell(column)]).filter(Boolean);
  if (mapped.length < 4) return null;
  return columns.map((column) => {
    const key = HEADER_ALIASES[normalizeHeaderCell(column)];
    return (key ?? '') as keyof ArchiveResultRow;
  });
}

export function parseArchiveResultsTsv(
  input: string,
  fallbackLevel: TournamentRatingLevel = 'hard',
): ArchiveImportResult {
  const lines = String(input ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  if (!lines.length) {
    return { rows: [], errors: ['Вставьте TSV-таблицу из Excel или Google Sheets.'], warnings: [], hasHeader: false };
  }

  const firstColumns = lines[0].split('\t');
  const detectedHeader = detectHeader(firstColumns);
  const columns = detectedHeader ?? DEFAULT_COLUMN_ORDER;
  const dataLines = detectedHeader ? lines.slice(1) : lines;
  const rows: ArchiveResultRow[] = [];
  const errors: string[] = [];

  dataLines.forEach((line, index) => {
    const cells = line.split('\t');
    const raw: Record<string, unknown> = {};
    columns.forEach((column, cellIndex) => {
      if (!column) return;
      raw[column] = cells[cellIndex] ?? '';
    });
    const row = sanitizeArchiveRow(raw, fallbackLevel);
    if (!row.playerName && cells.every((cell) => !cell.trim())) return;
    rows.push(row);

    if (!row.playerName.trim()) errors.push(`Строка TSV ${index + 1}: пустое имя.`);
    if (normalizeArchivePlacement(raw.placement) < 1) errors.push(`Строка TSV ${index + 1}: невалидное место.`);

    const poolCell = raw.ratingPool;
    if (poolCell != null && String(poolCell).trim() && !normalizeArchiveRatingPool(poolCell)) {
      errors.push(`Строка TSV ${index + 1}: невалидный пул "${String(poolCell)}".`);
    }

    const levelRaw = String(raw.ratingLevel ?? '').trim();
    if (levelRaw) {
      const normalizedLevel = normalizeTournamentRatingLevel(levelRaw);
      const normalizedSource = levelRaw.toLowerCase();
      const knownLevel =
        normalizedSource === normalizedLevel ||
        (normalizedSource === 'advanced' && normalizedLevel === 'advance') ||
        (normalizedSource === 'light' && normalizedLevel === 'lite') ||
        (normalizedSource === 'mid' && normalizedLevel === 'medium') ||
        (normalizedSource === 'easy' && normalizedLevel === 'lite') ||
        (normalizedSource === 'novice' && normalizedLevel === 'lite');
      if (!knownLevel) errors.push(`Строка TSV ${index + 1}: невалидный уровень "${levelRaw}".`);
    }
  });

  const validation = validateArchiveRows(rows);
  return {
    rows,
    errors: [...errors, ...validation.errors],
    warnings: validation.warnings,
    hasHeader: Boolean(detectedHeader),
  };
}

export function renumberArchivePlacements(rows: ArchiveResultRow[]): ArchiveResultRow[] {
  return rows.map((row, index) => ({ ...row, placement: index + 1 }));
}
