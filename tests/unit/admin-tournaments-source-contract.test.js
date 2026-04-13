import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('Admin tournaments page source contract', () => {
  it('shows the creation timer block only for KOTC tournaments', () => {
    const adminPage = read('web/app/admin/tournaments/page.tsx');

    expect(adminPage).toMatch(
      /\{isKotcFormat \? \(\s*<div className="rounded-xl border border-white\/15 bg-white\/5 p-4 flex flex-col gap-3">\s*<h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Таймеры<\/h3>[\s\S]*value=\{settings\.timerCourts\}[\s\S]*value=\{settings\.timerFinals\}[\s\S]*\) : null\}/,
    );
  });
});
