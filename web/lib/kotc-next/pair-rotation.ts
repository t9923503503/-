export interface KotcNextRotatingPairView {
  pairIdx: number;
  label: string;
  primaryPlayer: { id?: string; name: string } | null;
  secondaryPlayer: { id?: string; name: string } | null;
}

function normalizeVariant(value: string | null | undefined): string {
  return String(value || '').trim().toUpperCase();
}

export function usesKotcNextRotatingPairs(variant: string | null | undefined): boolean {
  const normalized = normalizeVariant(variant);
  return normalized === 'MF' || normalized === 'MN';
}

export function rotatingSecondaryPairIdx(pairIdx: number, raundNo: number, pairCount: number): number {
  if (!Number.isInteger(pairIdx) || pairCount <= 0) return pairIdx;
  const roundOffset = Math.max(0, Math.trunc(Number(raundNo)) - 1);
  return ((pairIdx + roundOffset) % pairCount + pairCount) % pairCount;
}

export function rotatingDisplayedPairIdx(rowIndex: number, raundNo: number, pairCount: number): number {
  if (!Number.isInteger(rowIndex) || pairCount <= 0) return rowIndex;
  const roundOffset = Math.max(0, Math.trunc(Number(raundNo)) - 1);
  return ((rowIndex + roundOffset) % pairCount + pairCount) % pairCount;
}

export function resolveKotcNextRotatingPairLabel(
  pairs: KotcNextRotatingPairView[],
  pairIdx: number,
  variant: string | null | undefined,
  raundNo: number,
): string {
  const pair = pairs.find((item) => item.pairIdx === pairIdx) ?? null;
  if (!pair) return `Pair ${pairIdx + 1}`;
  if (!usesKotcNextRotatingPairs(variant)) return pair.label || `Pair ${pairIdx + 1}`;

  const primary = String(pair.primaryPlayer?.name || '').trim() || `M${pairIdx + 1}`;
  const secondaryIdx = rotatingSecondaryPairIdx(pairIdx, raundNo, pairs.length);
  const secondaryPair = pairs.find((item) => item.pairIdx === secondaryIdx) ?? null;
  const secondary = String(secondaryPair?.secondaryPlayer?.name || '').trim() || `W${secondaryIdx + 1}`;
  return `${primary} / ${secondary}`;
}
