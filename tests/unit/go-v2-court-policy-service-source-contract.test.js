import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

function read(relativePath) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('GO V2 schedule service court-policy binding', () => {
  it('binds the strict LPVolley tier policy to every solver match', () => {
    const service = read('web/lib/go-v2/service.ts');

    expect(service).toContain("import { buildLpvTierCourtPolicy } from './court-policy'");
    expect(service).toContain("? 'hard_medium_light' as const");
    expect(service).toContain(": 'hard_light' as const");
    expect(service).toContain('const strictCourtBinding = buildLpvTierCourtPolicy({');
    expect(service).toContain('const courtBinding = applyGoV2CourtPolicyExceptions(');
    expect(service).toContain('courtPolicy: courtBinding.courtPolicy');
    expect(service).toContain('courtAffinityPenalties: courtBinding.courtAffinityPenalties');
    expect(service).not.toContain("const preferred = tier === 'hard' ? [3, 4]");
  });

  it('rejects ambiguous physical court numbering before policy compilation', () => {
    const service = read('web/lib/go-v2/service.ts');

    expect(service).toContain("'NON_CONTIGUOUS_COURT_NO'");
    expect(service).toContain('Court numbers must form a contiguous sequence starting at 1');
  });
});
