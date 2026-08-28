function canonicalize(value: unknown): unknown {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error('Команда содержит NaN или Infinity и не может быть безопасно хэширована.');
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

/**
 * Browser-safe counterpart of the GO V2 server canonical/hash helpers.
 * Keep this algorithm byte-for-byte compatible with the server before using
 * a client-declared requestHash for CAS/idempotency commands.
 */
export async function canonicalSha256Hex(value: unknown): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Безопасный SHA-256 недоступен в этом браузере. Команда не была создана.');
  }
  const serialized = JSON.stringify(canonicalize(value));
  if (serialized === undefined) throw new Error('Команда не имеет канонического JSON-представления.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}
