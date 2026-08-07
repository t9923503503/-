import crypto from 'crypto';

export const TELEGRAM_INTENT_COOKIE = process.env.NODE_ENV === 'production'
  ? '__Host-lpvolley_tg_intent'
  : 'telegram_login_intent';

export const LEGACY_TELEGRAM_INTENT_COOKIE = 'telegram_login_intent';
export const TELEGRAM_BROWSER_SECRET_RE = /^[A-Za-z0-9_-]{40,64}$/;
export const TELEGRAM_CONFIRMATION_CODE_RE = /^\d{6}$/;
const TELEGRAM_USER_ID_RE = /^[1-9]\d*$/;

/** Telegram web auth is available to every user who can confirm a private Telegram chat. */
export function isTelegramWebAuthAvailable(): boolean {
  return true;
}

export function isTelegramWebAuthUserAllowed(telegramUserIdRaw: unknown): boolean {
  const telegramUserId = String(telegramUserIdRaw ?? '').trim();
  return TELEGRAM_USER_ID_RE.test(telegramUserId);
}

/**
 * The old bearer-link flow cannot identify the Telegram user before issuing a
 * token and did not capture the current privacy-policy consent. Keep it only
 * for local development; production linking goes through the browser-bound
 * OTP flow above.
 */
export function isLegacyTelegramLinkAvailable(): boolean {
  return process.env.NODE_ENV !== 'production';
}

export function getTelegramIntentHashSecret(): string {
  const dedicated = String(process.env.TELEGRAM_INTENT_HASH_SECRET || '').trim();
  if (process.env.NODE_ENV === 'production') {
    if (dedicated) return dedicated;
    throw new Error('TELEGRAM_INTENT_HASH_SECRET env var is required in production');
  }
  return dedicated
    || String(process.env.PLAYER_SESSION_SECRET || '').trim()
    || 'lpvolley-telegram-intent-development-only';
}

export function hashTelegramBrowserSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

export function hashTelegramConfirmationCode(intentToken: string, code: string): string {
  return crypto
    .createHmac('sha256', getTelegramIntentHashSecret())
    .update(`telegram-login-code\n${intentToken}\n${code}`)
    .digest('hex');
}

export function formatTelegramConfirmationCode(code: string): string {
  return TELEGRAM_CONFIRMATION_CODE_RE.test(code)
    ? `${code.slice(0, 3)} ${code.slice(3)}`
    : code;
}
