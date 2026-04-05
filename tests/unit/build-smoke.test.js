import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

describe('Build smoke (Q3.1)', () => {

  // ── SW CORE_ASSETS match actual files ─────────────────────
  it('sw.js CORE_ASSETS all exist on disk', () => {
    const sw = readFileSync(resolve(ROOT, 'sw.js'), 'utf8');
    const match = sw.match(/const CORE_ASSETS\s*=\s*\[([\s\S]*?)\];/);
    expect(match).not.toBeNull();

    const assets = match[1]
      .split('\n')
      .map(l => l.trim().replace(/^['"]\.\//, '').replace(/['"],?$/, ''))
      .filter(l => l && !l.startsWith('//'));

    const missing = assets.filter(a => !existsSync(resolve(ROOT, a)));
    expect(missing, `Missing CORE_ASSETS files: ${missing.join(', ')}`).toEqual([]);
  });

  it('sw.js includes split core-* and roster-* files', () => {
    const sw = readFileSync(resolve(ROOT, 'sw.js'), 'utf8');
    for (const f of [
      'core-render.js', 'core-lifecycle.js', 'core-navigation.js',
      'roster-format-launcher.js', 'roster-edit.js', 'roster-list.js',
    ]) {
      expect(sw, `sw.js should reference ${f}`).toContain(f);
    }
    // Old monoliths should NOT be in CORE_ASSETS
    const coreAssets = sw.match(/const CORE_ASSETS\s*=\s*\[([\s\S]*?)\];/)?.[1] || '';
    expect(coreAssets).not.toContain("'./assets/js/screens/core.js'");
    expect(coreAssets).not.toContain("'./assets/js/screens/roster.js'");
  });

  // ── main.js APP_SCRIPT_ORDER consistency ──────────────────
  it('main.js APP_SCRIPT_ORDER files all exist', () => {
    const main = readFileSync(resolve(ROOT, 'assets/js/main.js'), 'utf8');
    const match = main.match(/const APP_SCRIPT_ORDER\s*=\s*\[([\s\S]*?)\];/);
    expect(match).not.toBeNull();

    const scripts = match[1]
      .split('\n')
      .map(l => l.trim().replace(/^['"]/, '').replace(/['"],?$/, ''))
      .filter(l => l && !l.startsWith('//'));

    const missing = scripts.filter(s => !existsSync(resolve(ROOT, s)));
    expect(missing, `Missing APP_SCRIPT_ORDER files: ${missing.join(', ')}`).toEqual([]);
  });

  it('main.js references split files, not old monoliths', () => {
    const main = readFileSync(resolve(ROOT, 'assets/js/main.js'), 'utf8');
    const scriptOrder = main.match(/const APP_SCRIPT_ORDER\s*=\s*\[([\s\S]*?)\];/)?.[1] || '';
    const deferredOrder =
      main.match(/const DEFERRED_APP_SCRIPT_ORDER\s*=\s*\[([\s\S]*?)\];/)?.[1] || '';
    expect(scriptOrder).not.toContain("'assets/js/screens/core.js'");
    expect(scriptOrder).not.toContain("'assets/js/screens/roster.js'");
    expect(scriptOrder).toContain('core-render.js');
    expect(scriptOrder).toContain('core-lifecycle.js');
    expect(scriptOrder).toContain('core-navigation.js');
    // Roster chain загружается после первичного бандла (DEFERRED_APP_SCRIPT_ORDER)
    expect(deferredOrder).toContain('roster-format-launcher.js');
    expect(deferredOrder).toContain('roster-edit.js');
    expect(deferredOrder).toContain('roster-list.js');
  });

  // ── Vite dist output ──────────────────────────────────────
  it('dist/ contains HTML entry points after build', () => {
    const dist = resolve(ROOT, 'dist');
    if (!existsSync(dist)) return; // skip if no build yet

    const expected = [
      'index.html', 'register.html', 'admin.html',
      'profile.html', 'player-card.html', 'ipt-session.html',
    ];
    const missing = expected.filter(f => !existsSync(resolve(dist, f)));
    expect(missing, `Missing dist HTML: ${missing.join(', ')}`).toEqual([]);
  });

  it('dist/ contains classic scripts copied by post-build', () => {
    const dist = resolve(ROOT, 'dist');
    if (!existsSync(dist)) return;

    const screensDir = resolve(dist, 'assets/js/screens');
    if (!existsSync(screensDir)) return;

    const files = readdirSync(screensDir);
    for (const f of ['core-render.js', 'core-lifecycle.js', 'core-navigation.js',
      'roster-format-launcher.js', 'roster-edit.js', 'roster-list.js']) {
      expect(files, `dist should have ${f}`).toContain(f);
    }
  });

  // ── Format pages in dist ──────────────────────────────────
  it('dist/ contains format pages', () => {
    const dist = resolve(ROOT, 'dist');
    if (!existsSync(dist)) return;

    for (const f of ['formats/thai/thai.html', 'formats/kotc/kotc.html']) {
      expect(existsSync(resolve(dist, f)), `dist should have ${f}`).toBe(true);
    }
  });

  // ── index.html sanity ─────────────────────────────────────
  it('index.html has CSP meta tag without unsafe-inline in script-src', () => {
    const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
    const csp = html.match(/<meta[^>]+Content-Security-Policy[^>]+content="([^"]+)"/i);
    expect(csp).not.toBeNull();
    const scriptSrc = csp[1].split(';').find(d => d.trim().startsWith('script-src'));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  it('index.html CSP style-src allows unsafe-inline (dynamic UI from JS)', () => {
    const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
    const csp = html.match(/<meta[^>]+Content-Security-Policy[^>]+content="([^"]+)"/i);
    expect(csp).not.toBeNull();
    const styleSrc = csp[1].split(';').find(d => d.trim().startsWith('style-src'));
    expect(styleSrc).toBeDefined();
    expect(styleSrc).toContain("'unsafe-inline'");
  });
});
