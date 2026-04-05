import type { Metadata } from 'next';
import './globals.css';
import { SiteChrome } from '@/components/layout/SiteChrome';

export const metadata: Metadata = {
  title: '\u041b\u044e\u0442\u044b\u0435 \u041f\u043b\u044f\u0436\u043d\u0438\u043a\u0438 \u2014 King of the Court',
  description:
    '\u041f\u043b\u044f\u0436\u043d\u044b\u0439 \u0432\u043e\u043b\u0435\u0439\u0431\u043e\u043b \u0432 \u0444\u043e\u0440\u043c\u0430\u0442\u0435 King of the Court. \u0420\u0435\u0439\u0442\u0438\u043d\u0433\u0438, \u0442\u0443\u0440\u043d\u0438\u0440\u044b, \u0441\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043a\u0430.',
  openGraph: {
    title: '\u041b\u044e\u0442\u044b\u0435 \u041f\u043b\u044f\u0436\u043d\u0438\u043a\u0438 \u2014 King of the Court',
    description:
      '\u041f\u043b\u044f\u0436\u043d\u044b\u0439 \u0432\u043e\u043b\u0435\u0439\u0431\u043e\u043b: \u0440\u0435\u0439\u0442\u0438\u043d\u0433\u0438, \u0442\u0443\u0440\u043d\u0438\u0440\u044b, \u0441\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043a\u0430 \u0438\u0433\u0440\u043e\u043a\u043e\u0432.',
    type: 'website',
    locale: 'ru_RU',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <head>
        <meta charSet="utf-8" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&family=Oswald:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-surface text-text-primary font-body antialiased min-h-screen flex flex-col">
        <SiteChrome>{children}</SiteChrome>
      </body>
    </html>
  );
}
