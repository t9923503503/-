import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import LogoutButton from '@/components/profile/LogoutButton';
import PlayerAuthPanel from '@/components/profile/PlayerAuthPanel';
import { getAccessSummaryFromCookies } from '@/lib/access-summary';
import { isTelegramWebAuthAvailable } from '@/lib/telegram-web-auth';
import { isVkIdAvailable } from '@/lib/vk-id';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Личный кабинет | Лютые Пляжники',
  description: 'Вход в личный кабинет игрока LPVOLLEY: профиль, статистика и турниры.',
  robots: { index: false, follow: false },
  alternates: { canonical: 'https://lpvolley.ru/cabinet' },
};

function adminRoleLabel(role: 'admin' | 'operator' | 'viewer'): string {
  if (role === 'admin') return 'администратор';
  if (role === 'operator') return 'оператор';
  return 'наблюдатель';
}

export default async function CabinetPage() {
  const summary = await getAccessSummaryFromCookies();

  return (
    <main className="cabinet-page mx-auto w-full max-w-[1180px] px-4 py-8 md:py-12">
      {summary.admin ? (
        <section className="cabinet-access-banner" aria-label="Активный административный доступ">
          <div className="cabinet-access-copy">
            <span>Активная роль</span>
            <strong>Вы вошли как {adminRoleLabel(summary.admin.role)}</strong>
          </div>
          <div className="cabinet-access-actions">
            <Link href="/admin" className="cabinet-access-primary">Открыть панель</Link>
            <LogoutButton
              scope="admin"
              redirectTo="/cabinet"
              className="cabinet-access-secondary"
            />
            {!summary.player ? (
              <a href="#player-login" className="cabinet-access-link">Подключить профиль игрока</a>
            ) : null}
            {summary.judgeApproved ? (
              <Link href="/court" className="cabinet-access-link">Судейский доступ активен</Link>
            ) : null}
          </div>
        </section>
      ) : summary.judgeApproved ? (
        <section className="cabinet-access-banner" aria-label="Активный судейский доступ">
          <div className="cabinet-access-copy">
            <span>Активная роль</span>
            <strong>Судейский доступ активен</strong>
          </div>
          <div className="cabinet-access-actions">
            <Link href="/court" className="cabinet-access-primary">Открыть судейский вход</Link>
          </div>
        </section>
      ) : null}

      <section className="cabinet-login-shell">
        <div id="player-login" className="cabinet-login-pane">
          <div className="cabinet-login-content">
            {summary.player ? (
              <section className="cabinet-player-session" aria-labelledby="cabinet-player-title">
                <div className="cabinet-auth-kicker">Личный кабинет игрока</div>
                <h1 id="cabinet-player-title" className="cabinet-auth-title">
                  Вы вошли как {summary.player.displayName}
                </h1>
                <p className="cabinet-auth-lead">
                  Профиль, статистика, заявки на турниры и ваши игры уже доступны.
                </p>
                <div className="cabinet-player-actions">
                  <Link href="/profile" className="cabinet-auth-submit">Открыть профиль</Link>
                  <LogoutButton redirectTo="/cabinet" className="cabinet-player-logout" />
                </div>
              </section>
            ) : (
              <PlayerAuthPanel
                redirectTo="/cabinet"
                initialMode="login"
                appearance="compact"
                telegramAuthEnabled={isTelegramWebAuthAvailable()}
                vkIdEnabled={isVkIdAvailable()}
              />
            )}

            <nav className="cabinet-other-access" aria-label="Другой способ входа">
              <span>Другой способ входа</span>
              <Link href={summary.judgeApproved ? '/court' : '/sudyam/login?returnTo=%2Fcabinet'}>
                {summary.judgeApproved ? 'Открыть судейский вход' : 'Вход для судей по PIN'}
                <span aria-hidden="true"> →</span>
              </Link>
            </nav>
          </div>
        </div>

        <aside className="cabinet-sport-visual" aria-label="Пляжный волейбол">
          <Image
            src="/images/cabinet/login-hero.webp"
            alt=""
            fill
            priority
            sizes="(min-width: 1024px) 54vw, 0px"
            className="cabinet-sport-photo"
          />
          <div className="cabinet-sport-shade" />
          <svg className="cabinet-court-lines" viewBox="0 0 600 720" fill="none" aria-hidden="true">
            <path d="M62 646 242 388h238l72 258H62Z" />
            <path d="m242 388 30 258M480 388 370 646M165 517h351" />
            <path className="cabinet-ball-path" d="M428 116c-60 12-110 50-142 110-18 34-25 70-23 108" />
            <circle cx="428" cy="116" r="10" />
          </svg>
          <div className="cabinet-sport-copy">
            <span>LPVOLLEY.RU</span>
            <p>Играй.<br />Побеждай.<br /><strong>Поднимайся в рейтинге.</strong></p>
          </div>
        </aside>
      </section>
    </main>
  );
}
