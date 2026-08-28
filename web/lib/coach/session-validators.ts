import {
  COACH_ATTENDANCE_STATUSES,
  COACH_EXTERNAL_PROVIDERS,
  COACH_TELEGRAM_STATUSES,
  COACH_TRAINING_STATUSES,
  COACH_YCLIENTS_STATUSES,
  type CoachAttendanceStatus,
  type CoachExternalProvider,
  type CoachTelegramStatus,
  type CoachTrainingStatus,
  type CoachYclientsStatus,
  type KotyaraParticipantInput,
  type KotyaraTrainingSyncInput,
} from './session-types';

function text(value: unknown, max: number): string {
  return String(value ?? '').trim().slice(0, max);
}

function enumValue<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  const normalized = String(value ?? '').trim() as T;
  return values.includes(normalized) ? normalized : fallback;
}

function integer(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function nullableInteger(value: unknown, min: number, max: number): number | null {
  if (value == null || value === '') return null;
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function metadata(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeParticipant(value: unknown): KotyaraParticipantInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const provider = enumValue(raw.provider, COACH_EXTERNAL_PROVIDERS, 'telegram') as CoachExternalProvider;
  const externalId = text(raw.externalId ?? raw.external_id, 240);
  if (!externalId) return null;
  return {
    provider,
    externalId,
    displayName: text(raw.displayName ?? raw.display_name, 160),
    username: text(raw.username, 160).replace(/^@/, ''),
    telegramStatus: enumValue(raw.telegramStatus ?? raw.telegram_status, COACH_TELEGRAM_STATUSES, 'unknown') as CoachTelegramStatus,
    yclientsStatus: enumValue(raw.yclientsStatus ?? raw.yclients_status, COACH_YCLIENTS_STATUSES, 'unknown') as CoachYclientsStatus,
    metadata: metadata(raw.metadata),
  };
}

export function normalizeKotyaraTrainingSync(raw: Record<string, unknown>): KotyaraTrainingSyncInput {
  const startsAt = text(raw.startsAt ?? raw.starts_at, 80);
  const durationSeconds = integer(raw.durationSeconds ?? raw.duration_seconds, 60, 86400, 7200);
  const explicitEndsAt = text(raw.endsAt ?? raw.ends_at, 80);
  const startDate = new Date(startsAt);
  const derivedEnd = Number.isFinite(startDate.getTime()) ? new Date(startDate.getTime() + durationSeconds * 1000).toISOString() : '';
  const rawParticipants = Array.isArray(raw.participants) ? raw.participants : [];
  return {
    eventKey: text(raw.eventKey ?? raw.event_key ?? raw.yclientsEventId ?? raw.yclients_event_id, 240),
    title: text(raw.title, 160),
    startsAt,
    endsAt: explicitEndsAt || derivedEnd,
    status: enumValue(raw.status, COACH_TRAINING_STATUSES, 'scheduled') as CoachTrainingStatus,
    location: text(raw.location, 300),
    courtCount: integer(raw.courtCount ?? raw.court_count, 0, 20, 1),
    capacity: nullableInteger(raw.capacity, 1, 200),
    yclientsRecordsCount: nullableInteger(raw.yclientsRecordsCount ?? raw.yclients_records_count, 0, 200),
    yclientsEventId: text(raw.yclientsEventId ?? raw.yclients_event_id, 240) || null,
    telegramChatId: text(raw.telegramChatId ?? raw.telegram_chat_id, 40) || null,
    telegramMessageId: text(raw.telegramMessageId ?? raw.telegram_message_id, 40) || null,
    metadata: metadata(raw.metadata),
    participants: rawParticipants.map(normalizeParticipant).filter((item): item is KotyaraParticipantInput => Boolean(item)).slice(0, 300),
  };
}

export function validateKotyaraTrainingSync(input: KotyaraTrainingSyncInput): string | null {
  if (!input.eventKey) return 'eventKey обязателен';
  if (input.title.length < 3) return 'Название тренировки должно содержать минимум 3 символа';
  const start = new Date(input.startsAt).getTime();
  const end = new Date(input.endsAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 'Некорректное время тренировки';
  if (input.capacity != null && input.yclientsRecordsCount != null && input.yclientsRecordsCount > input.capacity) return 'Число записей YCLIENTS больше вместимости';
  const identities = new Set<string>();
  for (const participant of input.participants) {
    const key = `${participant.provider}:${participant.externalId}`;
    if (identities.has(key)) return `Участник ${key} передан дважды`;
    identities.add(key);
  }
  return null;
}

export function normalizeCoachTrainingInput(raw: Record<string, unknown>) {
  return {
    title: text(raw.title, 160),
    startsAt: text(raw.startsAt ?? raw.starts_at, 80),
    endsAt: text(raw.endsAt ?? raw.ends_at, 80),
    status: enumValue(raw.status, COACH_TRAINING_STATUSES, 'scheduled') as CoachTrainingStatus,
    location: text(raw.location, 300),
    courtCount: integer(raw.courtCount ?? raw.court_count, 0, 20, 1),
    capacity: nullableInteger(raw.capacity, 1, 200),
  };
}

export function validateCoachTrainingInput(input: ReturnType<typeof normalizeCoachTrainingInput>): string | null {
  if (input.title.length < 3) return 'Название тренировки должно содержать минимум 3 символа';
  const start = new Date(input.startsAt).getTime();
  const end = new Date(input.endsAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 'Проверьте начало и окончание тренировки';
  return null;
}

export function normalizeAttendance(value: unknown): CoachAttendanceStatus {
  return enumValue(value, COACH_ATTENDANCE_STATUSES, 'unknown') as CoachAttendanceStatus;
}
