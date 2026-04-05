import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('Sudyam source contract', () => {
  it('keeps /sudyam as a format-aware bootstrap route instead of hard-redirecting Thai/IPT into legacy static pages', () => {
    const page = read('web/app/sudyam/page.tsx');

    expect(page).toContain('resolveSudyamBootstrap');
    expect(page).toContain('SudyamFormatWorkspace');
    expect(page).not.toContain('buildStandaloneJudgeHref');
    expect(page).not.toContain("/kotc/formats/thai/thai.html?trnId=");
    expect(page).not.toContain("/kotc/formats/ipt/ipt.html?trnId=");
  });

  it('preserves returnTo after Sudyam PIN login', () => {
    const loginPage = read('web/app/sudyam/login/page.tsx');

    expect(loginPage).toContain('normalizeReturnTo');
    expect(loginPage).toContain("searchParams.get('returnTo')");
    expect(loginPage).toContain('window.location.href = returnTo');
    expect(loginPage).not.toContain("window.location.href = '/sudyam'");
  });

  it('allows Sudyam PIN sessions to read roster bootstrap for static Thai judge pages', () => {
    const rosterRoute = read('web/app/api/admin/roster/route.ts');

    expect(rosterRoute).toContain("import { isSudyamApproved } from '@/lib/kotc-live'");
    expect(rosterRoute).toContain("if (!auth.ok && !isSudyamApproved(req)) return auth.response;");
  });
});
