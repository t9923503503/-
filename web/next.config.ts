import path from 'node:path';
import type { NextConfig } from 'next';

const NOINDEX_ROUTE_SOURCES = [
  '/admin/:path*',
  '/cabinet',
  '/profile',
  '/login',
  '/reset-password/:path*',
  '/partner/manage',
  '/calendar/:id/register',
  '/sudyam/:path*',
  '/sudyam2/:path*',
  '/court/:path*',
  '/judge-scoreboard/:path*',
  '/kotc-next/judge/:path*',
  '/go/:tournamentId/live',
  '/live/:path*',
  '/demo/:path*',
];

const nextConfig: NextConfig = {
  // CI/agents may verify in an isolated directory while a local dev/build process owns .next.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '..'),
  images: {
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.userapi.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
  /** До резолва страницы: убирает 404 на «судейском» URL, который путают с операторским Thai live. */
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.lpvolley.ru' }],
        destination: 'https://lpvolley.ru/:path*',
        permanent: true,
      },
      {
        source: '/play',
        destination: '/partner',
        permanent: true,
      },
      {
        source: '/play/:id',
        destination: '/partner/:id',
        permanent: true,
      },
      {
        source: '/court/tournament/:tournamentId/thai-live',
        destination: '/admin/tournaments/:tournamentId/thai-live',
        permanent: false,
      },
    ];
  },
  async headers() {
    const securityHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
      {
        key: 'Content-Security-Policy',
        value: [
          "default-src 'self'",
          process.env.NODE_ENV === 'development'
            ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://mc.yandex.ru https://mc.yandex.com"
            : "script-src 'self' 'unsafe-inline' https://mc.yandex.ru https://mc.yandex.com",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' https://fonts.gstatic.com",
          "img-src 'self' data: blob: https: http:",
          "connect-src 'self' https://mc.yandex.ru https://mc.yandex.com",
          "frame-src 'self' https://yandex.ru https://yandex.com",
          "worker-src 'self' blob:",
          "base-uri 'self'",
          "frame-ancestors 'self'",
          "object-src 'none'",
        ].join('; '),
      },
    ];

    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        // Разрешаем iframe-встраивание КОТС только со своего домена
        source: '/sudyam/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
        ],
      },
      ...NOINDEX_ROUTE_SOURCES.map((source) => ({
        source,
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }],
      })),
    ];
  },
};

export default nextConfig;
