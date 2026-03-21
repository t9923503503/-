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
