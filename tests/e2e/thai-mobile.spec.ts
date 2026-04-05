import { test, expect } from '@playwright/test';

const viewports = [
  { width: 320, height: 640 },
  { width: 414, height: 736 },
];

for (const vp of viewports) {
  test.describe(`Q1.7 — Thai mobile viewport ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp });

    test('roster → start → courts render', async ({ page }) => {
      const PORT = process.env.SMOKE_PORT ? Number(process.env.SMOKE_PORT) : 9011;
      const HOST = process.env.SMOKE_HOST || '127.0.0.1';
      const base = `http://${HOST}:${PORT}`;

      const trnId = `thai_e2e_mobile_${vp.width}`;
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
      await expect(page.locator('#thai-courts-grid .thai-pair-card')).toHaveCount(8);
    });
  });
}

