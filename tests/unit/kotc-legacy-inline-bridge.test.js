import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

function read(relPath) {
  return readFileSync(resolve(ROOT, relPath), 'utf8');
}

describe('legacy KOTC inline bridge', () => {
  it('static index does not ship inline script handlers that violate CSP on boot', () => {
    const html = read('web/public/kotc/index.html');

    expect(html).not.toContain('onerror=');
  });

  it('bridge rewrites inline attributes into data-inline hooks before dispatch', () => {
    const main = read('web/public/kotc/assets/js/main.js');

    expect(main).toContain('const INLINE_HANDLER_ATTRS = [\'onclick\', \'oninput\', \'onchange\', \'onblur\'];');
    expect(main).toContain('element.setAttribute(getInlineBridgeAttr(attr), value);');
    expect(main).toContain('element.removeAttribute(attr);');
    expect(main).toContain('closest(\'[data-inline-onclick]\')');
    expect(main).toContain('new MutationObserver');
  });
});
