export const COACH_TRAINING_STATUSES = ['draft', 'scheduled', 'in_progress', 'completed', 'cancelled'] as const;
export const COACH_TRAINING_SOURCES = ['manual', 'kotyara', 'yclients', 'import'] as const;
export const COACH_EXTERNAL_PROVIDERS = ['telegram', 'yclients', 'lpvolley'] as const;
export const COACH_TELEGRAM_STATUSES = ['going', 'maybe', 'not_going', 'unknown'] as const;
export const COACH_YCLIENTS_STATUSES = ['booked', 'waitlist', 'cancelled', 'unknown'] as const;
export const COACH_ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'left_early', 'unknown'] as const;

export type CoachTrainingStatus = (typeof COACH_TRAINING_STATUSES)[number];
export type CoachTrainingSource = (typeof COACH_TRAINING_SOURCES)[number];
export type CoachExternalProvider = (typeof COACH_EXTERNAL_PROVIDERS)[number];
export type CoachTelegramStatus = (typeof COACH_TELEGRAM_STATUSES)[number];
export type CoachYclientsStatus = (typeof COACH_YCLIENTS_STATUSES)[number];
export type CoachAttendanceStatus = (typeof COACH_ATTENDANCE_STATUSES)[number];

export interface CoachExternalIdentity {
  id: string;
  provider: CoachExternalProvider;
  externalId: string;
  playerId: string | null;
  playerName: string | null;
  displayName: string;
  username: string;
  resolutionStatus: 'unresolved' | 'resolved' | 'ignored';
  metadata: Record<string, unknown>;
}

export interface CoachTrainingParticipant {
  id: string;
  playerId: string | null;
  playerName: string | null;
  displayName: string;
  telegramStatus: CoachTelegramStatus;
  yclientsStatus: CoachYclientsStatus;
  actualAttendance: CoachAttendanceStatus;
  joinedAt: string;
  identities: CoachExternalIdentity[];
  statusConflict: boolean;
}

export interface CoachTrainingSessionSummary {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  status: CoachTrainingStatus;
  location: string;
  courtCount: number;
  capacity: number | null;
  yclientsRecordsCount: number | null;
  source: CoachTrainingSource;
  externalEventId: string | null;
  yclientsEventId: string | null;
  telegramChatId: string | null;
  telegramMessageId: string | null;
  participantCount: number;
  goingCount: number;
  unknownCount: number;
  conflictCount: number;
}

export interface CoachTrainingSession extends CoachTrainingSessionSummary {
  sourceMetadata: Record<string, unknown>;
  participants: CoachTrainingParticipant[];
}

export interface CoachIdentityCandidate {
  playerId: string;
  name: string;
  gender: 'M' | 'W';
  photoUrl: string;
  isCoachAthlete: boolean;
}

export interface KotyaraParticipantInput {
  provider: CoachExternalProvider;
  externalId: string;
  displayName: string;
  username: string;
  telegramStatus: CoachTelegramStatus;
  yclientsStatus: CoachYclientsStatus;
  metadata: Record<string, unknown>;
}

export interface KotyaraTrainingSyncInput {
  eventKey: string;
  title: string;
  startsAt: string;
  endsAt: string;
  status: CoachTrainingStatus;
  location: string;
  courtCount: number;
  capacity: number | null;
  yclientsRecordsCount: number | null;
  yclientsEventId: string | null;
  telegramChatId: string | null;
  telegramMessageId: string | null;
  metadata: Record<string, unknown>;
  participants: KotyaraParticipantInput[];
}
