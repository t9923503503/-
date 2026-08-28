import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeKotcAdminSettings } from '../../web/lib/kotc-next-config';

const read = (relativePath: string) => readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('KOTC Next optional self-scoring', () => {
  it('is disabled by default while voice and visible-history preferences remain ready', () => {
    expect(normalizeKotcAdminSettings({})).toMatchObject({
      selfScoringEnabled: false,
      scoreVoiceEnabled: true,
      scoreHistoryVisible: true,
    });

    expect(normalizeKotcAdminSettings({
      kotcSelfScoringEnabled: 'on',
      kotcScoreVoiceEnabled: 'off',
      kotcScoreHistoryVisible: false,
    })).toMatchObject({
      selfScoringEnabled: true,
      scoreVoiceEnabled: false,
      scoreHistoryVisible: false,
    });
  });

  it('requires player identity, pair ownership, device id and revision on the server', () => {
    const service = read('web/lib/kotc-next/service.ts');
    const pairPointRoute = read('web/app/api/kotc-next/judge/[pin]/raund/[no]/pair-point/route.ts');
    const undoRoute = read('web/app/api/kotc-next/judge/[pin]/raund/[no]/undo/route.ts');

    expect(service).toContain("'PLAYER_AUTH_REQUIRED'");
    expect(service).toContain("'PLAYER_PAIR_MISMATCH'");
    expect(service).toContain('expectedRevision is required in self-scoring mode');
    expect(service).toContain('deviceId is required in self-scoring mode');
    expect(service).toContain('revertedEventId: sourceAudit.rows[0]?.id');
    expect(service).toContain('firstPending.raundNo === active.raundNo + 1 && hasRaundTimerEnded(active)');
    expect(service).toContain('accessibleRaundNos,');
    expect(pairPointRoute).toContain('getVerifiedPlayerSessionFromCookieHeader');
    expect(pairPointRoute).toContain('commandId: body?.commandId');
    expect(undoRoute).toContain('getVerifiedPlayerSessionFromCookieHeader');
  });

  it('keeps immutable audit on and exposes optional, collapsed feedback UI', () => {
    const migration = read('migrations/082_kotc_next_optional_self_scoring.sql');
    const service = read('web/lib/kotc-next/service.ts');
    const screen = read('web/components/kotc-next/KotcNextJudgeScreen.tsx');
    const wizard = read('web/components/admin/tournaments/TournamentWizard.tsx');

    expect(migration).toContain("CHECK (actor_kind IN ('player', 'judge', 'operator', 'admin', 'system'))");
    expect(migration).toContain('kotcn_event_log_raund_score_created_idx');
    expect(service).toContain("eventType: 'pair_point'");
    expect(service).toContain('scoreBefore');
    expect(service).toContain('scoreAfter');
    expect(service).toContain('tournament.params.scoreHistoryVisible');
    expect(screen).toContain('applyNoTakeoversPairPoint(snapshot.liveState, pairIdx)');
    expect(screen).toContain('setSnapshot(previousSnapshot)');
    expect(screen).toContain('aria-live="assertive"');
    expect(screen).toContain('SpeechSynthesisUtterance');
    expect(screen).toContain('const [showScoreHistory, setShowScoreHistory] = useState(false)');
    expect(screen).toContain('snapshot.accessibleRaundNos');
    expect(wizard).toContain('Самостоятельный ввод очков игроками');
    expect(wizard).toContain('Служебный аудит «кто, когда и сколько изменил» ведётся всегда');
  });
});
