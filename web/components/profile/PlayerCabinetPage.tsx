import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import type { TournamentResult, RatingHistoryEntry } from '@/lib/types';
import {
  fetchPlayer,
  fetchPlayerMatches,
  fetchRatingHistory,
  fetchPlayerExtendedStats,
  fetchPlayerFormatInsights,
  findPlayerIdsByName,
  type PlayerExtendedStats,
} from '@/lib/queries';
import { emptyPlayerFormatInsights, type PlayerFormatInsights } from '@/lib/player-format-insights';
import { getMyPlayAvailability, getPlayReliability } from '@/lib/play-service';
import EpicProfile from '@/components/players/EpicProfile';
import PlayAvailabilityWidget from '@/components/play/PlayAvailabilityWidget';
import PartnerInbox from '@/components/profile/PartnerInbox';
import PlayEntries from '@/components/profile/PlayEntries';
import PlayReliabilityCard from '@/components/profile/PlayReliabilityCard';
import TelegramLinkForm from '@/components/profile/TelegramLinkForm';
import PlayerAuthPanel from '@/components/profile/PlayerAuthPanel';
import { isVkIdAvailable } from '@/lib/vk-id';
import PlayerPhotoUploadForm from '@/components/profile/PlayerPhotoUploadForm';
import LogoutButton from '@/components/profile/LogoutButton';
import MyAccountCard from '@/components/profile/MyAccountCard';
import ProfileLinkPlayerForm from '@/components/profile/ProfileLinkPlayerForm';
import { PLAYER_COOKIE, verifyPlayerToken } from '@/lib/player-auth';
import { resolvePlayerIdForAccount } from '@/lib/profile-link';

const PROFILE_TABS = [
  { key: 'overview', label: 'Обзор' },
  { key: 'games', label: 'Игры' },
  { key: 'stats', label: 'Статистика' },
  { key: 'history', label: 'История' },
  { key: 'settings', label: 'Настройки' },
] as const;

type ProfileTab = (typeof PROFILE_TABS)[number]['key'];

interface PlayerCabinetPageProps {
  searchParams?: Promise<{ id?: string; tab?: string; avatarSetup?: string; returnTo?: string }>;
}

