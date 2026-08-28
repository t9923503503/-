export const METRIKA_GOALS = {
  tournamentOpen: 'lpv_tournament_open',
  registrationFormView: 'lpv_registration_form_view',
  registrationStart: 'lpv_registration_start',
  tournamentRegistration: 'lpv_tournament_registration',
  cabinetOpen: 'lpv_cabinet_open',
  login: 'lpv_login',
  accountRegistration: 'lpv_account_registration',
  partnerRequest: 'lpv_partner_request',
  playerLinked: 'lpv_player_linked',
  photoUploaded: 'lpv_photo_uploaded',
  vkClick: 'lpv_vk_click',
  calendarFilterUsed: 'lpv_calendar_filter_used',
  playerProfileOpen: 'lpv_player_profile_open',
  rulesOpen: 'lpv_rules_open',
  shareClick: 'lpv_share_click',
  telegramClick: 'lpv_telegram_click',
} as const;

type MetrikaGoalId = (typeof METRIKA_GOALS)[keyof typeof METRIKA_GOALS];

declare global {
  interface Window {
    ym?: (...args: unknown[]) => void;
    __lpvMetrikaGoalQueue?: Array<{
      goalId: MetrikaGoalId;
      params?: Record<string, unknown>;
    }>;
  }
}

function getCounterId() {
  if (typeof window === 'undefined') return '108430286';
  return document.querySelector<HTMLMetaElement>('meta[name="yandex-metrika-id"]')?.content || '108430286';
}

const ATTRIBUTION_STORAGE_KEY = 'lpv_metrika_attribution';
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;

function safeParamValue(value: unknown): string | number | boolean | null | undefined {
  if (value == null) return null;
  if (typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.slice(0, 160);
  return undefined;
}

function sanitizeParams(params?: Record<string, unknown>) {
  const result: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(params || {})) {
    const safeValue = safeParamValue(value);
    if (safeValue !== undefined) result[key] = safeValue;
  }
  return result;
}

function readStoredAttribution() {
  try {
    return JSON.parse(window.sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY) || '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
}

function getReferrerHost() {
  if (!document.referrer) return '';
  try {
    const referrer = new URL(document.referrer);
    return referrer.hostname === window.location.hostname ? '' : referrer.hostname;
  } catch {
    return '';
  }
}

function getMetrikaContext() {
  if (typeof window === 'undefined') return {};

  const searchParams = new URLSearchParams(window.location.search);
  const stored = sanitizeParams(readStoredAttribution());
  const fresh: Record<string, string> = {};

  for (const key of UTM_KEYS) {
    const value = searchParams.get(key);
    if (value) fresh[key] = value.slice(0, 120);
  }

  const nextStored = {
    ...stored,
    ...fresh,
    ...(Object.keys(fresh).length > 0
      ? {
          landingPath: window.location.pathname,
        }
      : {}),
  };

  if (Object.keys(fresh).length > 0) {
    try {
      window.sessionStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(nextStored));
    } catch {
      // Ignore private-mode/sessionStorage failures; direct event tracking still works.
    }
  }

  return sanitizeParams({
    ...nextStored,
    sourcePage: window.location.pathname,
    referrerHost: getReferrerHost(),
    viewport: window.innerWidth < 768 ? 'mobile' : 'desktop',
  });
}

export function reachMetrikaGoal(goalId: MetrikaGoalId, params?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  const enrichedParams = {
    ...getMetrikaContext(),
    ...sanitizeParams(params),
  };

  if (typeof window.ym !== 'function') {
    const queue = window.__lpvMetrikaGoalQueue || [];
    if (queue.length < 50) {
      queue.push({ goalId, params: enrichedParams });
      window.__lpvMetrikaGoalQueue = queue;
    }
    return;
  }

  const counterId = Number(getCounterId());
  if (!Number.isFinite(counterId) || counterId <= 0) return;

  window.ym(counterId, 'reachGoal', goalId, enrichedParams);
}

export function flushMetrikaGoals() {
  if (typeof window === 'undefined' || typeof window.ym !== 'function') return;

  const queue = window.__lpvMetrikaGoalQueue || [];
  window.__lpvMetrikaGoalQueue = [];

  for (const item of queue) {
    reachMetrikaGoal(item.goalId, item.params);
  }
}
