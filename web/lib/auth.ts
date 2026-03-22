import { cookies } from 'next/headers';

export const COOKIE_NAME = 'sudyam_session';
const FALLBACK_SUDYAM_PIN = '7319';

export type AuthStatus = 'unauthenticated' | 'approved';

/** Проверяет cookie в Server Component */
export async function getAuthStatus(): Promise<AuthStatus> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return 'unauthenticated';
  return token === String(process.env.SUDYAM_PIN || FALLBACK_SUDYAM_PIN) ? 'approved' : 'unauthenticated';
}
