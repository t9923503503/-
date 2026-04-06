import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('admin players source contract', () => {
  it('keeps filters, presets, bulk toolbar, modal, mobile cards, and export action visible in source', () => {
    const source = readFileSync('web/app/admin/players/page.tsx', 'utf8');

    expect(source).toContain('data-admin-players-workspace');
    expect(source).toContain('data-filter-panel');
    expect(source).toContain('data-filter-presets');
    expect(source).toContain('data-bulk-toolbar');
    expect(source).toContain('data-player-modal');
    expect(source).toContain('data-mobile-player-cards');
    expect(source).toContain('/api/admin/players/export');
    expect(source).toContain('/api/admin/filter-presets?scope=admin.players');
    expect(source).toContain('Сохранить текущий фильтр как пресет');
  });
});
