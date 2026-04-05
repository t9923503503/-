/**
 * PIN для входа судей (/sudyam, /court index, KOTC live judge и т.д.).
 * Отдельно от ADMIN_PIN. В проде задайте JUDGE_PIN или SUDYAM_PIN (legacy имя).
 */
export const FALLBACK_JUDGE_PIN = '2525';

export function getExpectedJudgePin(): string {
  const configured = String(process.env.JUDGE_PIN || process.env.SUDYAM_PIN || '').trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JUDGE_PIN or SUDYAM_PIN env var is required in production');
  }
  return FALLBACK_JUDGE_PIN;
}
