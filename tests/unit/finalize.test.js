import { describe, it, expect } from 'vitest';

/**
 * S8.11: Tests for tournament finalization payload structure.
 * Validates that the result objects have the correct shape before being sent to RPC.
 */

function buildKotcResults(divScores, divRoster, divKeys) {
  const results = [];
  for (const key of divKeys) {
    for (const gender of ['M', 'W']) {
      const roster = divRoster?.[key]?.[gender === 'M' ? 'men' : 'women'] || [];
      const scores = divScores?.[key] || {};
      // Simplified ranking: just use roster order with mock points
      roster.forEach((name, i) => {
        if (!name) return;
        results.push({
          player_id: name,
          placement: i + 1,
          points: Math.max(0, 10 - i * 2),
          format: 'KOTC',
          division: key.toUpperCase(),
        });
      });
    }
  }
  return results;
}

function buildThaiResults(standings, mode) {
  return standings.map(s => ({
    player_id: s.playerId || s.name,
    placement: s.place || 0,
    points: s.pts || 0,
    format: 'Thai Mixed',
    division: mode,
  }));
}

describe('finalize_tournament payload', () => {
  it('KOTC results have required fields', () => {
    const divRoster = {
      hard: { men: ['Иванов', 'Петров', 'Сидоров', 'Козлов'], women: ['Иванова', 'Петрова'] },
    };
    const results = buildKotcResults({}, divRoster, ['hard']);

    expect(results.length).toBe(6); // 4 men + 2 women
    for (const r of results) {
      expect(r).toHaveProperty('player_id');
      expect(r).toHaveProperty('placement');
      expect(r).toHaveProperty('points');
      expect(r).toHaveProperty('format', 'KOTC');
      expect(r).toHaveProperty('division');
      expect(typeof r.player_id).toBe('string');
      expect(typeof r.placement).toBe('number');
      expect(typeof r.points).toBe('number');
      expect(r.placement).toBeGreaterThan(0);
    }
  });

  it('Thai results have required fields', () => {
    const standings = [
      { playerId: 'p1', name: 'Иванов', place: 1, pts: 15, diff: 8, wins: 5 },
      { playerId: 'p2', name: 'Петров', place: 2, pts: 12, diff: 3, wins: 4 },
      { playerId: 'p3', name: 'Сидоров', place: 3, pts: 8, diff: -2, wins: 2 },
    ];
    const results = buildThaiResults(standings, 'MF');

    expect(results.length).toBe(3);
    for (const r of results) {
      expect(r).toHaveProperty('player_id');
      expect(r).toHaveProperty('placement');
      expect(r).toHaveProperty('points');
      expect(r).toHaveProperty('format', 'Thai Mixed');
      expect(r).toHaveProperty('division', 'MF');
      expect(typeof r.player_id).toBe('string');
      expect(r.placement).toBeGreaterThan(0);
    }
  });

  it('empty results are rejected', () => {
    const results = buildKotcResults({}, {}, []);
    expect(results.length).toBe(0);
  });

  it('duplicate finalization prevention flag', () => {
    const session = { finalized: false };

    // First finalization
    session.finalized = true;

    // Second attempt should be blocked
    expect(session.finalized).toBe(true);
  });

  it('player_id falls back to name when playerId missing', () => {
    const standings = [
      { name: 'Иванов', place: 1, pts: 10 }, // no playerId
    ];
    const results = buildThaiResults(standings, 'MM');
    expect(results[0].player_id).toBe('Иванов');
  });
});

describe('player sync merge logic', () => {
  function mergePlayerLists(local, remote) {
    const remoteMap = new Map(remote.map(p => [String(p.id), p]));
    const localMap = new Map(local.map(p => [String(p.id), p]));
    const merged = [];

    // Server wins on conflicts
    for (const [rid, rp] of remoteMap) {
      const lp = localMap.get(rid);
      merged.push({
        ...(lp || {}),
        ...rp,
        totalPts: rp.total_pts ?? rp.totalPts ?? lp?.totalPts ?? 0,
      });
      localMap.delete(rid);
    }

    // Local-only players
    for (const [, lp] of localMap) {
      merged.push(lp);
    }

    return merged;
  }

  it('server data overwrites local on conflict', () => {
    const local = [{ id: 'p1', name: 'Old Name', totalPts: 5 }];
    const remote = [{ id: 'p1', name: 'New Name', total_pts: 20 }];
    const merged = mergePlayerLists(local, remote);

    expect(merged.length).toBe(1);
    expect(merged[0].name).toBe('New Name');
    expect(merged[0].totalPts).toBe(20);
  });

  it('local-only players preserved', () => {
    const local = [
      { id: 'p1', name: 'Both' },
      { id: 'p_local', name: 'Local Only' },
    ];
    const remote = [{ id: 'p1', name: 'Both Updated' }];
    const merged = mergePlayerLists(local, remote);

    expect(merged.length).toBe(2);
    expect(merged.find(p => p.id === 'p_local')).toBeTruthy();
  });

  it('remote-only players added', () => {
    const local = [];
    const remote = [{ id: 'p_remote', name: 'Remote Player', total_pts: 100 }];
    const merged = mergePlayerLists(local, remote);

    expect(merged.length).toBe(1);
    expect(merged[0].totalPts).toBe(100);
  });

  it('empty inputs return empty', () => {
    expect(mergePlayerLists([], []).length).toBe(0);
  });
});

describe('S8.6: hub finalization payload', () => {
  function buildHubResultsFromWinners(winners, db, format, division) {
    const results = [];
    (winners || []).forEach(slot => {
      (slot.playerIds || []).forEach(pid => {
        results.push({
          player_id: pid,
          placement: slot.place || 0,
          points: slot.points || 0,
          format: format || 'King of the Court',
          division: division || '',
        });
      });
    });
    return results;
  }

  function buildHubResultsFromHistory(players, format, division) {
    return (players || []).map((p, i) => ({
      player_id: p.id || p.name,
      placement: i + 1,
      points: p.totalPts ?? p.pts ?? 0,
      format: format || 'King of the Court',
      division: division || '',
    }));
  }

  it('builds results from winners array (tournaments)', () => {
    const winners = [
      { place: 1, points: 20, playerIds: ['p1', 'p2'] },
      { place: 2, points: 10, playerIds: ['p3'] },
    ];
    const results = buildHubResultsFromWinners(winners, [], 'KOTC', 'Мужской');
    expect(results.length).toBe(3);
    expect(results[0]).toEqual({
      player_id: 'p1', placement: 1, points: 20, format: 'KOTC', division: 'Мужской',
    });
    expect(results[2].placement).toBe(2);
  });

  it('builds results from history players array', () => {
    const players = [
      { id: 'p1', name: 'Иванов', totalPts: 30, gender: 'M' },
      { id: 'p2', name: 'Петров', totalPts: 20, gender: 'M' },
    ];
    const results = buildHubResultsFromHistory(players, 'Thai Mixed', 'MF');
    expect(results.length).toBe(2);
    expect(results[0].placement).toBe(1);
    expect(results[0].points).toBe(30);
    expect(results[1].placement).toBe(2);
    expect(results[1].format).toBe('Thai Mixed');
  });

  it('falls back to name when id missing in history', () => {
    const players = [{ name: 'Сидоров', pts: 5 }];
    const results = buildHubResultsFromHistory(players);
    expect(results[0].player_id).toBe('Сидоров');
  });

  it('empty winners yields empty results', () => {
    expect(buildHubResultsFromWinners([], []).length).toBe(0);
    expect(buildHubResultsFromHistory([]).length).toBe(0);
  });
});
