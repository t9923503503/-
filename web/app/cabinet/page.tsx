import type { Metadata } from 'next';
import Link from 'next/link';
import PlayerAuthPanel from '@/components/profile/PlayerAuthPanel';
import {
  getAccessDisplayName,
  getAccessLabels,
  getAccessSummaryFromCookies,
  hasAnyAccess,
} from '@/lib/access-summary';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Личный кабинет | Лютые Пляжники',
  description: 'Единый кабинет игрока, судьи и администратора с доступами по текущей роли.',
};

function roleTone(label: string): string {
  if (label === 'Игрок') return 'border-cyan-400/35 bg-cyan-400/12 text-cyan-100';
  if (label === 'Судья') return 'border-amber-400/35 bg-amber-400/12 text-amber-100';
  return 'border-brand/35 bg-brand/12 text-orange-100';
}

function AccessCard({
  eyebrow,
  title,
  description,
  href,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  action: string;
}) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,23,34,0.98),rgba(10,13,20,0.98))] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
      <div className="text-[11px] uppercase tracking-[0.32em] text-slate-500">{eyebrow}</div>
      <h2 className="mt-3 text-3xl font-black uppercase tracking-[-0.04em] text-white">{title}</h2>
      <p className="mt-3 text-sm leading-7 text-white/72">{description}</p>
      <Link href={href} className="btn-action-outline mt-6 inline-flex items-center justify-center">
        {action}
      </Link>
    </section>
  );
}

export default async function CabinetPage() {
  const summary = await getAccessSummaryFromCookies();
  const accessLabels = getAccessLabels(summary);
  const active = hasAnyAccess(summary);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 md:py-14">
      <section className="overflow-hidden rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(0,209,255,0.14),transparent_32%),radial-gradient(circle_at_top_right,rgba(255,90,0,0.18),transparent_32%),linear-gradient(180deg,rgba(10,13,20,0.98),rgba(7,11,20,0.98))] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.32)] md:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl">
            <div className="text-[11px] uppercase tracking-[0.34em] text-cyan-300/75">Account Hub</div>
            <h1 className="mt-3 text-4xl font-black uppercase tracking-[-0.05em] text-white md:text-6xl">
              Личный кабинет
            </h1>
            <p className="mt-4 text-sm leading-7 text-white/74 md:text-base">
              Один вход для публичного сайта. После авторизации здесь собираются доступы игрока,
              судьи и администратора в зависимости от вашей текущей сессии.
            </p>
          </div>

          <div className="rounded-[26px] border border-white/12 bg-white/5 p-4 md:min-w-[280px]">
            <div className="text-[10px] uppercase tracking-[0.28em] text-white/56">
              {active ? 'Активный доступ' : 'Статус'}
            </div>
            <div className="mt-2 text-2xl font-bold text-white">{getAccessDisplayName(summary)}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {accessLabels.length ? (
                accessLabels.map((label) => (
                  <span
                    key={label}
                    className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] ${roleTone(label)}`}
                  >
                    {label}
                  </span>
                ))
              ) : (
                <span className="rounded-full border border-white/12 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-white/72">
                  Гость
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {!active ? (
        <section className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <PlayerAuthPanel redirectTo="/cabinet" initialMode="login" />

          <div className="grid gap-6">
            <AccessCard
              eyebrow="Судейская"
              title="Судьям"
              description="Вход по PIN для live-управления матчами и перехода в рабочее судейское пространство."
              href="/sudyam/login?returnTo=%2Fcabinet"
              action="Войти как судья"
            />
            <AccessCard
              eyebrow="Операторская"
              title="Админ-панель"
              description="Вход для оператора, наблюдателя или администратора турниров. Уровень доступа определяется вашей ролью."
              href="/admin/login"
              action="Войти в админку"
            />
          </div>
        </section>
      ) : (
        <section className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {summary.player ? (
            <AccessCard
              eyebrow="Игрок"
              title={summary.player.displayName}
              description={`Аккаунт игрока подключен. Email: ${summary.player.email}. Здесь можно открыть профиль, статистику и управление своей карточкой.`}
              href="/profile"
              action="Открыть профиль игрока"
            />
          ) : (
            <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,23,34,0.98),rgba(10,13,20,0.98))] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
              <div className="text-[11px] uppercase tracking-[0.32em] text-slate-500">Игрок</div>
              <h2 className="mt-3 text-3xl font-black uppercase tracking-[-0.04em] text-white">
                Подключить игрока
              </h2>
              <p className="mt-3 text-sm leading-7 text-white/72">
                У вас ещё нет player-сессии. Можно сразу войти или зарегистрироваться, не теряя остальные доступы.
              </p>
              <div className="mt-6">
                <PlayerAuthPanel redirectTo="/cabinet" initialMode="login" />
              </div>
            </section>
          )}

          {summary.judgeApproved ? (
            <AccessCard
              eyebrow="Судья"
              title="Судейский доступ"
              description="PIN подтверждён. Можно открыть вход по активным кортам или единое судейское рабочее место."
              href="/court"
              action="Открыть судейский вход"
            />
          ) : (
            <AccessCard
              eyebrow="Судья"
              title="Вход по PIN"
              description="Судейский доступ хранится отдельно. После входа по PIN здесь откроются ссылки на корты и live-рабочее место."
              href="/sudyam/login?returnTo=%2Fcabinet"
              action="Войти как судья"
            />
          )}

          {summary.admin ? (
            <AccessCard
              eyebrow="Операторская"
              title={summary.admin.role === 'admin' ? 'Администратор' : summary.admin.role === 'operator' ? 'Оператор' : 'Наблюдатель'}
              description={`Admin-сессия активна. Actor ID: ${summary.admin.id}. Доступ в панель и API уже выдан по вашей роли.`}
              href="/admin"
              action="Открыть админ-панель"
            />
          ) : (
            <AccessCard
              eyebrow="Операторская"
              title="Админ-доступ"
              description="Для операторского контура нужен отдельный вход по роли. После него здесь появится быстрый переход в админку."
              href="/admin/login"
              action="Войти в админку"
            />
          )}
        </section>
      )}
    </main>
  );
}

