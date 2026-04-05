import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

function read(relPath) {
  return readFileSync(resolve(ROOT, relPath), 'utf8');
}

describe('KOTC live source contracts', () => {
  it('judge flows iterate server court ids in range 1..nc', () => {
    const sudyamClient = read('web/components/kotc-live/SudyamLiveClient.tsx');
    const judgeFlow = read('web/components/kotc-live/judge/KotcLiveJudgeFlow.tsx');

    expect(sudyamClient).toContain('for (let idx = 1; idx <= limit; idx += 1)');
    expect(judgeFlow).toContain('for (let idx = 1; idx <= limit; idx += 1)');
  });

  it('legacy /sudyam live UI does not add a second +1 to court labels', () => {
    const sudyamClient = read('web/components/kotc-live/SudyamLiveClient.tsx');

    expect(sudyamClient).toContain('Court {idx}');
    expect(sudyamClient).toContain('courtIdx={idx}');
    expect(sudyamClient).toContain('`court ${seat.courtIdx}`');
    expect(sudyamClient).not.toContain('Court {idx + 1}');
    expect(sudyamClient).not.toContain('courtIdx={idx - 1}');
    expect(sudyamClient).not.toContain('seat.courtIdx + 1');
  });

  it('gap recovery refetches a full snapshot so sessionVersion catches up', () => {
    const store = read('web/components/kotc-live/use-kotc-live-store.ts');

    expect(store).toContain('const snapshot = await fetchSnapshot(current.selectedSessionId, "global", current.seatToken);');
    expect(store).toContain('dispatch({ type: "applySnapshot", snapshot });');
    expect(store).not.toContain('const court = await fetchCourt(current.selectedSessionId, packet.court_idx, current.seatToken);');
  });

  it('serve-state stays in court scope across service and judge UI', () => {
    const service = read('web/lib/kotc-live/service.ts');
    const judgeFlow = read('web/components/kotc-live/judge/KotcLiveJudgeFlow.tsx');
    const judgeScreen = read('web/components/kotc-live/judge/JudgeScreen.tsx');

    expect(service).toContain("command.commandType === 'court.server_select'");
    expect(service).toContain("command.commandType === 'court.server_swap'");
    expect(service).toContain('server_slots_json');
    expect(judgeFlow).toContain('commandType: isSelected ? "court.server_swap" : "court.server_select"');
    expect(judgeScreen).toContain('Следующие');
    expect(judgeScreen).toContain('getCourtServeState');
  });
});
