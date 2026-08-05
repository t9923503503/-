import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import './globals.css';
import { SiteChrome } from '@/components/layout/SiteChrome';
import { YandexMetrika } from '@/components/analytics/YandexMetrika';
import {
  buildSportsOrganizationJsonLd,
  buildWebsiteJsonLd,
  jsonLdScriptProps,
} from '@/lib/seo';

const METRIKA_ID = process.env.YANDEX_METRIKA_ID || process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID || '108430286';

const THEME_BOOTSTRAP = `(function(){var k='lpvolley-theme';var t='dark';try{var s=localStorage.getItem(k);t=s==='light'||s==='dark'?s:(matchMedia('(prefers-color-scheme:light)').matches?'light':'dark')}catch(e){}document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t;var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',t==='light'?'#f8fafc':'#070b14')})()`;

export const metadata: Metadata = {
  title: 'Пляжный волейбол в Сургуте: тренировки, игры, турниры | LPVOLLEY.RU',
  description:
    'Пляжный волейбол в Сургуте: тренировки, игры, турниры, рейтинг игроков и поиск пары. LPVOLLEY.RU объединяет любителей пляжного волейбола. Форматы: THAI, King of the Court, миксты.',
  keywords: [
    'пляжный волейбол Сургут',
    'пляжный волейбол в Сургуте',
    'тренировки волейбол Сургут',
    'турниры пляжный волейбол Сургут',
    'волейбол 2 на 2 Сургут',
    'King of the Court Сургут',
    'рейтинг игроков пляжного волейбола',
  ],
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: 'https://lpvolley.ru',
    languages: {
      'ru-RU': 'https://lpvolley.ru',
    },
  },
  openGraph: {
    title: 'Пляжный волейбол в Сургуте: тренировки, игры, турниры | LPVOLLEY.RU',
    description:
      'Пляжный волейбол в Сургуте: тренировки, игры, турниры, рейтинг игроков и поиск пары.',
    url: 'https://lpvolley.ru',
    siteName: 'LPVOLLEY.RU',
    locale: 'ru_RU',
    type: 'website',
    images: [
      {
        url: 'https://lpvolley.ru/og-banner.jpg',
        width: 1200,
        height: 630,
        alt: 'LPVolley — пляжный волейбол в Сургуте: турниры, тренировки, рейтинг',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Пляжный волейбол в Сургуте: тренировки, игры и турниры',
    description:
      'Пляжный волейбол в Сургуте: тренировки, игры, турниры, рейтинги игроков и поиск пары.',
    images: {
      url: 'https://lpvolley.ru/og-banner.jpg',
      alt: 'LPVolley — пляжный волейбол в Сургуте',
    },
  },
  icons: {
    icon: [{ url: '/icon.png?v=20260805', type: 'image/png', sizes: '512x512' }],
    shortcut: '/favicon.ico?v=20260805',
    apple: [{ url: '/kotc/assets/logo_lp_192.png?v=20260805', sizes: '192x192', type: 'image/png' }],
  },
  applicationName: 'Лютые Пляжники',
};

export const viewport: Viewport = {
  themeColor: '#070b14',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="google-site-verification" content="QHxxU1_WOQ8QMaZZHrE-qxrL5gZiMCpr65VJOjrLSe4" />
        <meta name="yandex-metrika-id" content={METRIKA_ID} />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScriptProps(buildWebsiteJsonLd())} />
        <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScriptProps(buildSportsOrganizationJsonLd())} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&family=Oswald:wght@500;600;700&display=swap&subset=cyrillic,cyrillic-ext"
          rel="stylesheet"
        />
      </head>
      <body
        suppressHydrationWarning
        className="bg-surface text-text-primary font-body antialiased min-h-screen flex flex-col"
      >
        <SiteChrome>{children}</SiteChrome>
        <Suspense fallback={null}>
          <YandexMetrika counterId={METRIKA_ID} />
        </Suspense>
      </body>
    </html>
  );
}
