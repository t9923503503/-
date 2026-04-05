import { expect, test } from '@playwright/test';
import {
  buildLegacyIptTournamentState,
  buildLegacyPlayerDbState,
  IPT_MIXED_FORMAT,
} from '../../web/lib/admin-legacy-sync';

const roster = [
  { id: 'm1', name: 'Admin M1', gender: 'M' as const },
  { id: 'w1', name: 'Admin W1', gender: 'W' as const },
  { id: 'm2', name: 'Admin M2', gender: 'M' as const },
  { id: 'w2', name: 'Admin W2', gender: 'W' as const },
  { id: 'm3', name: 'Admin M3', gender: 'M' as const },
  { id: 'w3', name: 'Admin W3', gender: 'W' as const },
  { id: 'm4', name: 'Admin M4', gender: 'M' as const },
  { id: 'w4', name: 'Admin W4', gender: 'W' as const },
];

const tournament = buildLegacyIptTournamentState({
  id: 'ipt-admin-test',
  name: 'Admin IPT Test',
  date: '2026-03-29',
  time: '10:00',
  location: 'Legacy Court',
  format: IPT_MIXED_FORMAT,
  division: 'Mix',
  level: 'medium',
  status: 'open',
  settings: {
    iptPointLimit: 21,
    iptFinishType: 'hard',
  },
  participants: roster,
});

const playerDb = buildLegacyPlayerDbState(roster);

test('admin-created IPT snapshot auto-opens and finishes in legacy mode', async ({ page }) => {
  await page.addInitScript(
    ({ seededTournament, seededPlayers }) => {
      localStorage.setItem('kotc3_tournaments', JSON.stringify([seededTournament]));
      localStorage.setItem('kotc3_playerdb', JSON.stringify(seededPlayers.players));
      localStorage.setItem('kotc3_playerdb_ts', String(Date.now()));
      localStorage.removeItem('kotc3_ipt_active');
    },
    { seededTournament: tournament, seededPlayers: playerDb }
  );

  await page.goto('/?legacyTournamentId=ipt-admin-test&legacyFormat=ipt&startTab=roster', {
    waitUntil: 'domcontentloaded',
  });

  await page.waitForFunction(() => localStorage.getItem('kotc3_ipt_active') === 'ipt-admin-test');
  await page.locator('.ipt-wrap').first().waitFor();

  const result = await page.evaluate(async () => {
    const tournamentId = 'ipt-admin-test';
    const runCourt = (round: number, court: number, score1: number, score2: number) => {
      // @ts-expect-error legacy globals
      window.iptSetScore(tournamentId, 0, round, court, 1, score1);
      // @ts-expect-error legacy globals
      window.iptSetScore(tournamentId, 0, round, court, 2, score2);
    };

    for (let round = 0; round < 4; round += 1) {
      runCourt(round, 0, 21, 18);
      runCourt(round, 1, 21, 16);
      // @ts-expect-error legacy globals
      window.finishIPTRound(tournamentId, 0);
    }

    // @ts-expect-error legacy globals
    window.showConfirm = async () => true;
    // @ts-expect-error legacy globals
    await window.finishIPT(tournamentId);

    const tournaments = JSON.parse(localStorage.getItem('kotc3_tournaments') || '[]');
    const saved = tournaments.find((item: { id: string }) => item.id === tournamentId);
    return {
      status: saved?.status || '',
      groupCount: saved?.ipt?.groups?.length || 0,
      roundStatuses: saved?.ipt?.groups?.[0]?.rounds?.map((roundItem: { status: string }) => roundItem.status) || [],
      winners: Array.isArray(saved?.winners) ? saved.winners.length : 0,
    };
  });

  expect(result.status).toBe('finished');
  expect(result.groupCount).toBe(1);
  expect(result.roundStatuses).toEqual(['finished', 'finished', 'finished', 'finished']);
  expect(result.winners).toBeGreaterThan(0);
});
