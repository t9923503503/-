import { redirect } from 'next/navigation';
import { getAdminSessionFromCookies } from '@/lib/admin-auth';
import { isLegacyModeActive, parseAdminCredentialsFromJson } from '@/lib/admin-auth-policy';

export const dynamic = 'force-dynamic';

type AdminLoginSearchParams = Promise<{
  error?: string;
}>;

const ERROR_MESSAGES: Record<string, string> = {
  invalid: 'Неверный PIN или ID',
  server: 'Ошибка сервера. Попробуйте ещё раз.',
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: AdminLoginSearchParams;
}) {
  const actor = await getAdminSessionFromCookies();
  if (actor) {
    redirect('/admin');
  }

  const resolvedSearchParams = await searchParams;
  const errorCode = String(resolvedSearchParams?.error || '').trim();
  const error = errorCode ? ERROR_MESSAGES[errorCode] || ERROR_MESSAGES.server : '';
  const actorCredentials = parseAdminCredentialsFromJson(String(process.env.ADMIN_CREDENTIALS_JSON || ''));
  const legacyModeWarning = isLegacyModeActive({
    nodeEnv: String(process.env.NODE_ENV || ''),
    overrideFlag: String(process.env.ADMIN_ALLOW_LEGACY_PIN || 'true'),
    actorCredentialsCount: actorCredentials.length,
    adminPin: String(process.env.ADMIN_PIN || ''),
    operatorPin: String(process.env.ADMIN_OPERATOR_PIN || ''),
    viewerPin: String(process.env.ADMIN_VIEWER_PIN || ''),
  });

  return (
    <main className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4">
      <form
        action="/api/admin/auth"
        method="post"
        className="w-full max-w-sm rounded-2xl border border-white/15 bg-white/5 p-6 flex flex-col gap-4"
      >
        <h1 className="font-heading text-4xl leading-none tracking-wide text-center">Admin Login</h1>
        <input
          type="text"
          name="id"
          placeholder="ID (если настроен)"
          autoComplete="username"
          className="px-4 py-3 rounded-lg bg-surface border border-white/20 focus:outline-none focus:border-brand text-center"
        />
        <input
          type="password"
          name="pin"
          placeholder="Введите PIN"
          autoComplete="current-password"
          required
          className="px-4 py-3 rounded-lg bg-surface border border-white/20 focus:outline-none focus:border-brand text-center text-xl"
        />
        {error ? <p className="text-sm text-red-400 text-center">{error}</p> : null}
        {legacyModeWarning ? (
          <p className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100 text-center">
            Legacy PIN mode is active. Configure actor credentials or explicit env PINs.
          </p>
        ) : null}
        <button
          type="submit"
          className="px-4 py-3 rounded-lg bg-brand text-surface font-semibold"
        >
          Войти
        </button>
      </form>
    </main>
  );
}
