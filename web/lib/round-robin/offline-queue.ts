'use client';

import type { RrQueuedJudgeEvent } from './types';

const DB_NAME = 'lpvolley-round-robin';
const STORE_NAME = 'judge-events';
const DB_VERSION = 1;

function openQueue(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'clientEventId' });
        store.createIndex('queuedAt', 'queuedAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function enqueueRrJudgeEvent(event: RrQueuedJudgeEvent): Promise<void> {
  const database = await openQueue();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(event);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function listRrJudgeEvents(tournamentId: string): Promise<RrQueuedJudgeEvent[]> {
  const database = await openQueue();
  const rows = await new Promise<RrQueuedJudgeEvent[]>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result as RrQueuedJudgeEvent[]).filter((row) => row.tournamentId === tournamentId));
    request.onerror = () => reject(request.error);
  });
  database.close();
  return rows.sort((left, right) => left.queuedAt.localeCompare(right.queuedAt));
}

export async function removeRrJudgeEvent(clientEventId: string): Promise<void> {
  const database = await openQueue();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(clientEventId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}
