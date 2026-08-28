export const COACH_VIDEO_SOURCES = ['youtube', 'instagram', 'telegram', 'own_video', 'upload', 'other'] as const;
export const COACH_VIDEO_STATUSES = ['processing', 'ready', 'error', 'archived'] as const;
export const COACH_VIDEO_FRAME_KINDS = ['key', 'before', 'after', 'error', 'phase'] as const;
export const COACH_VIDEO_ANNOTATION_TYPES = ['technique', 'error', 'cue', 'decision', 'measurement', 'note'] as const;

export type CoachVideoSource = (typeof COACH_VIDEO_SOURCES)[number];
export type CoachVideoStatus = (typeof COACH_VIDEO_STATUSES)[number];
export type CoachVideoFrameKind = (typeof COACH_VIDEO_FRAME_KINDS)[number];
export type CoachVideoAnnotationType = (typeof COACH_VIDEO_ANNOTATION_TYPES)[number];

export interface CoachVideoAssetSummary {
  id: string;
  title: string;
  athleteId: string | null;
  athleteName: string | null;
  trainingSessionId: string | null;
  trainingSessionTitle: string | null;
  exerciseId: string | null;
  exerciseTitle: string | null;
  source: CoachVideoSource;
  originalUrl: string;
  storageUrl: string;
  thumbnailUrl: string;
  durationMs: number | null;
  recordedAt: string | null;
  status: CoachVideoStatus;
  notes: string;
  tags: string[];
  clipCount: number;
  frameCount: number;
  annotationCount: number;
  updatedAt: string;
}

export interface CoachVideoClip {
  id: string;
  videoAssetId: string;
  videoTitle?: string;
  startMs: number;
  endMs: number;
  title: string;
  skillId: string | null;
  skillName: string | null;
  issueId: string | null;
  issueTitle: string | null;
  notes: string;
  sortOrder: number;
  createdAt: string;
}

export interface CoachVideoFrame {
  id: string;
  videoAssetId: string;
  clipId: string | null;
  timestampMs: number;
  imageUrl: string;
  kind: CoachVideoFrameKind;
  label: string;
  notes: string;
  createdAt: string;
}

export interface CoachVideoAnnotation {
  id: string;
  videoAssetId: string;
  clipId: string | null;
  timestampMs: number;
  type: CoachVideoAnnotationType;
  skillId: string | null;
  skillName: string | null;
  issueId: string | null;
  issueTitle: string | null;
  text: string;
  source: 'coach' | 'ai';
  confidence: number;
  createdAt: string;
}

export interface CoachVideoComparison {
  id: string;
  athleteId: string | null;
  athleteName: string | null;
  beforeClipId: string;
  beforeClipTitle: string;
  beforeVideoTitle: string;
  afterClipId: string;
  afterClipTitle: string;
  afterVideoTitle: string;
  skillId: string | null;
  skillName: string | null;
  issueId: string | null;
  issueTitle: string | null;
  title: string;
  notes: string;
  createdAt: string;
}

export interface CoachVideoAssetDetail extends CoachVideoAssetSummary {
  clips: CoachVideoClip[];
  frames: CoachVideoFrame[];
  annotations: CoachVideoAnnotation[];
  comparisons: CoachVideoComparison[];
}

export interface CoachVideoOptions {
  athletes: Array<{ id: string; name: string }>;
  sessions: Array<{ id: string; title: string; startsAt: string }>;
  exercises: Array<{ id: string; title: string }>;
}
