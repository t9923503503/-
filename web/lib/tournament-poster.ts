import type { Tournament } from '@/lib/types';

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
