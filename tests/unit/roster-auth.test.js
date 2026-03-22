import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

function ensureRosterAuthLoaded() {
  if (globalThis.__rosterAuthLoaded) return;
  const absPath = path.join(process.cwd(), 'assets', 'js', 'ui', 'roster-auth.js');
  const code = readFileSync(absPath, 'utf8');
  const context = vm.createContext(globalThis);
  vm.runInContext(
    code + '\n' + [
      'globalThis.rosterDigestHex = rosterDigestHex;',
      'globalThis.rosterVerifyPassword = rosterVerifyPassword;',
      'globalThis.__rosterAuthLoaded = true;',
    ].join('\n'),
    context,
    { filename: absPath }
  );
}

describe('roster auth guards', () => {
  const originalCrypto = globalThis.crypto;

  beforeAll(() => {
    ensureRosterAuthLoaded();
  });

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    Object.defineProperty(globalThis, 'crypto', {
      value: originalCrypto,
      configurable: true,
      writable: true,
    });
  });

  afterAll(() => {
    Object.defineProperty(globalThis, 'crypto', {
      value: originalCrypto,
      configurable: true,
      writable: true,
    });
  });

  it('blocks roster verification when crypto.subtle is unavailable', async () => {
    localStorage.setItem('kotc3_roster_pwd_salt', 'salt-1');
    localStorage.setItem('kotc3_roster_pwd_hash', 'hash-1');
    Object.defineProperty(globalThis, 'crypto', {
      value: {
        getRandomValues: (bytes) => bytes,
      },
      configurable: true,
      writable: true,
    });

    await expect(globalThis.rosterVerifyPassword('1234')).rejects.toThrow(
      'Крипто-функции недоступны. Используйте HTTPS для защиты паролем.'
    );
  });

  it('keeps unsafe-inline out of script-src CSP directive', () => {
    const html = readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
    const metaMatch = html.match(
      /<meta[^>]+http-equiv="Content-Security-Policy"[^>]+content="([^"]+)"/i
    );

    expect(metaMatch).toBeTruthy();

    const csp = metaMatch[1];
    const scriptSrc = csp
      .split(';')
      .map(part => part.trim())
      .find(part => part.startsWith('script-src'));

    expect(scriptSrc).toBeTruthy();
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });
});
