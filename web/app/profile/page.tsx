import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import type { TournamentResult, RatingHistoryEntry } from '@/lib/types';
import {
  fetchPlayer,
  fetchPlayerMatches,
  fetchRatingHistory,
  fetchPlayerExtendedStats,
  findPlayerIdsByName,
  type PlayerExtendedStats,
} from '@/lib/queries';
import EpicProfile from '@/components/players/EpicProfile';
import PartnerInbox from '@/components/profile/PartnerInbox';
import TelegramLinkForm from '@/components/profile/TelegramLinkForm';
import PlayerAuthPanel from '@/components/profile/PlayerAuthPanel';
import PlayerPhotoUploadForm from '@/components/profile/PlayerPhotoUploadForm';
import LogoutButton from '@/components/profile/LogoutButton';
import MyAccountCard from '@/components/profile/MyAccountCard';
import ProfileAccordion from '@/components/profile/ProfileAccordion';
import ProfileLinkPlayerForm from '@/components/profile/ProfileLinkPlayerForm';
import { verifyPlayerToken } from '@/lib/player-auth';
import { resolvePlayerIdForAccount } from '@/lib/profile-link';

export const metadata: Metadata = {
  title: 'Профиль | Лютые Пляжники',
  description: 'Личный кабинет игрока: рейтинги, статистика, турнирная история.',
};

interface ProfilePageProps {
  searchParams?: Promise<{ id?: string }>;
}

interface LoadedProfileData {
  playerId: string;
  player: NonNullable<Awaited<ReturnType<typeof fetchPlayer>>>;
  matches: TournamentResult[];
  ratingHistory: RatingHistoryEntry[];
  stats: PlayerExtendedStats;
}

function emptyLevelBucket() {
  return { gold: 0, silver: 0, bronze: 0, total: 0 };
}

function emptyFormatBucket() {
  return { total: 0, rating: 0, gold: 0 };
}

