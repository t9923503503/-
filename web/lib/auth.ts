import { cookies } from 'next/headers';

export const COOKIE_NAME = 'sudyam_session';

export type AuthStatus = 'unauthenticated' | 'approved';

/** Проверяет cookie в Server Component */
export async function getAuthStatus(): Promise<AuthStatus> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return 'unauthenticated';
  return token === process.env.SUDYAM_PIN ? 'approved' : 'unauthenticated';
}
