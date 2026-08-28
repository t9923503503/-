import type { IndividualMixGameResult, IndividualMixPoolSchedule, IndividualMixScoreRule } from './types';

export const INDIVIDUAL_MIX_OFFLINE_BUNDLE_VERSION = 1;

export interface IndividualMixOfflineBundle {
  bundleVersion: typeof INDIVIDUAL_MIX_OFFLINE_BUNDLE_VERSION;
  tournamentId: string;
  deviceId: string;
  rulesVersion: string;
  scheduleRevision: number;
  localRevision: number;
  preparedAt: string;
  scoreRule: IndividualMixScoreRule;
  schedules: IndividualMixPoolSchedule[];
  results: Record<string, IndividualMixGameResult>;
  appliedCommandIds: string[];
  playoffLockedAt?: string;
  playoffFormatVersion?: string;
}

export type IndividualMixOfflineCommand =
  | {
      commandId: string;
      tournamentId: string;
      deviceId: string;
      sequenceNumber: number;
      baseRevision: number;
      scheduleRevision: number;
      rulesVersion: string;
      createdAt: string;
      type: 'score_recorded' | 'score_corrected';
      payload: { result: IndividualMixGameResult; reason?: string };
    }
  | {
      commandId: string;
      tournamentId: string;
      deviceId: string;
      sequenceNumber: number;
      baseRevision: number;
      scheduleRevision: number;
      rulesVersion: string;
      createdAt: string;
      type: 'score_removed';
      payload: { gameId: string; reason: string };
    };

export interface IndividualMixOfflineApplyResult {
  bundle: IndividualMixOfflineBundle;
  status: 'applied' | 'duplicate';
}

function cloneBundle(bundle: IndividualMixOfflineBundle): IndividualMixOfflineBundle {
  return {
    ...bundle,
    schedules: bundle.schedules,
    results: { ...bundle.results },
    appliedCommandIds: [...bundle.appliedCommandIds],
  };
}

export function createIndividualMixOfflineBundle(input: {
  tournamentId: string;
  deviceId: string;
  rulesVersion: string;
  scheduleRevision: number;
  preparedAt?: string;
  scoreRule: IndividualMixScoreRule;
  schedules: IndividualMixPoolSchedule[];
}): IndividualMixOfflineBundle {
  if (!input.tournamentId.trim() || !input.deviceId.trim() || !input.rulesVersion.trim()) {
    throw new Error('Offline bundle requires tournament, device and rules identifiers.');
  }
  if (!Number.isInteger(input.scheduleRevision) || input.scheduleRevision < 1) {
    throw new Error('Offline bundle requires a positive schedule revision.');
  }
  return {
    bundleVersion: INDIVIDUAL_MIX_OFFLINE_BUNDLE_VERSION,
    tournamentId: input.tournamentId,
    deviceId: input.deviceId,
    rulesVersion: input.rulesVersion,
    scheduleRevision: input.scheduleRevision,
    localRevision: 0,
    preparedAt: input.preparedAt ?? new Date().toISOString(),
    scoreRule: input.scoreRule,
    schedules: input.schedules,
    results: {},
    appliedCommandIds: [],
  };
}

