import { test, expect } from '@playwright/test';

test.describe('Thai quick-launch MN', () => {
  test('stores two male pools and opens MN url', async ({ page }) => {
    const PORT = process.env.SMOKE_PORT ? Number(process.env.SMOKE_PORT) : 9011;
    const HOST = process.env.SMOKE_HOST || '127.0.0.1';
    const base = `http://${HOST}:${PORT}`;

    const players = Array.from({ length: 16 }, (_, index) => ({
      id: `mn_m_${index + 1}`,
      name: `MN Player ${index + 1}`,
      gender: 'M',
      status: 'active',
    }));

    await page.addInitScript(
      ({ players }) => {
        localStorage.setItem('kotc3_playerdb', JSON.stringify(players));
        localStorage.setItem('kotc3_tournaments', '[]');
        localStorage.removeItem('kotc3_thai_sel');
        localStorage.removeItem('kotc3_thai_sel_secondary');
        localStorage.removeItem('__thai_quick_last_open');
        window.open = ((url) => {
          localStorage.setItem('__thai_quick_last_open', String(url));
          return null;
        }) as typeof window.open;
      },
      { players },
    );

    await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#screens')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.screen.active')).toBeAttached({ timeout: 30_000 });

    await page.evaluate(() => {
      const w = window as typeof window & Record<string, any>;
      w.switchTab('roster');
      w.switchRosterFmt('thai');
      w.setThaiMode('MN');
      w.setThaiN(8);
      const db = w.loadPlayerDB().filter((player: any) => String(player?.gender || '').toUpperCase() === 'M');
      const primaryIds = db.slice(0, 8).map((player: any) => player.id);
      const secondaryIds = db.slice(8, 16).map((player: any) => player.id);
      localStorage.setItem('__thai_quick_expected', JSON.stringify({ primaryIds, secondaryIds }));
      primaryIds.forEach((playerId: string) => w.thaiTogglePlayer(playerId, 'm'));
      secondaryIds.forEach((playerId: string) => w.thaiTogglePlayer(playerId, 'n'));
      w.launchThaiFormat();
    });

    await page.waitForTimeout(400);

    const result = await page.evaluate(() => {
      const tournaments = JSON.parse(localStorage.getItem('kotc3_tournaments') || '[]');
      const thai = tournaments.find((item: any) => item && item.id === 'thai_quick');
      const expected = JSON.parse(localStorage.getItem('__thai_quick_expected') || '{}');
      return {
        expected,
        openedUrl: localStorage.getItem('__thai_quick_last_open'),
        thai,
      };
    });

    expect(result.openedUrl).toContain('mode=MN');
    expect(result.openedUrl).toContain('trnId=thai_quick');
    expect(result.thai).toBeTruthy();
    expect(result.thai.gender).toBe('male');
    expect(result.thai.thaiMeta.mode).toBe('MN');
    expect(result.thai.thaiMeta.prefillMenIds).toEqual(result.expected.primaryIds);
    expect(result.thai.thaiMeta.prefillWomenIds).toEqual(result.expected.secondaryIds);
    expect(result.thai.participants).toEqual([
      ...(result.expected.primaryIds || []),
      ...(result.expected.secondaryIds || []),
    ]);
  });
});
