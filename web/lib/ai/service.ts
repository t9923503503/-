import { randomBytes } from 'crypto';
import type { PoolClient } from 'pg';
import { getPool } from '@/lib/db';
import {
  AI_CHUNK_SIZE,
  AI_JOB_KINDS,
  type AiEventResult,
  type AiJobKind,
  type AiJobSummary,
  type AiPlayerInput,
  type AiRallyResult,
} from './types';
import { deletePath } from './storage';
import { hashLeaseToken } from './worker-auth';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function numberValue(value: unknown): number {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function mapJob(row: Record<string, unknown>): AiJobSummary {
  return {
    id: String(row.id),
    kind: row.kind as AiJobKind,
    status: row.status as AiJobSummary['status'],
    title: String(row.title),
    sourceFileName: String(row.source_file_name),
    sourceSizeBytes: numberValue(row.source_size_bytes),
    progressPercent: numberValue(row.progress_percent),
    progressStage: String(row.progress_stage || ''),
    errorMessage: row.error_message ? String(row.error_message) : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function validatePlayers(players: AiPlayerInput[]): AiPlayerInput[] {
  const slots = new Set<string>();
  return players.map((player) => {
    if (!['A1', 'A2', 'B1', 'B2'].includes(player.slot) || slots.has(player.slot)) {
      throw new Error('BadRequest: player slots must be unique A1/A2/B1/B2');
    }
    slots.add(player.slot);
    if (player.playerId && !UUID_RE.test(player.playerId)) {
      throw new Error('BadRequest: invalid player id');
    }
    const displayName = String(player.displayName || '').trim();
    if (!displayName) throw new Error('BadRequest: player display name is required');
    return { ...player, displayName };
  });
}

export async function createAiJob(input: {
  actorId: string;
  kind: string;
  title: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sha256?: string | null;
  sourceMatchRef?: string | null;
  calibration?: Record<string, unknown>;
  players?: AiPlayerInput[];
}) {
  if (!AI_JOB_KINDS.includes(input.kind as AiJobKind)) throw new Error('BadRequest: invalid job kind');
  const title = String(input.title || '').trim();
  const fileName = String(input.fileName || '').trim();
  if (!title || !fileName) throw new Error('BadRequest: title and file name are required');
  const maxSize = numberValue(process.env.AI_MAX_UPLOAD_BYTES) || 20 * 1024 ** 3;
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0) {
    throw new Error('BadRequest: не удалось определить размер видео');
  }
  if (input.sizeBytes > maxSize) {
    throw new Error(`BadRequest: видео больше лимита ${Math.floor(maxSize / 1024 / 1024)} МБ`);
  }
  const players = validatePlayers(input.players || []);
  const totalChunks = Math.ceil(input.sizeBytes / AI_CHUNK_SIZE);
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const jobResult = await client.query(
      `INSERT INTO ai_analysis_job
        (kind, title, source_match_ref, source_file_name, source_content_type,
         source_size_bytes, source_sha256, calibration_json, created_by_actor)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
       RETURNING *`,
      [
        input.kind,
        title,
        input.sourceMatchRef || null,
        fileName,
        input.contentType || 'application/octet-stream',
        input.sizeBytes,
        input.sha256 || null,
        JSON.stringify(input.calibration || {}),
        input.actorId,
      ],
    );
    const job = jobResult.rows[0];
    const uploadResult = await client.query(
      `INSERT INTO ai_upload_session (job_id, chunk_size_bytes, total_chunks)
       VALUES ($1,$2,$3) RETURNING id, chunk_size_bytes, total_chunks, received_chunks`,
      [job.id, AI_CHUNK_SIZE, totalChunks],
    );
    for (const player of players) {
      await client.query(
        `INSERT INTO ai_analysis_player (job_id, slot, player_id, display_name, seed_x, seed_y)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [job.id, player.slot, player.playerId, player.displayName, player.seedX, player.seedY],
      );
    }
    await client.query('COMMIT');
    return { job: mapJob(job), upload: uploadResult.rows[0] };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listAiJobs(limit = 50): Promise<AiJobSummary[]> {
  const { rows } = await getPool().query(
    `SELECT * FROM ai_analysis_job ORDER BY created_at DESC LIMIT $1`,
    [Math.min(200, Math.max(1, limit))],
  );
  return rows.map(mapJob);
}

export async function getAiJobDetail(jobId: string) {
  if (!UUID_RE.test(jobId)) throw new Error('BadRequest: invalid job id');
  const pool = getPool();
  const [job, players, rallies, events, artifacts] = await Promise.all([
    pool.query(`SELECT * FROM ai_analysis_job WHERE id=$1`, [jobId]),
    pool.query(`SELECT * FROM ai_analysis_player WHERE job_id=$1 ORDER BY slot`, [jobId]),
    pool.query(`SELECT * FROM ai_rally WHERE job_id=$1 ORDER BY rally_no`, [jobId]),
    pool.query(`SELECT * FROM ai_event WHERE job_id=$1 ORDER BY event_time_sec`, [jobId]),
    pool.query(
      `SELECT id, kind, file_name, content_type, size_bytes, upload_status, created_at
         FROM ai_artifact WHERE job_id=$1 AND upload_status='complete' ORDER BY created_at`,
      [jobId],
    ),
  ]);
  if (!job.rows[0]) return null;
  return {
    job: { ...mapJob(job.rows[0]), calibration: job.rows[0].calibration_json, result: job.rows[0].result_json },
    players: players.rows.map((row) => ({
      id: row.id, slot: row.slot, playerId: row.player_id, displayName: row.display_name,
      seedX: row.seed_x === null ? null : Number(row.seed_x),
      seedY: row.seed_y === null ? null : Number(row.seed_y),
    })),
    rallies: rallies.rows.map((row) => ({
      id: row.id, rallyNo: row.rally_no, startSec: Number(row.start_sec), endSec: Number(row.end_sec),
      winnerTeam: row.winner_team, confidence: Number(row.confidence), reviewStatus: row.review_status,
      scoreBefore: row.score_before_json, scoreAfter: row.score_after_json,
    })),
    events: events.rows.map((row) => ({
      id: row.id, rallyId: row.rally_id, eventType: row.event_type,
      eventTimeSec: Number(row.event_time_sec), team: row.team, playerId: row.player_id,
      outcome: row.outcome, confidence: Number(row.confidence), metrics: row.metrics_json,
      evidence: row.evidence_json, reviewStatus: row.review_status,
    })),
    artifacts: artifacts.rows.map((row) => ({
      id: row.id, kind: row.kind, fileName: row.file_name, contentType: row.content_type,
      sizeBytes: Number(row.size_bytes), url: `/api/admin/ai/artifacts/${row.id}`,
    })),
  };
}

export async function getUploadSession(uploadId: string) {
  if (!UUID_RE.test(uploadId)) throw new Error('BadRequest: invalid upload id');
  const { rows } = await getPool().query(
    `SELECT u.*, j.id AS job_id, j.source_file_name, j.source_size_bytes, j.source_sha256,
            j.created_by_actor
       FROM ai_upload_session u JOIN ai_analysis_job j ON j.id=u.job_id
      WHERE u.id=$1`,
    [uploadId],
  );
  return rows[0] || null;
}

export async function markUploadChunk(uploadId: string, index: number): Promise<void> {
  const { rowCount } = await getPool().query(
    `UPDATE ai_upload_session
        SET received_chunks = CASE WHEN $2 = ANY(received_chunks) THEN received_chunks
                                   ELSE array_append(received_chunks, $2) END
      WHERE id=$1 AND status='open' AND $2 >= 0 AND $2 < total_chunks`,
    [uploadId, index],
  );
  if (!rowCount) throw new Error('BadRequest: upload is closed or chunk index is invalid');
}

export async function beginUploadAssembly(uploadId: string) {
  const { rows } = await getPool().query(
    `UPDATE ai_upload_session SET status='assembling'
      WHERE id=$1 AND status='open' AND cardinality(received_chunks)=total_chunks
      RETURNING *`,
    [uploadId],
  );
  if (!rows[0]) throw new Error('BadRequest: not all chunks have been uploaded');
  return rows[0];
}

export async function finishUploadAssembly(input: {
  uploadId: string;
  sourcePath: string;
  size: number;
  sha256: string;
}) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const upload = await client.query(
      `UPDATE ai_upload_session SET status='complete' WHERE id=$1 AND status='assembling' RETURNING job_id`,
      [input.uploadId],
    );
    if (!upload.rows[0]) throw new Error('BadRequest: upload is not being assembled');
    const expected = await client.query(
      `SELECT source_size_bytes, source_sha256 FROM ai_analysis_job WHERE id=$1 FOR UPDATE`,
      [upload.rows[0].job_id],
    );
    if (Number(expected.rows[0].source_size_bytes) !== input.size) {
      throw new Error('BadRequest: assembled size does not match upload');
    }
    if (expected.rows[0].source_sha256 && expected.rows[0].source_sha256 !== input.sha256) {
      throw new Error('BadRequest: SHA-256 mismatch');
    }
    await client.query(
      `UPDATE ai_analysis_job
          SET source_storage_path=$2, source_sha256=$3, status='queued',
              progress_percent=0, progress_stage='queued', error_message=NULL
        WHERE id=$1`,
      [upload.rows[0].job_id, input.sourcePath, input.sha256],
    );
    await client.query('COMMIT');
    return upload.rows[0].job_id as string;
  } catch (error) {
    await client.query('ROLLBACK');
    await getPool().query(`UPDATE ai_upload_session SET status='failed' WHERE id=$1`, [input.uploadId]);
    throw error;
  } finally {
    client.release();
  }
}

export async function leaseAiJob(workerId: string) {
  const leaseToken = randomBytes(32).toString('base64url');
  const leaseHash = hashLeaseToken(leaseToken);
  const { rows } = await getPool().query(
    `WITH candidate AS (
       SELECT id FROM ai_analysis_job
        WHERE status='queued' OR (status='processing' AND lease_expires_at < now())
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED LIMIT 1
     )
     UPDATE ai_analysis_job j
        SET status='processing', leased_by=$1, lease_token_hash=$2,
            lease_expires_at=now()+interval '5 minutes', heartbeat_at=now(),
            progress_stage=CASE WHEN j.status='queued' THEN 'leased' ELSE 'resumed' END
       FROM candidate WHERE j.id=candidate.id RETURNING j.*`,
    [workerId, leaseHash],
  );
  if (!rows[0]) return null;
  const detail = await getAiJobDetail(rows[0].id);
  return { leaseToken, job: detail };
}

export async function assertLease(jobId: string, leaseToken: string): Promise<Record<string, unknown>> {
  const { rows } = await getPool().query(
    `SELECT * FROM ai_analysis_job
      WHERE id=$1 AND status='processing' AND lease_token_hash=$2 AND lease_expires_at > now()`,
    [jobId, hashLeaseToken(leaseToken)],
  );
  if (!rows[0]) throw new Error('BadRequest: lease is invalid or expired');
  return rows[0];
}

export async function heartbeatAiJob(
  jobId: string,
  leaseToken: string,
  progress: number,
  stage: string,
) {
  const { rows } = await getPool().query(
    `UPDATE ai_analysis_job
        SET heartbeat_at=now(), lease_expires_at=now()+interval '5 minutes',
            progress_percent=$3, progress_stage=$4
      WHERE id=$1 AND status='processing' AND lease_token_hash=$2
      RETURNING progress_percent, progress_stage, lease_expires_at`,
    [jobId, hashLeaseToken(leaseToken), Math.min(99, Math.max(0, progress)), String(stage || 'processing')],
  );
  if (!rows[0]) throw new Error('BadRequest: lease is invalid');
  return rows[0];
}

export async function createArtifactUpload(input: {
  jobId: string; leaseToken: string; kind: string; fileName: string; contentType: string;
  sizeBytes: number; sha256?: string | null;
}) {
  await assertLease(input.jobId, input.leaseToken);
  const kinds = ['proxy', 'thumbnail', 'highlight', 'evidence', 'diagnostic'];
  if (!kinds.includes(input.kind)) throw new Error('BadRequest: invalid artifact kind');
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0) throw new Error('BadRequest: invalid artifact size');
  const totalChunks = Math.ceil(input.sizeBytes / AI_CHUNK_SIZE);
  const { rows } = await getPool().query(
    `INSERT INTO ai_artifact
      (job_id, kind, file_name, content_type, size_bytes, sha256, total_chunks)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [input.jobId, input.kind, input.fileName, input.contentType, input.sizeBytes, input.sha256 || null, totalChunks],
  );
  return rows[0];
}

export async function getArtifact(artifactId: string) {
  if (!UUID_RE.test(artifactId)) throw new Error('BadRequest: invalid artifact id');
  const { rows } = await getPool().query(`SELECT * FROM ai_artifact WHERE id=$1`, [artifactId]);
  return rows[0] || null;
}

export async function markArtifactChunk(artifactId: string, index: number) {
  const { rowCount } = await getPool().query(
    `UPDATE ai_artifact
        SET received_chunks=CASE WHEN $2=ANY(received_chunks) THEN received_chunks ELSE array_append(received_chunks,$2) END
      WHERE id=$1 AND upload_status='open' AND $2>=0 AND $2<total_chunks`,
    [artifactId, index],
  );
  if (!rowCount) throw new Error('BadRequest: artifact is closed or chunk index is invalid');
}

export async function finishArtifactUpload(artifactId: string, storagePath: string, size: number, sha256: string) {
  const { rows } = await getPool().query(
    `UPDATE ai_artifact SET storage_path=$2, sha256=$3, upload_status='complete'
      WHERE id=$1 AND upload_status='open' AND cardinality(received_chunks)=total_chunks
        AND size_bytes=$4 AND (sha256 IS NULL OR sha256=$3)
      RETURNING *`,
    [artifactId, storagePath, sha256, size],
  );
  if (!rows[0]) throw new Error('BadRequest: artifact chunks or size are incomplete');
  return rows[0];
}

async function replaceResults(
  client: PoolClient,
  jobId: string,
  rallies: AiRallyResult[],
  events: AiEventResult[],
) {
  await client.query(`DELETE FROM ai_rally WHERE job_id=$1`, [jobId]);
  const rallyIds = new Map<number, string>();
  for (const rally of rallies) {
    if (!(rally.endSec > rally.startSec) || rally.rallyNo < 1) continue;
    const { rows } = await client.query(
      `INSERT INTO ai_rally
        (job_id,rally_no,start_sec,end_sec,winner_team,score_before_json,score_after_json,confidence)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8) RETURNING id`,
      [jobId, rally.rallyNo, rally.startSec, rally.endSec, rally.winnerTeam || null,
       JSON.stringify(rally.scoreBefore ?? null), JSON.stringify(rally.scoreAfter ?? null),
       Math.min(1, Math.max(0, rally.confidence || 0))],
    );
    rallyIds.set(rally.rallyNo, rows[0].id);
  }
  for (const event of events) {
    await client.query(
      `INSERT INTO ai_event
        (job_id,rally_id,event_type,event_time_sec,team,player_id,outcome,confidence,metrics_json,evidence_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb)`,
      [jobId, event.rallyNo ? rallyIds.get(event.rallyNo) || null : null, event.eventType,
       event.eventTimeSec, event.team || null, event.playerId || null, event.outcome || null,
       Math.min(1, Math.max(0, event.confidence || 0)), JSON.stringify(event.metrics || {}),
       JSON.stringify(event.evidence || {})],
    );
  }
}

export async function completeAiJob(input: {
  jobId: string; leaseToken: string; modelVersion: string;
  result: Record<string, unknown>; rallies: AiRallyResult[]; events: AiEventResult[];
}) {
  await assertLease(input.jobId, input.leaseToken);
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await replaceResults(client, input.jobId, input.rallies || [], input.events || []);
    await client.query(
      `UPDATE ai_analysis_job
          SET status='review', progress_percent=100, progress_stage='review', model_version=$2,
              result_json=$3::jsonb, lease_token_hash=NULL, lease_expires_at=NULL, error_message=NULL
        WHERE id=$1`,
      [input.jobId, input.modelVersion, JSON.stringify(input.result || {})],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function failAiJob(jobId: string, leaseToken: string, message: string) {
  const { rowCount } = await getPool().query(
    `UPDATE ai_analysis_job SET status='failed', progress_stage='failed', error_message=$3,
       lease_token_hash=NULL, lease_expires_at=NULL WHERE id=$1 AND lease_token_hash=$2`,
    [jobId, hashLeaseToken(leaseToken), String(message || 'Worker failed').slice(0, 4000)],
  );
  if (!rowCount) throw new Error('BadRequest: lease is invalid');
}

export async function updateRally(input: {
  jobId: string; rallyId: string; actorId: string;
  startSec?: number; endSec?: number; winnerTeam?: 'A' | 'B' | null; reviewStatus?: string;
}) {
  const pool = getPool();
  const before = await pool.query(`SELECT * FROM ai_rally WHERE id=$1 AND job_id=$2`, [input.rallyId, input.jobId]);
  if (!before.rows[0]) return null;
  const current = before.rows[0];
  const start = input.startSec ?? Number(current.start_sec);
  const end = input.endSec ?? Number(current.end_sec);
  if (!(end > start) || start < 0) throw new Error('BadRequest: invalid rally boundaries');
  const winner = input.winnerTeam === undefined ? current.winner_team : input.winnerTeam;
  const status = input.reviewStatus || current.review_status;
  if (winner && !['A', 'B'].includes(winner)) throw new Error('BadRequest: invalid winner team');
  if (!['review', 'confirmed', 'rejected'].includes(status)) throw new Error('BadRequest: invalid review status');
  const { rows } = await pool.query(
    `UPDATE ai_rally SET start_sec=$3,end_sec=$4,winner_team=$5,review_status=$6
      WHERE id=$1 AND job_id=$2 RETURNING *`,
    [input.rallyId, input.jobId, start, end, winner, status],
  );
  await pool.query(
    `INSERT INTO ai_correction
      (job_id,entity_type,entity_id,field_name,before_json,after_json,model_version,
       original_confidence,corrected_by_actor)
     SELECT $1,'rally',$2,'review',$3::jsonb,$4::jsonb,model_version,$5,$6
       FROM ai_analysis_job WHERE id=$1`,
    [input.jobId, input.rallyId, JSON.stringify(current), JSON.stringify(rows[0]), current.confidence, input.actorId],
  );
  return rows[0];
}

export async function confirmAiJob(jobId: string, actorId: string) {
  const pool = getPool();
  const job = await pool.query(`SELECT * FROM ai_analysis_job WHERE id=$1 AND status='review'`, [jobId]);
  if (!job.rows[0]) throw new Error('BadRequest: job is not ready for confirmation');
  const artifacts = await pool.query(
    `SELECT id, storage_path FROM ai_artifact WHERE job_id=$1 AND kind<>'evidence' AND upload_status='complete'`,
    [jobId],
  );
  await deletePath(job.rows[0].source_storage_path);
  for (const artifact of artifacts.rows) await deletePath(artifact.storage_path);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE ai_artifact SET upload_status='deleted',storage_path=NULL
        WHERE job_id=$1 AND kind<>'evidence'`,
      [jobId],
    );
    await client.query(
      `UPDATE ai_analysis_job SET status='confirmed',confirmed_at=now(),source_storage_path=NULL,
         progress_stage='confirmed' WHERE id=$1`,
      [jobId],
    );
    await client.query(
      `INSERT INTO ai_correction (job_id,entity_type,field_name,after_json,corrected_by_actor,use_for_training)
       VALUES ($1,'job','confirmation',$2::jsonb,$3,false)`,
      [jobId, JSON.stringify({ confirmed: true }), actorId],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
