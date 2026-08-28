import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('Play authentication refresh source contract', () => {
  it('recovers an authenticated session from stale client navigation state', () => {
    const joinButton = read('web/components/partner/PlayJoinButton.tsx');
    expect(joinButton).toContain("fetch('/api/auth/me'");
    expect(joinButton).toContain("cache: 'no-store'");
    expect(joinButton).toContain('router.refresh()');
    expect(joinButton).toContain('sessionDetected');
    expect(joinButton).toContain('Обновляем статус записи…');
    expect(joinButton).toContain('setStatus(initialStatus)');
  });

  it('forces a fresh game page and a document navigation back from login', () => {
    const gamePage = read('web/app/partner/[id]/page.tsx');
    const loginPage = read('web/app/login/page.tsx');
    expect(gamePage).toContain("export const dynamic = 'force-dynamic'");
    expect(loginPage).toContain('<a href={returnTo}');
    expect(loginPage).toContain('Вернуться к игре');
  });
});
