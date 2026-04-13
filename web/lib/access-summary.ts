import { getPool } from '@/lib/db';
import { getAuthStatus } from '@/lib/auth';
import { getAdminSessionFromCookies, type AdminActor, type AdminRole } from '@/lib/admin-auth';
import { PLAYER_COOKIE, verifyPlayerToken } from '@/lib/player-auth';
import { cookies } from 'next/headers';

export interface AccessSummaryPlayer {
  id: number;
  email: string;
  fullName: string | null;
  nickname: string | null;
  displayName: string;
}

export interface AccessSummary {
  player: AccessSummaryPlayer | null;
  admin: AdminActor | null;
  judgeApproved: boolean;
}

function normalizeDisplayName(value: string | null | undefined): string {
  return String(value || '').trim();
}

function roleLabel(role: AdminRole): string {
  switch (role) {
    case 'admin':
      return 'Администратор';
    case 'operator':
      return 'Оператор';
    default:
      return 'Наблюдатель';
  }
}

async function loadPlayerSummaryFromCookies(): Promise<AccessSummaryPlayer | null> {
  const store = await cookies();
  const token = store.get(PLAYER_COOKIE)?.value;
  if (!token) return null;

  const payload = verifyPlayerToken(token);
  if (!payload) return null;

  let fullName: string | null = null;
  let nickname: string | null = null;

  try {
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT full_name, nickname FROM users WHERE id = $1 LIMIT 1',
      [payload.id]
    );
    fullName = rows[0]?.full_name ? String(rows[0].full_name) : null;
    nickname = rows[0]?.nickname ? String(rows[0].nickname) : null;
  } catch {
    // Player session should still work even if the profile query fails.
  }

  const emailPrefix = String(payload.email || '').split('@')[0] || 'Игрок';
  const displayName =
    normalizeDisplayName(nickname) ||
    normalizeDisplayName(fullName) ||
    normalizeDisplayName(emailPrefix) ||
    'Игрок';

  return {
    id: payload.id,
    email: payload.email,
    fullName,
    nickname,
    displayName,
  };
}

export async function getAccessSummaryFromCookies(): Promise<AccessSummary> {
  const [player, admin, judgeStatus] = await Promise.all([
    loadPlayerSummaryFromCookies(),
    getAdminSessionFromCookies(),
    getAuthStatus(),
  ]);

  return {
    player,
    admin,
    judgeApproved: judgeStatus === 'approved',
  };
}

export function getAccessLabels(summary: AccessSummary): string[] {
  const labels: string[] = [];

  if (summary.player) {
    labels.push('Игрок');
  }
  if (summary.judgeApproved) {
    labels.push('Судья');
  }
  if (summary.admin) {
    labels.push(roleLabel(summary.admin.role));
  }

  return labels;
}

export function getAccessDisplayName(summary: AccessSummary): string {
  if (summary.player?.displayName) {
    return summary.player.displayName;
  }
  if (summary.admin) {
    return roleLabel(summary.admin.role);
  }
  if (summary.judgeApproved) {
    return 'Судейский доступ';
  }
  return 'Вход на сайт';
}

export function getAccessSubtitle(summary: AccessSummary): string {
  const labels = getAccessLabels(summary);
  if (labels.length > 0) {
    return labels.join(' • ');
  }
  return 'Регистрация';
}

export function hasAnyAccess(summary: AccessSummary): boolean {
  return Boolean(summary.player || summary.admin || summary.judgeApproved);
}

