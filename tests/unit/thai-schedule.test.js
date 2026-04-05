import { describe, test, expect } from 'vitest';
import { thaiGenerateSchedule, thaiValidateSchedule } from '../../formats/thai/thai-format.js';

/** MF: [manIdx, womanIdx] — два независимых пула; [3,3] это не «дубль игрока». */
function assertNoIntraTourConflicts(args, sched) {
  const isDualPool = args.mode === 'MF' || args.mode === 'MN';
  for (const round of sched) {
    if (isDualPool) {
      const seenMen = new Set();
      const seenWomen = new Set();
      for (const [mi, wi] of round.pairs) {
        expect(seenMen.has(mi), `MF round ${round.round}: man ${mi} twice`).toBe(false);
        expect(seenWomen.has(wi), `MF round ${round.round}: woman ${wi} twice`).toBe(false);
        seenMen.add(mi);
        seenWomen.add(wi);
      }
    } else {
      const seen = new Set();
      for (const [a, b] of round.pairs) {
        expect(seen.has(a)).toBe(false);
        expect(seen.has(b)).toBe(false);
        seen.add(a);
        seen.add(b);
      }
    }
  }
}

// Все 6 комбинаций режим × размер
const CASES = [
  { label: 'MF×8',  args: { mode: 'MF', men: 8,  women: 8,  seed: 42 } },
  { label: 'MF×10', args: { mode: 'MF', men: 10, women: 10, seed: 42 } },
  { label: 'MN×8',  args: { mode: 'MN', men: 8,  women: 8,  seed: 42 } },
  { label: 'MN×10', args: { mode: 'MN', men: 10, women: 10, seed: 42 } },
  { label: 'MM×8',  args: { mode: 'MM', men: 8,  women: 0,  seed: 42 } },
  { label: 'MM×10', args: { mode: 'MM', men: 10, women: 0,  seed: 42 } },
  { label: 'WW×8',  args: { mode: 'WW', men: 0,  women: 8,  seed: 42 } },
  { label: 'WW×10', args: { mode: 'WW', men: 0,  women: 10, seed: 42 } },
];

describe('thaiGenerateSchedule — структура расписания', () => {
  for (const { label, args } of CASES) {
    test(`${label}: генерирует расписание`, () => {
      const sched = thaiGenerateSchedule(args);
      expect(Array.isArray(sched)).toBe(true);
      expect(sched.length).toBeGreaterThan(0);
    });

    test(`${label}: каждый раунд содержит массив pairs`, () => {
      const sched = thaiGenerateSchedule(args);
      for (const round of sched) {
        expect(round).toHaveProperty('pairs');
        expect(Array.isArray(round.pairs)).toBe(true);
        expect(round.pairs.length).toBeGreaterThan(0);
      }
    });

    test(`${label}: каждая пара — это [a, b]`, () => {
      const sched = thaiGenerateSchedule(args);
      for (const round of sched) {
        for (const pair of round.pairs) {
          expect(Array.isArray(pair)).toBe(true);
          expect(pair.length).toBe(2);
        }
      }
    });
  }
  test('meta-based validation rejects out-of-range player ids', () => {
    const sched = thaiGenerateSchedule({ mode: 'MM', men: 8, women: 0, seed: 42 });
    const broken = sched.map((round) => ({
      ...round,
      pairs: round.pairs.map(([a, b]) => [a === 7 ? 99 : a, b === 7 ? 99 : b]),
    }));
    broken.meta = { ...sched.meta };

    const res = thaiValidateSchedule(broken);
    expect(res.valid).toBe(false);
    expect(res.errors.some((err) => err.includes('out of range'))).toBe(true);
  });
});

describe('thaiValidateSchedule — валидация всех 6 комбинаций', () => {
  for (const { label, args } of CASES) {
    test(`${label}: thaiValidateSchedule возвращает valid=true и errors=[]`, () => {
      const sched = thaiGenerateSchedule(args);
      const res = thaiValidateSchedule(sched);
      expect(res.valid).toBe(true);
      expect(res.errors).toEqual([]);
    });
  }
});

describe('Seed reproducibility', () => {
  for (const { label, args } of CASES) {
    test(`${label}: одинаковый seed воспроизводит идентичные pairs`, () => {
      const schedA = thaiGenerateSchedule(args);
      const schedB = thaiGenerateSchedule(args);
      const pairsA = schedA.map(r => r.pairs);
      const pairsB = schedB.map(r => r.pairs);
      expect(pairsA).toEqual(pairsB);
    });
  }

  test('разные seeds дают разные расписания (MM×10)', () => {
    const schedA = thaiGenerateSchedule({ mode: 'MM', men: 10, women: 0, seed: 1 });
    const schedB = thaiGenerateSchedule({ mode: 'MM', men: 10, women: 0, seed: 999 });
    const pairsA = schedA.map(r => r.pairs);
    const pairsB = schedB.map(r => r.pairs);
    expect(pairsA).not.toEqual(pairsB);
  });
});

