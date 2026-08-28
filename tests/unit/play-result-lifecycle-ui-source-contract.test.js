import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('play result lifecycle UI source contract', () => {
  it('lets a confirmed participant propose a score and the organizer approve it', () => {
    const page = read('web/app/play/[id]/page.tsx');
    const focusPage = read('web/app/partner/[id]/live/page.tsx');
    const actions = read('web/components/play/PlayResultLifecycleActions.tsx');
    expect(page).toContain('(isManager || isParticipant)');
    expect(focusPage).toContain('submitterRole={isManager ? \'organizer\' : \'participant\'}');
    expect(actions).toContain('/api/play-results/${resultId}/approve');
    expect(actions).toContain('Утвердить счёт');
    expect(actions).toContain('Счёт отправлен организатору');
  });

  it('supports revision-aware correction and full score editing', () => {
    const page = read('web/app/play/[id]/page.tsx');
    const form = read('web/components/play/PlayResultForm.tsx');
    const actions = read('web/components/play/PlayResultLifecycleActions.tsx');
    expect(page).toContain('expectedRevision={post.result.revision}');
    expect(page).toContain('initialPayload={post.result.payload}');
    expect(form).toContain("method: resultId ? 'PUT' : 'POST'");
    expect(form).toContain('Сохранить исправление');
    expect(actions).toContain('/correction-requests`');
    expect(actions).toContain('Есть ошибка');
    expect(actions).toContain('Принять и исправить');
  });

  it('blocks organizer approval of a rated result with unclaimed guests', () => {
    const form = read('web/components/play/PlayResultForm.tsx');
    expect(form).toContain("ratingMode === 'rated' && guestCount > 0");
    expect(form).toContain("ratedGuestsBlockApproval && submitterRole === 'organizer'");
    expect(form).toContain('переведите игру в обычную');
  });
});
