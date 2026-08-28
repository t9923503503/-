export type GoV2OfflineSyncState =
  | 'synced'
  | 'pending'
  | 'offline'
  | 'conflict'
  | 'authorization'
  | 'rejected'
  | 'error';

export interface GoV2QueuedCommand {
  commandId: string;
  scopeKey: string;
  endpoint: string;
  method: 'POST' | 'PUT';
  envelope: Record<string, unknown>;
  expectedVersion: number;
  queuedAt: string;
  status?: 'pending' | 'discarded' | 'rebased';
  resolution?: GoV2OfflineCommandResolution;
  lineage?: {
    rebasedFromCommandId: string;
    confirmedByActorId: string;
    confirmedByDeviceId: string;
    reason: string;
    confirmedAt: string;
  };
}

export interface GoV2OfflineCommandResolution {
  action: 'discard' | 'rebase';
  actorId: string;
  deviceId: string;
  reason: string;
  resolvedAt: string;
  remoteVersion: number;
  replacementCommandId?: string;
}

export interface GoV2CachedSnapshot<T = Record<string, unknown>> {
  scopeKey: string;
  savedAt: string;
  version: number;
  payload: T;
}

export interface GoV2OfflineConflict<T = Record<string, unknown>> {
  scopeKey: string;
  commandId: string;
  detectedAt: string;
  code: string;
  message: string;
  local: {
    journal: GoV2QueuedCommand[];
    snapshot: GoV2CachedSnapshot<T> | null;
  };
  remote: {
    snapshot: T;
    version: number;
    snapshotVersion: number;
    receivedAt: string;
  };
}

export interface GoV2OfflineRemoteMatch {
  matchId: string;
  commandVersion: number;
  playState: string;
}

export type GoV2OfflineRebaseAssessment =
  | {
      safe: true;
      kind: 'match.start' | 'match.pause' | 'match.resume';
      matchId: string;
      expectedVersion: number;
      payload: Record<string, never>;
    }
  | { safe: false; code: string; message: string };

export interface GoV2OfflineResolutionIdentity {
  actorId: string;
  deviceId: string;
  reason: string;
  resolvedAt?: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizedCommand(command: GoV2QueuedCommand): GoV2QueuedCommand {
  return { ...command, status: command.status ?? 'pending' };
}

function requiredResolutionIdentity(input: GoV2OfflineResolutionIdentity): Required<GoV2OfflineResolutionIdentity> {
  const actorId = input.actorId.trim();
  const deviceId = input.deviceId.trim();
  const reason = input.reason.trim();
  if (!actorId) throw new Error('Укажите оператора, который принимает решение по конфликту.');
  if (!deviceId) throw new Error('Устройство решения split-brain не определено.');
  if (reason.length < 5) throw new Error('Укажите причину решения split-brain (минимум 5 символов).');
  return {
    actorId,
    deviceId,
    reason,
    resolvedAt: input.resolvedAt ?? new Date().toISOString(),
  };
}

function pendingCommands(journal: readonly GoV2QueuedCommand[]): GoV2QueuedCommand[] {
  return journal.map(normalizedCommand).filter((command) => command.status === 'pending');
}

/**
 * Only idempotent lifecycle intent may be explicitly rebased. Whole-score and
 * finish/result commands always fail closed and must be replayed manually from
 * the accepted server snapshot.
 */
export function assessGoV2OfflineRebase(
  journal: readonly GoV2QueuedCommand[],
  conflictCommandId: string,
  remoteMatch: GoV2OfflineRemoteMatch | null,
): GoV2OfflineRebaseAssessment {
  const pending = pendingCommands(journal);
  if (pending.length !== 1 || pending[0]?.commandId !== conflictCommandId) {
    return {
      safe: false,
      code: 'REBASE_REQUIRES_SINGLE_PENDING_INTENT',
      message: 'Rebase разрешён только для одной независимой неотправленной intent-команды.',
    };
  }

  const queued = pending[0];
  const envelope = asRecord(queued.envelope);
  const command = asRecord(envelope.command);
  const kind = String(command.type ?? '');
  const matchId = String(command.matchId ?? '');
  const payload = asRecord(command.payload);
  if (kind === 'score.replace' || kind === 'match.finish.request') {
    return {
      safe: false,
      code: 'SCORE_OR_RESULT_REBASE_FORBIDDEN',
      message: 'Счёт и итог матча нельзя объединять автоматически. Примите серверную версию и внесите правку вручную.',
    };
  }
  if (kind !== 'match.start' && kind !== 'match.pause' && kind !== 'match.resume') {
    return {
      safe: false,
      code: 'UNSAFE_REBASE_COMMAND',
      message: 'Тип локальной команды нельзя безопасно повторить поверх серверной версии.',
    };
  }
  if (Object.keys(payload).length > 0) {
    return {
      safe: false,
      code: 'REBASE_PAYLOAD_NOT_EMPTY',
      message: 'Intent-команда содержит данные матча и требует ручной проверки.',
    };
  }
  if (!remoteMatch || remoteMatch.matchId !== matchId) {
    return {
      safe: false,
      code: 'REMOTE_MATCH_SNAPSHOT_REQUIRED',
      message: 'Нет подтверждённого серверного снимка именно этого матча.',
    };
  }
  if (!Number.isSafeInteger(remoteMatch.commandVersion)
      || remoteMatch.commandVersion <= queued.expectedVersion) {
    return {
      safe: false,
      code: 'REMOTE_VERSION_NOT_NEWER',
      message: 'Серверная версия не подтверждает конфликт CAS; rebase заблокирован.',
    };
  }
  const allowedState = {
    'match.start': ['pending', 'ready'],
    'match.pause': ['live'],
    'match.resume': ['paused'],
  }[kind];
  if (!allowedState.includes(remoteMatch.playState)) {
    return {
      safe: false,
      code: 'REMOTE_STATE_CHANGED',
      message: `Серверный матч уже в состоянии «${remoteMatch.playState}»; intent нельзя повторить автоматически.`,
    };
  }
  if (Number(envelope.expectedVersion) !== queued.expectedVersion
      || String(envelope.commandId ?? '') !== queued.commandId) {
    return {
      safe: false,
      code: 'LOCAL_COMMAND_ENVELOPE_MISMATCH',
      message: 'Локальная команда повреждена или не совпадает со своим подписанным envelope.',
    };
  }
  return {
    safe: true,
    kind,
    matchId,
    expectedVersion: remoteMatch.commandVersion,
    payload: {},
  };
}

function requestResult<T>(request: IDBRequest<T>, fallback: string): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error(fallback));
  });
}

