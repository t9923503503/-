import type { AdminRole } from './admin-auth';

export interface ParsedAdminCredential {
  id: string;
  pin: string;
  role: AdminRole;
}

export function parseAdminCredentialsFromJson(raw: string): ParsedAdminCredential[] {
  const text = String(raw || '').trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    const out: ParsedAdminCredential[] = [];
    parsed.forEach((item) => {
      const id = String(item?.id || '').trim();
      const pin = String(item?.pin || '').trim();
      const roleRaw = String(item?.role || '').trim();
      const role = roleRaw === 'admin' || roleRaw === 'operator' || roleRaw === 'viewer' ? roleRaw : null;
      if (id && pin && role) out.push({ id, pin, role });
    });
    return out;
  } catch {
    return [];
  }
}

export function allowLegacyPins(nodeEnv: string, overrideFlag: string): boolean {
  return nodeEnv !== 'production' || overrideFlag === 'true';
}

export function requireActorIdOnLogin(actorCredentialsCount: number): boolean {
  return Number(actorCredentialsCount || 0) > 0;
}

function hasPinValue(raw: string): boolean {
  return String(raw || '').trim().length > 0;
}

export function hasLegacyPinCredentials(input: {
  adminPin?: string;
  operatorPin?: string;
  viewerPin?: string;
}): boolean {
  return (
    hasPinValue(String(input.adminPin || '')) ||
    hasPinValue(String(input.operatorPin || '')) ||
    hasPinValue(String(input.viewerPin || ''))
  );
}

export function isLegacyModeActive(input: {
  nodeEnv: string;
  overrideFlag: string;
  actorCredentialsCount: number;
  adminPin?: string;
  operatorPin?: string;
  viewerPin?: string;
}): boolean {
  if (requireActorIdOnLogin(input.actorCredentialsCount)) return false;
  if (!allowLegacyPins(input.nodeEnv, input.overrideFlag)) return false;
  return hasLegacyPinCredentials(input);
}
