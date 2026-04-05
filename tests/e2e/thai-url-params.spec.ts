import { test, expect } from '@playwright/test';

test.describe('Thai URL courts/tours', () => {
  test('courts=2 tours=3 n=8 MF: tabs and grid match params after start', async ({ page }) => {
    const PORT = process.env.SMOKE_PORT ? Number(process.env.SMOKE_PORT) : 9011;
    const HOST = process.env.SMOKE_HOST || '127.0.0.1';
    const base = `http://${HOST}:${PORT}`;

    const trnId = 'thai_e2e_url_ct_1';
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

    const url =
      `${base}/formats/thai/thai.html?mode=MF&n=8&seed=42&courts=2&tours=3&trnId=${encodeURIComponent(trnId)}`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    await expect(page.locator('#thai-roster-panel')).toHaveClass(/active/);
    await page.getByRole('button', { name: /Автобаланс/i }).click();
    const startBtn = page.getByRole('button', { name: /Запустить сессию/i });
    await expect(startBtn).toBeEnabled();
    await startBtn.click();

    await expect(page.locator('#thai-courts-panel')).toHaveClass(/active/);
    await expect(page.locator('#thai-tour-tabs button')).toHaveCount(3);
    await expect(page.locator('#thai-courts-grid .thai-pair-card')).toHaveCount(2);
  });
});
