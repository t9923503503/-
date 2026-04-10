import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('KOTC Next judge source contract', () => {
  it('renders a dedicated pin-based judge page for the canonical KOTC Next judge URL', () => {
    const page = read('web/app/kotc-next/judge/[pin]/page.tsx');
    const service = read('web/lib/kotc-next/service.ts');

    expect(page).toContain('getKotcNextJudgeSnapshotByPin');
    expect(page).toContain('KotcNextJudgeScreen');
    expect(page).toContain('isKotcNextError');
    expect(page).toContain('notFound()');
    expect(service).toContain('return `/kotc-next/judge/${encodeURIComponent(pin)}`;');
  });

  it('keeps judge actions, timer, undo and local draft wiring in the judge screen', () => {
    const screen = read('web/components/kotc-next/KotcNextJudgeScreen.tsx');

    expect(screen).toContain('/api/kotc-next/judge/');
    expect(screen).toContain("runAction('start')");
    expect(screen).toContain("runAction('king-point')");
    expect(screen).toContain("runAction('takeover')");
    expect(screen).toContain("runAction('undo')");
    expect(screen).toContain("runAction('finish')");
    expect(screen).toContain('localStorage.setItem');
    expect(screen).toContain('formatRemaining');
  });
});
