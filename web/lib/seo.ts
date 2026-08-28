import type { Tournament } from '@/lib/types';

export const SITE_URL = String(process.env.NEXT_PUBLIC_SITE_URL || 'https://lpvolley.ru').replace(
  /\/+$/,
  ''
);

export const SITE_NAME = 'Лютые Пляжники';
export const SITE_CITY = 'Сургут';

export const SITE_DESCRIPTION =
  'Пляжный волейбол в Сургуте: игры, турниры, результаты, история матчей и рейтинг игроков.';

export const SEO_KEYWORDS = [
  'пляжный волейбол Сургут',
  'пляжный волейбол в Сургуте',
  'тренировки по пляжному волейболу Сургут',
  'тренировки волейбол Сургут',
  'игры пляжный волейбол Сургут',
  'турниры пляжный волейбол Сургут',
  'турниры по пляжному волейболу Сургут',
  'волейбол 2 на 2 Сургут',
  'King of the Court Сургут',
  'рейтинг игроков пляжного волейбола Сургут',
  'любительский пляжный волейбол Сургут',
  'найти пару для пляжного волейбола Сургут',
];

export function absoluteUrl(path = '/'): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export function jsonLdScriptProps(data: unknown) {
  return {
    __html: JSON.stringify(data).replace(/</g, '\\u003c'),
  };
}

export function buildWebsiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    inLanguage: 'ru-RU',
    description: SITE_DESCRIPTION,
    areaServed: {
      '@type': 'City',
      name: SITE_CITY,
    },
  };
}

export function buildSportsOrganizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsOrganization',
    name: SITE_NAME,
    url: SITE_URL,
    sport: 'Beach volleyball',
    description: SITE_DESCRIPTION,
    areaServed: {
      '@type': 'City',
      name: SITE_CITY,
    },
    sameAs: ['https://vk.com/lpvolley'],
  };
}

export function buildTournamentDescription(tournament: Tournament): string {
  const parts = [
    tournament.name,
    `турнир по пляжному волейболу в ${SITE_CITY}`,
    tournament.format,
    tournament.division,
    tournament.location,
  ]
    .map((part) => String(part || '').trim())
    .filter(Boolean);

  const base = parts.join(' · ');
  const status =
    tournament.status === 'open'
      ? 'Открыта регистрация на игру.'
      : tournament.status === 'full'
        ? 'Основной состав заполнен, доступен лист ожидания.'
        : tournament.status === 'finished'
          ? 'Результаты турнира и статистика игроков.'
          : tournament.status === 'awaiting_results' || tournament.status === 'in_progress'
            ? 'Турнир завершает игровой день, результаты готовятся.'
          : tournament.status === 'cancelled'
            ? 'Турнир отменен.'
            : '';

  return [base, status].filter(Boolean).join(' ');
}

function tournamentStartDate(tournament: Tournament): string | undefined {
  const date = String(tournament.date || '').trim();
  if (!date) return undefined;

  const time = String(tournament.time || '').trim().match(/^\d{1,2}:\d{2}/)?.[0];
  if (!time) return date;

  return `${date}T${time}:00+05:00`;
}

function eventStatus(status: Tournament['status']): string {
  if (status === 'cancelled') return 'https://schema.org/EventCancelled';
  if (status === 'finished') return 'https://schema.org/EventCompleted';
  return 'https://schema.org/EventScheduled';
}

export function buildTournamentEventJsonLd(
  tournament: Tournament,
  options: { image?: string | null } = {}
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: tournament.name,
    description: buildTournamentDescription(tournament),
    sport: 'Beach volleyball',
    startDate: tournamentStartDate(tournament),
    eventStatus: eventStatus(tournament.status),
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    url: absoluteUrl(`/calendar/${tournament.id}`),
    image: options.image ? [absoluteUrl(options.image)] : undefined,
    location: tournament.location
      ? {
          '@type': 'Place',
          name: tournament.location,
          address: {
            '@type': 'PostalAddress',
            addressLocality: SITE_CITY,
            addressCountry: 'RU',
            streetAddress: tournament.location,
          },
        }
      : {
          '@type': 'Place',
          name: SITE_CITY,
          address: {
            '@type': 'PostalAddress',
            addressLocality: SITE_CITY,
            addressCountry: 'RU',
          },
        },
    organizer: {
      '@type': 'SportsOrganization',
      name: SITE_NAME,
      url: SITE_URL,
      areaServed: {
        '@type': 'City',
        name: SITE_CITY,
      },
    },
  };
}
