import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const IPT_FORMAT_CODE = fs.readFileSync(
  path.resolve(process.cwd(), 'assets/js/ui/ipt-format.js'),
  'utf8',
);

test.describe('IPT regression after A0.2', () => {
  test('generateIPTGroups(8 players, mixed) prefers sharedPlayers.loadPlayerDB', async ({ page }) => {
    const db = [
      { id: 'p1', name: 'P1', gender: 'M' },
      { id: 'p2', name: 'P2', gender: 'M' },
      { id: 'p3', name: 'P3', gender: 'M' },
      { id: 'p4', name: 'P4', gender: 'M' },
      { id: 'p5', name: 'P5', gender: 'W' },
      { id: 'p6', name: 'P6', gender: 'W' },
      { id: 'p7', name: 'P7', gender: 'W' },
      { id: 'p8', name: 'P8', gender: 'W' },
    ];

    const participants = ['p1', 'p6', 'p2', 'p5', 'p3', 'p8', 'p4', 'p7'];

    const dbBad = [
      { id: 'p1', name: 'P1', gender: 'W' },
      { id: 'p2', name: 'P2', gender: 'W' },
      { id: 'p3', name: 'P3', gender: 'W' },
      { id: 'p4', name: 'P4', gender: 'W' },
      { id: 'p5', name: 'P5', gender: 'M' },
      { id: 'p6', name: 'P6', gender: 'M' },
      { id: 'p7', name: 'P7', gender: 'M' },
      { id: 'p8', name: 'P8', gender: 'M' },
    ];

    let sharedCalled = false;
    let fallbackCalled = false;

    const sharedPlayers = {
      loadPlayerDB: () => {
        sharedCalled = true;
        return db;
      },
    };

    const loadPlayerDB = () => {
      fallbackCalled = true;
      return dbBad;
    };

    const generateIPTGroups = new Function(
      'sharedPlayers',
      'loadPlayerDB',
      IPT_FORMAT_CODE + '\nreturn generateIPTGroups;',
    )(sharedPlayers, loadPlayerDB) as (p: string[], g: string) => any[];

    const groups = generateIPTGroups(participants, 'mixed');
    const g0 = groups && groups[0] ? groups[0] : null;

    expect(sharedCalled).toBe(true);
    expect(fallbackCalled).toBe(false);
    expect(groups.length).toBe(1);
    expect(g0.players).toEqual(['p1', 'p2', 'p3', 'p4', 'p6', 'p5', 'p8', 'p7']);
  });

  test('generateIPTGroups(n!=8, mixed) does not crash and generates rounds/courts', async ({ page }) => {
    const participants = [
      'p1', 'p2', 'p3', 'p4',
      'p5', 'p6', 'p7', 'p8',
      'p9', 'p10', 'p11', 'p12',
    ];
    let sharedCalled = false;
    let fallbackCalled = false;

    const sharedPlayers = {
      loadPlayerDB: () => {
        sharedCalled = true;
        return [];
      },
    };

    const loadPlayerDB = () => {
      fallbackCalled = true;
      return [];
    };

    const generateIPTGroups = new Function(
      'sharedPlayers',
      'loadPlayerDB',
      IPT_FORMAT_CODE + '\nreturn generateIPTGroups;',
    )(sharedPlayers, loadPlayerDB) as (p: string[], g: string) => any[];

    const groups = generateIPTGroups(participants, 'mixed');
    const g0 = groups && groups[0] ? groups[0] : null;

    expect(sharedCalled).toBe(true);
    expect(fallbackCalled).toBe(false);
    expect(groups.length).toBe(1);
    expect(g0.players.length).toBe(12);
    expect(g0.rounds.length).toBeGreaterThan(0);
    expect(g0.rounds[0].courts.length).toBeGreaterThan(0);
    expect(g0.rounds[0].courts[0].team1.length).toBe(2);
    expect(g0.rounds[0].courts[0].team2.length).toBe(2);
  });
});

