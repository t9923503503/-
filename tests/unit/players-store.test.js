import { beforeEach, describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = process.cwd();
const PLAYERS_JS = path.join(ROOT, 'assets', 'js', 'domain', 'players.js');

function loadPlayersStore() {
  const context = vm.createContext(globalThis);
  const code = readFileSync(PLAYERS_JS, 'utf8');
  vm.runInContext(
    code + '\nglobalThis.__playersStoreTest = { loadPlayerDB, savePlayerDB };',
    context,
    { filename: PLAYERS_JS },
  );
  return globalThis.__playersStoreTest;
}

describe('loadPlayerDB', () => {
  beforeEach(() => {
    localStorage.clear();
    delete globalThis.__playersStoreTest;
  });

  test('returns a seeded array when default players are backfilled', () => {
    const { loadPlayerDB } = loadPlayersStore();

    localStorage.setItem('kotc3_playerdb', JSON.stringify([
      { id: 'ipt-m1', name: 'IPT M1', gender: 'M', status: 'active' },
      { id: 'ipt-w1', name: 'IPT W1', gender: 'W', status: 'active' },
    ]));
    localStorage.setItem('kotc3_playerdb_ts', '1');

    const players = loadPlayerDB();

    expect(Array.isArray(players)).toBe(true);
    expect(players.find((player) => player.id === 'ipt-m1')?.name).toBe('IPT M1');
    expect(players.length).toBeGreaterThan(2);
    expect(players.some((player) => player.name === 'Микуляк' && player.gender === 'M')).toBe(true);
    expect(players.some((player) => player.name === 'Рукавишников' && player.gender === 'M')).toBe(true);
    expect(players.some((player) => player.name === 'Шелгачев А' && player.gender === 'M')).toBe(true);

    const secondRead = loadPlayerDB();
    expect(Array.isArray(secondRead)).toBe(true);
    expect(secondRead.length).toBe(players.length);
  });
});
