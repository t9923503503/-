import { describe, expect, it } from 'vitest';
import { buildThaiFormatUrl } from '../../shared/format-links.js';
import { buildThaiFormatUrl as buildThaiFormatUrlWeb } from '../../web/public/shared/format-links.js';

describe('buildThaiFormatUrl', () => {
  it('keeps Thai courts/tours from the new contract without clamping', () => {
    const url = buildThaiFormatUrl({
      mode: 'MM',
      n: 10,
      seed: 7,
      courts: 12,
      tours: 18,
    });

    expect(url).toBe('formats/thai/thai.html?mode=MM&n=10&seed=7&courts=12&tours=18');
  });

  it('omits invalid courts/tours and preserves the rest of the query', () => {
    const url = buildThaiFormatUrl({
      mode: 'mf',
      n: '8',
      seed: '3',
      courts: 0,
      tours: 'abc',
    });

    expect(url).toBe('formats/thai/thai.html?mode=MF&n=8&seed=3');
  });

  it('keeps root and web/public builders aligned for the Thai contract', () => {
    const opts = {
      mode: 'MN',
      n: 12,
      seed: 5,
      courts: 6,
      tours: 9,
      trnId: 'thai-sync',
    };

    expect(buildThaiFormatUrlWeb(opts)).toBe(buildThaiFormatUrl(opts));
  });
});
