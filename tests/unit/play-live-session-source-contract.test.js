import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('play live session source contract', () => {
  it('persists idempotent commands with optimistic revisions', () => {
    const migration = read('migrations/090_play_live_sessions.sql');
    const service = read('web/lib/play-live-session.ts');
    expect(migration).toContain('UNIQUE (session_id, command_id)');
    expect(migration).toContain('expected_revision');
    expect(service).toContain('expectedRevision !== Number(row.revision)');
    expect(service).toContain('commandId');
    expect(service).toContain('nextRevision = Number(row.revision) + 1');
    expect(service).toContain('roster: state.roster');
    expect(service).toContain('next.roster = previous.roster ?? next.roster');
    expect(service).toContain("if (format === 'king_sideout') return PLAY_KING_POINT_LIMIT");
    expect(service).toContain("rawState.format === 'king_sideout' ? PLAY_KING_POINT_LIMIT");
  });

  it('uses the shared quick score UI and automatically selects the next match', () => {
    const panel = read('web/components/play/PlayLiveSessionPanel.tsx');
    expect(panel).toContain("from '@/lib/play-live-core'");
    expect(panel).toContain('type PlayLiveCommand');
    expect(panel).not.toContain("from '@/lib/play-live-session'");
    expect(panel).toContain('<QuickWinnerScoreInput');
    expect(panel).toContain("state.matches.find((match) => match.scoreA === match.scoreB)");
    expect(panel).toContain("crypto.randomUUID()");
    expect(panel).toContain("type: 'undo'");
    expect(panel).toContain("type: 'set_match_teams'");
    expect(panel).toContain("type: 'set_match_point_limit'");
    expect(panel).toContain("type: 'complete_king_round'");
    expect(panel).toContain('getCurrentKingRound(state)');
    expect(panel).toContain('быстрый счёт до');
    expect(panel).toContain('Вне партии:');
    expect(panel).toContain('Следующая партия →');
    expect(panel).toContain('Состав и замены');
    expect(panel).toContain('Экран площадки');
    expect(panel).toContain('Состав из Котяры → начать');
    expect(panel).toContain('importKotyaraAndStart');
    expect(panel).toContain('selectedResultKeys');
    expect(panel).toContain('function addRematchParty');
    expect(panel).toContain('teamA: [...previous.teamA]');
    expect(panel).toContain('teamB: [...previous.teamB]');
    expect(panel).not.toContain("addSmartParty(state, 'rematch')");
    expect(panel).toContain('chooseFreshLiveTeams(selectedResultKeys, state.matches)');
    expect(panel).toContain('function syncLateArrivals()');
    expect(panel).toContain("const updated = await sendCommand(session, { type: 'sync_roster' })");
    expect(panel).toContain("setNotice('Новых подтверждённых игроков пока нет')");
    expect(panel).toContain('router.refresh()');
    expect(panel).toContain('↻ Обновить состав');
    expect(panel).toContain('return nextSession');
    expect(panel).toContain('Завершить раунд →');
    expect(panel).toContain('🎲 Перемешать');
  });
});
