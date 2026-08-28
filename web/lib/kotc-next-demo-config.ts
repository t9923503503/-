import { isKotcNextFormat } from '@/lib/kotc-next-config';

type JsonObject = Record<string, unknown>;

function normalizeSettings(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function slugify(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export function normalizeKotcNextDemoSlug(value: unknown): string {
  return slugify(String(value || '').trim()).slice(0, 80);
}

export function buildKotcNextDemoSlugCandidate(name: string, date?: string): string {
  const base = normalizeKotcNextDemoSlug(name) || 'kotc-next-demo';
  const normalizedDate = /^\d{4}-\d{2}-\d{2}$/.test(String(date || '').trim())
    ? String(date).trim()
    : '';
  return normalizeKotcNextDemoSlug(`${base}-${normalizedDate || 'training'}`) || 'kotc-next-demo-training';
}

export function buildKotcNextDemoPath(slug: string): string {
  return `/demo/kotc-next/${encodeURIComponent(normalizeKotcNextDemoSlug(slug))}`;
}

export function isKotcNextDemoSettings(settings: unknown): boolean {
  const normalized = normalizeSettings(settings);
  return normalized.kotcNextDemoEnabled === true;
}

export function getKotcNextDemoSlug(settings: unknown): string | null {
  const normalized = normalizeSettings(settings);
  const slug = normalizeKotcNextDemoSlug(normalized.kotcNextDemoSlug);
  return slug || null;
}

export function isKotcNextDemoTournament(input: {
  format?: unknown;
  settings?: unknown;
}): boolean {
  return isKotcNextFormat(String(input.format || '')) && isKotcNextDemoSettings(input.settings);
}
