import { describe, expect, it } from 'vitest';

import {
  parseArchiveResultsTsv,
  renumberArchivePlacements,
  sanitizeArchiveRow,
  validateArchiveRows,
} from '../../web/lib/archive-results';

describe('archive-results helpers', () => {
  it('sanitizes a row with normalized pool, level and rating override', () => {
    expect(
      sanitizeArchiveRow({
        playerName: '  Настя НМ ',
        gender: 'Ж',
        placement: '2',
        points: '49',
        ratingPool: 'новичок',
        ratingLevel: 'advanced',
        ratingPts: '21',
      }),
    ).toEqual({
      playerName: 'Настя НМ',
      gender: 'W',
      placement: 2,
      points: 49,
      ratingPool: 'novice',
      ratingLevel: 'advance',
      ratingPts: 21,
    });
  });

  it('parses TSV with a header row', () => {
    const parsed = parseArchiveResultsTsv(
      'Имя\tПол\tУровень\tПул\tМесто\tОчки\tRatingPts\nНастя НМ\tЖ\tHARD\tpro\t1\t49\t\nКузьмина\tЖ\tMEDIUM\tnovice\t2\t38\t17',
      'hard',
    );

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.hasHeader).toBe(true);
    expect(parsed.rows[0].playerName).toBe('Настя НМ');
    expect(parsed.rows[1].ratingLevel).toBe('medium');
    expect(parsed.rows[1].ratingPool).toBe('novice');
    expect(parsed.rows[1].ratingPts).toBe(17);
  });

  it('parses TSV without a header row', () => {
    const parsed = parseArchiveResultsTsv('Настя НМ\tЖ\tHARD\tpro\t1\t49\t\nКузьмина\tЖ\tLITE\tnovice\t2\t38\t', 'hard');

    expect(parsed.errors).toEqual([]);
    expect(parsed.hasHeader).toBe(false);
    expect(parsed.rows[0].ratingLevel).toBe('hard');
    expect(parsed.rows[1].ratingLevel).toBe('lite');
  });

  it('reports bad place, level and pool in TSV', () => {
    const parsed = parseArchiveResultsTsv('Имя\tПол\tУровень\tПул\tМесто\tОчки\nИгрок\tМ\tBOSS\tsemi\t0\t10', 'hard');

    expect(parsed.errors.join(' ')).toContain('невалидный уровень');
    expect(parsed.errors.join(' ')).toContain('невалидный пул');
    expect(parsed.errors.join(' ')).toContain('невалидное место');
  });

  it('warns about duplicates, out-of-range places and override mismatch', () => {
    const validation = validateArchiveRows([
      sanitizeArchiveRow({ playerName: 'Игрок 1', placement: 1, ratingLevel: 'lite', ratingPool: 'pro' }),
      sanitizeArchiveRow({ playerName: 'Игрок 1', placement: 7, ratingLevel: 'lite', ratingPool: 'pro' }),
      sanitizeArchiveRow({ playerName: 'Игрок 3', placement: 7, ratingLevel: 'medium', ratingPool: 'novice', ratingPts: 99 }),
    ]);

    expect(validation.errors).toEqual([]);
    expect(validation.warnings.join(' ')).toContain('Дубликаты игроков');
    expect(validation.warnings.join(' ')).toContain('Повторяющиеся места');
    expect(validation.warnings.join(' ')).toContain('выходит за таблицу уровня LITE');
    expect(validation.warnings.join(' ')).toContain('ручной рейтинг 99 отличается от авто');
  });

  it('renumbers rows sequentially', () => {
    const rows = renumberArchivePlacements([
      sanitizeArchiveRow({ playerName: 'A', placement: 10 }),
      sanitizeArchiveRow({ playerName: 'B', placement: 10 }),
      sanitizeArchiveRow({ playerName: 'C', placement: 10 }),
    ]);

    expect(rows.map((row) => row.placement)).toEqual([1, 2, 3]);
  });
});