function transactionDone(transaction: IDBTransaction, fallback: string): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error(fallback));
    transaction.onabort = () => reject(transaction.error ?? new Error(fallback));
  });
}

/**
 * IndexedDB transport cache shared by V2 judge/admin live clients.
 *
 * Commands retain their original commandId and expectedVersion. A conflict is
 * persisted for an explicit operator decision; this class deliberately has no
 * last-write-wins or automatic score/result rebase operation.
 */
export class GoV2OfflineStore {
  constructor(private readonly databaseName = 'lpvolley-go-v2-live-v1') {}

  private open(): Promise<IDBDatabase> {
    if (typeof indexedDB === 'undefined') {
      return Promise.reject(new Error('IndexedDB недоступен на этом устройстве.'));
    }
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('snapshots')) {
          db.createObjectStore('snapshots', { keyPath: 'scopeKey' });
        }
        if (!db.objectStoreNames.contains('commands')) {
          const commands = db.createObjectStore('commands', { keyPath: 'commandId' });
          commands.createIndex('byScopeQueuedAt', ['scopeKey', 'queuedAt'], { unique: false });
        }
        if (!db.objectStoreNames.contains('conflicts')) {
          db.createObjectStore('conflicts', { keyPath: 'scopeKey' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Не удалось открыть офлайн-хранилище V2.'));
    });
  }

  async saveSnapshot<T>(scopeKey: string, version: number, payload: T): Promise<void> {
    const db = await this.open();
    try {
      const transaction = db.transaction('snapshots', 'readwrite');
      transaction.objectStore('snapshots').put({
        scopeKey,
        version,
        payload,
        savedAt: new Date().toISOString(),
      } satisfies GoV2CachedSnapshot<T>);
      await transactionDone(transaction, 'Не удалось сохранить V2-снимок.');
    } finally {
      db.close();
    }
  }

  async loadSnapshot<T>(scopeKey: string): Promise<GoV2CachedSnapshot<T> | null> {
    const db = await this.open();
    try {
      const request = db.transaction('snapshots', 'readonly').objectStore('snapshots').get(scopeKey);
      const result = await requestResult(request, 'Не удалось прочитать V2-снимок.');
      return (result as GoV2CachedSnapshot<T> | undefined) ?? null;
    } finally {
      db.close();
    }
  }