interface LoadedProfileData {
  playerId: string;
  player: NonNullable<Awaited<ReturnType<typeof fetchPlayer>>>;
  matches: TournamentResult[];
  ratingHistory: RatingHistoryEntry[];
  stats: PlayerExtendedStats;
  formatInsights: PlayerFormatInsights;
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
    rankDeltaM: null,
    rankDeltaW: null,
    rankDeltaMix: null,
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

function normalizeTab(value?: string): ProfileTab {
  return PROFILE_TABS.some((tab) => tab.key === value) ? (value as ProfileTab) : 'overview';
}

async function redirectLegacyPublicProfile(rawId: string): Promise<never> {
  if (isUuid(rawId)) redirect(`/players/${encodeURIComponent(rawId)}`);
  const ids = await findPlayerIdsByName(rawId, 2).catch(() => []);
  if (ids.length === 1) redirect(`/players/${encodeURIComponent(ids[0])}`);
  redirect('/rankings');
}

async function loadProfileData(playerId: string): Promise<LoadedProfileData | null> {
  if (!isUuid(playerId)) return null;
  const player = await fetchPlayer(playerId).catch(() => null);
  if (!player) return null;

  let matches: TournamentResult[] = [];
  let ratingHistory: RatingHistoryEntry[] = [];
  let stats = emptyPlayerStats();
  let formatInsights = emptyPlayerFormatInsights();
  try {
    [matches, ratingHistory, stats] = await Promise.all([
      fetchPlayerMatches(playerId, 30),
      fetchRatingHistory(playerId, 30),
      fetchPlayerExtendedStats(playerId),
    ]);
    formatInsights = await fetchPlayerFormatInsights(playerId, { player, matches, stats });
  } catch {
    // The cabinet remains usable when an analytical query is temporarily unavailable.
  }
  return { playerId, player, matches, ratingHistory, stats, formatInsights };
}

function Surface({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-surface-light/20 p-4 md:p-5">
      <h2 className="font-heading text-2xl tracking-wide text-text-primary">{title}</h2>
      {subtitle ? <p className="mt-1 text-sm text-text-secondary">{subtitle}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function MissingPlayerCard() {
  return (
    <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-5 text-sm text-amber-100">
      <h2 className="text-lg font-semibold">Привяжите карточку игрока</h2>
      <p className="mt-2 text-amber-100/80">
        Игры и настройки уже доступны. После привязки здесь появятся рейтинги, статистика и история турниров.
      </p>
      <Link href="/cabinet?tab=settings" className="mt-4 inline-flex rounded-xl bg-amber-200 px-4 py-2.5 font-semibold text-slate-950">
        Перейти к привязке
      </Link>
    </div>
  );
}

function SettingsPanel({
  ownProfile,
  avatarSetup,
  avatarReturnTo,
}: {
  ownProfile: LoadedProfileData | null;
  avatarSetup: 'upload' | 'telegram' | null;
  avatarReturnTo: string | null;
}) {
  const sections = [
    {
      id: 'profile-account',
      title: 'Аккаунт',
      subtitle: 'Контакты и данные текущей авторизации.',
      content: <MyAccountCard embedded />,
    },
    {
      id: 'profile-link',
      title: 'Привязка игрока',
      subtitle: ownProfile
        ? 'Карточка найдена. Здесь можно проверить или изменить привязку.'
        : 'Закрепите свою турнирную карточку за аккаунтом.',
      content: <ProfileLinkPlayerForm embedded />,
    },
    {
      id: 'profile-photo',
      title: 'Фото',
      subtitle: 'Кадрируйте и обновите аватар аккаунта и карточки игрока.',
      content: <PlayerPhotoUploadForm playerId={ownProfile?.playerId} embedded setupReturnTo={avatarSetup === 'upload' ? avatarReturnTo : null} />,
    },
    {
      id: 'profile-connections',
      title: 'Связи',
      subtitle: 'Запросы на пару и Telegram-уведомления.',
      content: (
        <div className="space-y-4">
          <PartnerInbox embedded />
          <TelegramLinkForm embedded setupReturnTo={avatarSetup === 'telegram' ? avatarReturnTo : null} />
        </div>
      ),
    },
  ];

  return (
    <Surface title="Настройки профиля" subtitle="Приватные данные и управление доступны только вам.">
      <div className="space-y-5">
        {sections.map((section, index) => (
          <section id={section.id} key={section.title} className={`scroll-mt-24 ${index ? 'border-t border-white/10 pt-5' : ''}`}>
            <h3 className="font-heading text-xl tracking-wide text-text-primary">{section.title}</h3>
            <p className="mt-1 text-sm text-text-secondary">{section.subtitle}</p>
            <div className="mt-3">{section.content}</div>
          </section>
        ))}
      </div>
    </Surface>
  );
}

export default async function PlayerCabinetPage({ searchParams }: PlayerCabinetPageProps) {
  const params = (await searchParams) ?? {};
  const legacyId = String(params.id || '').trim();
  if (legacyId) await redirectLegacyPublicProfile(legacyId);

  const tab = normalizeTab(params.tab);
  const avatarSetup = params.avatarSetup === 'upload' || params.avatarSetup === 'telegram' ? params.avatarSetup : null;
  const rawAvatarReturnTo = String(params.returnTo || '').trim();
  const avatarReturnTo = rawAvatarReturnTo.startsWith('/') && !rawAvatarReturnTo.startsWith('//')
    ? rawAvatarReturnTo
    : null;
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(PLAYER_COOKIE)?.value;
  const me = sessionToken ? verifyPlayerToken(sessionToken) : null;

  if (!me?.id) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8 md:py-12">
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand">Личный кабинет</p>
          <h1 className="mt-2 font-heading text-4xl uppercase tracking-wide text-text-primary md:text-5xl">Профиль игрока</h1>
          <p className="mt-2 text-text-secondary">Войдите, чтобы управлять играми, статистикой и настройками.</p>
        </header>
        <PlayerAuthPanel initialMode="login" redirectTo="/cabinet" vkIdEnabled={isVkIdAvailable()} />
        <p className="mt-5 text-center text-sm text-text-secondary">
          Ищете другого игрока? <Link href="/rankings" className="font-semibold text-brand hover:underline">Откройте рейтинги</Link>.
        </p>
      </main>
    );
  }

  const ownPlayerId = await resolvePlayerIdForAccount(me.id);
  const [ownProfile, availability, reliability] = await Promise.all([
    ownPlayerId ? loadProfileData(ownPlayerId) : Promise.resolve(null),
    getMyPlayAvailability(me.id),
    getPlayReliability(me.id),
  ]);

  const profileProps = ownProfile
    ? {
        player: ownProfile.player,
        stats: ownProfile.stats,
        matches: ownProfile.matches,
        ratingHistory: ownProfile.ratingHistory,
        formatInsights: ownProfile.formatInsights,
      }
    : null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 md:py-9">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand">Личный кабинет</p>
          <h1 className="mt-1 font-heading text-4xl uppercase tracking-wide text-text-primary md:text-5xl">
            {ownProfile?.player.name || 'Профиль игрока'}
          </h1>
          <p className="mt-1 text-sm text-text-secondary">Игры, результаты и настройки в одном месте.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {ownProfile ? (
            <Link href={`/players/${ownProfile.playerId}`} className="btn-action-outline inline-flex items-center">Публичный профиль</Link>
          ) : null}
          <LogoutButton redirectTo="/cabinet" />
        </div>
      </header>

      <nav aria-label="Разделы личного кабинета" className="mt-6 overflow-x-auto border-b border-white/10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex min-w-max gap-1">
          {PROFILE_TABS.map((item) => {
            const active = item.key === tab;
            return (
              <Link
                key={item.key}
                href={item.key === 'overview' ? '/cabinet' : `/cabinet?tab=${item.key}`}
                aria-current={active ? 'page' : undefined}
                className={`relative min-h-12 px-4 py-3 text-sm font-semibold transition focus-visible:rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand ${active ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
              >
                {item.label}
                {active ? <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand" /> : null}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="mt-5 space-y-5">
        {tab === 'overview' ? (
          <>
            {profileProps ? <EpicProfile {...profileProps} initialSection="overview" sectionOnly /> : <MissingPlayerCard />}
            <Surface title="Готовность играть" subtitle="Отметка используется существующей системой приглашений Play V3.">
              <PlayAvailabilityWidget current={availability} />
            </Surface>
            <Surface title="Ближайшие игры" subtitle="Краткий список активных заявок и резерва.">
              <PlayEntries mode="summary" />
            </Surface>
            <PlayReliabilityCard value={reliability} />
          </>
        ) : null}

        {tab === 'games' ? (
          <Surface title="Мои игры" subtitle="Предстоящие события, резерв и архив заявок.">
            <PlayEntries />
          </Surface>
        ) : null}

        {tab === 'stats' ? (
          profileProps ? <><EpicProfile {...profileProps} initialSection="stats" sectionOnly /><div className="mt-5"><PlayReliabilityCard value={reliability} /></div></> : <MissingPlayerCard />
        ) : null}

        {tab === 'history' ? (
          profileProps ? <EpicProfile {...profileProps} initialSection="history" sectionOnly /> : <MissingPlayerCard />
        ) : null}

        {tab === 'settings' ? (
          <SettingsPanel ownProfile={ownProfile} avatarSetup={avatarSetup} avatarReturnTo={avatarReturnTo} />
        ) : null}
      </div>
    </main>
  );
}
