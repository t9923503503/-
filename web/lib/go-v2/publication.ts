import { createHash } from 'node:crypto';

import type { PoolClient } from 'pg';

import type {
  GoV2ActorContext,
  GoV2CommandEnvelope,
  GoV2CommitResponse,
  GoV2PreviewResponse,
  GoV2Risk,
} from './contracts';
import {
  assertGoV2Uuid,
  GoV2Error,
  parseGoV2CommandEnvelope,
} from './contracts';
import {
  appendAuditEvent,
  assertExpectedVersion,
  assertReceiptMatches,
  createOperationPreview,
  enqueueNotificationOutbox,
  ensureGoV2StateForUpdate,
  findCommandReceipt,
  getOperationPreviewForUpdate,
  requireMutationReason,
  saveCommandReceipt,
  withGoV2Transaction,
} from './repository';

export type GoV2PublicationState = 'shadow' | 'published' | 'unpublished';
export type GoV2PublicationTarget = 'published' | 'unpublished';

type PublicationDbRow = {
  go_engine_version: number | string;
  settings: unknown;
  aggregate_version: number | string;
  publication_state: string;
  publication_revision_no: number | string;
  active_schedule_version_id: string | null;
  schedule_status: string | null;
  schedule_hash: string | null;
  entry_count: number | string;
  assignment_count: number | string;
  entries_snapshot: unknown;
  assignments_snapshot: unknown;
};

