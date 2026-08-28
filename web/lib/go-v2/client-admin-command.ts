import { canonicalSha256Hex } from './client-command-hash';

export type GoV2ClientEnvelope = Record<string, unknown>;

const COMMAND_META_KEYS = new Set([
  'expectedVersion', 'commandId', 'requestHash', 'deviceId', 'actor', 'courtGrant',
  'idempotencyKey', 'reasonCode', 'reasonNote', 'previewId', 'inputHash',
  'confirmRed', 'redApprovalId', 'payload',
]);

function asRecord(value: unknown): GoV2ClientEnvelope {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as GoV2ClientEnvelope
    : {};
}

function commandPayload(envelope: GoV2ClientEnvelope): GoV2ClientEnvelope {
  const nested = asRecord(envelope.payload);
  const topLevel = Object.fromEntries(
    Object.entries(envelope).filter(([key]) => !COMMAND_META_KEYS.has(key)),
  );
  return { ...nested, ...topLevel };
}

function decodedPathPart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Builds the same canonical request digest as the authenticated GO V2 server.
 * Route parameters injected server-side are included before hashing, while
 * actor/courtGrant remain trusted server context and are never client supplied.
 */
export async function adminCommandRequestHash(
  tournamentId: string,
  path: string,
  envelope: GoV2ClientEnvelope,
): Promise<string> {
  const exactOperations: Record<string, string> = {
    '/registration/lock': 'registration.lock',
    '/draw/preview': 'draw.preview',
    '/draw/commit': 'draw.commit',
    '/draw/unlock/preview': 'draw.unlock.preview',
    '/draw/unlock/commit': 'draw.unlock.commit',
    '/stages/materialize': 'stages.materialize',
    '/bracket/preview': 'bracket.preview',
    '/bracket/lock': 'bracket.lock',
    '/schedule/generate': 'schedule.generate.preview',
    '/schedule/commit': 'schedule.generate.commit',
    '/schedule/replan/preview': 'schedule.replan.preview',
    '/schedule/replan/commit': 'schedule.replan.commit',
    '/schedule/policy/preview': 'schedule.policy.preview',
    '/schedule/policy/commit': 'schedule.policy.commit',
    '/publication/preview': 'publication.preview',
    '/publication/commit': 'publication.commit',
    '/schedule/defer/preview': 'schedule.defer.preview',
    '/schedule/defer/commit': 'schedule.defer.commit',
    '/schedule/defer/release/preview': 'schedule.defer.release.preview',
    '/schedule/defer/release/commit': 'schedule.defer.release.commit',
    '/schedule/disruptions/preview': 'disruption.preview',
    '/schedule/disruptions/commit': 'disruption.commit',
    '/incidents/preview': 'incident.preview',
    '/incidents/commit': 'incident.commit',
    '/attendance/reinstate/preview': 'attendance.reinstate.preview',
    '/attendance/reinstate/commit': 'attendance.reinstate.commit',
  };
  let operation = exactOperations[path];
  let entityId: string | null = null;
  let effectiveEnvelope = envelope;

  const matchResult = /^\/matches\/([^/]+)\/result$/.exec(path);
  const paperImport = /^\/matches\/([^/]+)\/paper-import\/(preview|commit)$/.exec(path);
  const matchFinishReview = /^\/matches\/([^/]+)\/finish\/(accept|reject)$/.exec(path);
  const entryMutation = /^\/entries\/([^/]+)\/(replacement|withdrawal|attendance)\/(preview|commit)$/.exec(path);
  const reservePromotion = /^\/reserves\/([^/]+)\/promote\/(preview|commit)$/.exec(path);
  const undoMutation = /^\/mutations\/([^/]+)\/undo\/(preview|commit)$/.exec(path);
  const grantMutation = /^\/courts\/([^/]+)\/grants(?:\/([^/]+)\/(rotate|revoke))?$/.exec(path);
  const redApproval = /^\/approvals\/([^/]+)$/.exec(path);
  const disruptionResolution = /^\/schedule\/disruptions\/([^/]+)\/resolve\/(preview|commit)$/.exec(path);
  const pauseResolution = /^\/matches\/([^/]+)\/pause-resolution\/(preview|commit)$/.exec(path);
  const stageRules = /^\/stages\/([^/]+)\/rules\/(preview|commit)$/.exec(path);

  if (reservePromotion) {
    const reserveEntryId = decodedPathPart(reservePromotion[1]);
    operation = `reserve.promotion.${reservePromotion[2]}`;
    if (reservePromotion[2] === 'preview') effectiveEnvelope = { ...envelope, reserveEntryId };
    else entityId = reserveEntryId;
  } else if (paperImport) {
    const matchId = decodedPathPart(paperImport[1]);
    operation = `match.paper_import.${paperImport[2]}`;
    if (paperImport[2] === 'preview') effectiveEnvelope = { ...envelope, matchId };
    else entityId = matchId;
  } else if (matchResult) {
    operation = 'match.result.revise';
    entityId = decodedPathPart(matchResult[1]);
  } else if (matchFinishReview) {
    operation = `match.finish.${matchFinishReview[2]}`;
    entityId = decodedPathPart(matchFinishReview[1]);
  } else if (entryMutation) {
    const entryId = decodedPathPart(entryMutation[1]);
    operation = entryMutation[2] === 'replacement'
      ? `roster.replacement.${entryMutation[3]}`
      : entryMutation[2] === 'withdrawal'
        ? `entry.withdrawal.${entryMutation[3]}`
        : `attendance.${entryMutation[3]}`;
    if (entryMutation[3] === 'preview') effectiveEnvelope = { ...envelope, entryId };
    else entityId = entryId;
  } else if (undoMutation) {
    const batchId = decodedPathPart(undoMutation[1]);
    operation = `mutation.undo.${undoMutation[2]}`;
    if (undoMutation[2] === 'preview') effectiveEnvelope = { ...envelope, batchId };
    else entityId = batchId;
  } else if (disruptionResolution) {
    const disruptionId = decodedPathPart(disruptionResolution[1]);
    operation = `disruption.resolve.${disruptionResolution[2]}`;
    if (disruptionResolution[2] === 'preview') effectiveEnvelope = { ...envelope, disruptionId };
    else entityId = disruptionId;
  } else if (pauseResolution) {
    const matchId = decodedPathPart(pauseResolution[1]);
    operation = `match.pause_resolution.${pauseResolution[2]}`;
    if (pauseResolution[2] === 'preview') effectiveEnvelope = { ...envelope, matchId };
    else entityId = matchId;
  } else if (stageRules) {
    const stageId = decodedPathPart(stageRules[1]);
    operation = `stage.rules.${stageRules[2]}`;
    if (stageRules[2] === 'preview') effectiveEnvelope = { ...envelope, stageId };
    else entityId = stageId;
  }

  if (grantMutation) {
    const courtId = decodedPathPart(grantMutation[1]);
    const grantId = grantMutation[2] ? decodedPathPart(grantMutation[2]) : null;
    const grantOperation = grantMutation[3] === 'rotate'
      ? 'court_grant.rotate'
      : grantMutation[3] === 'revoke'
        ? 'court_grant.revoke'
        : 'court_grant.issue';
    return canonicalSha256Hex({
      operation: grantOperation,
      tournamentId,
      courtId,
      grantId,
      expectedVersion: envelope.expectedVersion,
      commandId: envelope.commandId,
      deviceId: envelope.deviceId,
      reasonCode: envelope.reasonCode,
      reasonNote: envelope.reasonNote ?? null,
      payload: commandPayload(envelope),
    });
  }

  if (redApproval) {
    const review = commandPayload(envelope);
    return canonicalSha256Hex({
      operation: 'red_operation.approve',
      tournamentId,
      previewId: decodedPathPart(redApproval[1]),
      reviewedInputHash: review.reviewedInputHash,
      reviewedAggregateVersion: review.reviewedAggregateVersion,
      expectedVersion: envelope.expectedVersion,
      commandId: envelope.commandId,
      deviceId: envelope.deviceId,
      reasonCode: envelope.reasonCode,
      reasonNote: envelope.reasonNote ?? null,
    });
  }

  if (!operation) throw new Error(`Неизвестная V2-команда: ${path}`);
  if (operation === 'publication.preview' || operation === 'publication.commit') {
    return canonicalSha256Hex({
      operation,
      tournamentId,
      commandId: effectiveEnvelope.commandId,
      deviceId: effectiveEnvelope.deviceId,
      expectedVersion: effectiveEnvelope.expectedVersion,
      reasonCode: effectiveEnvelope.reasonCode,
      reasonNote: effectiveEnvelope.reasonNote ?? null,
      previewId: effectiveEnvelope.previewId ?? null,
      inputHash: effectiveEnvelope.inputHash ?? null,
      confirmRed: effectiveEnvelope.confirmRed === true,
      redApprovalId: effectiveEnvelope.redApprovalId ?? null,
      payload: commandPayload(effectiveEnvelope),
    });
  }
  return canonicalSha256Hex({
    operation,
    entityId,
    commandId: effectiveEnvelope.commandId,
    deviceId: effectiveEnvelope.deviceId,
    expectedVersion: effectiveEnvelope.expectedVersion,
    reasonCode: effectiveEnvelope.reasonCode,
    reasonNote: effectiveEnvelope.reasonNote ?? null,
    previewId: effectiveEnvelope.previewId ?? null,
    inputHash: effectiveEnvelope.inputHash ?? null,
    confirmRed: effectiveEnvelope.confirmRed === true,
    redApprovalId: effectiveEnvelope.redApprovalId ?? null,
    payload: commandPayload(effectiveEnvelope),
  });
}
