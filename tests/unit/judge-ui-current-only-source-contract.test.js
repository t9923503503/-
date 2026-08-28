import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('King and Thai judge UI current-only contract', () => {
  it('routes King and Thai tournaments only to current operator workspaces', () => {
    const sudyam = read('web/app/sudyam/page.tsx');
    const launch = read('web/lib/admin-tournaments-ui.ts');
    const kotcAdmin = read('web/app/admin/tournaments/[id]/kotcn-live/page.tsx');

    expect(sudyam).toContain('redirect(`/sudyam/kotcn/');
    expect(sudyam).not.toContain('payload.thaiJudgeLegacyUrl &&');
    expect(launch).toContain("if (format === 'thai')");
    expect(launch).toContain('/thai-live`');
    expect(kotcAdmin).not.toContain('legacy=1');
  });

  it('coerces stored legacy module values to the current modules', () => {
    const kotc = read('web/lib/admin-legacy-sync.ts');
    const thai = read('web/lib/thai-judge-config.ts');

    expect(kotc).toContain("export const KOTC_JUDGE_MODULES = ['next'] as const");
    expect(kotc).toContain("return 'next';");
    expect(thai).toContain('return THAI_JUDGE_MODULE_NEXT;');
  });

  it('keeps release guards in both current operator panels', () => {
    expect(read('web/components/kotc-next/KotcNextOperatorPanel.tsx')).toContain(
      'LPVOLLEY_KOTC_OPERATOR_V2_ONLY_20260810',
    );
    expect(read('web/components/thai-live/ThaiOperatorPanel.tsx')).toContain(
      'LPVOLLEY_THAI_OPERATOR_V2_ONLY_20260810',
    );
  });
});
