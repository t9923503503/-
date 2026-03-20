import { test, expect } from '@playwright/test';

test.describe('Q1.1 — Thai tournament creation', () => {
  test('open thai.html, autobalance roster, start R1', async ({ page }) => {
    const PORT = process.env.SMOKE_PORT ? Number(process.env.SMOKE_PORT) : 9011;
    const HOST = process.env.SMOKE_HOST || '127.0.0.1';
    const base = `http://${HOST}:${PORT}`;

    const trnId = 'thai_e2e_create_1';
    const players = [
      ...Array.from({ length: 8 }, (_, i) => ({ id: `m${i}`, name: `M${i + 1}`, gender: 'M', status: 'active' })),
      ...Array.from({ length: 8 }, (_, i) => ({ id: `w${i}`, name: `W${i + 1}`, gender: 'W', status: 'active' })),
    ];

    await page.addInitScript(
      ({ trnId, players }) => {
        localStorage.setItem('kotc3_playerdb', JSON.stringify(players));
        localStorage.removeItem('kotc3_thai_session_' + trnId);
      },
      { trnId, players },
    );

    const url = `${base}/formats/thai/thai.html?mode=MF&n=8&seed=1&trnId=${encodeURIComponent(trnId)}`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // Roster panel should render.
    const rosterPanel = page.locator('#thai-roster-panel');
    await expect(rosterPanel).toHaveClass(/active/);

    const autoBtn = page.getByRole('button', { name: /Автобаланс/i });
    await autoBtn.click();

    const startBtn = page.getByRole('button', { name: /Запустить сессию/i });
    await expect(startBtn).toBeEnabled();
    await startBtn.click();

    const courtsPanel = page.locator('#thai-courts-panel');
    await expect(courtsPanel).toHaveClass(/active/);

    const courtCards = page.locator('#thai-courts-grid .thai-pair-card');
    expect(await courtCards.count()).toBeGreaterThan(0);

    const tourButtons = page.locator('#thai-tour-tabs button');
    expect(await tourButtons.count()).toBeGreaterThan(0);
  });
});

