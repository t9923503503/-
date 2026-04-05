import type { MetadataRoute } from 'next';

const STATIC_ROUTES = [
  '/',
  '/calendar',
  '/archive',
  '/rankings',
  '/profile',
  '/partner',
  '/pravila',
];

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = String(process.env.NEXT_PUBLIC_SITE_URL || 'https://lpvolley.ru').replace(/\/+$/, '');
  const now = new Date();
  return STATIC_ROUTES.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: now,
    changeFrequency: route === '/' ? 'daily' : 'weekly',
    priority: route === '/' ? 1 : 0.7,
  }));
}
