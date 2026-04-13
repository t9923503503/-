import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import PlayerAuthPanel from '@/components/profile/PlayerAuthPanel';
import LogoutButton from '@/components/profile/LogoutButton';
import { verifyPlayerToken } from '@/lib/player-auth';

export const metadata: Metadata = {
  title: 'Вход и регистрация | Лютые Пляжники',
  description: 'Войдите или зарегистрируйтесь, чтобы записываться на турниры и искать пару.',
};

interface LoginPageProps {
  searchParams?: Promise<{ returnTo?: string }>;
}

function normalizeReturnTo(value: string | undefined): string {
  const candidate = String(value || '').trim();
  if (!candidate.startsWith('/')) return '/profile';
  if (candidate.startsWith('//')) return '/profile';
  return candidate;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = (await searchParams) ?? {};
  const returnTo = normalizeReturnTo(params.returnTo);

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('player_session')?.value;
  const me = sessionToken ? verifyPlayerToken(sessionToken) : null;

  return (
    <main className="max-w-xl mx-auto px-4 py-16">
      <h1 className="font-heading text-5xl text-text-primary tracking-wide uppercase text-center">
        Личный кабинет
      </h1>
      <p className="mt-3 font-body text-text-secondary text-center text-sm">
        Войдите или зарегистрируйтесь, чтобы управлять заявками и поиском пары.
      </p>

      {me?.id ? (
        <section className="mt-8 rounded-2xl border border-white/10 bg-surface-light/20 p-6 text-center">
          <p className="font-body text-text-primary">Вы уже авторизованы.</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <Link href={returnTo} className="btn-action-outline">
              Открыть кабинет
            </Link>
            <LogoutButton redirectTo="/profile" />
          </div>
        </section>
      ) : (
        <PlayerAuthPanel redirectTo={returnTo} initialMode="login" />
      )}
    </main>
  );
}
