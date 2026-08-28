import type {
  KotcNextControlAction,
  KotcNextOperatorState,
  KotcNextPresenceStatus,
} from './types';

export interface KotcNextPresenceAggregate {
  totalCourts: number;
  onlineCourts: number;
  staleCourts: number;
  offlineCourts: number;
  onlineDevices: number;
}

export interface KotcNextCockpitStep {
  id: 'setup' | 'r1' | 'r2' | 'finish';
  label: string;
  state: 'completed' | 'current' | 'upcoming';
  clickable: boolean;
}

export interface KotcNextCockpitViewModel {
  primaryAction: Extract<KotcNextControlAction, 'start_raund' | 'pause_raund' | 'resume_raund' | 'finish_raund'> | 'none';
  primaryLabel: string;
  primaryDisabledReason: string | null;
  warnings: string[];
  readiness: KotcNextPresenceAggregate;
  steps: KotcNextCockpitStep[];
}

export function aggregateKotcNextPresence(state: KotcNextOperatorState): KotcNextPresenceAggregate {
  const activeRound = state.rounds.find((round) => round.status !== 'finished') ?? state.rounds.at(-1) ?? null;
  const courts = activeRound?.courts ?? [];
  return courts.reduce<KotcNextPresenceAggregate>(
    (result, court) => {
      result.totalCourts += 1;
      result.onlineDevices += court.presence.onlineDevices;
      if (court.presence.status === 'online') result.onlineCourts += 1;
      else if (court.presence.status === 'stale') result.staleCourts += 1;
      else result.offlineCourts += 1;
      return result;
    },
    { totalCourts: 0, onlineCourts: 0, staleCourts: 0, offlineCourts: 0, onlineDevices: 0 },
  );
}

function stepState(index: number, current: number): KotcNextCockpitStep['state'] {
  return index < current ? 'completed' : index === current ? 'current' : 'upcoming';
}

function currentStepIndex(state: KotcNextOperatorState): number {
  if (state.stage === 'setup') return 0;
  if (state.stage === 'r1_live' || state.stage === 'r1_finished') return 1;
  if (state.stage === 'r2_live') return 2;
  return 3;
}

export function buildKotcNextCockpitViewModel(
  state: KotcNextOperatorState,
  remainingMs: number | null,
): KotcNextCockpitViewModel {
  const activeRound = state.rounds.find((round) => round.status !== 'finished') ?? state.rounds.at(-1) ?? null;
  const activeRaund = activeRound?.courts[0]?.raunds.find((raund) => raund.status === 'running' || raund.status === 'paused')
    ?? activeRound?.courts[0]?.raunds.find((raund) => raund.status === 'pending')
    ?? null;
  const readiness = aggregateKotcNextPresence(state);
  const warnings: string[] = [];
  if (readiness.offlineCourts) warnings.push(`Нет связи: ${readiness.offlineCourts}`);
  if (readiness.staleCourts) warnings.push(`Нестабильная связь: ${readiness.staleCourts}`);

  let primaryAction: KotcNextCockpitViewModel['primaryAction'] = 'none';
  let primaryLabel = 'Нет доступных действий';
  let primaryDisabledReason: string | null = null;
  if (activeRaund?.status === 'pending') {
    primaryAction = 'start_raund';
    primaryLabel = 'Запустить все корты';
    if (readiness.totalCourts > 0 && readiness.onlineCourts !== readiness.totalCourts) {
      primaryDisabledReason = 'Есть корты без устойчивого соединения';
    }
  } else if (activeRaund?.status === 'running') {
    primaryAction = 'pause_raund';
    primaryLabel = 'Поставить на паузу';
  } else if (activeRaund?.status === 'paused') {
    primaryAction = remainingMs === 0 ? 'finish_raund' : 'resume_raund';
    primaryLabel = remainingMs === 0 ? 'Завершить раунд' : 'Продолжить все корты';
  }

  const current = currentStepIndex(state);
  const labels: Array<[KotcNextCockpitStep['id'], string]> = [
    ['setup', 'Подготовка'],
    ['r1', 'R1'],
    ['r2', 'R2'],
    ['finish', 'Завершение'],
  ];
  const steps = labels.map(([id, label], index) => {
    const stateValue = stepState(index, current);
    return { id, label, state: stateValue, clickable: stateValue !== 'upcoming' };
  });

  return { primaryAction, primaryLabel, primaryDisabledReason, warnings, readiness, steps };
}

export function presenceStatusLabel(status: KotcNextPresenceStatus): string {
  return status === 'online' ? 'Онлайн' : status === 'stale' ? 'Связь нестабильна' : 'Офлайн';
}
