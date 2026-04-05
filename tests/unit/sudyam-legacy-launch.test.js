import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

function read(relPath) {
  return readFileSync(resolve(ROOT, relPath), 'utf8');
}

describe('Sudyam legacy shell redirects', () => {
  it('supports canonical tournamentId/format params in both legacy entry bundles', () => {
    for (const relPath of ['assets/js/main.js', 'web/public/kotc/assets/js/main.js']) {
      const main = read(relPath);
      expect(main).toContain("params.get('tournamentId') || params.get('legacyTournamentId')");
      expect(main).toContain("params.get('format') || params.get('legacyFormat')");
      expect(main).toContain("function buildCanonicalSudyamHref(requested)");
    }
  });

  it('bounces RR and Thai launches back into canonical /sudyam instead of thai.html', () => {
    for (const relPath of ['assets/js/main.js', 'web/public/kotc/assets/js/main.js']) {
      const main = read(relPath);
      expect(main).toContain("if (requested.format === 'rr' || requested.format === 'thai')");
      expect(main).toContain("const href = buildCanonicalSudyamHref(requested);");
      expect(main).not.toContain("if (requested.format === 'kotc' || requested.format === 'rr')");
    }
  });
});
