const DEFAULT_SUPPORTED_TOURNAMENT_FORMAT_CODES = new Set([
  'classic',
  'double_elim',
  'ipt_mixed',
  'kotc',
  'swiss',
]);

const TOURNAMENT_FORMAT_CODE_ALIASES = new Map<string, string>([
  ['classic', 'classic'],
  ['double elimination', 'double_elim'],
  ['double_elim', 'double_elim'],
  ['ipt mixed', 'ipt_mixed'],
  ['ipt_mixed', 'ipt_mixed'],
  ['king of the court', 'kotc'],
  ['kotc', 'kotc'],
  ['round robin', 'classic'],
  ['swiss', 'swiss'],
]);

function normalizeSupportedCodes(supportedCodes?: Iterable<string>): Set<string> {
  if (!supportedCodes) return DEFAULT_SUPPORTED_TOURNAMENT_FORMAT_CODES;
  if (supportedCodes instanceof Set) return supportedCodes;
  return new Set(Array.from(supportedCodes, (code) => String(code || '').trim().toLowerCase()).filter(Boolean));
}

export function getTournamentFormatCode(
  format: unknown,
  supportedCodes?: Iterable<string>
): string | null {
  const normalized = String(format || '').trim().toLowerCase();
  if (!normalized) return null;
  const code = TOURNAMENT_FORMAT_CODE_ALIASES.get(normalized);
  if (!code) return null;
  return normalizeSupportedCodes(supportedCodes).has(code) ? code : null;
}

export function normalizeTournamentDbTime(value: unknown): string | null {
  const normalized = String(value || '').trim();
  return normalized || null;
}
