import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('archive admin level source contract', () => {
  it('renders tournament and per-player level selectors in the archive editor', () => {
    const page = read('web/app/admin/archive/page.tsx');

    expect(page).toContain('value={resultsLevel}');
    expect(page).toContain("setResultsLevel(normalizeTournamentRatingLevel(e.target.value))");
    expect(page).toContain("label: 'ADVANCE'");
    expect(page).toContain("label: 'LITE'");
    expect(page).toContain("value={r.ratingLevel}");
    expect(page).toContain("updateRow(idx, 'ratingLevel', normalizeTournamentRatingLevel(e.target.value))");
    expect(page).toContain('ratingPointsForLevelPlace');
    expect(page).toContain('updateManualRating');
    expect(page).toContain('clearManualRating');
    expect(page).toContain('clearAllManualRatings');
    expect(page).toContain('duplicateRow');
    expect(page).toContain('renumberRows');
    expect(page).toContain('handleNamePaste');
    expect(page).toContain('parseArchiveResultsTsv');
    expect(page).toContain('downloadTextFile');
    expect(page).toContain('toTsv');
    expect(page).toContain('Ctrl+S');
    expect(page).toContain('Ctrl+Enter');
    expect(page).toContain('Скачать шаблон TSV');
    expect(page).toContain('Экспорт текущей таблицы');
    expect(page).toContain('Разобрать TSV');
    expect(page).toContain('Заменить текущую таблицу');
    expect(page).toContain('Добавить к текущей таблице');
    expect(page).toContain('Перенумеровать');
    expect(page).toContain('Применить уровень всем');
    expect(page).toContain('Применить пул всем');
    expect(page).toContain('onPaste={(e) => handleNamePaste(e, idx)}');
    expect(page).toContain('placeholder={String(autoPts)}');
    expect(page).toContain("body: JSON.stringify({ level: resultsLevel, results: resultsForm })");
    expect(page).toContain('r.ratingPts !==');
  });

  it('persists tournament level, validates rows and returns structured validation', () => {
    const route = read('web/app/api/admin/tournaments/[id]/results/route.ts');

    expect(route).toContain('sanitizeArchiveRows');
    expect(route).toContain('validateArchiveRows');
    expect(route).toContain("{ error: 'Validation failed', validation }");
    expect(route).toContain('warnings: validation.warnings');
    expect(route).toContain('return NextResponse.json({ ok: true, inserted, validation });');
    expect(route).toContain('body.level == null ? normalizeTournamentLevel(current.level) : normalizeTournamentLevel(body.level)');
    expect(route).toContain('await updateTournament(id, { ...current, level });');
    expect(route).toContain('afterState: { count: inserted, level, warnings: validation.warnings }');
  });
});
