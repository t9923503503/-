import { test, expect } from '@playwright/test';

function getBase() {
  const port = process.env.SMOKE_PORT ? Number(process.env.SMOKE_PORT) : 9011;
  const host = process.env.SMOKE_HOST || '127.0.0.1';
  return `http://${host}:${port}`;
}

test.describe('Thai edge-cases', () => {
  test('does not start session with incomplete roster', async ({ page }) => {
    const trnId = 'thai_edge_incomplete_roster';
    const players = [
      ...Array.from({ length: 6 }, (_, i) => ({ id: `m${i}`, name: `M${i + 1}`, gender: 'M', status: 'active' })),
      ...Array.from({ length: 6 }, (_, i) => ({ id: `w${i}`, name: `W${i + 1}`, gender: 'W', status: 'active' })),
    ];

    await page.addInitScript(({ trnId, players }) => {
      localStorage.setItem('kotc3_playerdb', JSON.stringify(players));
      localStorage.removeItem('kotc3_thai_session_' + trnId);
    }, { trnId, players });

    await page.goto(`${getBase()}/formats/thai/thai.html?mode=MF&n=8&seed=1&trnId=${encodeURIComponent(trnId)}`, {
      waitUntil: 'domcontentloaded',
    });

    await expect(page.locator('#thai-roster-panel')).toHaveClass(/active/);
    const startBtn = page.getByRole('button', { name: /Запустить сессию/i });
    await expect(startBtn).toBeDisabled();
    await expect(page.locator('#thai-courts-panel')).not.toHaveClass(/active/);
  });

  test('shows rest badges for n=10 tour', async ({ page }) => {
    const trnId = 'thai_edge_rest_badges_10';
    const players = [
      ...Array.from({ length: 10 }, (_, i) => ({ id: `m${i}`, name: `M${i + 1}`, gender: 'M', status: 'active' })),
      ...Array.from({ length: 10 }, (_, i) => ({ id: `w${i}`, name: `W${i + 1}`, gender: 'W', status: 'active' })),
    ];

    await page.addInitScript(({ trnId, players }) => {
      localStorage.setItem('kotc3_playerdb', JSON.stringify(players));
      localStorage.removeItem('kotc3_thai_session_' + trnId);
    }, { trnId, players });

    await page.goto(`${getBase()}/formats/thai/thai.html?mode=MF&n=10&seed=3&trnId=${encodeURIComponent(trnId)}`, {
      waitUntil: 'domcontentloaded',
    });

    await page.getByRole('button', { name: /Автобаланс/i }).click();
    await page.getByRole('button', { name: /Запустить сессию/i }).click();
    await expect(page.locator('#thai-courts-panel')).toHaveClass(/active/);

    const restBadges = page.locator('#thai-rest-badge-row .thai-rest-badge');
    expect(await restBadges.count()).toBeGreaterThan(0);
  });
});

