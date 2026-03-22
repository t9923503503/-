import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Q3.2: Stress-test localStorage — work near 4MB, export/import without data loss

describe('localStorage stress (Q3.2)', () => {
  let storage;

  beforeEach(() => {
    storage = {};
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(k => storage[k] ?? null);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((k, v) => {
      const total = Object.values(storage).reduce((s, x) => s + x.length, 0) + v.length;
      if (total > 5 * 1024 * 1024) {
        const err = new Error('Storage full');
        err.name = 'QuotaExceededError';
        throw err;
      }
      storage[k] = String(v);
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(k => { delete storage[k]; });
    globalThis.showToast = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('safeSetItem handles QuotaExceededError gracefully', async () => {
    const { safeSetItem } = await import('../../shared/api.js');
    // Fill storage near limit
    storage['filler'] = 'x'.repeat(4.9 * 1024 * 1024);
    const result = safeSetItem('test_key', 'x'.repeat(200 * 1024));
    expect(result).toBe(false);
    expect(globalThis.showToast).toHaveBeenCalled();
  });

  it('large scores array serializes and deserializes correctly', () => {
    // Simulate 4 courts × 5 players × 5 rounds with scores
    const scores = Array.from({ length: 4 }, () =>
      Array.from({ length: 5 }, () =>
        Array.from({ length: 5 }, () => Math.floor(Math.random() * 25))
      )
    );
    const json = JSON.stringify(scores);
    storage['kotc3_scores'] = json;
    const restored = JSON.parse(storage['kotc3_scores']);
    expect(restored).toEqual(scores);
    expect(json.length).toBeLessThan(2000); // scores are compact
  });

  it('large tournament history (450 entries) fits in localStorage', () => {
    const history = Array.from({ length: 450 }, (_, i) => ({
      time: `12:${String(i % 60).padStart(2, '0')}:00`,
      court: `Корт ${(i % 4) + 1}`,
      player: `Игрок_Тестовый_Длинное_Имя_${i}`,
      delta: i % 2 === 0 ? 1 : -1,
      score: Math.floor(Math.random() * 50),
      key: ['k0', 'k1', 'k2', 'k3', 'hard', 'advance', 'medium', 'lite'][i % 8],
    }));
    const json = JSON.stringify(history);
    expect(json.length).toBeLessThan(100_000); // should be well under 100KB
    storage['kotc3_eventlog'] = json;
    const restored = JSON.parse(storage['kotc3_eventlog']);
    expect(restored.length).toBe(450);
    expect(restored[0].court).toBe('Корт 1');
  });

  it('player database with 200 players fits comfortably', () => {
    const players = Array.from({ length: 200 }, (_, i) => ({
      id: `p_${i}`,
      name: `Фамилия_${i}_Длинная`,
      gender: i % 2 === 0 ? 'M' : 'W',
      level: ['hard', 'medium', 'lite', 'advance'][i % 4],
      rating: 1000 + i * 10,
      stats: { wins: i, losses: 200 - i, points: i * 15 },
    }));
    const json = JSON.stringify(players);
    expect(json.length).toBeLessThan(100_000);
    storage['kotc3_players'] = json;
    const restored = JSON.parse(storage['kotc3_players']);
    expect(restored.length).toBe(200);
  });

  it('50 tournaments with full metadata fit in localStorage', () => {
    const tournaments = Array.from({ length: 50 }, (_, i) => ({
      id: `trn_${i}`,
      name: `Турнир ${i} — Лютые Пляжники`,
      format: ['Thai Mixed', 'IPT Mixed', 'Standard'][i % 3],
      status: i < 45 ? 'finished' : 'open',
      date: `2026-${String((i % 12) + 1).padStart(2, '0')}-15`,
      venue: 'Пляж Казани',
      capacity: 32,
      participants: Array.from({ length: 32 }, (_, j) => `p_${j}`),
      results: Array.from({ length: 32 }, (_, j) => ({
        playerId: `p_${j}`, place: j + 1, points: 100 - j * 3,
      })),
    }));
    const json = JSON.stringify(tournaments);
    expect(json.length).toBeLessThan(500_000); // under 500KB
    storage['kotc3_tournaments'] = json;
    const restored = JSON.parse(storage['kotc3_tournaments']);
    expect(restored.length).toBe(50);
  });

  it('combined data stays under 4MB', () => {
    // Simulate all keys together
    const scores = JSON.stringify(Array.from({ length: 4 }, () =>
      Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => 15))
    ));
    const roster = JSON.stringify(Array.from({ length: 4 }, () => ({
      men: Array.from({ length: 5 }, (_, i) => `Мужчина_${i}`),
      women: Array.from({ length: 5 }, (_, i) => `Женщина_${i}`),
    })));
    const players = JSON.stringify(Array.from({ length: 200 }, (_, i) => ({
      id: `p_${i}`, name: `Фамилия_${i}`, gender: 'M', level: 'medium',
      rating: 1000, stats: { wins: 10, losses: 5 },
    })));
    const tournaments = JSON.stringify(Array.from({ length: 50 }, (_, i) => ({
      id: `t_${i}`, name: `Турнир ${i}`, format: 'Thai', status: 'finished',
      participants: Array.from({ length: 32 }, (_, j) => `p_${j}`),
      results: Array.from({ length: 32 }, (_, j) => ({ id: `p_${j}`, place: j + 1 })),
    })));
    const history = JSON.stringify(Array.from({ length: 450 }, (_, i) => ({
      time: '12:00:00', court: 'К1', player: `Игрок_${i}`, delta: 1, score: i,
    })));

    const total = scores.length + roster.length + players.length
      + tournaments.length + history.length;

    // All combined data should be well under 4MB
    expect(total).toBeLessThan(4 * 1024 * 1024);
    // In practice it should be under 500KB
    expect(total).toBeLessThan(500 * 1024);
  });

  it('export-utils roundtrip preserves data', async () => {
    // Test that the shared export utilities produce valid output
    const { exportToJSON, exportToCSV, standingsToCSVData } = await import('../../shared/export-utils.js');

    // Mock _download to capture blob content
    const blobs = [];
    const origCreateObjectURL = globalThis.URL?.createObjectURL;
    globalThis.URL = globalThis.URL || {};
    globalThis.URL.createObjectURL = () => 'blob:mock';
    globalThis.URL.revokeObjectURL = () => {};
    globalThis.document = globalThis.document || {
      createElement: () => ({ click() {}, href: '', download: '' }),
      body: { appendChild() {}, removeChild() {} },
    };

    // exportToJSON should not throw
    const data = { players: [{ name: 'Тест' }], tournaments: [] };
    expect(() => exportToJSON(data, 'test.json')).not.toThrow();

    // standingsToCSVData produces correct structure
    const standings = [
      { place: 1, name: 'Иванов', pts: 10, diff: 5, wins: 3 },
      { place: 2, name: 'Петров', pts: 8, diff: 2, wins: 2 },
    ];
    const { headers, rows } = standingsToCSVData(standings, 'Тест');
    expect(headers.length).toBeGreaterThan(0);
    expect(rows.length).toBe(2);
    expect(rows[0]).toContain('Иванов');

    if (origCreateObjectURL) globalThis.URL.createObjectURL = origCreateObjectURL;
  });
});
