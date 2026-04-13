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
  it('copies required next runtime files, .next/static and public into standalone/web', () => {
    const tempDir = mkdtempSync(resolve(tmpdir(), 'lpvolley-postbuild-'));

    try {
      const staticFile = resolve(tempDir, '.next/static/css/test.css');
      const middlewareManifest = resolve(tempDir, '.next/server/middleware-manifest.json');
      const buildIdFile = resolve(tempDir, '.next/BUILD_ID');
      const requiredServerFiles = resolve(tempDir, '.next/required-server-files.json');
      const publicFile = resolve(tempDir, 'public/images/pravila/kotc.svg');

      mkdirSync(dirname(staticFile), { recursive: true });
      mkdirSync(dirname(middlewareManifest), { recursive: true });
      mkdirSync(dirname(publicFile), { recursive: true });
      mkdirSync(resolve(tempDir, '.next/standalone/web'), { recursive: true });

      writeFileSync(staticFile, 'body { color: red; }', 'utf8');
      writeFileSync(middlewareManifest, '{"version":1}', 'utf8');
      writeFileSync(buildIdFile, 'build-id', 'utf8');
      writeFileSync(
        requiredServerFiles,
        JSON.stringify({
          version: 1,
          files: [
            '.next/BUILD_ID',
            '.next/server/middleware-manifest.json',
          ],
        }),
        'utf8'
      );
      writeFileSync(publicFile, '<svg></svg>', 'utf8');

      const result = spawnSync(process.execPath, [SCRIPT], {
        cwd: tempDir,
        encoding: 'utf8',
      });

      expect(result.status, result.stderr).toBe(0);

      const copiedStatic = resolve(tempDir, '.next/standalone/web/.next/static/css/test.css');
      const copiedBuildId = resolve(tempDir, '.next/standalone/web/.next/BUILD_ID');
      const copiedMiddlewareManifest = resolve(tempDir, '.next/standalone/web/.next/server/middleware-manifest.json');
      const copiedPublic = resolve(tempDir, '.next/standalone/web/public/images/pravila/kotc.svg');

      expect(existsSync(copiedStatic)).toBe(true);
      expect(existsSync(copiedBuildId)).toBe(true);
      expect(existsSync(copiedMiddlewareManifest)).toBe(true);
      expect(existsSync(copiedPublic)).toBe(true);
      expect(readFileSync(copiedStatic, 'utf8')).toBe('body { color: red; }');
      expect(readFileSync(copiedBuildId, 'utf8')).toBe('build-id');
      expect(readFileSync(copiedMiddlewareManifest, 'utf8')).toBe('{"version":1}');
      expect(readFileSync(copiedPublic, 'utf8')).toBe('<svg></svg>');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
