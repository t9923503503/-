import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('judge workspace theme isolation source contract', () => {
  it('keeps King and Thai judge screens dark when the public site uses light theme', () => {
    const styles = read('web/app/globals.css');

    expect(styles).toMatch(
      /html\[data-theme="light"\] body\.judge-workspace\s*\{[^}]*background:\s*#050914;/s,
    );
    expect(styles).toMatch(
      /html\[data-theme="light"\] body\.judge-workspace \.go-v2-judge-surface\s*\{[^}]*--color-white:\s*#fff;[^}]*--color-slate-950:\s*#020617;/s,
    );
    expect(styles).toContain(
      'html[data-theme="light"] body:not(.judge-workspace) [class*="bg-\\[linear-gradient"]',
    );
    expect(styles).toContain(
      'html[data-theme="light"] body:not(.judge-workspace) [class*="text-[#"]',
    );
    expect(styles).not.toMatch(
      /^html\[data-theme="light"\] \[class\*="(?:bg-|text-)/m,
    );
  });

  it('preserves the full-height mobile safe area around Thai judge pages', () => {
    const layout = read('web/app/live/thai/layout.tsx');

    expect(layout).toContain('min-h-dvh');
    expect(layout).toContain('env(safe-area-inset-top)');
    expect(layout).toContain('env(safe-area-inset-bottom)');
  });
});
