import type {
  IndividualMixAdminSessionView,
  IndividualMixJudgeSessionView,
  IndividualMixLiveCommandEnvelope,
} from './live-service';

export type IndividualMixCachedSession = IndividualMixAdminSessionView | IndividualMixJudgeSessionView;

export interface IndividualMixLiveQueuedCommand {
  commandId: string;
  scopeKey: string;
  endpoint: string;
  tournamentId: string;
  pin?: string;
  envelope: IndividualMixLiveCommandEnvelope;
  queuedAt: string;
}

export interface IndividualMixLiveConflict {
  commandId: string;
  code: string;
  message: string;
  current: IndividualMixCachedSession;
  detectedAt: string;
}

type CachedRecord = {
  scopeKey: string;
  savedAt: string;
  session: IndividualMixCachedSession;
  conflict?: IndividualMixLiveConflict;
};

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

export function individualMixAdminScopeKey(tournamentId: string): string {
  return `admin:${tournamentId}`;
}

export function individualMixJudgeScopeKey(pin: string): string {
  return `judge:${String(pin).trim().toUpperCase()}`;
}

export class IndividualMixLiveOfflineStore {
  constructor(private readonly databaseName = 'lpvolley-individual-mix-live-v1') {}

  private open(): Promise<IDBDatabase> {
    if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB недоступен на этом устройстве.'));
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'scopeKey' });
        if (!db.objectStoreNames.contains('commands')) {
          const commands = db.createObjectStore('commands', { keyPath: 'commandId' });
          commands.createIndex('byScopeQueuedAt', ['scopeKey', 'queuedAt'], { unique: false });
        }
        if (!db.objectStoreNames.contains('backups')) {
          const backups = db.createObjectStore('backups', { keyPath: 'id' });
          backups.createIndex('byTournamentCreatedAt', ['tournamentId', 'createdAt'], { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Не удалось открыть офлайн-хранилище live-сессии.'));
    });
  }

  async saveSession(scopeKey: string, session: IndividualMixCachedSession, conflict?: IndividualMixLiveConflict): Promise<void> {
    const db = await this.open();
    try {
      const tx = db.transaction('sessions', 'readwrite');
      tx.objectStore('sessions').put({ scopeKey, session, conflict, savedAt: new Date().toISOString() } satisfies CachedRecord);
      await transactionDone(tx, 'Не удалось сохранить серверный снимок офлайн.');
    } finally {
      db.close();
    }
  }

  async loadSession(scopeKey: string): Promise<CachedRecord | null> {
    const db = await this.open();
    try {
      const result = await requestResult(
        db.transaction('sessions', 'readonly').objectStore('sessions').get(scopeKey),
        'Не удалось прочитать офлайн-снимок.',
      );
      return (result as CachedRecord | undefined) ?? null;
    } finally {
      db.close();
    }
  }

  async queueCommand(command: IndividualMixLiveQueuedCommand): Promise<void> {
    const db = await this.open();
    try {
      const tx = db.transaction('commands', 'readwrite');
      tx.objectStore('commands').put(command);
      await transactionDone(tx, 'Не удалось добавить действие в очередь синхронизации.');
    } finally {
      db.close();
    }
  }

  async listCommands(scopeKey: string): Promise<IndividualMixLiveQueuedCommand[]> {
    const db = await this.open();
    try {
      const tx = db.transaction('commands', 'readonly');
      const index = tx.objectStore('commands').index('byScopeQueuedAt');
      const range = IDBKeyRange.bound([scopeKey, ''], [scopeKey, '\uffff']);
      const result = await requestResult(index.getAll(range), 'Не удалось прочитать очередь синхронизации.');
      return (result as IndividualMixLiveQueuedCommand[]).sort((left, right) => left.queuedAt.localeCompare(right.queuedAt));
    } finally {
      db.close();
    }
  }

  async removeCommand(commandId: string): Promise<void> {
    const db = await this.open();
    try {
      const tx = db.transaction('commands', 'readwrite');
      tx.objectStore('commands').delete(commandId);
      await transactionDone(tx, 'Не удалось удалить отправленное действие из очереди.');
    } finally {
      db.close();
    }
  }

  async clearCommands(scopeKey: string): Promise<void> {
    const commands = await this.listCommands(scopeKey);
    if (!commands.length) return;
    const db = await this.open();
    try {
      const tx = db.transaction('commands', 'readwrite');
      const store = tx.objectStore('commands');
      for (const command of commands) store.delete(command.commandId);
      await transactionDone(tx, 'Не удалось очистить очередь после разрешения конфликта.');
    } finally {
      db.close();
    }
  }

  async saveBackup(tournamentId: string, label: string, payload: unknown): Promise<string> {
    const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `backup-${Date.now()}`;
    const db = await this.open();
    try {
      const tx = db.transaction('backups', 'readwrite');
      tx.objectStore('backups').put({ id, tournamentId, label, payload, createdAt: new Date().toISOString() });
      await transactionDone(tx, 'Не удалось сохранить локальную резервную копию.');
      return id;
    } finally {
      db.close();
    }
  }
}

export function downloadIndividualMixJsonBackup(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.replace(/[^a-zа-яё0-9_.-]+/gi, '-');
  anchor.click();
  URL.revokeObjectURL(url);
}
