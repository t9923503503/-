import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const partnerPage = fs.readFileSync(path.join(root, 'web/app/partner/page.tsx'), 'utf8');
const howItWorks = fs.readFileSync(path.join(root, 'web/components/play/PlayHowItWorks.tsx'), 'utf8');
const globalStyles = fs.readFileSync(path.join(root, 'web/app/globals.css'), 'utf8');

describe('partner how-it-works disclosure contract', () => {
  it('is hidden by default above the partner navigation and can be opened', () => {
    expect(partnerPage).toContain('<details id="how-it-works" className="group');
    expect(partnerPage).not.toContain('<details id="how-it-works" open');
    expect(partnerPage).toContain('group-open:hidden');
    expect(partnerPage).toContain('group-open:inline');
    expect(partnerPage.indexOf('<details id="how-it-works" className="group')).toBeLessThan(
      partnerPage.indexOf('<nav aria-label='),
    );
  });

  it('shows the guide for the games tab regardless of authentication', () => {
    expect(partnerPage).toContain("{tab === 'games' ? (");
    expect(partnerPage).not.toContain("tab === 'games' && !me ? <PlayHowItWorks");
    expect(partnerPage).toContain('<PlayHowItWorks compact embedded />');
    expect(howItWorks).toContain('embedded?: boolean');
  });

  it('keeps the create-game action visible across every partner tab and scroll position', () => {
    expect(partnerPage).toContain('className="partner-create-game-fab"');
    expect(partnerPage).toContain('aria-label=');
    expect(partnerPage.indexOf('className="partner-create-game-fab"')).toBeLessThan(
      partnerPage.indexOf("{tab === 'games' ? (")
    );
    expect(globalStyles).toMatch(/\.partner-create-game-fab\s*\{[\s\S]*position:\s*fixed;/);
    expect(globalStyles).toContain('bottom: calc(5.25rem + env(safe-area-inset-bottom, 0px));');
  });
});
