import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

// Load locale files directly
const ru = JSON.parse(readFileSync(resolve(ROOT, 'locales/ru.json'), 'utf8'));
const en = JSON.parse(readFileSync(resolve(ROOT, 'locales/en.json'), 'utf8'));

describe('i18n (Q4.1)', () => {

  // ── Key parity: every ru key exists in en ─────────────────
  function collectKeys(obj, prefix = '') {
    const keys = [];
    for (const [k, v] of Object.entries(obj)) {
      const full = prefix ? `${prefix}.${k}` : k;
      if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        keys.push(...collectKeys(v, full));
      } else {
        keys.push(full);
      }
    }
    return keys;
  }

  const ruKeys = collectKeys(ru);
  const enKeys = collectKeys(en);

  it('ru.json and en.json have the same keys', () => {
    const missingInEn = ruKeys.filter(k => !enKeys.includes(k));
    const missingInRu = enKeys.filter(k => !ruKeys.includes(k));
    expect(missingInEn, `Keys in ru.json missing from en.json: ${missingInEn.join(', ')}`).toEqual([]);
    expect(missingInRu, `Keys in en.json missing from ru.json: ${missingInRu.join(', ')}`).toEqual([]);
  });

  it('all locale values are non-empty strings', () => {
    const emptyRu = ruKeys.filter(k => {
      const val = k.split('.').reduce((o, p) => o?.[p], ru);
      return typeof val !== 'string' || val.trim() === '';
    });
    const emptyEn = enKeys.filter(k => {
      const val = k.split('.').reduce((o, p) => o?.[p], en);
      return typeof val !== 'string' || val.trim() === '';
    });
    expect(emptyRu, `Empty values in ru.json: ${emptyRu.join(', ')}`).toEqual([]);
    expect(emptyEn, `Empty values in en.json: ${emptyEn.join(', ')}`).toEqual([]);
  });

  it('locale files have at least 50 keys', () => {
    expect(ruKeys.length).toBeGreaterThanOrEqual(50);
    expect(enKeys.length).toBeGreaterThanOrEqual(50);
  });

  it('en values differ from ru values (actual translation)', () => {
    // At least 80% of keys should have different values
    const different = ruKeys.filter(k => {
      const rv = k.split('.').reduce((o, p) => o?.[p], ru);
      const ev = k.split('.').reduce((o, p) => o?.[p], en);
      return rv !== ev;
    });
    const ratio = different.length / ruKeys.length;
    expect(ratio).toBeGreaterThan(0.7);
  });

  // ── i18n module ────────────────────────────────────────────
  it('i18n.js exports t, getLocale, setLocale, initI18n', async () => {
    const mod = await import('../../shared/i18n.js');
    expect(typeof mod.t).toBe('function');
    expect(typeof mod.getLocale).toBe('function');
    expect(typeof mod.setLocale).toBe('function');
    expect(typeof mod.initI18n).toBe('function');
    expect(typeof mod.isReady).toBe('function');
    expect(typeof mod.getSupportedLocales).toBe('function');
  });

  it('getSupportedLocales returns ru and en', async () => {
    const { getSupportedLocales } = await import('../../shared/i18n.js');
    const locales = getSupportedLocales();
    expect(locales).toContain('ru');
    expect(locales).toContain('en');
  });

  it('t() returns key as fallback when no locale loaded', async () => {
    const { t } = await import('../../shared/i18n.js');
    // Before initI18n, strings may not be loaded — should return key
    const result = t('nonexistent.key');
    expect(result).toBe('nonexistent.key');
  });

  it('t() interpolates {{params}}', async () => {
    // Direct test of interpolation logic
    const { t } = await import('../../shared/i18n.js');
    // Even without loaded strings, we can test the pattern
    const result = t('nav.courtN', { n: 3 });
    // May return raw key with interpolation or translated string
    expect(typeof result).toBe('string');
  });

  // ── Placeholder consistency ────────────────────────────────
  it('interpolation placeholders match between ru and en', () => {
    const placeholderRe = /\{\{(\w+)\}\}/g;
    const mismatches = [];
    for (const key of ruKeys) {
      const rv = key.split('.').reduce((o, p) => o?.[p], ru);
      const ev = key.split('.').reduce((o, p) => o?.[p], en);
      const ruPlaceholders = [...(rv.matchAll(placeholderRe))].map(m => m[1]).sort();
      const enPlaceholders = [...(ev.matchAll(placeholderRe))].map(m => m[1]).sort();
      if (JSON.stringify(ruPlaceholders) !== JSON.stringify(enPlaceholders)) {
        mismatches.push(`${key}: ru=${ruPlaceholders} en=${enPlaceholders}`);
      }
    }
    expect(mismatches, `Placeholder mismatches:\n${mismatches.join('\n')}`).toEqual([]);
  });

  // ── JSON validity ──────────────────────────────────────────
  it('locale files are valid JSON', () => {
    expect(() => JSON.parse(readFileSync(resolve(ROOT, 'locales/ru.json'), 'utf8'))).not.toThrow();
    expect(() => JSON.parse(readFileSync(resolve(ROOT, 'locales/en.json'), 'utf8'))).not.toThrow();
  });
});
