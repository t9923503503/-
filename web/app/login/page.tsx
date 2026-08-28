import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import PlayerAuthPanel from '@/components/profile/PlayerAuthPanel';
import LogoutButton from '@/components/profile/LogoutButton';
import { normalizeAuthReturnTo } from '@/lib/auth-return-to';
import { PLAYER_COOKIE, verifyPlayerToken } from '@/lib/player-auth';
import { isTelegramWebAuthAvailable } from '@/lib/telegram-web-auth';
import { isVkIdAvailable } from '@/lib/vk-id';

export const metadata: Metadata = {
  title: 'Вход в личный кабинет | Лютые Пляжники',
  description: 'Вход в личный кабинет игрока LPVOLLEY.',
};

interface LoginPageProps {
  searchParams?: Promise<{ returnTo?: string; error?: string }>;
}

const TELEGRAM_ERRORS: Record<string, string> = {
  telegram_link: 'Ссылка Telegram повреждена. Начните вход заново.',
  telegram_link_expired: 'Ссылка для входа истекла или уже использована. Начните вход заново.',
  telegram_account: 'Не удалось найти Telegram-аккаунт. Запустите вход ещё раз.',
  telegram_login: 'Временная ошибка входа через Telegram. Повторите попытку.',
  telegram_unavailable: 'Вход через Telegram временно недоступен. Повторите попытку чуть позже.',
  telegram_rate_limited: 'Слишком много попыток входа. Подождите несколько минут и попробуйте снова.',
  telegram_account_switch: 'В браузере уже открыт другой аккаунт. Сначала выйдите из него.',
  telegram_beta_closed: 'Вход через Telegram временно недоступен.',
  vk_cancelled: 'Вход через VK ID отменён. Можно попробовать ещё раз.',
  vk_expired: 'Попытка входа через VK ID истекла. Начните заново.',
  vk_login: 'Не удалось завершить вход через VK ID. Попробуйте ещё раз.',
  vk_unavailable: 'VK ID временно недоступен.',
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = (await searchParams) ?? {};
  const returnTo = normalizeAuthReturnTo(params.returnTo);
  const telegramError = params.error ? TELEGRAM_ERRORS[params.error] : undefined;
  const telegramAuthEnabled = isTelegramWebAuthAvailable();
  const vkIdEnabled = isVkIdAvailable();
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(PLAYER_COOKIE)?.value;
  const me = sessionToken ? verifyPlayerToken(sessionToken) : null;

  return (
    <main className="max-w-xl mx-auto px-4 py-16">
      <h1 className="font-heading text-5xl text-text-primary tracking-wide uppercase text-center">
        Личный кабинет
      </h1>
      <p className="mt-3 font-body text-text-secondary text-center text-sm">
        {vkIdEnabled
          ? 'Быстрый вход через VK ID без email и пароля.'
          : 'Входите через Telegram или по email и паролю.'}
      </p>

      {me?.id ? (
        <section className="mt-8 rounded-2xl border border-white/10 bg-surface-light/20 p-6 text-center">
          {telegramError ? (
            <p role="alert" className="mb-4 rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
              {telegramError}
            </p>
          ) : null}
          <p className="font-body text-text-primary">Вы уже авторизованы.</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <a href={returnTo} className="btn-action-outline">
              {returnTo.startsWith('/partner/') ? 'Вернуться к игре' : 'Открыть кабинет'}
            </a>
            <LogoutButton redirectTo="/profile" />
          </div>
        </section>
      ) : (
        <PlayerAuthPanel
          redirectTo={returnTo}
          initialMode="login"
          telegramAuthEnabled={telegramAuthEnabled}
          vkIdEnabled={vkIdEnabled}
          initialNotice={telegramError ? { type: 'error', text: telegramError } : null}
        />
      )}
    </main>
  );
}
