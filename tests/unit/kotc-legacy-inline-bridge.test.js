import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

function read(relPath) {
  return readFileSync(resolve(ROOT, relPath), 'utf8');
}

function walkJsFiles(relDir, results = []) {
  const absDir = resolve(ROOT, relDir);
  for (const entry of readdirSync(absDir)) {
    const absPath = resolve(absDir, entry);
    const st = statSync(absPath);
    if (st.isDirectory()) {
      walkJsFiles(resolve(relDir, entry), results);
      continue;
    }
    if (entry.endsWith('.js')) {
      results.push(resolve(relDir, entry).replace(/\\/g, '/'));
    }
  }
  return results;
}

function collectInlineHandlerAttrs(relDir) {
  const attrs = new Set();
  for (const relPath of walkJsFiles(relDir)) {
    const content = read(relPath);
    for (const match of content.matchAll(/\b(on[a-z]+)=/g)) {
      attrs.add(match[1]);
    }
  }
  return attrs;
}

function readInlineBridgeAttrs(relPath) {
  const content = read(relPath);
  const match = content.match(/const INLINE_EVENT_BRIDGE\s*=\s*\{([\s\S]*?)\};/);
  expect(match, `INLINE_EVENT_BRIDGE not found in ${relPath}`).toBeTruthy();
  return new Set(Array.from(match[1].matchAll(/\b(on[a-z]+)\s*:/g), (entry) => entry[1]));
}

const BRIDGED_APPS = [
  {
    name: 'root SPA',
    main: 'assets/js/main.js',
    scriptsDir: 'assets/js',
  },
  {
    name: 'legacy KOTC',
    main: 'web/public/kotc/assets/js/main.js',
    scriptsDir: 'web/public/kotc/assets/js',
  },
];

describe('inline event bridge', () => {
  it('static index does not ship inline script handlers that violate CSP on boot', () => {
    const html = read('web/public/kotc/index.html');

    expect(html).not.toContain('onerror=');
  });

  it.each(BRIDGED_APPS)('$name installs the bridge before bootstrapping screens', ({ main }) => {
    const content = read(main);
    expect(content).toContain('installInlineEventBridge();');
    expect(content).toContain('new MutationObserver');
    expect(content).toContain('element.setAttribute(getInlineBridgeAttr(attr), value);');
    expect(content).toContain('element.removeAttribute(attr);');
  });

  it.each(BRIDGED_APPS)('$name covers every inline handler attribute used by its JS templates', ({ main, scriptsDir }) => {
    const supported = readInlineBridgeAttrs(main);
    const used = collectInlineHandlerAttrs(scriptsDir);
    const missing = [...used].filter((attr) => !supported.has(attr)).sort();
    expect(missing, `Missing bridged inline attrs in ${main}: ${missing.join(', ')}`).toEqual([]);
  });
});