export function applyIndividualMixOfflineCommand(
  current: IndividualMixOfflineBundle,
  command: IndividualMixOfflineCommand,
): IndividualMixOfflineApplyResult {
  if (current.appliedCommandIds.includes(command.commandId)) return { bundle: current, status: 'duplicate' };
  if (command.tournamentId !== current.tournamentId) throw new Error('Offline command belongs to another tournament.');
  if (command.deviceId !== current.deviceId) throw new Error('Offline command belongs to another device.');
  if (command.scheduleRevision !== current.scheduleRevision) throw new Error('Offline command uses a stale schedule revision.');
  if (command.rulesVersion !== current.rulesVersion) throw new Error('Offline command uses a stale rules version.');
  if (command.baseRevision !== current.localRevision) {
    throw new Error(`Offline revision conflict: expected ${current.localRevision}, got ${command.baseRevision}.`);
  }
  if (command.sequenceNumber !== current.localRevision + 1) {
    throw new Error(`Offline sequence conflict: expected ${current.localRevision + 1}, got ${command.sequenceNumber}.`);
  }

  const knownGameIds = new Set(
    current.schedules.flatMap((schedule) =>
      schedule.rounds.flatMap((round) => round.duels.flatMap((duel) => duel.games.map((game) => game.id))),
    ),
  );
  const gameId = command.type === 'score_removed' ? command.payload.gameId : command.payload.result.gameId;
  if (!knownGameIds.has(gameId)) throw new Error(`Offline command references unknown game ${gameId}.`);

  const next = cloneBundle(current);
  if (command.type === 'score_removed') delete next.results[gameId];
  else next.results[gameId] = { ...command.payload.result };
  next.localRevision += 1;
  next.appliedCommandIds.push(command.commandId);
  return { bundle: next, status: 'applied' };
}

export function getIndividualMixOfflineProgress(bundle: IndividualMixOfflineBundle): {
  completed: number;
  total: number;
  missingGameIds: string[];
} {
  const gameIds = bundle.schedules.flatMap((schedule) =>
    schedule.rounds.flatMap((round) => round.duels.flatMap((duel) => duel.games.map((game) => game.id))),
  );
  const missingGameIds = gameIds.filter((gameId) => !bundle.results[gameId]);
  return { completed: gameIds.length - missingGameIds.length, total: gameIds.length, missingGameIds };
}

/**
 * Thin IndexedDB adapter. Domain code stays independent from a specific wrapper
 * (Dexie can replace this adapter later without changing the format engine).
 */
export class IndividualMixOfflineStore {
  private readonly databaseName: string;

  constructor(databaseName = 'lpvolley-individual-mix-offline-v1') {
    this.databaseName = databaseName;
  }

  private open(): Promise<IDBDatabase> {
    if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is not available on this device.'));
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('bundles')) db.createObjectStore('bundles', { keyPath: 'tournamentId' });
        if (!db.objectStoreNames.contains('commands')) {
          const commands = db.createObjectStore('commands', { keyPath: 'commandId' });
          commands.createIndex('byTournamentSequence', ['tournamentId', 'sequenceNumber'], { unique: true });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Failed to open offline database.'));
    });
  }

  async saveBundle(bundle: IndividualMixOfflineBundle): Promise<void> {
    const db = await this.open();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('bundles', 'readwrite');
        tx.objectStore('bundles').put(bundle);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('Failed to save offline bundle.'));
        tx.onabort = () => reject(tx.error ?? new Error('Offline bundle transaction was aborted.'));
      });
    } finally {
      db.close();
    }
  }

  async loadBundle(tournamentId: string): Promise<IndividualMixOfflineBundle | null> {
    const db = await this.open();
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction('bundles', 'readonly').objectStore('bundles').get(tournamentId);
        request.onsuccess = () => resolve((request.result as IndividualMixOfflineBundle | undefined) ?? null);
        request.onerror = () => reject(request.error ?? new Error('Failed to load offline bundle.'));
      });
    } finally {
      db.close();
    }
  }

  async applyCommand(command: IndividualMixOfflineCommand): Promise<IndividualMixOfflineApplyResult> {
    const current = await this.loadBundle(command.tournamentId);
    if (!current) throw new Error('Prepare the tournament offline bundle before recording results.');
    const result = applyIndividualMixOfflineCommand(current, command);
    if (result.status === 'duplicate') return result;
    const db = await this.open();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['bundles', 'commands'], 'readwrite');
        tx.objectStore('commands').add(command);
        tx.objectStore('bundles').put(result.bundle);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('Failed to apply offline command.'));
        tx.onabort = () => reject(tx.error ?? new Error('Offline command transaction was aborted.'));
      });
      return result;
    } finally {
      db.close();
    }
  }
}
