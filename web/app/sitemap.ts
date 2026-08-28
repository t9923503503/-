import type { MetadataRoute } from 'next';

const STATIC_ROUTES: Array<{ path: string; priority: number; freq: MetadataRoute.Sitemap[number]['changeFrequency'] }> = [
  { path: '/', priority: 1.0, freq: 'daily' },
  { path: '/calendar', priority: 0.9, freq: 'daily' },
  { path: '/rankings', priority: 0.8, freq: 'weekly' },
  { path: '/archive', priority: 0.75, freq: 'weekly' },
  { path: '/partner', priority: 0.75, freq: 'weekly' },
  { path: '/partner/about', priority: 0.55, freq: 'monthly' },
  { path: '/pravila', priority: 0.7, freq: 'monthly' },
  { path: '/privacy', priority: 0.35, freq: 'yearly' },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = String(process.env.NEXT_PUBLIC_SITE_URL || 'https://lpvolley.ru').replace(/\/+$/, '');
  const now = new Date();
  return STATIC_ROUTES.map((route) => ({
    url: `${baseUrl}${route.path}`,
    lastModified: now,
    changeFrequency: route.freq,
    priority: route.priority,
  }));
}
