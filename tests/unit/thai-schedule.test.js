import { describe, test, expect } from 'vitest';
import { thaiGenerateSchedule, thaiValidateSchedule } from '../../formats/thai/thai-format.js';

// Все 6 комбинаций режим × размер
const CASES = [
  { label: 'MF×8',  args: { mode: 'MF', men: 8,  women: 8,  seed: 42 } },
  { label: 'MF×10', args: { mode: 'MF', men: 10, women: 10, seed: 42 } },
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
