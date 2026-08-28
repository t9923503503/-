export const PLAY_ROSTER_BULK_LIMIT = 50;

export type PlayRosterBulkAction = 'invite' | 'add' | 'guest';

export interface NormalizedPlayRosterBulkItem {
  index: number;
  action: PlayRosterBulkAction;
  userId: number | null;
  playerId: string | null;
  guestName: string | null;
}

export interface PlayRosterBulkIssue {
  index: number;
  action: string;
  error: string;
}

export interface PlayRosterBulkNormalization {
  inputCount: number;
  items: NormalizedPlayRosterBulkItem[];
  issues: PlayRosterBulkIssue[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanGuestName(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 100);
}

export function normalizePlayRosterBulkItems(value: unknown): PlayRosterBulkNormalization {
  if (!Array.isArray(value) || value.length === 0) {
    return {
      inputCount: 0,
      items: [],
      issues: [{ index: -1, action: '', error: 'Добавьте хотя бы одно действие с составом' }],
    };
  }
  if (value.length > PLAY_ROSTER_BULK_LIMIT) {
    return {
      inputCount: value.length,
      items: [],
      issues: [{ index: -1, action: '', error: `За один раз можно обработать не более ${PLAY_ROSTER_BULK_LIMIT} позиций` }],
    };
  }

  const items: NormalizedPlayRosterBulkItem[] = [];
  const issues: PlayRosterBulkIssue[] = [];
  const seen = new Map<string, number>();

  value.forEach((raw, index) => {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw)
      ? raw as Record<string, unknown>
      : {};
    const action = String(source.action ?? '').trim().toLowerCase();
    if (!['invite', 'add', 'guest'].includes(action)) {
      issues.push({ index, action, error: 'Действие должно быть invite, add или guest' });
      return;
    }

    const parsedUserId = Number(source.userId ?? source.user_id);
    const userId = Number.isInteger(parsedUserId) && parsedUserId > 0 ? parsedUserId : null;
    const rawPlayerId = String(source.playerId ?? source.player_id ?? '').trim();
    const playerId = UUID_RE.test(rawPlayerId) ? rawPlayerId.toLowerCase() : null;
    const guestName = cleanGuestName(source.guestName ?? source.guest_name);

    if (action === 'invite' && !userId) {
      issues.push({ index, action, error: 'Для приглашения укажите userId зарегистрированного игрока' });
      return;
    }
    if (action === 'add' && !userId && !playerId) {
      issues.push({ index, action, error: 'Для добавления выберите userId или playerId' });
      return;
    }
    if (action === 'guest' && guestName.length < 2) {
      issues.push({ index, action, error: 'Имя гостя должно содержать минимум 2 символа' });
      return;
    }

    const identityKey = action === 'guest'
      ? `guest:${guestName.toLocaleLowerCase('ru')}`
      : userId ? `user:${userId}` : `player:${playerId}`;
    const duplicateIndex = seen.get(identityKey);
    if (duplicateIndex != null) {
      issues.push({ index, action, error: `Этот игрок уже указан в позиции ${duplicateIndex + 1}` });
      return;
    }
    seen.set(identityKey, index);
    items.push({
      index,
      action: action as PlayRosterBulkAction,
      userId: action === 'guest' ? null : userId,
      playerId: action === 'add' ? playerId : null,
      guestName: action === 'guest' ? guestName : null,
    });
  });

  return { inputCount: value.length, items, issues };
}