  async queueCommand(command: GoV2QueuedCommand): Promise<void> {
    const db = await this.open();
    try {
      const transaction = db.transaction('commands', 'readwrite');
      transaction.objectStore('commands').put({ ...command, status: 'pending' });
      await transactionDone(transaction, 'Не удалось сохранить команду V2 в очередь.');
    } finally {
      db.close();
    }
  }

  async queueCommandAndSaveSnapshot<T>(
    command: GoV2QueuedCommand,
    version: number,
    payload: T,
  ): Promise<void> {
    if (command.scopeKey.trim() === '') {
      throw new Error('Команда V2 не содержит scopeKey.');
    }
    const db = await this.open();
    try {
      const transaction = db.transaction(['commands', 'snapshots'], 'readwrite');
      transaction.objectStore('commands').put({ ...command, status: 'pending' });
      transaction.objectStore('snapshots').put({
        scopeKey: command.scopeKey,
        version,
        payload,
        savedAt: new Date().toISOString(),
      } satisfies GoV2CachedSnapshot<T>);
      await transactionDone(transaction, 'Не удалось атомарно сохранить команду и V2-снимок.');
    } finally {
      db.close();
    }
  }

  async listCommands(scopeKey: string): Promise<GoV2QueuedCommand[]> {
    return (await this.listCommandJournal(scopeKey)).filter((command) => command.status === 'pending');
  }

  async listCommandJournal(scopeKey: string): Promise<GoV2QueuedCommand[]> {
    const db = await this.open();
    try {
      const transaction = db.transaction('commands', 'readonly');
      const index = transaction.objectStore('commands').index('byScopeQueuedAt');
      const range = IDBKeyRange.bound([scopeKey, ''], [scopeKey, '\uffff']);
      const result = await requestResult(index.getAll(range), 'Не удалось прочитать очередь V2.');
      return (result as GoV2QueuedCommand[])
        .map(normalizedCommand)
        .sort((left, right) => left.queuedAt.localeCompare(right.queuedAt));
    } finally {
      db.close();
    }
  }

  async removeCommand(commandId: string): Promise<void> {
    const db = await this.open();
    try {
      const transaction = db.transaction('commands', 'readwrite');
      transaction.objectStore('commands').delete(commandId);
      await transactionDone(transaction, 'Не удалось удалить отправленную команду V2.');
    } finally {
      db.close();
    }
  }

  async clearCommands(scopeKey: string): Promise<void> {
    const commands = await this.listCommands(scopeKey);
    if (!commands.length) return;
    const db = await this.open();
    try {
      const transaction = db.transaction('commands', 'readwrite');
      const store = transaction.objectStore('commands');
      for (const command of commands) store.delete(command.commandId);
      await transactionDone(transaction, 'Не удалось очистить очередь V2.');
    } finally {
      db.close();
    }
  }

  async saveConflict<T>(conflict: GoV2OfflineConflict<T>): Promise<void> {
    const db = await this.open();
    try {
      const transaction = db.transaction('conflicts', 'readwrite');
      transaction.objectStore('conflicts').put({
        ...conflict,
        local: {
          ...conflict.local,
          journal: conflict.local.journal.map(normalizedCommand),
        },
      });
      await transactionDone(transaction, 'Не удалось сохранить конфликт V2.');
    } finally {
      db.close();
    }
  }

  async loadConflict<T>(scopeKey: string): Promise<GoV2OfflineConflict<T> | null> {
    const db = await this.open();
    try {
      const request = db.transaction('conflicts', 'readonly').objectStore('conflicts').get(scopeKey);
      const result = await requestResult(request, 'Не удалось прочитать конфликт V2.');
      if (!result) return null;
      const raw = asRecord(result);
      const rawLocal = asRecord(raw.local);
      const rawRemote = asRecord(raw.remote);
      const legacyCommands = Array.isArray(rawLocal.commands) ? rawLocal.commands : [];
      const journal = (Array.isArray(rawLocal.journal) ? rawLocal.journal : legacyCommands)
        .map((command) => normalizedCommand(command as GoV2QueuedCommand));
      const remoteSnapshot = (rawRemote.snapshot ?? raw.server ?? {}) as T;
      return {
        scopeKey: String(raw.scopeKey ?? scopeKey),
        commandId: String(raw.commandId ?? ''),
        detectedAt: String(raw.detectedAt ?? new Date().toISOString()),
        code: String(raw.code ?? 'JUDGE_COMMAND_VERSION_CONFLICT'),
        message: String(raw.message ?? 'Серверное состояние изменилось на другом устройстве.'),
        local: {
          journal,
          snapshot: (rawLocal.snapshot as GoV2CachedSnapshot<T> | null | undefined) ?? null,
        },
        remote: {
          snapshot: remoteSnapshot,
          version: Number(rawRemote.version ?? -1),
          snapshotVersion: Number(rawRemote.snapshotVersion ?? -1),
          receivedAt: String(rawRemote.receivedAt ?? raw.detectedAt ?? new Date().toISOString()),
        },
      };
    } finally {
      db.close();
    }
  }

