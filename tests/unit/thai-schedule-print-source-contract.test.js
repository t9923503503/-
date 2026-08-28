import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('Thai schedule print source contract', () => {
  it('keeps print-only score boxes, per-court page breaks, and signature lines', () => {
    const client = read('web/components/thai-live/ThaiSchedulePrintClient.tsx');

    expect(client).toContain('print:table-cell');
    expect(client).toContain('Счёт');
    expect(client).toContain('h-8 w-8 rounded-sm border border-black');
    expect(client).toContain('className="thai-print-court');
    expect(client).toContain('break-after: page;');
    expect(client).toContain('break-after: auto;');
    expect(client).toContain('print:border-black');
    expect(client).toContain('print:border-gray-800');
    expect(client).toContain('print:hidden');
    expect(client).toContain('print:flex');
    expect(client).toContain('thai-match-writeins-stack space-y-1');
    expect(client).toContain('gap: 1px !important;');
    expect(client).toContain('Судья на корте: _________________');
  });
});
