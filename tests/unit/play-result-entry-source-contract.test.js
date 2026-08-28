import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('ordinary game result entry source contract', () => {
  it('offers one direct finish-and-enter-result action', () => {
    const button = read('web/components/play/PlayFinishAndResultButton.tsx');
    const page = read('web/app/play/[id]/page.tsx');
    const focusPage = read('web/app/partner/[id]/live/page.tsx');
    const manager = read('web/components/partner/PlayManagementClient.tsx');
    expect(button).toContain('href={`/partner/${postId}/live`}');
    expect(button).not.toContain("status: 'completed'");
    expect(button).toContain('Провести игру');
    expect(page).toContain('id="result-entry"');
    expect(page).toContain('Открыть пульт игры →');
    expect(focusPage).toContain('<PlayResultForm');
    expect(focusPage).toContain('focusMode');
    expect(page).toContain('getAdminSessionFromCookies');
    expect(page).toContain("admin.role !== 'viewer'");
    expect(manager).toContain('<PlayFinishAndResultButton postId={post.id} />');
  });

  it('uses participant result identities while keeping ratings account-only', () => {
    const service = read('web/lib/play-service.ts');
    const form = read('web/components/play/PlayResultForm.tsx');
    const rating = read('web/lib/play-game-rating.ts');
    expect(service).toContain('SELECT result_key, user_id FROM play_post_participants');
    expect(service).toContain('if (confirmedUserIds.size === 0)');
    expect(service).toContain('Number(post.owner_user_id || 0)');
    expect(form).toContain('participant.resultKey');
    expect(form).toContain('участник(а) без аккаунта');
    expect(rating).toContain('keyToUser');
    expect(rating).toContain('if (resultKeys.some((key) => !keyToUser.has(key))) return false');
  });

  it('allows score zero to be cleared and replaced on mobile', () => {
    const form = read('web/components/play/PlayResultForm.tsx');
    expect(form).toContain('function ScoreNumberInput');
    expect(form).toContain("const [draft, setDraft] = useState(String(value))");
    expect(form).toContain("if (draft === '0') setDraft('')");
    expect(form).toContain("if (nextValue !== '') onUpdate(nextValue)");
    expect(form).toContain("if (draft === '')");
  });

  it('uses quick score entry with a preset limit and only losing points', () => {
    const form = read('web/components/play/PlayResultForm.tsx');
    const quickInput = read('web/components/QuickWinnerScoreInput.tsx');
    const roundRobin = read('web/components/round-robin/RoundRobinWorkspace.tsx');
    expect(form).toContain('const QUICK_POINT_LIMITS = [11, 15, 21]');
    expect(form).toContain("function setQuickScore(index: number, winner: 'A' | 'B', loserPoints: number)");
    expect(form).toContain('<QuickWinnerScoreInput');
    expect(form).toContain('Нажмите на победившую команду');
    expect(quickInput).toContain('Очки проигравших');
    expect(quickInput).toContain('Array.from({ length: target }');
    expect(roundRobin).toContain('<QuickWinnerScoreInput');
  });

  it('keeps full score entry for extended and nonstandard endings', () => {
    const form = read('web/components/play/PlayResultForm.tsx');
    expect(form).toContain('Полный ввод');
    expect(form).toContain('например 22:20');
    expect(form).toContain("format === 'classic_2x2' ? 99 : match.pointLimit ?? pointLimit");
  });

  it('uses a separate deciding-set target and player avatars', () => {
    const form = read('web/components/play/PlayResultForm.tsx');
    const quickInput = read('web/components/QuickWinnerScoreInput.tsx');
    const page = read('web/app/play/[id]/page.tsx');
    expect(form).toContain('initialDecidingPointLimit');
    expect(form).toContain('Решающий сет до');
    expect(form).toContain('if (setIndex === 2) next.pointLimit = decidingPointLimit');
    expect(form).toContain('teamAMembers={teamAMembers}');
    expect(quickInput).toContain('TeamMemberAvatars');
    expect(quickInput).toContain('member.avatarUrl && !guest');
    expect(page).toContain('initialDecidingPointLimit={resultSettings.resultConfig?.decidingPointLimit}');
    expect(page).toContain('avatarUrl: p.avatarUrl');
  });

  it('hides advanced result setup in the focused mobile flow', () => {
    const form = read('web/components/play/PlayResultForm.tsx');
    expect(form).toContain('focusMode?: boolean');
    expect(form).toContain('Проверить пары и настройки');
    expect(form).toContain('Нажмите на победившую команду, затем выберите очки проигравших.');
    expect(form).toContain("open={!focusMode}");
  });
});