  private async resolveConflict<T>(input: {
    scopeKey: string;
    conflictCommandId: string;
    commandIds: string[];
    remoteSnapshot: T;
    remoteVersion: number;
    remoteSnapshotVersion: number;
    identity: GoV2OfflineResolutionIdentity;
    action: 'discard' | 'rebase';
    replacement?: GoV2QueuedCommand;
    replacementSnapshot?: T;
  }): Promise<void> {
    const scopeKey = input.scopeKey.trim();
    const conflictCommandId = input.conflictCommandId.trim();
    const targetIds = [...new Set(input.commandIds.map((value) => value.trim()).filter(Boolean))];
    const identity = requiredResolutionIdentity(input.identity);
    if (!scopeKey || !conflictCommandId || !targetIds.length) {
      throw new Error('Конфликт split-brain не содержит конкретных локальных команд.');
    }
    if (!Number.isSafeInteger(input.remoteVersion) || input.remoteVersion < 0) {
      throw new Error('Серверная версия матча не подтверждена. Обновите снимок перед решением.');
    }
    if (!Number.isSafeInteger(input.remoteSnapshotVersion) || input.remoteSnapshotVersion < 0) {
      throw new Error('Версия серверного снимка не подтверждена. Обновите данные корта.');
    }

    const db = await this.open();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(['commands', 'snapshots', 'conflicts'], 'readwrite');
        const commandStore = transaction.objectStore('commands');
        const range = IDBKeyRange.bound([scopeKey, ''], [scopeKey, '\uffff']);
        const journalRequest = commandStore.index('byScopeQueuedAt').getAll(range);
        const conflictRequest = transaction.objectStore('conflicts').get(scopeKey);
        let journal: GoV2QueuedCommand[] | null = null;
        let storedConflict: GoV2OfflineConflict | null | undefined;
        let prepared = false;
        let failed = false;

        const fail = (reason: unknown) => {
          if (failed) return;
          failed = true;
          try { transaction.abort(); } catch { /* transaction may already be aborting */ }
          reject(reason instanceof Error ? reason : new Error('Не удалось разрешить split-brain конфликт.'));
        };

        const prepareWrites = () => {
          if (prepared || journal === null || storedConflict === undefined || failed) return;
          prepared = true;
          try {
            if (!storedConflict || storedConflict.commandId !== conflictCommandId) {
              throw new Error('Конфликт изменился. Обновите экран перед решением.');
            }
            const currentPending = pendingCommands(journal);
            const pendingIds = new Set(currentPending.map((command) => command.commandId));
            if (pendingIds.size !== targetIds.length || targetIds.some((commandId) => !pendingIds.has(commandId))) {
              throw new Error('Локальный журнал изменился. Решение не применено.');
            }

            let replacementCommandId: string | undefined;
            if (input.action === 'rebase') {
              const replacement = input.replacement;
              if (!replacement || !input.replacementSnapshot) {
                throw new Error('Новая rebase-команда или её локальный снимок отсутствует.');
              }
              const original = currentPending.find((command) => command.commandId === conflictCommandId);
              const originalCommand = asRecord(asRecord(original?.envelope).command);
              const replacementEnvelope = asRecord(replacement.envelope);
              const replacementCommand = asRecord(replacementEnvelope.command);
              const actualKind = String(originalCommand.type ?? '');
              if (!original
                  || targetIds.length !== 1
                  || !['match.start', 'match.pause', 'match.resume'].includes(actualKind)
                  || Object.keys(asRecord(originalCommand.payload)).length > 0
                  || original.expectedVersion >= input.remoteVersion
                  || Number(asRecord(original.envelope).expectedVersion) !== original.expectedVersion
                  || String(asRecord(original.envelope).commandId ?? '') !== original.commandId
                  || replacement.commandId === original.commandId
                  || replacement.expectedVersion !== input.remoteVersion
                  || Number(replacementEnvelope.expectedVersion) !== input.remoteVersion
                  || String(replacementEnvelope.commandId ?? '') !== replacement.commandId
                  || String(replacementEnvelope.requestHash ?? '') === String(asRecord(original.envelope).requestHash ?? '')
                  || !String(replacementEnvelope.requestHash ?? '').match(/^[0-9a-f]{64}$/)
                  || String(replacementCommand.type ?? '') !== String(originalCommand.type ?? '')
                  || String(replacementCommand.matchId ?? '') !== String(originalCommand.matchId ?? '')
                  || Object.keys(asRecord(replacementCommand.payload)).length > 0) {
                throw new Error('Новая rebase-команда не соответствует безопасному intent исходной команды.');
              }
              replacementCommandId = replacement.commandId;
              commandStore.put({
                ...replacement,
                status: 'pending',
                lineage: {
                  rebasedFromCommandId: original.commandId,
                  confirmedByActorId: identity.actorId,
                  confirmedByDeviceId: identity.deviceId,
                  reason: identity.reason,
                  confirmedAt: identity.resolvedAt,
                },
              } satisfies GoV2QueuedCommand);
            }

            const resolution: GoV2OfflineCommandResolution = {
              action: input.action,
              actorId: identity.actorId,
              deviceId: identity.deviceId,
              reason: identity.reason,
              resolvedAt: identity.resolvedAt,
              remoteVersion: input.remoteVersion,
              ...(replacementCommandId ? { replacementCommandId } : {}),
            };
            for (const command of currentPending) {
              commandStore.put({
                ...command,
                status: input.action === 'discard' ? 'discarded' : 'rebased',
                resolution,
              } satisfies GoV2QueuedCommand);
            }
            transaction.objectStore('snapshots').put({
              scopeKey,
              version: input.remoteSnapshotVersion,
              payload: input.action === 'rebase'
                ? input.replacementSnapshot as T
                : input.remoteSnapshot,
              savedAt: identity.resolvedAt,
            } satisfies GoV2CachedSnapshot<T>);
            transaction.objectStore('conflicts').delete(scopeKey);
          } catch (reason) {
            fail(reason);
          }
        };

        journalRequest.onsuccess = () => {
          journal = (journalRequest.result as GoV2QueuedCommand[]).map(normalizedCommand);
          prepareWrites();
        };
        journalRequest.onerror = () => fail(journalRequest.error ?? new Error('Не удалось прочитать локальный журнал.'));
        conflictRequest.onsuccess = () => {
          storedConflict = (conflictRequest.result as GoV2OfflineConflict | undefined) ?? null;
          prepareWrites();
        };
        conflictRequest.onerror = () => fail(conflictRequest.error ?? new Error('Не удалось прочитать конфликт.'));
        transaction.oncomplete = () => { if (!failed) resolve(); };
        transaction.onerror = () => fail(transaction.error ?? new Error('Не удалось сохранить решение split-brain.'));
        transaction.onabort = () => fail(transaction.error ?? new Error('Решение split-brain отменено.'));
      });
    } finally {
      db.close();
    }
  }

  async discardConflict<T>(input: {
    scopeKey: string;
    conflictCommandId: string;
    commandIds: string[];
    remoteSnapshot: T;
    remoteVersion: number;
    remoteSnapshotVersion: number;
    identity: GoV2OfflineResolutionIdentity;
  }): Promise<void> {
    await this.resolveConflict({ ...input, action: 'discard' });
  }

  async rebaseConflict<T>(input: {
    scopeKey: string;
    conflictCommandId: string;
    originalJournal: GoV2QueuedCommand[];
    remoteMatch: GoV2OfflineRemoteMatch;
    remoteSnapshot: T;
    remoteSnapshotVersion: number;
    replacement: GoV2QueuedCommand;
    replacementSnapshot: T;
    identity: GoV2OfflineResolutionIdentity;
  }): Promise<void> {
    const assessment = assessGoV2OfflineRebase(
      input.originalJournal,
      input.conflictCommandId,
      input.remoteMatch,
    );
    if (!assessment.safe) throw new Error(assessment.message);
    await this.resolveConflict({
      scopeKey: input.scopeKey,
      conflictCommandId: input.conflictCommandId,
      commandIds: [input.conflictCommandId],
      remoteSnapshot: input.remoteSnapshot,
      remoteVersion: input.remoteMatch.commandVersion,
      remoteSnapshotVersion: input.remoteSnapshotVersion,
      identity: input.identity,
      action: 'rebase',
      replacement: input.replacement,
      replacementSnapshot: input.replacementSnapshot,
    });
  }

}

export function downloadGoV2ConflictBackup(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.replace(/[^a-zа-яё0-9_.-]+/giu, '-');
  anchor.click();
  URL.revokeObjectURL(url);
}
