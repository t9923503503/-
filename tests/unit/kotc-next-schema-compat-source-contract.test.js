import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('KOTC Next schema compatibility source contract', () => {
  it('adapts PG tournament writes to the actual tournaments schema', () => {
    const source = read('web/lib/admin-queries-pg.ts');

    expect(source).toContain("const columns = await getTournamentTableColumnsTx(client);");
    expect(source).toContain('buildTournamentWritePayload(columns, id, input)');
    expect(source).toContain("if (columns.has('kotc_judge_module'))");
    expect(source).toContain('buildDynamicInsertSql(');
    expect(source).toContain('buildDynamicUpdateSql(');
  });

  it('loads KOTC Next tournament settings with fallback to settings json when dedicated columns are absent', () => {
    const source = read('web/lib/kotc-next/service.ts');

    expect(source).toContain("import { getTournamentTableColumnsTx } from '@/lib/admin-queries-pg';");
    expect(source).toContain("const columns = await getTournamentTableColumnsTx(client);");
    expect(source).toContain("NULL::text AS kotc_judge_module");
    expect(source).toContain('row.kotc_judge_module ?? rawSettings.kotcJudgeModule');
    expect(source).toContain('rawSettings.kotcJudgeBootstrapSignature');
  });
});