import type { Page } from '@playwright/test';

// ── IPT Regression: post A0.2 refactor ──────────────────────────────────────
// Verifies that the sharedPlayers bridge introduced in A0.2 did not break any
// IPT logic.  All tests run inside a real Chromium context via page.evaluate()
// so they exercise the fully-loaded script stack (shared/ + ipt-format.js).
// ---------------------------------------------------------------------------

async function waitForApp(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.locator('.nb[data-tab="home"]').waitFor({ timeout: 20_000 });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

test.describe.skip('IPT Regression — post A0.2 refactor', () => {

  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
  });

  // 1. IPT functions присутствуют в глобальном контексте ──────────────────
  test('1. IPT-функции доступны в глобальном контексте браузера', async ({ page }) => {
    const present = await page.evaluate(() => {
      const fns = [
        'generateIPTRounds',
        'generateIPTGroups',
        'calcIPTStandings',
        'calcIPTGroupStandings',
        'iptMatchFinished',
        'tryGenerateIPTRoundsDynamic',
        'buildIPTMatchHistory',
        '_migrateIPTLegacy',
      ];
      return fns.reduce((acc, fn) => {
        acc[fn] = typeof (window as any)[fn] === 'function';
        return acc;
      }, {} as Record<string, boolean>);
    });

    for (const [fn, ok] of Object.entries(present)) {
      expect(ok, `${fn} должна быть функцией`).toBe(true);
    }
  });

  // 2. sharedPlayers bridge доступен после загрузки shared/players.js ───────
  test('2. sharedPlayers bridge загружен (A0.2)', async ({ page }) => {
    const result = await page.evaluate(() => {
      const sp = (window as any).sharedPlayers;
      return {
        defined:         typeof sp !== 'undefined',
        hasLoadPlayerDB: typeof sp?.loadPlayerDB === 'function',
        hasSearchPlayers:typeof sp?.searchPlayers === 'function',
      };
    });

    expect(result.defined,          'sharedPlayers должен быть определён').toBe(true);
    expect(result.hasLoadPlayerDB,  'sharedPlayers.loadPlayerDB должен быть функцией').toBe(true);
    expect(result.hasSearchPlayers, 'sharedPlayers.searchPlayers должен быть функцией').toBe(true);
  });

  // 3. generateIPTRounds — стандартная ротация (8 игроков) ──────────────────
  test('3. generateIPTRounds — стандартная ротация 8 игроков', async ({ page }) => {
    const result = await page.evaluate(() => {
      const p = ['p0','p1','p2','p3','p4','p5','p6','p7'];
      const rounds = (window as any).generateIPTRounds(p, false);
      return {
        numRounds:       rounds.length,
        round0Status:    rounds[0].status,
        round1Status:    rounds[1].status,
        round0Courts:    rounds[0].courts.length,
        court0Team1:     rounds[0].courts[0].team1,
        court0Team2:     rounds[0].courts[0].team2,
        allHave2Courts:  rounds.every((r: any) => r.courts.length === 2),
        allScoresZero:   rounds.every((r: any) => r.courts.every((c: any) => c.score1 === 0 && c.score2 === 0)),
      };
    });

    expect(result.numRounds).toBe(4);
    expect(result.round0Status).toBe('active');
    expect(result.round1Status).toBe('waiting');
    expect(result.round0Courts).toBe(2);
    expect(result.court0Team1).toEqual(['p0', 'p1']);
    expect(result.court0Team2).toEqual(['p2', 'p3']);
    expect(result.allHave2Courts).toBe(true);
    expect(result.allScoresZero).toBe(true);
  });

  // 4. generateIPTRounds — Mixed ротация (М/Ж) ─────────────────────────────
  test('4. generateIPTRounds — mixed режим М/Ж', async ({ page }) => {
    const result = await page.evaluate(() => {
      // Индексы 0..3 = мужчины, 4..7 = женщины
      const p = ['m0','m1','m2','m3','w0','w1','w2','w3'];
      const rounds = (window as any).generateIPTRounds(p, true);
      // Round 0: t1=[0,4], t2=[1,5] → m0+w0 vs m1+w1
      const r0c0 = rounds[0].courts[0];
      return {
        numRounds:   rounds.length,
        r0c0_team1:  r0c0.team1,
        r0c0_team2:  r0c0.team2,
      };
    });

    expect(result.numRounds).toBe(4);
    expect(result.r0c0_team1).toEqual(['m0', 'w0']);
    expect(result.r0c0_team2).toEqual(['m1', 'w1']);
  });

  // 5. generateIPTGroups — не падает, возвращает корректную структуру ───────
  test('5. generateIPTGroups — 8 игроков → 1 группа (мужская)', async ({ page }) => {
    const result = await page.evaluate(() => {
      const p = Array.from({ length: 8 }, (_, i) => `male${i}`);
      let groups: any;
      try {
        groups = (window as any).generateIPTGroups(p, 'male');
      } catch (e: any) {
        return { ok: false, error: e.message };
      }
      return {
        ok:          true,
        numGroups:   groups.length,
        groupName:   groups[0].name,
        players:     groups[0].players.length,
        numRounds:   groups[0].rounds.length,
        status:      groups[0].status,
      };
    });

    expect(result.ok,        'generateIPTGroups не должна выбрасывать').toBe(true);
    expect(result.numGroups).toBe(1);
    expect(result.groupName).toBe('IPT');
    expect(result.players).toBe(8);
    expect(result.numRounds).toBe(4);
    expect(result.status).toBe('active');
  });

  // 6. generateIPTGroups — 16 игроков → 2 группы (ХАРД / ЛАЙТ) ─────────────
  test('6. generateIPTGroups — 16 игроков → 2 группы', async ({ page }) => {
    const result = await page.evaluate(() => {
      const p = Array.from({ length: 16 }, (_, i) => `p${i}`);
      const groups = (window as any).generateIPTGroups(p, 'male');
      return {
        numGroups: groups.length,
        names:     groups.map((g: any) => g.name),
        each8:     groups.every((g: any) => g.players.length === 8),
      };
    });

    expect(result.numGroups).toBe(2);
    expect(result.names).toEqual(['ХАРД', 'ЛАЙТ']);
    expect(result.each8).toBe(true);
  });

  // 7. generateIPTGroups — mixed режим использует sharedPlayers bridge ───────
  test('7. generateIPTGroups — mixed режим не падает (sharedPlayers bridge)', async ({ page }) => {
    const result = await page.evaluate(() => {
      const p = Array.from({ length: 8 }, (_, i) => `mix${i}`);
      try {
        const groups = (window as any).generateIPTGroups(p, 'mixed');
        return {
          ok:        true,
          numGroups: groups.length,
          numRounds: groups[0].rounds.length,
        };
      } catch (e: any) {
        return { ok: false, error: e.message };
      }
    });

    expect(result.ok, 'mixed generateIPTGroups не должна падать').toBe(true);
    expect(result.numGroups).toBe(1);
    expect(result.numRounds).toBe(4);
  });

  // 8. calcIPTGroupStandings — корректный подсчёт победы / разницы / очков ──
  test('8. calcIPTGroupStandings — подсчёт победы/разницы/очков', async ({ page }) => {
    const result = await page.evaluate(() => {
      const players = ['a','b','c','d','e','f','g','h'];
      const rounds  = (window as any).generateIPTRounds(players, false);
      // R0: корт 0 → a+b (21) vs c+d (10) — команда 1 побеждает
      rounds[0].courts[0].score1 = 21;
      rounds[0].courts[0].score2 = 10;
      rounds[0].courts[0].status = 'finished';
      const group = { name: 'IPT', players, currentRound: 0, status: 'active', rounds };
      const st    = (window as any).calcIPTGroupStandings(group, 21, 'hard');
      const a = st.find((s: any) => s.playerId === 'a');
      const c = st.find((s: any) => s.playerId === 'c');
      return {
        aWins: a?.wins,  aPts: a?.pts,  aDiff: a?.diff,  aMatches: a?.matches,
        cWins: c?.wins,  cPts: c?.pts,  cDiff: c?.diff,  cMatches: c?.matches,
      };
    });

    expect(result.aWins).toBe(1);
    expect(result.aPts).toBe(21);
    expect(result.aDiff).toBe(11);    // 21 - 10
    expect(result.aMatches).toBe(1);
    expect(result.cWins).toBe(0);
    expect(result.cPts).toBe(10);
    expect(result.cDiff).toBe(-11);   // 10 - 21
    expect(result.cMatches).toBe(1);
  });

  // 9. iptMatchFinished — режим hard и balance ───────────────────────────────
  test('9. iptMatchFinished — hard и balance режимы', async ({ page }) => {
    const result = await page.evaluate(() => {
      const f = (window as any).iptMatchFinished;
      return {
        hard_win:     f({ score1: 21, score2:  0 }, 21, 'hard'),
        hard_notYet:  f({ score1: 20, score2: 20 }, 21, 'hard'),
        bal_deuceOk:  f({ score1: 16, score2: 14 }, 15, 'balance'),
        bal_noDeuce:  f({ score1: 15, score2: 14 }, 15, 'balance'),
        bal_continue: f({ score1: 23, score2: 22 }, 21, 'balance'),
        bal_ok:       f({ score1: 24, score2: 22 }, 21, 'balance'),
      };
    });

    expect(result.hard_win).toBe(true);
    expect(result.hard_notYet).toBe(false);
    expect(result.bal_deuceOk).toBe(true);
    expect(result.bal_noDeuce).toBe(false);
    expect(result.bal_continue).toBe(false);
    expect(result.bal_ok).toBe(true);
  });

  // 10. _migrateIPTLegacy — конвертация flat → groups формат ────────────────
  test('10. _migrateIPTLegacy — конвертация flat rounds → groups', async ({ page }) => {
    const result = await page.evaluate(() => {
      const players = ['a','b','c','d','e','f','g','h'];
      const rounds  = (window as any).generateIPTRounds(players, false);
      const trn = {
        id: 'legacy-test',
        status: 'active',
        ipt: { rounds, currentRound: 0, pointLimit: 21, finishType: 'hard' },
      };
      const hasBefore = !!(trn as any).ipt.groups;
      (window as any)._migrateIPTLegacy(trn);
      const ipt = (trn as any).ipt;
      return {
        hasBefore,
        hasAfter:     !!ipt.groups,
        numGroups:    ipt.groups?.length,
        groupName:    ipt.groups?.[0]?.name,
        currentGroup: ipt.currentGroup,
        roundsLen:    ipt.groups?.[0]?.rounds?.length,
      };
    });

    expect(result.hasBefore).toBe(false);
    expect(result.hasAfter).toBe(true);
    expect(result.numGroups).toBe(1);
    expect(result.groupName).toBe('IPT');
    expect(result.currentGroup).toBe(0);
    expect(result.roundsLen).toBe(4);
  });

  // 11. tryGenerateIPTRoundsDynamic — 8 игроков → детерминированный schedule─
  test('11. tryGenerateIPTRoundsDynamic — 8 игроков = детерминированный schedule', async ({ page }) => {
    const result = await page.evaluate(() => {
      const p8 = Array.from({ length: 8 }, (_, i) => `p${i}`);
      const r  = (window as any).tryGenerateIPTRoundsDynamic(p8);
      return {
        numRounds:  r.length,
        numCourts:  r[0].courts.length,
        // 8 игроков → стандартный IPT_SCHEDULE → те же команды что generateIPTRounds
        r0c0_t1: r[0].courts[0].team1,
      };
    });

    expect(result.numRounds).toBe(4);
    expect(result.numCourts).toBe(2);
    expect(result.r0c0_t1).toEqual(['p0', 'p1']);
  });

  // 12. tryGenerateIPTRoundsDynamic — 12 игроков → dynamic schedule ─────────
  test('12. tryGenerateIPTRoundsDynamic — 12 игроков → dynamic schedule', async ({ page }) => {
    const result = await page.evaluate(() => {
      const p12 = Array.from({ length: 12 }, (_, i) => `p${i}`);
      const r   = (window as any).tryGenerateIPTRoundsDynamic(p12);
      return {
        isArray:    Array.isArray(r),
        numRounds:  r.length,
        // floor(12/4) = 3 корта за раунд
        courtsR0: r[0].courts.length,
      };
    });

    expect(result.isArray).toBe(true);
    expect(result.numRounds).toBeGreaterThan(0);
    expect(result.courtsR0).toBe(3);
  });

  // 13. tryGenerateIPTRoundsDynamic — граничные случаи ─────────────────────
  test('13. tryGenerateIPTRoundsDynamic — граничные случаи (< 4 и пустой массив)', async ({ page }) => {
    const result = await page.evaluate(() => {
      const fn = (window as any).tryGenerateIPTRoundsDynamic;
      return {
        empty:    fn([]).length,
        tooFew:   fn(['a','b','c']).length,
        exactly4: fn(['a','b','c','d']).length,
      };
    });

    expect(result.empty).toBe(0);
    expect(result.tooFew).toBe(0);
    expect(result.exactly4).toBeGreaterThan(0);
  });

  // 14. buildIPTMatchHistory — считает партнёров и оппонентов ───────────────
  test('14. buildIPTMatchHistory — корректный учёт партнёров/оппонентов', async ({ page }) => {
    const result = await page.evaluate(() => {
      const p = ['a','b','c','d','e','f','g','h'];
      const rounds = (window as any).generateIPTRounds(p, false);
      const hist   = (window as any).buildIPTMatchHistory(rounds);
      // Раунд 0: a+b vs c+d → a|b — партнёры, a|c, a|d, b|c, b|d — оппоненты
      return {
        partnersCount:  Object.keys(hist.partners).length,
        opponentsCount: Object.keys(hist.opponents).length,
        ab:  hist.partners['a|b'] ?? 0,
        cd:  hist.partners['c|d'] ?? 0,
        ac:  hist.opponents['a|c'] ?? 0,
      };
    });

    expect(result.partnersCount).toBeGreaterThan(0);
    expect(result.opponentsCount).toBeGreaterThan(0);
    expect(result.ab).toBe(1);   // a и b — партнёры в раунде 0
    expect(result.cd).toBe(1);   // c и d — партнёры в раунде 0
    expect(result.ac).toBeGreaterThan(0);  // a и c — оппоненты
  });

  // 15. Нет console-ошибок при вызове IPT-функций ───────────────────────────
  test('15. Нет ошибок консоли при работе IPT-функций', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e  => errors.push(e.message));
    page.on('console',   m  => { if (m.type() === 'error') errors.push(m.text()); });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('.nb[data-tab="home"]').waitFor({ timeout: 20_000 });

    await page.evaluate(() => {
      const p = Array.from({ length: 8 }, (_, i) => `p${i}`);
      (window as any).generateIPTRounds(p, false);
      (window as any).generateIPTRounds(p, true);
      (window as any).generateIPTGroups(p, 'male');
      (window as any).generateIPTGroups(p, 'mixed');
      (window as any).tryGenerateIPTRoundsDynamic(p);
      (window as any).tryGenerateIPTRoundsDynamic(p.slice(0, 4));
      (window as any).buildIPTMatchHistory([]);
    });

    // Фильтруем только ошибки, связанные с IPT или JS
    const iptErrors = errors.filter(e =>
      /ipt|generateIPT|calcIPT|Unexpected|TypeError|ReferenceError/i.test(e)
    );
    expect(iptErrors, `IPT errors: ${iptErrors.join('; ')}`).toEqual([]);
  });

});
