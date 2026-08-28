import { createHash } from 'node:crypto';

function normalizeForJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeForJson);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        if (record[key] !== undefined) result[key] = normalizeForJson(record[key]);
        return result;
      }, {});
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeForJson(value));
}

export function deterministicHash(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}
