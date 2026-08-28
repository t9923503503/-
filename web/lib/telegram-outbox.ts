import type { TelegramInlineButton } from '@/lib/telegram';

const PLAY_URL_RE = /https?:\/\/[^/\s]+\/(?:partner|play)\/([0-9a-f-]{36})/i;
const PLAY_MANAGE_URL_RE = /https?:\/\/[^/\s]+\/partner\/manage(?:[^\s]*)?/i;

function playLink(text: string): { postId: string; url: string } | null {
  const match = String(text || '').match(PLAY_URL_RE);
  if (!match) return null;
  return {
    postId: match[1],
    url: match[0].replace(/\/play\//i, '/partner/'),
  };
}

function authenticatedPlayLink(urlRaw: string, anchor: string): string {
  const url = new URL(urlRaw);
  const returnTo = `${url.pathname}${anchor}`;
  return `${url.origin}/login?returnTo=${encodeURIComponent(returnTo)}`;
}

export function telegramOutboxButtons(
  kindRaw: unknown,
  textRaw: unknown,
): TelegramInlineButton[][] {
  const kind = String(kindRaw || '').trim().toLowerCase();
  const text = String(textRaw || '');
  const link = playLink(text);
  if (!link) {
    const manageLink = text.match(PLAY_MANAGE_URL_RE)?.[0];
    return manageLink ? [[{ text: 'Управлять играми', url: manageLink }]] : [];
  }

  if (kind === 'invite_received') {
    return [
      [
        { text: '✅ Иду', callbackData: `invite:a:${link.postId}` },
        { text: '❌ Не смогу', callbackData: `invite:d:${link.postId}` },
      ],
      [{ text: 'Открыть игру', url: link.url }],
    ];
  }
  if (['reminder_24h', 'reminder_3h', 'reminder_60m'].includes(kind)) {
    return [
      [
        { text: '✅ Иду', callbackData: `attendance:y:${link.postId}` },
        { text: '❌ Не смогу', callbackData: `attendance:n:${link.postId}` },
      ],
      [{ text: 'Открыть игру', url: link.url }],
    ];
  }
  if (kind === 'result_reminder') {
    return [[{ text: '✍️ Внести счёт', url: authenticatedPlayLink(link.url, '#result-entry') }]];
  }
  if (kind === 'result_awaiting_approval') {
    return [[{ text: '✅ Проверить и утвердить', url: authenticatedPlayLink(link.url, '#result') }]];
  }
  if (['result_entered', 'result_proposed'].includes(kind)) {
    return [[{ text: '🔎 Проверить счёт', url: authenticatedPlayLink(link.url, '#result') }]];
  }
  if (['result_disputed', 'correction_requested'].includes(kind)) {
    return [[{ text: '✏️ Проверить исправление', url: authenticatedPlayLink(link.url, '#result') }]];
  }
  return [[{ text: 'Открыть игру', url: link.url }]];
}
