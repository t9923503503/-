import type { AdminActor } from '@/lib/admin-auth';

const BUILT_IN_ADMIN_PLAYER_EMAILS = ['sv-ugra@yandex.ru'] as const;

function normalizeEmail(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase();
}

function configuredAdminPlayerEmails(): Set<string> {
  const configured = String(process.env.ADMIN_PLAYER_EMAILS || '')
    .split(',')
    .map(normalizeEmail)
    .filter(Boolean);

  return new Set([
    ...BUILT_IN_ADMIN_PLAYER_EMAILS.map(normalizeEmail),
    ...configured,
  ]);
}

export function isAdminPlayerEmail(email: string | null | undefined): boolean {
  const normalized = normalizeEmail(email);
  return Boolean(normalized) && configuredAdminPlayerEmails().has(normalized);
}

export function createPlayerAdminActor(playerId: number): AdminActor {
  return {
    id: `player:${playerId}`,
    role: 'admin',
  };
}