describe('Snapshot regression — exact output for legacy n=8/10', () => {
  for (const { label, args } of CASES) {
    test(`${label} seed=42: exact pairs snapshot`, () => {
      const sched = thaiGenerateSchedule(args);
      expect(sched.map(r => r.pairs)).toMatchSnapshot();
    });
  }
});

describe('thaiGenerateSchedule — arbitrary courts/tours', () => {
  const NEW_CASES = [
    { label: 'MM courts=1 tours=1 n=4', args: { mode: 'MM', men: 4, women: 0, seed: 42, courts: 1, tours: 1 } },
    { label: 'MM courts=2 tours=2 n=8', args: { mode: 'MM', men: 8, women: 0, seed: 42, courts: 2, tours: 2 } },
    { label: 'MF courts=2 tours=3 n=8', args: { mode: 'MF', men: 8, women: 8, seed: 42, courts: 2, tours: 3 } },
    { label: 'MN courts=2 tours=3 n=8', args: { mode: 'MN', men: 8, women: 8, seed: 42, courts: 2, tours: 3 } },
    { label: 'MF courts=4 tours=3 n=10', args: { mode: 'MF', men: 10, women: 10, seed: 42, courts: 4, tours: 3 } },
    { label: 'WW courts=1 tours=3 n=8', args: { mode: 'WW', men: 0, women: 8, seed: 42, courts: 1, tours: 3 } },
    { label: 'MM courts=3 tours=2 n=6', args: { mode: 'MM', men: 6, women: 0, seed: 42, courts: 3, tours: 2 } },
  ];

  for (const { label, args } of NEW_CASES) {
    test(`${label}: generates schedule with correct structure`, () => {
      const sched = thaiGenerateSchedule(args);
      expect(sched.length).toBe(args.tours);
      for (const round of sched) {
        expect(round.pairs.length).toBe(args.courts);
      }
    });

    test(`${label}: meta contains courts and tours`, () => {
      const sched = thaiGenerateSchedule(args);
      expect(sched.meta.courts).toBe(args.courts);
      expect(sched.meta.tours).toBe(args.tours);
    });

    test(`${label}: no player conflicts within a tour`, () => {
      const sched = thaiGenerateSchedule(args);
      assertNoIntraTourConflicts(args, sched);
    });

    test(`${label}: validates via thaiValidateSchedule`, () => {
      const sched = thaiGenerateSchedule(args);
      const res = thaiValidateSchedule(sched);
      expect(res.valid).toBe(true);
      expect(res.errors).toEqual([]);
    });
  }
});

describe('Backward compat — omitting courts/tours', () => {
  for (const { label, args } of CASES) {
    test(`${label}: no courts/tours gives same schedule as legacy`, () => {
      const legacy = thaiGenerateSchedule(args);
      const withNulls = thaiGenerateSchedule({ ...args, courts: undefined, tours: undefined });
      expect(legacy.map(r => r.pairs)).toEqual(withNulls.map(r => r.pairs));
    });
  }
});

describe('thaiValidateSchedule — отрицательные тесты', () => {
  test('расписание без pairs в первом раунде → valid=false', () => {
    const sched = thaiGenerateSchedule({ mode: 'MM', men: 8, women: 0, seed: 42 });
    const broken = sched.map((r, i) =>
      i === 0 ? { ...r, pairs: undefined } : { ...r }
    );
    const res = thaiValidateSchedule(broken);
    expect(res.valid).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
  });

  test('удалена пара из первого раунда → valid=false (нарушен degree)', () => {
    const sched = thaiGenerateSchedule({ mode: 'MM', men: 8, women: 0, seed: 42 });
    const broken = sched.map((r, i) =>
      i === 0
        ? { ...r, pairs: r.pairs.slice(1) }  // убираем первую пару
        : { ...r }
    );
    const res = thaiValidateSchedule(broken);
    expect(res.valid).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
  });

  test('пустое расписание → valid=false', () => {
    const res = thaiValidateSchedule([]);
    expect(res.valid).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
  });

  test('null → valid=false', () => {
    const res = thaiValidateSchedule(null);
    expect(res.valid).toBe(false);
  });

  test('добавлен лишний раунд → valid=false (неверное число раундов)', () => {
    const sched = thaiGenerateSchedule({ mode: 'MF', men: 8, women: 8, seed: 42 });
    const extraRound = { round: 99, pairs: sched[0].pairs };
    const broken = [...sched, extraRound];
    const res = thaiValidateSchedule(broken);
    expect(res.valid).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
  });
});
