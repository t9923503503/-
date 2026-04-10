import type { Tournament } from '@/lib/types';

const LOCAL_TOURNAMENT_POSTERS: Record<string, string> = {
  'a19522bb-864e-4520-8182-61e035c27894':
    '/images/tournaments/a19522bb-864e-4520-8182-61e035c27894/hero.jpg',
  'eb07361d-8af2-45e4-8ed6-be26a45af14e':
    '/images/tournaments/eb07361d-8af2-45e4-8ed6-be26a45af14e/poster.jpg',
};

export function localPosterForTournamentId(id: string): string {
  return LOCAL_TOURNAMENT_POSTERS[id] ?? '';
}

export function absoluteLocalPosterForTournamentId(id: string): string {
  const src = localPosterForTournamentId(id);
  return src ? `https://lpvolley.ru${src}` : '';
}

/** True if URL looks like a direct image asset (not Yandex Disk / Google Drive HTML). */
export function isLikelyDirectImageUrl(url: string): boolean {
  const value = String(url || '').trim();
  if (!value) return false;
  if (value.startsWith('/')) return true;
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    if (u.hostname.includes('disk.yandex')) return false;
    if (u.hostname === 'yadi.sk') return false;
    if (u.hostname.includes('drive.google')) return false;
    return /\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(u.pathname + u.search);
  } catch {
    return false;
  }
}

/** VK CDN (userapi) often has no “.jpg” in path — still a direct image response. */
export function isLikelyHostedPlayerOrVkPhoto(url: string): boolean {
  const value = String(url || '').trim();
  if (!value) return false;
  if (value.startsWith('/')) return true;
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const h = u.hostname.toLowerCase();
    if (h.includes('userapi.com') || h.includes('vkuseraudio.net')) return true;
    return isLikelyDirectImageUrl(url);
  } catch {
    return false;
  }
}

export function fallbackPosterForTournament(t: Pick<Tournament, 'format'>): string {
  const fmt = (t.format || '').toLowerCase();
  if (fmt.includes('king')) return '/images/pravila/kotc.svg';
  if (fmt.includes('round')) return '/images/pravila/mixup.svg';
  if (fmt.includes('double')) return '/images/pravila/double.svg';
  return '/images/pravila/kotc.svg';
}
