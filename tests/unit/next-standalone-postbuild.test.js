import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const SCRIPT = resolve(ROOT, 'web/scripts/postbuild-standalone-static.mjs');

describe('Next standalone postbuild assets', () => {
  it('copies both .next/static and public into standalone/web', () => {
    const tempDir = mkdtempSync(resolve(tmpdir(), 'lpvolley-postbuild-'));

    try {
      const staticFile = resolve(tempDir, '.next/static/css/test.css');
      const publicFile = resolve(tempDir, 'public/images/pravila/kotc.svg');

      mkdirSync(dirname(staticFile), { recursive: true });
      mkdirSync(dirname(publicFile), { recursive: true });
      mkdirSync(resolve(tempDir, '.next/standalone/web'), { recursive: true });

      writeFileSync(staticFile, 'body { color: red; }', 'utf8');
      writeFileSync(publicFile, '<svg></svg>', 'utf8');

      const result = spawnSync(process.execPath, [SCRIPT], {
        cwd: tempDir,
        encoding: 'utf8',
      });

      expect(result.status, result.stderr).toBe(0);

      const copiedStatic = resolve(tempDir, '.next/standalone/web/.next/static/css/test.css');
      const copiedPublic = resolve(tempDir, '.next/standalone/web/public/images/pravila/kotc.svg');

      expect(existsSync(copiedStatic)).toBe(true);
      expect(existsSync(copiedPublic)).toBe(true);
      expect(readFileSync(copiedStatic, 'utf8')).toBe('body { color: red; }');
      expect(readFileSync(copiedPublic, 'utf8')).toBe('<svg></svg>');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
