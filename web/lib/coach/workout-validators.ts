import { isCoachUuid } from './validators';

type WorkoutItemInput = {
  exerciseId: string;
  durationMinutes: number;
  courtLabel: string;
  coachNote: string;
  participantIds: string[];
};

function cleanText(value: unknown, max: number): string {
  return String(value ?? '').trim().slice(0, max);
}

function participantIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(String).filter(isCoachUuid))].slice(0, 200);
}

export function parseWorkoutItemInput(body: unknown): WorkoutItemInput {
  const raw = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const exerciseId = String(raw.exerciseId ?? '');
  const durationMinutes = Math.round(Number(raw.durationMinutes));
  if (!isCoachUuid(exerciseId)) throw new Error('BadRequest: выберите упражнение');
  if (!Number.isFinite(durationMinutes) || durationMinutes < 1 || durationMinutes > 360) {
    throw new Error('BadRequest: длительность должна быть от 1 до 360 минут');
  }
  return {
    exerciseId,
    durationMinutes,
    courtLabel: cleanText(raw.courtLabel, 80),
    coachNote: cleanText(raw.coachNote, 1000),
    participantIds: participantIds(raw.participantIds),
  };
}

export function parseWorkoutPlanCommand(body: unknown):
  | ({ action: 'add_item' } & WorkoutItemInput)
  | ({ action: 'update_item'; itemId: string } & WorkoutItemInput)
  | { action: 'move_item'; itemId: string; direction: 'up' | 'down' }
  | { action: 'remove_item'; itemId: string }
  | { action: 'start_session' }
  | { action: 'complete_session' } {
  const raw = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const action = String(raw.action ?? '');
  if (action === 'add_item') return { action, ...parseWorkoutItemInput(raw) };
  if (action === 'update_item') {
    const itemId = String(raw.itemId ?? '');
    if (!isCoachUuid(itemId)) throw new Error('BadRequest: некорректный пункт плана');
    return { action, itemId, ...parseWorkoutItemInput(raw) };
  }
  if (action === 'move_item') {
    const itemId = String(raw.itemId ?? '');
    const direction = String(raw.direction ?? '');
    if (!isCoachUuid(itemId) || !['up', 'down'].includes(direction)) throw new Error('BadRequest: некорректное перемещение');
    return { action, itemId, direction: direction as 'up' | 'down' };
  }
  if (action === 'remove_item') {
    const itemId = String(raw.itemId ?? '');
    if (!isCoachUuid(itemId)) throw new Error('BadRequest: некорректный пункт плана');
    return { action, itemId };
  }
  if (action === 'start_session' || action === 'complete_session') return { action };
  throw new Error('BadRequest: неизвестная команда плана');
}

export function parseWorkoutExecutionCommand(body: unknown):
  | { action: 'start'; itemId: string }
  | { action: 'pause' | 'resume' | 'finish'; executionId: string; revision: number }
  | { action: 'adjust'; executionId: string; revision: number; deltaSeconds: number }
  | { action: 'next'; executionId: string; revision: number } {
  const raw = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const action = String(raw.action ?? '');
  if (action === 'start') {
    const itemId = String(raw.itemId ?? '');
    if (!isCoachUuid(itemId)) throw new Error('BadRequest: выберите пункт плана');
    return { action, itemId };
  }
  if (['pause', 'resume', 'finish', 'adjust', 'next'].includes(action)) {
    const executionId = String(raw.executionId ?? '');
    const revision = Math.round(Number(raw.revision));
    if (!isCoachUuid(executionId) || !Number.isFinite(revision) || revision < 1) throw new Error('BadRequest: устаревшая команда таймера');
    if (action === 'adjust') {
      const deltaSeconds = Math.round(Number(raw.deltaSeconds));
      if (![-120, 120].includes(deltaSeconds)) throw new Error('BadRequest: таймер можно менять только на 2 минуты');
      return { action, executionId, revision, deltaSeconds };
    }
    return { action: action as 'pause' | 'resume' | 'finish' | 'next', executionId, revision };
  }
  throw new Error('BadRequest: неизвестная команда проведения');
}
