import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

function findHtmlFiles(dir, results = []) {
  for (const entry of readdirSync(dir)) {
    if (['node_modules', 'dist', 'playwright-report', '.git', 'web', 'prototypes'].includes(entry)) continue;
    const full = join(dir, entry);
    try {
      const st = statSync(full);
      if (st.isDirectory()) findHtmlFiles(full, results);
      else if (entry.endsWith('.html')) results.push(full);
    } catch (_) {}
  }
  return results;
}

const ROOT = join(import.meta.dirname, '..', '..');
const htmlFiles = findHtmlFiles(ROOT);

// Pages with inline scripts that haven't been migrated yet (Phase 8+ backlog)
const INLINE_SCRIPT_EXCEPTIONS = new Set([
  'ipt-session.html',
  'profile.html',
  'rating.html',
  'register.html',
  'player-card.html',
]);

// Pages with inline onclick (Phase 8+ backlog)
const INLINE_HANDLER_EXCEPTIONS = new Set([
  'ipt-session.html',
  'profile.html',
  'rating.html',
]);

describe('CSP — no inline scripts in HTML files', () => {
  for (const file of htmlFiles) {
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    const basename = rel.split('/').pop();

    it(`${rel}: no <script> without src`, () => {
      if (INLINE_SCRIPT_EXCEPTIONS.has(basename)) return; // known exception
      const content = readFileSync(file, 'utf-8');
      const scriptTags = content.matchAll(/<script\b([^>]*)>/gi);
      for (const m of scriptTags) {
        const attrs = m[1];
        expect(
          /\bsrc\s*=/i.test(attrs),
          `Found <script> without src= in ${rel}: <script${attrs}>`
        ).toBe(true);
      }
    });

    it(`${rel}: no inline event handlers`, () => {
      if (INLINE_HANDLER_EXCEPTIONS.has(basename)) return; // known exception
      const content = readFileSync(file, 'utf-8');
      const inlineHandlers = content.match(/\bon(click|load|error|submit|change|input|focus|blur|mouse\w+|key\w+|touch\w+)\s*=/gi);
      expect(
        inlineHandlers,
        `Found inline event handler(s) in ${rel}: ${(inlineHandlers || []).join(', ')}`
      ).toBeNull();
    });

    it(`${rel}: CSP script-src has no unsafe-inline (if CSP present)`, () => {
      const content = readFileSync(file, 'utf-8');
      const cspMatch = content.match(/Content-Security-Policy[^>]*content\s*=\s*"([^"]*)"/i);
      if (!cspMatch) return;
      const csp = cspMatch[1];
      const scriptSrc = csp.match(/script-src\s+([^;]+)/i);
      if (!scriptSrc) return;
      expect(
        scriptSrc[1],
        `CSP script-src contains 'unsafe-inline' in ${rel}`
      ).not.toContain("'unsafe-inline'");
    });
  }
});
