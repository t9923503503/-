import { test, expect } from '@playwright/test';

const PORT = process.env.SMOKE_PORT ? Number(process.env.SMOKE_PORT) : 9011;
const HOST = process.env.SMOKE_HOST || '127.0.0.1';
const BASE = `http://${HOST}:${PORT}`;

/**
 * Helper: build a player DB with enough players for nc courts × 4 men + 4 women each.
 */
function makePlayers(nc: number) {
  const total = nc * 4;
  return [
    ...Array.from({ length: total }, (_, i) => ({
      id: `m${i}`, name: `Man${i + 1}`, gender: 'M', status: 'active',
    })),
    ...Array.from({ length: total }, (_, i) => ({
      id: `w${i}`, name: `Woman${i + 1}`, gender: 'W', status: 'active',
    })),
  ];
}

test.describe('Q2.2 — KOTC E2E flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('kotc3_locale', 'ru');
    });
  });

  test('kotc.html loads and shows roster panel', async ({ page }) => {
    const trnId = 'kotc_e2e_load_' + Date.now();
    const players = makePlayers(4);

    await page.addInitScript(({ trnId, players }) => {
      localStorage.setItem('kotc3_playerdb', JSON.stringify(players));
      localStorage.removeItem('kotc3_kotc_session_' + trnId);
    }, { trnId, players });

    await page.goto(`${BASE}/formats/kotc/kotc.html?nc=4&ppc=4&trnId=${trnId}`, {
      waitUntil: 'domcontentloaded',
    });

    // Roster panel should be active
    const rosterPanel = page.locator('#kotc-roster-panel');
    await expect(rosterPanel).toHaveClass(/active/);

    // Info bar text
    const infoText = page.locator('#kotc-info-text');
    await expect(infoText).toContainText('KOTC');

    // Phase badge shows Ростер
    const badge = page.locator('#kotc-phase-badge');
    await expect(badge).toContainText('Ростер');
  });

  test('fill roster and start Stage 1', async ({ page }) => {
    const trnId = 'kotc_e2e_stage1_' + Date.now();
    const nc = 2;
    const players = makePlayers(nc);

    // Pre-seed a session with full courts so we can skip manual roster filling
    const session = {
      version: '2.0',
      trnId,
      nc,
      ppc: 4,
      fixedPairs: false,
      phase: 'roster',
      courts: Array.from({ length: nc }, (_, ci) => ({
        men: players.filter(p => p.gender === 'M').slice(ci * 4, ci * 4 + 4).map(p => p.name),
        women: players.filter(p => p.gender === 'W').slice(ci * 4, ci * 4 + 4).map(p => p.name),
      })),
      scores: Array.from({ length: nc }, () =>
        Array.from({ length: 4 }, () => Array(3).fill(null))
      ),
      courtRound: Array(nc).fill(0),
      divRoster: { hard: { men: [], women: [] }, advance: { men: [], women: [] }, medium: { men: [], women: [] }, lite: { men: [], women: [] } },
      divScores: { hard: [], advance: [], medium: [], lite: [] },
      divRoundState: { hard: 0, advance: 0, medium: 0, lite: 0 },
      meta: { name: 'KOTC', date: '2026-03-22' },
      savedAt: Date.now(),
    };

    await page.addInitScript(({ trnId, players, session }) => {
      localStorage.setItem('kotc3_playerdb', JSON.stringify(players));
      localStorage.setItem('kotc3_kotc_session_' + trnId, JSON.stringify(session));
    }, { trnId, players, session });

    await page.goto(`${BASE}/formats/kotc/kotc.html?nc=${nc}&ppc=4&trnId=${trnId}`, {
      waitUntil: 'domcontentloaded',
    });

    // Roster should show with full courts
    await expect(page.locator('#kotc-roster-panel')).toHaveClass(/active/);

    // Action bar should have Start button
    const startBtn = page.locator('#kotc-action-bar button', { hasText: 'Начать Stage 1' });
    await expect(startBtn).toBeVisible();
    await startBtn.click();

    // Should switch to courts panel
    await expect(page.locator('#kotc-courts-panel')).toHaveClass(/active/);

    // Court tabs should appear
    await expect(page.locator('#kotc-court-tabs-wrap')).toBeVisible();

    // Phase badge
    await expect(page.locator('#kotc-phase-badge')).toContainText('Stage 1');
  });

  test('enter scores in Stage 1 and view standings', async ({ page }) => {
    const trnId = 'kotc_e2e_scores_' + Date.now();
    const nc = 1;
    const players = makePlayers(nc);

    // Pre-seed session in stage1 phase
    const session = {
      version: '2.0',
      trnId,
      nc,
      ppc: 4,
      fixedPairs: false,
      phase: 'stage1',
      courts: [{
        men: players.filter(p => p.gender === 'M').map(p => p.name),
        women: players.filter(p => p.gender === 'W').map(p => p.name),
      }],
      scores: [
        Array.from({ length: 4 }, () => Array(3).fill(null))
      ],
      courtRound: [0],
      divRoster: { hard: { men: [], women: [] }, advance: { men: [], women: [] }, medium: { men: [], women: [] }, lite: { men: [], women: [] } },
      divScores: { hard: [], advance: [], medium: [], lite: [] },
      divRoundState: { hard: 0, advance: 0, medium: 0, lite: 0 },
      meta: { name: 'KOTC', date: '2026-03-22' },
      savedAt: Date.now(),
    };

    await page.addInitScript(({ trnId, players, session }) => {
      localStorage.setItem('kotc3_playerdb', JSON.stringify(players));
      localStorage.setItem('kotc3_kotc_session_' + trnId, JSON.stringify(session));
    }, { trnId, players, session });

    await page.goto(`${BASE}/formats/kotc/kotc.html?nc=${nc}&ppc=4&trnId=${trnId}`, {
      waitUntil: 'domcontentloaded',
    });

    // Should start in courts panel
    await expect(page.locator('#kotc-courts-panel')).toHaveClass(/active/);

    // Score buttons should exist
    const scoreBtns = page.locator('.kotc-sc-btn');
    const btnCount = await scoreBtns.count();
    expect(btnCount).toBeGreaterThan(0);

    // Click + button several times
    const plusBtns = page.locator('.kotc-sc-btn:has-text("+")');
    if (await plusBtns.count() > 0) {
      await plusBtns.first().click();
      await plusBtns.first().click();
    }

    // View standings
    const standingsBtn = page.locator('#kotc-action-bar button', { hasText: 'Таблица' });
    await expect(standingsBtn).toBeVisible();
    await standingsBtn.click();

    await expect(page.locator('#kotc-standings-panel')).toHaveClass(/active/);
  });

  test('session persists after reload (offline-first)', async ({ page }) => {
    const trnId = 'kotc_e2e_persist_' + Date.now();
    const nc = 1;
    const players = makePlayers(nc);

    const session = {
      version: '2.0',
      trnId,
      nc,
      ppc: 4,
      fixedPairs: false,
      phase: 'stage1',
      courts: [{
        men: players.filter(p => p.gender === 'M').map(p => p.name),
        women: players.filter(p => p.gender === 'W').map(p => p.name),
      }],
      scores: [
        [[15, null, null, null], [10, null, null, null], [null, null, null, null], [null, null, null, null]]
      ],
      courtRound: [0],
      divRoster: { hard: { men: [], women: [] }, advance: { men: [], women: [] }, medium: { men: [], women: [] }, lite: { men: [], women: [] } },
      divScores: { hard: [], advance: [], medium: [], lite: [] },
      divRoundState: { hard: 0, advance: 0, medium: 0, lite: 0 },
      meta: { name: 'KOTC Persist', date: '2026-03-22' },
      savedAt: Date.now(),
    };

    await page.addInitScript(({ trnId, players, session }) => {
      localStorage.setItem('kotc3_playerdb', JSON.stringify(players));
      localStorage.setItem('kotc3_kotc_session_' + trnId, JSON.stringify(session));
    }, { trnId, players, session });

    const url = `${BASE}/formats/kotc/kotc.html?nc=${nc}&ppc=4&trnId=${trnId}`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // Phase should be Stage 1
    await expect(page.locator('#kotc-phase-badge')).toContainText('Stage 1');

    // Reload the page
    await page.reload({ waitUntil: 'domcontentloaded' });

    // After reload, session should be preserved
    await expect(page.locator('#kotc-phase-badge')).toContainText('Stage 1');
    await expect(page.locator('#kotc-courts-panel')).toHaveClass(/active/);
  });

  test('hub roster launcher has KOTC tab', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('kotc3_playerdb', JSON.stringify([
        { id: 'test1', name: 'Test', gender: 'M', status: 'active' },
      ]));
    });

    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });

    // Navigate to roster
    await page.evaluate(() => {
      if (typeof (window as any).switchTab === 'function') {
        (window as any).switchTab('roster');
      }
    });

    // Wait for roster to render
    await page.waitForSelector('.fmt-mode-tabs', { timeout: 5000 });

    // KOTC tab should exist
    const kotcTab = page.locator('.fmt-tab', { hasText: 'KOTC' });
    await expect(kotcTab).toBeVisible();
  });
});
