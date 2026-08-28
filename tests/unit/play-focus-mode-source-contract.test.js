import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('play focused game flow source contract', () => {
  it('uses a dedicated authorized workspace without public site chrome', () => {
    const route = read('web/app/partner/[id]/live/page.tsx');
    const chrome = read('web/components/layout/SiteChrome.tsx');
    expect(route).toContain('getPlayPostDetail(id, me?.id)');
    expect(route).toContain('getPlayLiveSession(actor, post.id)');
    expect(route).toContain("post.viewerStatus === 'confirmed'");
    expect(route).toContain("post.status === 'draft'");
    expect(route).toContain("post.status === 'cancelled'");
    expect(route).toContain('if (post.result) redirect(`${detailHref}#result`)');
    expect(route).toContain('const showManualResult = !session && gameEnded');
    expect(route).toContain("post.resultFormat === 'legacy_custom' ? 'classic_2x2' : post.resultFormat");
    expect(route).toContain('Режим площадки');
    expect(route).toContain('focusMode');
    expect(chrome).toContain("/^\\/partner\\/[^/]+\\/live$/");
    expect(chrome).toContain('playFocusMode');
  });

  it('puts the focused workspace before informational game details', () => {
    const detail = read('web/app/play/[id]/page.tsx');
    const dashboard = read('web/app/api/me/play-dashboard/route.ts');
    const partner = read('web/app/partner/page.tsx');
    const profile = read('web/components/profile/PlayEntries.tsx');
    expect(detail).toContain('Провести игру без лишней информации');
    expect(detail).toContain('href={`/partner/${post.id}/live`}');
    expect(detail.indexOf('id="live"')).toBeLessThan(detail.indexOf('>Игроки</h2>'));
    expect(dashboard).toContain('`/partner/${post.id}/live`');
    expect(partner).toContain('`/partner/${card.postId}/live`');
    expect(profile).toContain('`/partner/${action.postId}/live`');
  });

  it('keeps destructive controls manager-only and confirms early completion', () => {
    const panel = read('web/components/play/PlayLiveSessionPanel.tsx');
    const service = read('web/lib/play-live-session.ts');
    const opener = read('web/components/play/PlayFinishAndResultButton.tsx');
    expect(panel).toContain("window.confirm('Завершить игру раньше и сохранить этот результат?')");
    expect(panel).toContain("{canStart && state.history.length ? <button type=\"button\" disabled={busy}");
    expect(panel).toContain('Отправить результат организатору');
    expect(service).toContain("command.type === 'undo'");
    expect(service).toContain("String(post.status) !== 'published'");
    expect(opener).not.toContain("status: 'completed'");
  });

  it('shows a short three-step orientation and collapses secondary panels', () => {
    const steps = read('web/components/play/PlayGameFlowSteps.tsx');
    const panel = read('web/components/play/PlayLiveSessionPanel.tsx');
    expect(steps).toContain("label: 'Старт'");
    expect(steps).toContain("label: 'Счёт'");
    expect(steps).toContain("label: 'Готово'");
    expect(steps).toContain('aria-current={active ? \'step\' : undefined}');
    expect(panel).toContain('open={!courtMode && !focusMode}');
    expect(panel).toContain('Настроить пары и лимит');
    expect(panel).toContain('courtMode || focusMode');
  });
});
