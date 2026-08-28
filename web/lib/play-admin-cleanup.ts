export interface AdminUnfilledPlayDeleteState {
  kind: string;
  status: string;
  endsAt: string | Date;
  hasResult: boolean;
  liveStatus: string | null;
}

export function adminUnfilledPlayDeleteBlocker(
  state: AdminUnfilledPlayDeleteState,
  now = Date.now(),
): string | null {
  if (state.kind !== 'game') return 'Удалять этим действием можно только игры';
  if (state.hasResult) return 'У игры уже есть результат — удаление заблокировано';
  if (state.liveStatus === 'active') return 'Игра открыта в live-режиме — сначала завершите её';

  const disposableStatus = ['draft', 'cancelled', 'completed'].includes(state.status);
  const endedAt = new Date(state.endsAt).getTime();
  const hasEnded = Number.isFinite(endedAt) && endedAt <= now;
  if (!disposableStatus && !hasEnded) {
    return 'Будущую опубликованную игру удалять нельзя — сначала отмените её';
  }
  return null;
}
