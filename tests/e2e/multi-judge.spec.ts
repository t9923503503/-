import { test, expect } from '@playwright/test';

const PORT = process.env.SMOKE_PORT ? Number(process.env.SMOKE_PORT) : 9011;
const HOST = process.env.SMOKE_HOST || '127.0.0.1';
const BASE = `http://${HOST}:${PORT}`;

/**
 * S7.9 — Multi-judge E2E test
 *
 * Two browser contexts simulate two judges on different courts.
 * Verifies court-lock: each judge can only edit their own court,
 * while the other courts' buttons are disabled.
 * Uses index.html with seeded localStorage state.
 */

// Seed: 2 courts, 4 players each
const ROSTER = [
  { men: ['Man1','Man2','Man3','Man4'], women: ['Woman1','Woman2','Woman3','Woman4'] },
  { men: ['Man5','Man6','Man7','Man8'], women: ['Woman5','Woman6','Woman7','Woman8'] },
];
const CFG = { ppc: 4, nc: 2, fixedPairs: false };

// Blank scores for 2 courts × 4 matches × 4 rounds
const SCORES = Array.from({ length: 2 }, () =>
  Array.from({ length: 4 }, () => Array(4).fill(null))
);

function seedAppState() {
  localStorage.setItem('kotc_version', '1.1');
  localStorage.setItem('kotc3_locale', 'ru');
  localStorage.setItem('kotc3_cfg',    JSON.stringify({ ppc: 4, nc: 2, fixedPairs: false }));
  localStorage.setItem('kotc3_roster', JSON.stringify([
    { men: ['Man1','Man2','Man3','Man4'], women: ['Woman1','Woman2','Woman3','Woman4'] },
    { men: ['Man5','Man6','Man7','Man8'], women: ['Woman5','Woman6','Woman7','Woman8'] },
  ]));
  localStorage.setItem('kotc3_scores', JSON.stringify(
    Array.from({ length: 2 }, () =>
      Array.from({ length: 4 }, () => Array(4).fill(null))
    )
  ));
}

test.describe('S7.9 — Multi-judge court lock (index.html)', () => {

  test('judgeMode is parsed from URL correctly', async ({ page }) => {
    await page.addInitScript(seedAppState);

    await page.goto(`${BASE}/index.html?trnId=test_jm&court=0&token=tokA&judge=Ivan`, {
      waitUntil: 'domcontentloaded',
    });

    // Wait for main.js to execute
    await page.waitForFunction(() => typeof (window as any).judgeMode !== 'undefined', { timeout: 10_000 });

    const jm = await page.evaluate(() => (window as any).judgeMode);
    expect(jm.active).toBe(true);
    expect(jm.court).toBe(0);
    expect(jm.trnId).toBe('test_jm');
    expect(jm.token).toBe('tokA');
    expect(jm.judgeName).toBe('Ivan');
  });

  test('judge on court 0: court 0 buttons enabled, court 1 buttons disabled', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await page.addInitScript(seedAppState);

    await page.goto(`${BASE}/index.html?trnId=lock_test_0&court=0&token=tokA`, {
      waitUntil: 'domcontentloaded',
    });

    // Wait for app to build screens
    await page.waitForFunction(() => {
      return document.getElementById('screen-0') !== null &&
             document.getElementById('screen-1') !== null;
    }, { timeout: 10_000 });

    // Navigate to court 0
    await page.evaluate(() => { (window as any).switchTab(0); });
    await page.waitForSelector('#screen-0.active', { timeout: 5_000 });

    // Court 0 (judge's court): plus button should be enabled
    const plusCourt0 = page.locator('#screen-0 .score-btn.plus').first();
    await expect(plusCourt0).not.toBeDisabled();

    // Court 0: sub-text should NOT show lock
    const subCourt0 = page.locator('#screen-0 .court-sub').first();
    await expect(subCourt0).not.toContainText('🔒');

    // Navigate to court 1 (foreign)
    await page.evaluate(() => { (window as any).switchTab(1); });
    await page.waitForSelector('#screen-1.active', { timeout: 5_000 });

    // Court 1 (foreign court): plus button should be disabled
    const plusCourt1 = page.locator('#screen-1 .score-btn.plus').first();
    await expect(plusCourt1).toBeDisabled();

    // Court 1: sub-text shows lock icon
    const subCourt1 = page.locator('#screen-1 .court-sub').first();
    await expect(subCourt1).toContainText('🔒');

    await ctx.close();
  });

  test('judge on court 1: court 1 buttons enabled, court 0 buttons disabled', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await page.addInitScript(seedAppState);

    await page.goto(`${BASE}/index.html?trnId=lock_test_1&court=1&token=tokB`, {
      waitUntil: 'domcontentloaded',
    });

    await page.waitForFunction(() => {
      return document.getElementById('screen-0') !== null &&
             document.getElementById('screen-1') !== null;
    }, { timeout: 10_000 });

    // Court 0 is in DOM but inactive — check it's locked
    const plusCourt0 = page.locator('#screen-0 .score-btn.plus').first();
    await expect(plusCourt0).toBeDisabled();

    const subCourt0 = page.locator('#screen-0 .court-sub').first();
    await expect(subCourt0).toContainText('🔒');

    // Navigate to court 1 (judge's court)
    await page.evaluate(() => { (window as any).switchTab(1); });
    await page.waitForSelector('#screen-1.active', { timeout: 5_000 });

    const plusCourt1 = page.locator('#screen-1 .score-btn.plus').first();
    await expect(plusCourt1).not.toBeDisabled();

    const subCourt1 = page.locator('#screen-1 .court-sub').first();
    await expect(subCourt1).not.toContainText('🔒');

    await ctx.close();
  });

  test('two judges in parallel — each locked to their own court', async ({ browser }) => {
    // Launch both contexts simultaneously
    const [ctx1, ctx2] = await Promise.all([
      browser.newContext(),
      browser.newContext(),
    ]);
    const [page1, page2] = await Promise.all([
      ctx1.newPage(),
      ctx2.newPage(),
    ]);

    await Promise.all([
      page1.addInitScript(seedAppState),
      page2.addInitScript(seedAppState),
    ]);

    await Promise.all([
      page1.goto(`${BASE}/index.html?trnId=dual_test&court=0&token=tokA`, { waitUntil: 'domcontentloaded' }),
      page2.goto(`${BASE}/index.html?trnId=dual_test&court=1&token=tokB`, { waitUntil: 'domcontentloaded' }),
    ]);

    // Wait for both to build
    await Promise.all([
      page1.waitForFunction(() => document.getElementById('screen-1') !== null, { timeout: 10_000 }),
      page2.waitForFunction(() => document.getElementById('screen-0') !== null, { timeout: 10_000 }),
    ]);

    // Judge 1: court 0 ok, court 1 locked
    const [jm1, jm2] = await Promise.all([
      page1.evaluate(() => (window as any).judgeMode),
      page2.evaluate(() => (window as any).judgeMode),
    ]);
    expect(jm1.court).toBe(0);
    expect(jm2.court).toBe(1);

    // Judge 1: foreign court (1) is locked
    const page1Court1Plus = page1.locator('#screen-1 .score-btn.plus').first();
    await expect(page1Court1Plus).toBeDisabled();

    // Judge 2: foreign court (0) is locked
    const page2Court0Plus = page2.locator('#screen-0 .score-btn.plus').first();
    await expect(page2Court0Plus).toBeDisabled();

    await Promise.all([ctx1.close(), ctx2.close()]);
  });
});