function emptyPlayerStats(): PlayerExtendedStats {
  return {
    totalTournaments: 0,
    gold: 0,
    silver: 0,
    bronze: 0,
    topThreeRate: 0,
    avgPlace: 0,
    bestPlace: 0,
    totalRatingPts: 0,
    avgRatingPts: 0,
    winRate: 0,
    totalWins: 0,
    totalBalls: 0,
    avgBalls: 0,
    bestTournament: null,
    currentStreak: { type: 'none', count: 0 },
    rankM: null,
    rankW: null,
    rankMix: null,
    formLast5: [],
    levelPrizes: {
      hard: emptyLevelBucket(),
      advanced: emptyLevelBucket(),
      medium: emptyLevelBucket(),
      light: emptyLevelBucket(),
    },
    formatStats: {
      kotc: emptyFormatBucket(),
      double: emptyFormatBucket(),
      thai: emptyFormatBucket(),
    },
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

async function loadProfileData(playerId: string): Promise<LoadedProfileData | null> {
  if (!isUuid(playerId)) return null;

  let player = null;
  try {
    player = await fetchPlayer(playerId);
  } catch {
    player = null;
  }
  if (!player) return null;

  let matches: TournamentResult[] = [];
  let ratingHistory: RatingHistoryEntry[] = [];
  let stats: PlayerExtendedStats = emptyPlayerStats();

  try {
    [matches, ratingHistory, stats] = await Promise.all([
      fetchPlayerMatches(playerId, 30),
      fetchRatingHistory(playerId, 30),
      fetchPlayerExtendedStats(playerId),
    ]);
  } catch {
    // Keep profile page alive even if one of the analytical queries fails.
  }

  return {
    playerId,
    player,
    matches,
    ratingHistory,
    stats,
  };
}

function SessionActionBar({
  me,
  loginHref,
  logoutRedirect,
  loginText,
}: {
  me: { id: number; email: string } | null;
  loginHref: string;
  logoutRedirect: string;
  loginText: string;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-surface-light/20 p-3.5 md:p-4">
      {me?.id ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-body text-text-secondary">Вы вошли в личный кабинет.</p>
          <LogoutButton redirectTo={logoutRedirect} />
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-body text-text-secondary">{loginText}</p>
          <Link href={loginHref} className="btn-action-outline">
            Войти / Регистрация
          </Link>
        </div>
      )}
    </section>
  );
}

function SettingsSection({
  title,
  subtitle,
  children,
  first = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  first?: boolean;
}) {
  return (
    <section className={first ? '' : 'border-t border-white/10 pt-5'}>
      <div className="mb-3">
        <h3 className="font-heading text-xl text-text-primary tracking-wide">{title}</h3>
        {subtitle ? <p className="mt-1 text-sm font-body text-text-secondary">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function SettingsPanel({
  title,
  subtitle,
  sections,
}: {
  title: string;
  subtitle: string;
  sections: Array<{ title: string; subtitle?: string; content: ReactNode }>;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-surface-light/20 p-4 md:p-5">
      <div>
        <h2 className="font-heading text-2xl text-text-primary tracking-wide">{title}</h2>
        <p className="mt-1 text-sm font-body text-text-secondary">{subtitle}</p>
      </div>

      <div className="mt-5 space-y-5">
        {sections.map((section, index) => (
          <SettingsSection
            key={section.title}
            title={section.title}
            subtitle={section.subtitle}
            first={index === 0}
          >
            {section.content}
          </SettingsSection>
        ))}
      </div>
    </section>
  );
}

function ProfileSummarySection({
  title,
  subtitle,
  content,
}: {
  title: string;
  subtitle: string;
  content: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-heading text-2xl text-text-primary tracking-wide">{title}</h2>
        <p className="mt-1 text-sm font-body text-text-secondary">{subtitle}</p>
      </div>
      {content}
    </section>
  );
}

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
  const params = (await searchParams) ?? {};
  const rawId = (params.id || '').trim();
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('player_session')?.value;
  const me = sessionToken ? verifyPlayerToken(sessionToken) : null;

  if (!rawId) {
    let ownProfile: LoadedProfileData | null = null;

    if (me?.id) {
      const resolvedOwnPlayerId = await resolvePlayerIdForAccount(me.id);
      if (resolvedOwnPlayerId) {
        ownProfile = await loadProfileData(resolvedOwnPlayerId);
      }
    }

    return (
      <main className="mx-auto max-w-5xl space-y-4 px-4 py-6 md:py-8">
        <div>
          <h1 className="font-heading text-4xl text-text-primary tracking-wide uppercase md:text-5xl">
            Профиль
          </h1>
          <p className="mt-1 font-body text-text-secondary">Личный кабинет игрока.</p>
        </div>

        {me?.id ? (
          <SessionActionBar
            me={me}
            loginHref="/login?returnTo=%2Fprofile"
            logoutRedirect="/profile"
            loginText="Чтобы управлять профилем, войдите в аккаунт."
          />
        ) : null}

        {me?.id ? (
          <>
            <SettingsPanel
              title="Настройки профиля"
              subtitle="Аккаунт, привязка карточки игрока, фото и связи собраны в одном блоке."
              sections={[
                {
                  title: 'Аккаунт',
                  subtitle: 'Контакты и данные текущей авторизации',
                  content: <MyAccountCard embedded />,
                },
                {
                  title: 'Привязка игрока',
                  subtitle: ownProfile
                    ? 'Карточка найдена. Здесь можно закрепить её явно или сменить привязку.'
                    : 'Закрепите свою карточку игрока, чтобы кабинет всегда открывался правильно.',
                  content: <ProfileLinkPlayerForm embedded />,
                },
                {
                  title: 'Фото',
                  subtitle: 'Обновите аватар в аккаунте и карточке игрока.',
                  content: <PlayerPhotoUploadForm playerId={ownProfile?.playerId} embedded />,
                },
                {
                  title: 'Связи',
                  subtitle: 'Запросы на пару и Telegram-уведомления.',
                  content: (
                    <div className="space-y-4">
                      <PartnerInbox embedded />
                      <TelegramLinkForm embedded />
                    </div>
                  ),
                },
              ]}
            />

            <ProfileSummarySection
              title="Моя статистика и история"
              subtitle={
                ownProfile
                  ? 'Открыто автоматически по вашей учетной записи.'
                  : 'Сначала привяжите карточку игрока в блоке выше.'
              }
              content={
                ownProfile ? (
                  <EpicProfile
                    player={ownProfile.player}
                    stats={ownProfile.stats}
                    matches={ownProfile.matches}
                    ratingHistory={ownProfile.ratingHistory}
                    backLink={{ href: '/rankings', label: '← Рейтинги' }}
                  />
                ) : (
                  <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm font-body text-amber-100">
                    Не удалось автоматически найти ваш профиль игрока. Привяжите карточку в блоке
                    выше или откройте профиль вручную через поиск ниже либо через страницу{' '}
                    <Link href="/rankings" className="underline">
                      рейтингов
                    </Link>
                    .
                  </div>
                )
              }
            />
          </>
        ) : (
          <ProfileAccordion
            title="Вход и регистрация"
            subtitle="Создайте аккаунт или войдите, чтобы видеть свой кабинет"
            defaultOpen
          >
            <PlayerAuthPanel initialMode="login" redirectTo="/profile" />
          </ProfileAccordion>
        )}

        <section className="rounded-xl border border-white/10 bg-surface-light/20 p-4 md:p-5">
          <h2 className="font-heading text-2xl text-text-primary tracking-wide">
            Найти профиль игрока
          </h2>
          <p className="mt-1 text-sm font-body text-text-secondary">
            Перейдите в{' '}
            <Link href="/rankings" className="text-brand hover:underline">
              рейтинги
            </Link>{' '}
            и нажмите на своё имя, либо введите ID/имя игрока вручную.
          </p>

          <form method="get" action="/profile" className="mt-4">
            <label className="block text-xs font-body uppercase tracking-widest text-text-secondary">
              ID или имя игрока
            </label>
            <input
              name="id"
              placeholder="Напр. Лебедев или UUID"
              className="mt-2 w-full rounded-xl border border-white/10 bg-surface px-4 py-3 font-body text-text-primary outline-none transition-colors focus:border-brand"
            />
            <button type="submit" className="btn-action-outline mt-4 w-full sm:w-auto">
              Открыть профиль
            </button>
          </form>
        </section>
      </main>
    );
  }

  let playerId = rawId;
  let resolvedByName = false;
  if (!isUuid(rawId)) {
    const ids = await findPlayerIdsByName(rawId, 2);
    if (ids.length === 1) {
      playerId = ids[0];
      resolvedByName = true;
    } else if (ids.length > 1) {
      return (
        <main className="mx-auto max-w-4xl px-4 py-10">
          <div className="glass-panel rounded-2xl border border-white/10 p-8 text-center">
            <div className="mb-3 text-4xl">{'\u{1F50E}'}</div>
            <h2 className="font-heading text-3xl text-text-primary">Найдено несколько игроков</h2>
            <p className="mt-2 text-sm font-body text-text-secondary">
              Уточните запрос: <span className="text-text-primary/90">{rawId}</span>
            </p>
            <Link href="/rankings" className="btn-action-outline mt-6 inline-block">
              Выбрать в рейтингах
            </Link>
          </div>
        </main>
      );
    } else {
      return (
        <main className="mx-auto max-w-4xl px-4 py-10">
          <div className="glass-panel rounded-2xl border border-white/10 p-8 text-center">
            <div className="mb-3 text-4xl">{'\u{1F6AB}'}</div>
            <h2 className="font-heading text-3xl text-text-primary">Игрок не найден</h2>
            <p className="mt-2 text-sm font-body text-text-secondary">
              По запросу <span className="text-text-primary/90">{rawId}</span> нет совпадений.
            </p>
            <Link href="/rankings" className="btn-action-outline mt-6 inline-block">
              К рейтингам
            </Link>
          </div>
        </main>
      );
    }
  }

  const profile = await loadProfileData(playerId);
  if (!profile) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <div className="glass-panel rounded-2xl border border-white/10 p-8 text-center">
          <div className="mb-3 text-4xl">{'\u{1F6AB}'}</div>
          <h2 className="font-heading text-3xl text-text-primary">Игрок не найден</h2>
          <p className="mt-2 text-sm font-body text-text-secondary">
            Проверьте ID или имя и попробуйте ещё раз.
          </p>
          <Link href="/rankings" className="btn-action-outline mt-6 inline-block">
            К рейтингам
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <SessionActionBar
        me={me}
        loginHref={`/login?returnTo=${encodeURIComponent(`/profile?id=${playerId}`)}`}
        logoutRedirect={`/profile?id=${encodeURIComponent(playerId)}`}
        loginText="Нет доступа к личному кабинету? Войдите в аккаунт."
      />

      {resolvedByName ? (
        <div className="rounded-xl border border-brand/30 bg-brand/10 px-4 py-3 text-sm font-body text-brand-light">
          Профиль открыт по поиску имени: <span className="font-semibold">{rawId}</span>
        </div>
      ) : null}

      {me?.id ? (
        <SettingsPanel
          title="Настройки профиля"
          subtitle="Для открытого игрока доступны ваши действия по аккаунту, привязке и фото."
          sections={[
            {
              title: 'Аккаунт',
              subtitle: 'Данные текущей авторизации.',
              content: <MyAccountCard embedded />,
            },
            {
              title: 'Привязка игрока',
              subtitle: 'Можно закрепить именно этого игрока за вашим аккаунтом.',
              content: (
                <ProfileLinkPlayerForm
                  embedded
                  targetPlayerId={playerId}
                  targetPlayerName={profile.player.name}
                  loginHref={`/login?returnTo=${encodeURIComponent(`/profile?id=${playerId}`)}`}
                />
              ),
            },
            {
              title: 'Фото',
              subtitle: 'Обновление фото для аккаунта и карточки игрока.',
              content: <PlayerPhotoUploadForm playerId={playerId} embedded />,
            },
          ]}
        />
      ) : null}

      <ProfileSummarySection
        title="Статистика и история игрока"
        subtitle={`Игрок: ${profile.player.name}`}
        content={
          <EpicProfile
            player={profile.player}
            stats={profile.stats}
            matches={profile.matches}
            ratingHistory={profile.ratingHistory}
            backLink={{ href: '/rankings', label: '← Рейтинги' }}
          />
        }
      />
    </main>
  );
}
