import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

function ensureErrorHandlerLoaded() {
  if (globalThis.__errorHandlerLoaded) return;
  const absPath = path.join(process.cwd(), 'assets', 'js', 'ui', 'error-handler.js');
  const code = readFileSync(absPath, 'utf8');
  const context = vm.createContext(globalThis);
  vm.runInContext(
    code + '\n' + [
      'globalThis.getErrorLog = getErrorLog;',
      'globalThis.clearErrorLog = clearErrorLog;',
      'globalThis.__errorHandlerLoaded = true;',
    ].join('\n'),
    context,
    { filename: absPath }
  );
}

describe('global error handler', () => {
  beforeAll(() => {
    ensureErrorHandlerLoaded();
  });

  beforeEach(() => {
    localStorage.clear();
    globalThis.showToast = vi.fn();
    globalThis.clearErrorLog();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('captures window.onerror, shows toast and stores error entry', () => {
    const handled = window.onerror(
      'boom',
      `${window.location.origin}/assets/js/main.js`,
      12,
      5,
      new Error('boom')
    );

    expect(handled).toBe(false);
    expect(globalThis.showToast).toHaveBeenCalledWith('⚠️ boom', 'error', 4000);
    expect(globalThis.getErrorLog()).toEqual([
      expect.objectContaining({
        msg: 'boom',
        src: '/assets/js/main.js',
        line: 12,
        col: 5,
      }),
    ]);
  });
});
