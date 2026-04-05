import { test, expect } from '@playwright/test';

test.describe('Q1.4 — Thai E2E R2 → FINISHED → nominations → Telegram', () => {
  test('finish after R2 play shows nominations + telegram', async ({ page }) => {
    const PORT = process.env.SMOKE_PORT ? Number(process.env.SMOKE_PORT) : 9011;
    const HOST = process.env.SMOKE_HOST || '127.0.0.1';
    const base = `http://${HOST}:${PORT}`;

    const trnId = 'thai_e2e_r2_finished_1';
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

    await expect(page.locator('#thai-roster-panel')).toHaveClass(/active/);
    await page.getByRole('button', { name: /Автобаланс/i }).click();
    const startBtn = page.getByRole('button', { name: /Запустить сессию/i });
    await expect(startBtn).toBeEnabled();
    await startBtn.click();
    await expect(page.locator('#thai-courts-panel')).toHaveClass(/active/);

    const nCourts = 8;
    const tourCount = await page.locator('#thai-tour-tabs button').count();

    for (let tour = 0; tour < tourCount; tour++) {
      await page.evaluate((nCourts) => {
        for (let pi = 0; pi < nCourts; pi++) {
          const isEven = pi % 2 === 0;
          const own = isEven ? 3 : 1;
          const opp = isEven ? 1 : 3;
          window._thaiScore(pi, 'own', own);
          window._thaiScore(pi, 'opp', opp);
        }
      }, nCourts);

      await expect(page.locator('#thai-zs-bar')).toHaveClass(/zs-ok/);

      const nextBtn = page.getByRole('button', { name: /Следующий тур/i });
      if (tour < tourCount - 1) {
        await nextBtn.click();
        await expect(page.locator('#thai-courts-panel')).toHaveClass(/active/);
      }
    }

    // Open standings
    await page.getByRole('button', { name: /Таблица/i }).click();
    await expect(page.locator('#thai-standings-panel')).toHaveClass(/active/);

    // Go to R2 seed, then R2 play
    await page.getByRole('button', { name: /Посев R2/i }).click();
    await expect(page.locator('#thai-r2-panel')).toHaveClass(/active/);
    await page.getByRole('button', { name: /Играть R2/i }).click();

    // Finish
    await page.getByRole('button', { name: /Завершить/i }).click();

    // Finished UI assertions
    await expect(page.locator('#thai-finished-panel')).toHaveClass(/active/);
    const nomWraps = page.locator('#thai-finished-content .thai-nom-wrap');
    expect(await nomWraps.count()).toBeGreaterThan(0);
    const telegramWraps = page.locator('#thai-finished-content .thai-telegram-wrap');
    expect(await telegramWraps.count()).toBeGreaterThan(0);
    await expect(page.locator('#thai-telegram-text')).toBeVisible();
  });
});

