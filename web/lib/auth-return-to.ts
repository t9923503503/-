const AUTH_FALLBACK = '/profile';
const AUTH_ORIGIN = 'https://lpvolley.ru';
const MAX_RETURN_TO_LENGTH = 512;

export function getAuthPublicOrigin(requestOrigin?: string): string {
  const configured = String(process.env.SITE_BASE_URL || '').trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.origin;
    } catch {
      // Fall through to a local development origin or the canonical site.
    }
  }

  if (process.env.NODE_ENV !== 'production' && requestOrigin) {
    try {
      const url = new URL(requestOrigin);
      if (['localhost', '127.0.0.1'].includes(url.hostname)) return url.origin;
    } catch {
      // Use the canonical origin below.
    }
  }

  return AUTH_ORIGIN;
}

export function normalizeAuthReturnTo(
  value: unknown,
  fallback = AUTH_FALLBACK
): string {
  const candidate = String(value ?? '').trim();
  if (
    !candidate ||
    candidate.length > MAX_RETURN_TO_LENGTH ||
    !candidate.startsWith('/') ||
    candidate.startsWith('//') ||
    candidate.includes('\\') ||
    /[\u0000-\u001f\u007f]/.test(candidate)
  ) {
    return fallback;
  }

  try {
    const parsed = new URL(candidate, AUTH_ORIGIN);
    if (parsed.origin !== AUTH_ORIGIN) return fallback;
    const normalized = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    if (
      !normalized.startsWith('/')
      || normalized.startsWith('//')
      || normalized.includes('\\')
      || /[\u0000-\u001f\u007f]/.test(normalized)
    ) {
      return fallback;
    }
    return normalized || fallback;
  } catch {
    return fallback;
  }
}
