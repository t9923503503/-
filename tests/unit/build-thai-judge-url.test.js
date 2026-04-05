import { describe, test, expect } from 'vitest';

import { buildThaiJudgeRelativeUrl } from '../../web/lib/build-thai-judge-url.ts';

describe('buildThaiJudgeRelativeUrl', () => {
  test('MF: derives n=8, passes courts and tours from settings', () => {
    const url = buildThaiJudgeRelativeUrl({
      settings: { thaiVariant: 'MF', courts: 2, tourCount: 3, seed: 7 },
      participantCount: 16,
      tournamentId: 'tourney-1',
    });
    expect(url.startsWith('formats/thai/thai.html?')).toBe(true);
    const q = new URLSearchParams(url.split('?')[1]);
    expect(q.get('mode')).toBe('MF');
    expect(q.get('n')).toBe('8');
    expect(q.get('courts')).toBe('2');
    expect(q.get('tours')).toBe('3');
    expect(q.get('trnId')).toBe('tourney-1');
    expect(q.get('seed')).toBe('7');
  });

  test('MM: n equals seat count', () => {
    const url = buildThaiJudgeRelativeUrl({
      settings: { thaiVariant: 'MM', courts: 1, tourCount: 2 },
      participantCount: 8,
      tournamentId: 'mm-1',
    });
    const q = new URLSearchParams(url.split('?')[1]);
    expect(q.get('mode')).toBe('MM');
    expect(q.get('n')).toBe('8');
    expect(q.get('courts')).toBe('1');
    expect(q.get('tours')).toBe('2');
  });

  test('baseUrl: /kotc keeps Thai judge link under /kotc and derives n=4 for one-court MF', () => {
    const url = buildThaiJudgeRelativeUrl({
      settings: { thaiVariant: 'MF', courts: 1, tourCount: 2, seed: 5 },
      participantCount: 8,
      tournamentId: 'mf-1',
      baseUrl: '/kotc',
    });
    expect(url.startsWith('/kotc/formats/thai/thai.html?')).toBe(true);
    const q = new URLSearchParams(url.split('?')[1]);
    expect(q.get('mode')).toBe('MF');
    expect(q.get('n')).toBe('4');
    expect(q.get('courts')).toBe('1');
    expect(q.get('tours')).toBe('2');
    expect(q.get('seed')).toBe('5');
    expect(q.get('trnId')).toBe('mf-1');
  });

  test('MN: derives n from one male pool and keeps courts/tours', () => {
    const url = buildThaiJudgeRelativeUrl({
      settings: { thaiVariant: 'MN', courts: 2, tourCount: 4, seed: 9 },
      participantCount: 16,
      tournamentId: 'mn-1',
    });
    const q = new URLSearchParams(url.split('?')[1]);
    expect(q.get('mode')).toBe('MN');
    expect(q.get('n')).toBe('8');
    expect(q.get('courts')).toBe('2');
    expect(q.get('tours')).toBe('4');
    expect(q.get('seed')).toBe('9');
  });
});
