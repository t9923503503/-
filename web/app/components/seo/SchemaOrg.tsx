'use client';

// ============================================================
// LPVOLLEY.RU — Schema.org JSON-LD компоненты
// Копируй нужный компонент на страницу
// ============================================================

// ── ГЛАВНАЯ: Organization + WebSite ──
export function OrganizationSchema() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'SportsActivityLocation',
    '@id': 'https://lpvolley.ru/#organization',
    name: 'LPVolley — Лютые Пляжники',
    alternateName: 'Лютые Пляжники',
    description:
      'Пляжный волейбол в Сургуте: игры, турниры, результаты, статистика и рейтинг игроков.',
    url: 'https://lpvolley.ru',
    logo: {
      '@type': 'ImageObject',
      url: 'https://lpvolley.ru/icon.png',
      width: 567,
      height: 580,
    },
    image: {
      '@type': 'ImageObject',
      url: 'https://lpvolley.ru/og-banner.jpg',
      width: 1200,
      height: 630,
    },
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Сургут',
      addressCountry: 'RU',
    },
    sameAs: [
      'https://vk.com/lpvolley',
      'https://t.me/+ZkXujfqOmNE5ODMy',
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export function WebSiteSchema() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': 'https://lpvolley.ru/#website',
    name: 'LPVolley — Пляжный волейбол в Сургуте',
    url: 'https://lpvolley.ru',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: 'https://lpvolley.ru/search?q={search_term_string}',
      },
      'query-input': 'required name=search_term_string',
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

// ── СТРАНИЦА ТУРНИРА: SportsEvent ──
interface EventSchemaProps {
  name: string;
  description: string;
  startDate: string; // ISO 8601
  endDate?: string;
  locationName: string;
  locationAddress?: string;
  price?: number;
  spotsAvailable?: number;
  spotsTotal?: number;
  image?: string;
  url: string;
}

export function EventSchema({
  name,
  description,
  startDate,
  endDate,
  locationName,
  locationAddress,
  price,
  spotsAvailable,
  spotsTotal,
  image,
  url,
}: EventSchemaProps) {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name,
    description,
    startDate,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'SportsActivityLocation',
      name: locationName,
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Сургут',
        addressCountry: 'RU',
        streetAddress: locationAddress || locationName,
      },
    },
    organizer: {
      '@type': 'Organization',
      name: 'LPVolley',
      url: 'https://lpvolley.ru',
    },
    url,
    image: image || 'https://lpvolley.ru/og-banner.jpg',
  };

  if (endDate) schema.endDate = endDate;
  if (price && price > 0) {
    schema.offers = {
      '@type': 'Offer',
      url,
      price: price.toString(),
      priceCurrency: 'RUB',
      availability:
        spotsAvailable !== undefined && spotsAvailable > 0
          ? 'https://schema.org/InStock'
          : 'https://schema.org/SoldOut',
      validFrom: startDate,
    };
  }
  if (spotsTotal !== undefined) schema.maximumAttendeeCapacity = spotsTotal;

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

// ── FAQ: FAQPage ──
interface FAQItem {
  question: string;
  answer: string;
}

export function FAQSchema({ items }: { items: FAQItem[] }) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

// ── ХЛЕБНЫЕ КРОШКИ: BreadcrumbList ──
interface BreadcrumbItem {
  name: string;
  url: string;
}

export function BreadcrumbSchema({ items }: { items: BreadcrumbItem[] }) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

// ── ContactPoint ──
export function ContactSchema() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'LPVolley',
    url: 'https://lpvolley.ru',
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'Organizer',
      availableLanguage: 'Russian',
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
