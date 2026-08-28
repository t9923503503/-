const FNV_OFFSET_BASIS_64 = BigInt('14695981039346656037');
const FNV_PRIME_64 = BigInt('1099511628211');
const MASK_64 = (BigInt(1) << BigInt(64)) - BigInt(1);

/** Stable, browser-safe structural hash. It is an identity checksum, not a security primitive. */
export function stableStructuralHash(value: unknown): string {
  const serialized = stableStringify(value);
  let hash = FNV_OFFSET_BASIS_64;
  const bytes = new TextEncoder().encode(serialized);
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * FNV_PRIME_64) & MASK_64;
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (typeof value === 'bigint') return { $bigint: value.toString() };
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, canonicalize(record[key])]),
  );
}
