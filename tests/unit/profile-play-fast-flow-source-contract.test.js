import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relativePath) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('fast game collection from the player cabinet', () => {
  it('offers direct, format-specific collection actions', () => {
    const entries = read('web/components/profile/PlayEntries.tsx');
    expect(entries).toContain('Собрать игру за минуту');
    expect(entries).toContain('/partner/manage?recipe=classic');
    expect(entries).toContain('/partner/manage?recipe=thai-evening');
    expect(entries).toContain('/partner/manage?recipe=king-company');
    expect(entries).toContain('Найти готовую игру');
  });

  it('opens the selected recipe immediately in the one-minute form', () => {
    const management = read('web/components/partner/PlayManagementClient.tsx');
    expect(management).toContain("query.get('recipe')");
    expect(management).toContain('GAME_RECIPES.find((item) => item.id === recipeId)');
    expect(management).toContain('setForm(gamePresetForm(recipe.gameType');
    expect(management).toContain("setSelectedKind('game')");
  });

  it('keeps only two urgent cards expanded and defers the old result backlog', () => {
    const entries = read('web/components/profile/PlayEntries.tsx');
    expect(entries).toContain('const actions = orderedActions.slice(0, 2)');
    expect(entries).toContain('const deferredActions = compact ? [] : orderedActions.slice(2)');
    expect(entries).toContain('Ещё игр без счёта:');
    expect(entries).toContain('состав {post.confirmedCount}/{post.capacity}');
  });
});