export type GoV2PublicationSnapshot = {
  engineVersion: 2;
  fromState: GoV2PublicationState;
  toState: GoV2PublicationTarget;
  publicationRevisionNo: number;
  publicKillSwitchEnabled: boolean;
  activeScheduleVersionId: string | null;
  activeScheduleStatus: string | null;
  activeScheduleHash: string | null;
  entryCount: number;
  assignmentCount: number;
  disclosedEntries: Array<Record<string, unknown>>;
  scheduleAssignments: Array<Record<string, unknown>>;
  surfaces: {
    structure: boolean;
    standings: boolean;
    brackets: boolean;
    liveSchedule: boolean;
  };
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function parsePublicationTarget(value: unknown): GoV2PublicationTarget {
  const target = String(value ?? '').trim().toLowerCase();
  if (target !== 'published' && target !== 'unpublished') {
    throw new GoV2Error(
      422,
      'PUBLICATION_TARGET_INVALID',
      'toState must be published or unpublished',
    );
  }
  return target;
}

function parsePublicationState(value: unknown): GoV2PublicationState {
  const state = String(value ?? '').trim().toLowerCase();
  if (state !== 'shadow' && state !== 'published' && state !== 'unpublished') {
    throw new GoV2Error(500, 'PUBLICATION_STATE_INVALID', 'Stored publication state is invalid');
  }
  return state;
}

function assertPublicationReason(command: GoV2CommandEnvelope): void {
  if (command.reasonCode !== 'publication_state_changed') {
    throw new GoV2Error(
      422,
      'PUBLICATION_REASON_MISMATCH',
      'Publication changes require reasonCode=publication_state_changed',
    );
  }
}

export function assessGoV2PublicationRisk(input: {
  toState: GoV2PublicationTarget;
  entryCount: number;
  assignmentCount: number;
}): GoV2Risk {
  if (input.toState === 'unpublished') return 'amber';
  return input.entryCount > 0 || input.assignmentCount > 0 ? 'red' : 'amber';
}

export function buildGoV2PublicationRequestHash(
  operation: 'publication.preview' | 'publication.commit',
  tournamentId: string,
  command: GoV2CommandEnvelope,
): string {
  return sha256({
    operation,
    tournamentId,
    commandId: command.commandId,
    deviceId: command.deviceId,
    expectedVersion: command.expectedVersion,
    reasonCode: command.reasonCode,
    reasonNote: command.reasonNote ?? null,
    previewId: command.previewId ?? null,
    inputHash: command.inputHash ?? null,
    confirmRed: command.confirmRed === true,
    redApprovalId: command.redApprovalId ?? null,
    payload: command.payload,
  });
}

function assertDeclaredRequestHash(command: GoV2CommandEnvelope, expected: string): void {
  if (command.requestHash !== expected) {
    throw new GoV2Error(
      409,
      'REQUEST_HASH_MISMATCH',
      'requestHash does not match the canonical publication command',
    );
  }
}

async function loadPublicationSnapshot(
  client: PoolClient,
  tournamentId: string,
  toState: GoV2PublicationTarget,
): Promise<GoV2PublicationSnapshot> {
  const loaded = await client.query<PublicationDbRow>(
    `SELECT tournament.go_engine_version,
            tournament.settings,
            state.aggregate_version,
            state.publication_state,
            state.publication_revision_no,
            state.active_schedule_version_id::text,
            schedule.status AS schedule_status,
            schedule.schedule_hash,
            (SELECT count(*)::int
               FROM go_v2_entries entry
              WHERE entry.tournament_id = tournament.id) AS entry_count,
            (SELECT count(*)::int
               FROM go_v2_schedule_assignments assignment
              WHERE assignment.schedule_version_id = state.active_schedule_version_id) AS assignment_count,
            COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'entryId', entry.id,
                'entryNo', entry.entry_no,
                'displayName', entry.display_name,
                'registrationState', entry.registration_state,
                'attendanceState', entry.attendance_state,
                'initialSeed', entry.initial_seed
              ) ORDER BY entry.entry_no, entry.id)
                FROM go_v2_entries entry
               WHERE entry.tournament_id = tournament.id
            ), '[]'::jsonb) AS entries_snapshot,
            COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'assignmentId', assignment.id,
                'matchId', assignment.match_id,
                'courtId', assignment.court_id,
                'courtNo', court.court_no,
                'courtLabel', court.label,
                'plannedStart', assignment.planned_start,
                'plannedEnd', assignment.planned_end,
                'liveEta', assignment.live_eta,
                'isConditional', assignment.is_conditional,
                'refereeDuty', (
                  SELECT jsonb_build_object(
                    'dutyKind', duty.duty_kind,
                    'refereeEntryId', duty.referee_entry_id,
                    'sourceMatchId', duty.source_match_id,
                    'candidateEntryIds', duty.candidate_entry_ids,
                    'status', duty.status
                  )
                    FROM go_v2_referee_duties duty
                   WHERE duty.schedule_assignment_id = assignment.id
                   ORDER BY duty.id
                   LIMIT 1
                )
              ) ORDER BY assignment.planned_start, court.court_no, assignment.match_id)
                FROM go_v2_schedule_assignments assignment
                JOIN go_v2_courts court ON court.id = assignment.court_id
               WHERE assignment.schedule_version_id = state.active_schedule_version_id
            ), '[]'::jsonb) AS assignments_snapshot
       FROM tournaments tournament
       JOIN go_v2_tournament_state state ON state.tournament_id = tournament.id
       LEFT JOIN go_v2_schedule_versions schedule
         ON schedule.id = state.active_schedule_version_id
      WHERE tournament.id = $1::uuid`,
    [tournamentId],
  );
  if (!loaded.rowCount || Number(loaded.rows[0].go_engine_version) !== 2) {
    throw new GoV2Error(404, 'GO_V2_NOT_ENABLED', 'Tournament Engine V2 is not enabled');
  }
  const row = loaded.rows[0];
  const fromState = parsePublicationState(row.publication_state);
  if (fromState === toState) {
    throw new GoV2Error(409, 'PUBLICATION_STATE_UNCHANGED', `Tournament is already ${toState}`);
  }
  const settings = record(row.settings);
  const publicKillSwitchEnabled = settings.goV2PublicEnabled === true;
  const activeScheduleVersionId = row.active_schedule_version_id
    ? String(row.active_schedule_version_id)
    : null;
  const activeScheduleStatus = row.schedule_status ? String(row.schedule_status) : null;
  if (toState === 'published') {
    if (!publicKillSwitchEnabled) {
      throw new GoV2Error(
        409,
        'PUBLICATION_KILL_SWITCH_DISABLED',
        'Enable settings.goV2PublicEnabled before creating a publication preview',
      );
    }
    if (!activeScheduleVersionId || activeScheduleStatus !== 'published') {
      throw new GoV2Error(
        409,
        'PUBLICATION_REQUIRES_PUBLISHED_SCHEDULE',
        'Publication requires the active validated schedule version to be published',
      );
    }
  }
  const publish = toState === 'published';
  return {
    engineVersion: 2,
    fromState,
    toState,
    publicationRevisionNo: Number(row.publication_revision_no),
    publicKillSwitchEnabled,
    activeScheduleVersionId,
    activeScheduleStatus,
    activeScheduleHash: row.schedule_hash ? String(row.schedule_hash) : null,
    entryCount: Number(row.entry_count),
    assignmentCount: Number(row.assignment_count),
    disclosedEntries: Array.isArray(row.entries_snapshot)
      ? row.entries_snapshot.map(record)
      : [],
    scheduleAssignments: Array.isArray(row.assignments_snapshot)
      ? row.assignments_snapshot.map(record)
      : [],
    surfaces: {
      structure: publish,
      standings: publish,
      brackets: publish,
      liveSchedule: publish,
    },
  };
}

function publicationInputHash(snapshot: GoV2PublicationSnapshot, aggregateVersion: number): string {
  return sha256({ operation: 'publication.preview', aggregateVersion, snapshot });
}

async function assertPublicationRedApproval(
  client: PoolClient,
  input: {
    tournamentId: string;
    previewId: string;
    approvalId: string;
    requesterId: string;
    inputHash: string;
    aggregateVersion: number;
  },
): Promise<void> {
  const approval = await client.query(
    `SELECT id
       FROM go_v2_red_operation_approvals
      WHERE id = $1::uuid
        AND tournament_id = $2::uuid
        AND preview_id = $3::uuid
        AND requested_by = $4
        AND approved_by <> $4
        AND reviewed_input_hash = $5
        AND reviewed_aggregate_version = $6
        AND consumed_at IS NULL
        AND expires_at > now()
      FOR UPDATE`,
    [
      input.approvalId,
      input.tournamentId,
      input.previewId,
      input.requesterId,
      input.inputHash,
      input.aggregateVersion,
    ],
  );
  if (!approval.rowCount) {
    throw new GoV2Error(
      409,
      'SECOND_APPROVAL_REQUIRED',
      'Publishing participant or schedule data requires a fresh approval from a different admin',
    );
  }
}

export async function previewGoV2Publication(
  tournamentIdRaw: string,
  body: unknown,
  actor: GoV2ActorContext,
): Promise<GoV2PreviewResponse> {
  const tournamentId = assertGoV2Uuid(tournamentIdRaw, 'tournamentId');
  const command = parseGoV2CommandEnvelope(body);
  assertPublicationReason(command);
  const requestHash = buildGoV2PublicationRequestHash('publication.preview', tournamentId, command);
  assertDeclaredRequestHash(command, requestHash);
  const toState = parsePublicationTarget(command.payload.toState);

  return withGoV2Transaction(tournamentId, async (client) => {
    const state = await ensureGoV2StateForUpdate(client, tournamentId);
    const receipt = await findCommandReceipt(client, tournamentId, command.idempotencyKey);
    if (receipt) {
      assertReceiptMatches(receipt, 'publication.preview', requestHash);
      return {
        ...(receipt.responsePayload as unknown as GoV2PreviewResponse),
        replayed: true,
      };
    }
    assertExpectedVersion(state, command.expectedVersion);
    await requireMutationReason(client, command.reasonCode, command.reasonNote);
    const snapshot = await loadPublicationSnapshot(client, tournamentId, toState);
    const inputHash = publicationInputHash(snapshot, state.aggregateVersion);
    const risk = assessGoV2PublicationRisk({
      toState,
      entryCount: snapshot.entryCount,
      assignmentCount: snapshot.assignmentCount,
    });
    const result = {
      candidate: snapshot,
      impact: {
        publicApiBefore: snapshot.fromState === 'published' && snapshot.publicKillSwitchEnabled,
        publicApiAfter: toState === 'published' && snapshot.publicKillSwitchEnabled,
        disclosedEntryCount: toState === 'published' ? snapshot.entryCount : 0,
        disclosedScheduleAssignmentCount: toState === 'published' ? snapshot.assignmentCount : 0,
      },
      requiresSecondApproval: risk === 'red',
      warnings: risk === 'red'
        ? ['Publishing reveals participant/team names and the live schedule; a different admin must approve this exact preview.']
        : ['Unpublishing closes the public V2 API without deleting history.'],
    };
    const preview = await createOperationPreview(client, {
      tournamentId,
      operationKind: 'publication.preview',
      aggregateVersion: state.aggregateVersion,
      inputHash,
      risk,
      payload: { toState },
      result,
      actorId: actor.id,
    });
    const response: GoV2PreviewResponse = {
      previewId: preview.id,
      operation: 'publication.preview',
      aggregateVersion: state.aggregateVersion,
      inputHash,
      risk,
      expiresAt: preview.expiresAt,
      replayed: false,
      commandId: command.commandId,
      requestHash,
      deviceId: command.deviceId,
      result,
    };
    await saveCommandReceipt(client, {
      tournamentId,
      idempotencyKey: command.idempotencyKey,
      operationKind: 'publication.preview',
      expectedVersion: state.aggregateVersion,
      resultingVersion: state.aggregateVersion,
      requestHash,
      responsePayload: response as unknown as Record<string, unknown>,
      actorId: actor.id,
      actorRole: actor.role,
      deviceId: command.deviceId,
      clientRequestHash: command.requestHash,
    });
    return response;
  });
}

export async function commitGoV2Publication(
  tournamentIdRaw: string,
  body: unknown,
  actor: GoV2ActorContext,
): Promise<GoV2CommitResponse> {
  const tournamentId = assertGoV2Uuid(tournamentIdRaw, 'tournamentId');
  const command = parseGoV2CommandEnvelope(body);
  assertPublicationReason(command);
  const requestHash = buildGoV2PublicationRequestHash('publication.commit', tournamentId, command);
  assertDeclaredRequestHash(command, requestHash);
  if (!command.previewId || !command.inputHash) {
    throw new GoV2Error(400, 'PUBLICATION_PREVIEW_REQUIRED', 'previewId and inputHash are required');
  }
  const previewId = command.previewId;
  const inputHash = command.inputHash;
  const toState = parsePublicationTarget(command.payload.toState);

  return withGoV2Transaction(tournamentId, async (client) => {
    const state = await ensureGoV2StateForUpdate(client, tournamentId);
    const receipt = await findCommandReceipt(client, tournamentId, command.commandId);
    if (receipt) {
      assertReceiptMatches(receipt, 'publication.commit', requestHash);
      return {
        ...(receipt.responsePayload as unknown as GoV2CommitResponse),
        replayed: true,
      };
    }
    assertExpectedVersion(state, command.expectedVersion);
    await requireMutationReason(client, command.reasonCode, command.reasonNote);
    const preview = await getOperationPreviewForUpdate(
      client,
      tournamentId,
      previewId,
      'publication.preview',
      state.aggregateVersion,
    );
    if (preview.inputHash !== inputHash) {
      throw new GoV2Error(409, 'PREVIEW_HASH_MISMATCH', 'inputHash does not match the publication preview');
    }
    const candidate = record(preview.result.candidate);
    if (parsePublicationTarget(candidate.toState) !== toState) {
      throw new GoV2Error(409, 'PUBLICATION_TARGET_CHANGED', 'Commit target does not match the preview');
    }
    const snapshot = await loadPublicationSnapshot(client, tournamentId, toState);
    const currentInputHash = publicationInputHash(snapshot, state.aggregateVersion);
    if (currentInputHash !== preview.inputHash) {
      throw new GoV2Error(
        409,
        'PUBLICATION_PREVIEW_STALE',
        'Publication inputs or public kill switch changed after preview',
      );
    }
    if (preview.risk === 'red') {
      if (!command.confirmRed || !command.redApprovalId) {
        throw new GoV2Error(
          409,
          'SECOND_APPROVAL_REQUIRED',
          'confirmRed and redApprovalId are required for this publication',
        );
      }
      await assertPublicationRedApproval(client, {
        tournamentId,
        previewId,
        approvalId: assertGoV2Uuid(command.redApprovalId, 'redApprovalId'),
        requesterId: actor.id,
        inputHash: preview.inputHash,
        aggregateVersion: state.aggregateVersion,
      });
    }

    const resultingVersion = state.aggregateVersion + 1;
    const publish = toState === 'published';
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO go_v2_publication_state_revisions (
         tournament_id, revision_no, expected_aggregate_version,
         resulting_aggregate_version, from_state, to_state,
         publish_structure, publish_standings, publish_brackets,
         publish_live_schedule, source_preview_id, red_approval_id,
         successor_schedule_version_id, reason_code, reason_note,
         actor_id, command_id, request_hash, input_hash
       ) VALUES (
         $1::uuid, $2, $3, $4, $5, $6,
         $7, $7, $7, $7, $8::uuid, $9::uuid, $10::uuid, $11, $12,
         $13, $14, $15, $16
       )
       RETURNING id::text`,
      [
        tournamentId,
        snapshot.publicationRevisionNo + 1,
        state.aggregateVersion,
        resultingVersion,
        snapshot.fromState,
        toState,
        publish,
        previewId,
        preview.risk === 'red' ? command.redApprovalId : null,
        publish ? snapshot.activeScheduleVersionId : null,
        command.reasonCode,
        command.reasonNote?.trim() ?? '',
        actor.id,
        command.commandId,
        requestHash,
        preview.inputHash,
      ],
    );
    const revisionId = String(inserted.rows[0].id);
    await appendAuditEvent(client, {
      tournamentId,
      aggregateVersion: resultingVersion,
      eventType: 'publication.commit',
      entityType: 'publication_state_revision',
      entityId: revisionId,
      reasonCode: command.reasonCode,
      reasonNote: command.reasonNote,
      actorId: actor.id,
      idempotencyKey: command.commandId,
      diffPayload: {
        fromState: snapshot.fromState,
        toState,
        inputHash: preview.inputHash,
        activeScheduleVersionId: publish ? snapshot.activeScheduleVersionId : null,
        surfaces: snapshot.surfaces,
      },
    });
    await enqueueNotificationOutbox(client, {
      tournamentId,
      aggregateVersion: resultingVersion,
      eventType: 'publication_state_changed',
      payload: { fromState: snapshot.fromState, toState },
    });
    const response: GoV2CommitResponse = {
      operationId: revisionId,
      operation: 'publication.commit',
      aggregateVersion: resultingVersion,
      previewId,
      replayed: false,
      commandId: command.commandId,
      requestHash,
      deviceId: command.deviceId,
      result: {
        publicationState: toState,
        publicationRevisionNo: snapshot.publicationRevisionNo + 1,
        publicApiEnabled: publish && snapshot.publicKillSwitchEnabled,
        activeScheduleVersionId: publish ? snapshot.activeScheduleVersionId : null,
        inputHash: preview.inputHash,
      },
    };
    await saveCommandReceipt(client, {
      tournamentId,
      idempotencyKey: command.commandId,
      operationKind: 'publication.commit',
      expectedVersion: state.aggregateVersion,
      resultingVersion,
      requestHash,
      responsePayload: response as unknown as Record<string, unknown>,
      actorId: actor.id,
      actorRole: actor.role,
      deviceId: command.deviceId,
      clientRequestHash: command.requestHash,
    });
    return response;
  });
}
