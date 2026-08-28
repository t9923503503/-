import { getPool } from '@/lib/db';
import type {
  CoachVideoAnnotation, CoachVideoAssetDetail, CoachVideoAssetSummary, CoachVideoClip,
  CoachVideoComparison, CoachVideoFrame,
} from './video-types';
import type {
  normalizeCoachVideoAnnotationInput, normalizeCoachVideoAssetInput, normalizeCoachVideoClipInput,
  normalizeCoachVideoComparisonInput, normalizeCoachVideoFrameInput,
} from './video-validators';

type AssetInput = ReturnType<typeof normalizeCoachVideoAssetInput>;
type ClipInput = ReturnType<typeof normalizeCoachVideoClipInput>;
type FrameInput = ReturnType<typeof normalizeCoachVideoFrameInput>;
type AnnotationInput = ReturnType<typeof normalizeCoachVideoAnnotationInput>;
type ComparisonInput = ReturnType<typeof normalizeCoachVideoComparisonInput>;

function stringArray(value: unknown): string[] { return Array.isArray(value) ? value.map(String) : []; }

function mapAsset(row: Record<string, unknown>): CoachVideoAssetSummary {
  return {
    id: String(row.id), title: String(row.title), athleteId: row.athlete_id ? String(row.athlete_id) : null,
    athleteName: row.athlete_name ? String(row.athlete_name) : null,
    trainingSessionId: row.training_session_id ? String(row.training_session_id) : null,
    trainingSessionTitle: row.training_session_title ? String(row.training_session_title) : null,
    exerciseId: row.exercise_id ? String(row.exercise_id) : null, exerciseTitle: row.exercise_title ? String(row.exercise_title) : null,
    source: String(row.source) as CoachVideoAssetSummary['source'], originalUrl: String(row.original_url ?? ''), storageUrl: String(row.storage_url ?? ''),
    thumbnailUrl: String(row.thumbnail_url ?? ''), durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
    recordedAt: row.recorded_at ? new Date(String(row.recorded_at)).toISOString() : null,
    status: String(row.status) as CoachVideoAssetSummary['status'], notes: String(row.notes ?? ''), tags: stringArray(row.tags),
    clipCount: Number(row.clip_count ?? 0), frameCount: Number(row.frame_count ?? 0), annotationCount: Number(row.annotation_count ?? 0),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function mapClip(row: Record<string, unknown>): CoachVideoClip {
  return { id: String(row.id), videoAssetId: String(row.video_asset_id), videoTitle: row.video_title ? String(row.video_title) : undefined,
    startMs: Number(row.start_ms), endMs: Number(row.end_ms), title: String(row.title), skillId: row.skill_id ? String(row.skill_id) : null,
    skillName: row.skill_name ? String(row.skill_name) : null, issueId: row.issue_id ? String(row.issue_id) : null,
    issueTitle: row.issue_title ? String(row.issue_title) : null, notes: String(row.notes ?? ''), sortOrder: Number(row.sort_order ?? 0),
    createdAt: new Date(String(row.created_at)).toISOString() };
}

function mapFrame(row: Record<string, unknown>): CoachVideoFrame {
  return { id: String(row.id), videoAssetId: String(row.video_asset_id), clipId: row.clip_id ? String(row.clip_id) : null,
    timestampMs: Number(row.timestamp_ms), imageUrl: String(row.image_url), kind: String(row.kind) as CoachVideoFrame['kind'],
    label: String(row.label ?? ''), notes: String(row.notes ?? ''), createdAt: new Date(String(row.created_at)).toISOString() };
}

function mapAnnotation(row: Record<string, unknown>): CoachVideoAnnotation {
  return { id: String(row.id), videoAssetId: String(row.video_asset_id), clipId: row.clip_id ? String(row.clip_id) : null,
    timestampMs: Number(row.timestamp_ms), type: String(row.type) as CoachVideoAnnotation['type'], skillId: row.skill_id ? String(row.skill_id) : null,
    skillName: row.skill_name ? String(row.skill_name) : null, issueId: row.issue_id ? String(row.issue_id) : null,
    issueTitle: row.issue_title ? String(row.issue_title) : null, text: String(row.text), source: String(row.source) as 'coach' | 'ai',
    confidence: Number(row.confidence), createdAt: new Date(String(row.created_at)).toISOString() };
}

function mapComparison(row: Record<string, unknown>): CoachVideoComparison {
  return { id: String(row.id), athleteId: row.athlete_id ? String(row.athlete_id) : null, athleteName: row.athlete_name ? String(row.athlete_name) : null,
    beforeClipId: String(row.before_clip_id), beforeClipTitle: String(row.before_clip_title), beforeVideoTitle: String(row.before_video_title),
    afterClipId: String(row.after_clip_id), afterClipTitle: String(row.after_clip_title), afterVideoTitle: String(row.after_video_title),
    skillId: row.skill_id ? String(row.skill_id) : null, skillName: row.skill_name ? String(row.skill_name) : null,
    issueId: row.issue_id ? String(row.issue_id) : null, issueTitle: row.issue_title ? String(row.issue_title) : null,
    title: String(row.title), notes: String(row.notes ?? ''), createdAt: new Date(String(row.created_at)).toISOString() };
}

const ASSET_SELECT = `SELECT asset.id::text, asset.title, asset.athlete_id::text, player.name AS athlete_name,
  asset.training_session_id::text, session.title AS training_session_title, asset.exercise_id::text, exercise.title AS exercise_title,
  asset.source, asset.original_url, asset.storage_url, asset.thumbnail_url, asset.duration_ms, asset.recorded_at, asset.status,
  asset.notes, asset.tags, asset.updated_at,
  (SELECT count(*)::int FROM coach_video_clips clip WHERE clip.video_asset_id = asset.id) AS clip_count,
  (SELECT count(*)::int FROM coach_video_frames frame WHERE frame.video_asset_id = asset.id) AS frame_count,
  (SELECT count(*)::int FROM coach_video_annotations annotation WHERE annotation.video_asset_id = asset.id) AS annotation_count
 FROM coach_video_assets asset
 LEFT JOIN players player ON player.id = asset.athlete_id
 LEFT JOIN coach_training_sessions session ON session.id = asset.training_session_id
 LEFT JOIN coach_exercises exercise ON exercise.id = asset.exercise_id`;

export async function listCoachVideoAssets(query = ''): Promise<CoachVideoAssetSummary[]> {
  const term = String(query).trim();
  const { rows } = await getPool().query(`${ASSET_SELECT}
    WHERE asset.status <> 'archived' AND ($1 = '' OR asset.title ILIKE '%' || $1 || '%' OR player.name ILIKE '%' || $1 || '%')
    ORDER BY COALESCE(asset.recorded_at, asset.created_at) DESC, asset.id DESC LIMIT 300`, [term]);
  return rows.map(mapAsset);
}

export async function createCoachVideoAsset(input: AssetInput & { actorId: string }): Promise<CoachVideoAssetDetail> {
  const { rows } = await getPool().query(`INSERT INTO coach_video_assets
    (title, athlete_id, training_session_id, exercise_id, source, original_url, storage_url, thumbnail_url, duration_ms,
     recorded_at, status, notes, tags, created_by_actor, updated_by_actor)
   VALUES ($1,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7,$8,$9,$10::timestamptz,$11,$12,$13::text[],$14,$14) RETURNING id::text`,
  [input.title, input.athleteId, input.trainingSessionId, input.exerciseId, input.source, input.originalUrl, input.storageUrl,
   input.thumbnailUrl, input.durationMs, input.recordedAt, input.status, input.notes, input.tags, input.actorId]);
  const detail = await getCoachVideoAsset(String(rows[0].id)); if (!detail) throw new Error('NotFound'); return detail;
}

async function listClips(videoAssetId?: string): Promise<CoachVideoClip[]> {
  const { rows } = await getPool().query(`SELECT clip.id::text, clip.video_asset_id::text, asset.title AS video_title,
    clip.start_ms, clip.end_ms, clip.title, clip.skill_id::text, skill.name AS skill_name, clip.issue_id::text,
    issue.title AS issue_title, clip.notes, clip.sort_order, clip.created_at
   FROM coach_video_clips clip JOIN coach_video_assets asset ON asset.id=clip.video_asset_id
   LEFT JOIN coach_skills skill ON skill.id=clip.skill_id LEFT JOIN coach_issues issue ON issue.id=clip.issue_id
   WHERE ($1::uuid IS NULL OR clip.video_asset_id=$1::uuid) ORDER BY asset.created_at DESC, clip.sort_order, clip.start_ms`, [videoAssetId ?? null]);
  return rows.map(mapClip);
}

export async function listCoachVideoClipOptions(): Promise<CoachVideoClip[]> { return listClips(); }

async function listComparisons(videoAssetId?: string): Promise<CoachVideoComparison[]> {
  const { rows } = await getPool().query(`SELECT comparison.id::text, comparison.athlete_id::text, player.name AS athlete_name,
    comparison.before_clip_id::text, before_clip.title AS before_clip_title, before_asset.title AS before_video_title,
    comparison.after_clip_id::text, after_clip.title AS after_clip_title, after_asset.title AS after_video_title,
    comparison.skill_id::text, skill.name AS skill_name, comparison.issue_id::text, issue.title AS issue_title,
    comparison.title, comparison.notes, comparison.created_at
   FROM coach_video_comparisons comparison
   JOIN coach_video_clips before_clip ON before_clip.id=comparison.before_clip_id
   JOIN coach_video_assets before_asset ON before_asset.id=before_clip.video_asset_id
   JOIN coach_video_clips after_clip ON after_clip.id=comparison.after_clip_id
   JOIN coach_video_assets after_asset ON after_asset.id=after_clip.video_asset_id
   LEFT JOIN players player ON player.id=comparison.athlete_id LEFT JOIN coach_skills skill ON skill.id=comparison.skill_id
   LEFT JOIN coach_issues issue ON issue.id=comparison.issue_id
   WHERE ($1::uuid IS NULL OR before_clip.video_asset_id=$1::uuid OR after_clip.video_asset_id=$1::uuid)
   ORDER BY comparison.created_at DESC`, [videoAssetId ?? null]);
  return rows.map(mapComparison);
}

export async function listCoachVideoComparisons(): Promise<CoachVideoComparison[]> { return listComparisons(); }

export async function getCoachVideoAsset(id: string): Promise<CoachVideoAssetDetail | null> {
  const { rows } = await getPool().query(`${ASSET_SELECT} WHERE asset.id=$1::uuid LIMIT 1`, [id]);
  if (!rows[0]) return null;
  const [clips, framesResult, annotationsResult, comparisons] = await Promise.all([
    listClips(id),
    getPool().query(`SELECT id::text, video_asset_id::text, clip_id::text, timestamp_ms, image_url, kind, label, notes, created_at
      FROM coach_video_frames WHERE video_asset_id=$1::uuid ORDER BY timestamp_ms, created_at`, [id]),
    getPool().query(`SELECT annotation.id::text, annotation.video_asset_id::text, annotation.clip_id::text, annotation.timestamp_ms,
      annotation.type, annotation.skill_id::text, skill.name AS skill_name, annotation.issue_id::text, issue.title AS issue_title,
      annotation.text, annotation.source, annotation.confidence, annotation.created_at
      FROM coach_video_annotations annotation LEFT JOIN coach_skills skill ON skill.id=annotation.skill_id
      LEFT JOIN coach_issues issue ON issue.id=annotation.issue_id WHERE annotation.video_asset_id=$1::uuid
      ORDER BY annotation.timestamp_ms, annotation.created_at`, [id]),
    listComparisons(id),
  ]);
  return { ...mapAsset(rows[0]), clips, frames: framesResult.rows.map(mapFrame), annotations: annotationsResult.rows.map(mapAnnotation), comparisons };
}

async function assertAsset(id: string): Promise<void> {
  const result = await getPool().query('SELECT 1 FROM coach_video_assets WHERE id=$1::uuid AND status<>\'archived\'', [id]);
  if (!result.rowCount) throw new Error('NotFound');
}

export async function addCoachVideoClip(videoAssetId: string, input: ClipInput & { actorId: string }): Promise<CoachVideoClip> {
  await assertAsset(videoAssetId);
  const { rows } = await getPool().query(`INSERT INTO coach_video_clips
    (video_asset_id,start_ms,end_ms,title,skill_id,issue_id,notes,sort_order,created_by_actor)
    VALUES ($1::uuid,$2,$3,$4,$5::uuid,$6::uuid,$7,$8,$9) RETURNING id::text`,
    [videoAssetId,input.startMs,input.endMs,input.title,input.skillId,input.issueId,input.notes,input.sortOrder,input.actorId]);
  const clips = await listClips(videoAssetId); const clip = clips.find((item) => item.id===String(rows[0].id)); if (!clip) throw new Error('NotFound'); return clip;
}

async function assertClipOnAsset(videoAssetId: string, clipId: string | null): Promise<void> {
  if (!clipId) return;
  const result = await getPool().query('SELECT 1 FROM coach_video_clips WHERE id=$1::uuid AND video_asset_id=$2::uuid', [clipId,videoAssetId]);
  if (!result.rowCount) throw new Error('InvalidClip');
}

export async function addCoachVideoFrame(videoAssetId: string, input: FrameInput & { actorId: string }): Promise<CoachVideoFrame> {
  await assertAsset(videoAssetId); await assertClipOnAsset(videoAssetId,input.clipId);
  const { rows } = await getPool().query(`INSERT INTO coach_video_frames
    (video_asset_id,clip_id,timestamp_ms,image_url,kind,label,notes,created_by_actor)
    VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8) RETURNING id::text,video_asset_id::text,clip_id::text,timestamp_ms,image_url,kind,label,notes,created_at`,
    [videoAssetId,input.clipId,input.timestampMs,input.imageUrl,input.kind,input.label,input.notes,input.actorId]); return mapFrame(rows[0]);
}

export async function addCoachVideoAnnotation(videoAssetId: string, input: AnnotationInput & { actorId: string }): Promise<CoachVideoAnnotation> {
  await assertAsset(videoAssetId); await assertClipOnAsset(videoAssetId,input.clipId);
  const { rows } = await getPool().query(`INSERT INTO coach_video_annotations
    (video_asset_id,clip_id,timestamp_ms,type,skill_id,issue_id,text,source,confidence,created_by_actor)
    VALUES ($1::uuid,$2::uuid,$3,$4,$5::uuid,$6::uuid,$7,'coach',$8,$9) RETURNING id::text`,
    [videoAssetId,input.clipId,input.timestampMs,input.type,input.skillId,input.issueId,input.text,input.confidence,input.actorId]);
  const detail=await getCoachVideoAsset(videoAssetId); const annotation=detail?.annotations.find((item)=>item.id===String(rows[0].id)); if(!annotation) throw new Error('NotFound'); return annotation;
}

export async function createCoachVideoComparison(input: ComparisonInput & { actorId: string }): Promise<CoachVideoComparison> {
  const { rows: clipRows } = await getPool().query('SELECT id::text FROM coach_video_clips WHERE id=ANY($1::uuid[])', [[input.beforeClipId,input.afterClipId]]);
  if (clipRows.length !== 2) throw new Error('InvalidClip');
  const { rows } = await getPool().query(`INSERT INTO coach_video_comparisons
    (athlete_id,before_clip_id,after_clip_id,skill_id,issue_id,title,notes,created_by_actor)
    VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,$7,$8) RETURNING id::text`,
    [input.athleteId,input.beforeClipId,input.afterClipId,input.skillId,input.issueId,input.title,input.notes,input.actorId]);
  const comparisons=await listComparisons(); const comparison=comparisons.find((item)=>item.id===String(rows[0].id)); if(!comparison) throw new Error('NotFound'); return comparison;
}
