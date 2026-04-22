import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('KOTC Next judge source contract', () => {
  it('renders a dedicated pin-based judge page for the canonical KOTC Next judge URL', () => {
    const page = read('web/app/kotc-next/judge/[pin]/page.tsx');
    const service = read('web/lib/kotc-next/service.ts');

    expect(page).toContain('getKotcNextJudgeSnapshotByPin');
    expect(page).toContain('KotcNextJudgeScreen');
    expect(page).toContain('isKotcNextError');
    expect(page).toContain('notFound()');
    expect(service).toContain('return `/kotc-next/judge/${encodeURIComponent(pin)}`;');
  });

  it('keeps judge actions, timer, undo and local draft wiring in the judge screen', () => {
    const screen = read('web/components/kotc-next/KotcNextJudgeScreen.tsx');
    const service = read('web/lib/kotc-next/service.ts');
    const types = read('web/lib/kotc-next/types.ts');
    const chrome = read('web/components/layout/SiteChrome.tsx');

    expect(screen).toContain('/api/kotc-next/judge/');
    expect(screen).toContain('/manual-pair');
    expect(screen).toContain('/reset');
    expect(screen).toContain("from 'next/link'");
    expect(screen).toContain('useScreenWakeLock');
    expect(screen).toContain('navigator.vibrate(ms)');
    expect(screen).toContain("runAction('start')");
    expect(screen).toContain("runAction('king-point')");
    expect(screen).toContain("runAction('takeover')");
    expect(screen).toContain("runAction('undo')");
    expect(screen).toContain('runUndoAction()');
    expect(screen).toContain('runFinishAction()');
    expect(screen).toContain('const confirmations = [');
    expect(screen).toContain('for (const confirmationMessage of confirmations)');
    expect(screen).toContain("type JudgeSound = 'score' | 'error';");
    expect(screen).toContain('const audioContextRef = useRef<AudioContext | null>(null);');
    expect(screen).toContain("playJudgeSound('score')");
    expect(screen).toContain("playJudgeSound('error')");
    expect(screen).toContain("runManualPairAction('king', 'prev')");
    expect(screen).toContain("runManualPairAction('challenger', 'next')");
    expect(screen).toContain('window.confirm');
    expect(screen).toContain('runResetRaundAction()');
    expect(screen).toContain('readStoredDraft');
    expect(screen).toContain('clearStoredDraft');
    expect(screen).toContain('localStorage.getItem');
    expect(screen).toContain('localStorage.setItem');
    expect(screen).toContain('localStorage.removeItem');
    expect(screen).toContain('uiPrefsKey');
    expect(screen).toContain('readUiPrefs');
    expect(screen).toContain('currentRaundInstanceKey');
    expect(screen).toContain('currentRaundRevision');
    expect(screen).toContain('formatTournamentMeta');
    expect(screen).toContain('formatEventClock');
    expect(screen).toContain('describeEvent');
    expect(screen).toContain('getPairShortLabel');
    expect(screen).toContain('Смена трона');
    expect(screen).toContain('Очко короля');
    expect(screen).toContain('Скрыть подсказки стрелок');
    expect(screen).toContain('Свернуть таблицу');
    expect(screen).toContain('Свернуть историю');
    expect(screen).toContain('Отмена последнего');
    expect(screen).toContain('LOCAL DRAFT');
    expect(screen).toContain('formatRemaining');
    expect(screen).toContain('snapshot.roundNav.map');
    expect(screen).toContain('selectedRoundNav.courts.map');
    expect(screen).toContain('formatCourtTabLabel');
    expect(screen).toContain('roundTabClasses');
    expect(screen).toContain('courtTabClasses');
    expect(chrome).toContain("pathname.startsWith('/kotc-next/judge/')");

    expect(service).toContain('async function loadJudgeRoundNavTx');
    expect(service).toContain('judgeRoundLabel');
    expect(service).toContain('roundNav, courtNav');
    expect(service).toContain('judgeUrl: court ? judgeUrlForPin(court.pinCode) : null');
    expect(service).toContain('buildJudgeRaundInstanceKey');
    expect(service).toContain('buildJudgeRaundRevision');
    expect(service).toContain('currentEvents,');

    expect(types).toContain('export interface KotcNextJudgeCourtNavItem');
    expect(types).toContain('export interface KotcNextJudgeRoundNavItem');
    expect(types).toContain('roundNav: KotcNextJudgeRoundNavItem[];');
    expect(types).toContain('courtNav: KotcNextJudgeCourtNavItem[];');
    expect(types).toContain('currentEvents: KotcNextGameEvent[];');
    expect(types).toContain('currentRaundInstanceKey: string;');
    expect(types).toContain('currentRaundRevision: number;');
  });
});
