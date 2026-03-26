# План работ: Фазы 6–8

> **Источник:** анализ критики 4 AI-моделей + требования заказчика
> **Дата:** 2026-03-23
> **Предпосылки:** Фазы 1–5 завершены ✅

---

## Фаза 6 — Безопасность (из критики всех 4 AI)

> Закрываем единственную реальную дыру, на которую указали все модели единодушно:
> `'unsafe-inline'` в CSP + roomSecret в localStorage = XSS → компрометация турнира.

| ID | Задача | Роль | Файлы | Зависит от | Сложность |
|----|--------|------|-------|------------|-----------|
| **S6.1** | Вынести inline `<script>` из `admin.html` в `admin-init.js` | ARCH | `admin.html`, `admin-init.js` (new) | — | 30 мин |
| **S6.2** | Вынести inline `<script type="module">` из `thai.html` в `thai-boot.js` | FORMAT | `formats/thai/thai.html`, `formats/thai/thai-boot.js` (new) | — | 20 мин |
| **S6.3** | Заменить inline `onclick=` в `kotc.html` и `thai.html` на addEventListener | FORMAT | `formats/kotc/kotc.html`, `formats/kotc/kotc.js`, `formats/thai/thai.html`, `formats/thai/thai-boot.js` | S6.2 | 30 мин |
| **S6.4** | Убрать `'unsafe-inline'` из `script-src` CSP | ARCH | `index.html` (meta CSP), `formats/kotc/kotc.html`, `formats/thai/thai.html` | S6.1, S6.2, S6.3 | 10 мин |
| **S6.5** | `kotc3_sb_config` → `sessionStorage` (сброс при закрытии вкладки) | ARCH | `assets/js/integrations.js`, `assets/js/integrations/config.js` | — | 15 мин |
| **S6.6** | Обновить SW cache version (v60) + добавить новые .js файлы | ARCH | `sw.js` | S6.1–S6.5 | 10 мин |
| **S6.7** | Тесты: CSP-валидация, проверка отсутствия inline скриптов | QA | `tests/unit/`, `scripts/release-gate.mjs` | S6.4 | 30 мин |

**Итого Фаза 6: ~2.5 часа**

### Детали по ключевым шагам

#### S6.1 — admin.html inline → admin-init.js
```
До:  <script>(function(){ ... 400+ строк ... })();</script>
После: <script src="admin-init.js"></script>
```
Содержимое IIFE переносится 1:1 во внешний файл. Никакой логики не меняется.

#### S6.4 — CSP без unsafe-inline
```html
<!-- index.html — в нём уже НЕТ inline скриптов, просто убираем флаг -->
script-src 'self' blob: https://accounts.google.com https://cdn.jsdelivr.net
```
Nonce НЕ нужен — все скрипты подключены через `src=`. Статический PWA из SW-кэша.

#### S6.5 — sessionStorage вместо localStorage для секретов
```javascript
// integrations.js — заменить:
localStorage.getItem('kotc3_sb_config')  → sessionStorage.getItem('kotc3_sb_config')
localStorage.setItem('kotc3_sb_config')  → sessionStorage.setItem('kotc3_sb_config')
```
Судья вводит room code + secret при каждой сессии. Данные НЕ переживают закрытие вкладки.
`kotc3_state`, `kotc3_playerdb` — остаются в localStorage (не секретные).

---

## Фаза 7 — Мультисудейство: 4 судьи × 4 корта

> Админ создаёт турнир → назначает 4 судей на корты → каждый судья
> получает ссылку → открывает свой корт → судит автономно → всё
> синхронизируется в реальном времени через Broadcast.

### Архитектура

```
┌─────────────────────────────────────────────────────┐
│  АДМИН-ПАНЕЛЬ (admin.html)                          │
│  Создать турнир → назначить судей → выдать ссылки   │
│  Режим ОБЗОР: видит все 4 корта (read-only сводка)  │
└──────┬──────────────────────────────────┬───────────┘
│ RPC: create_judge_session()                  │
       ▼                                  ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Судья Корт 1 │ │ Судья Корт 2 │ │ Судья Корт 3 │ │ Судья Корт 4 │
│ index.html   │ │ index.html   │ │ index.html   │ │ index.html   │
│ ?trnId=X     │ │ ?trnId=X     │ │ ?trnId=X     │ │ ?trnId=X     │
│ &court=0     │ │ &court=1     │ │ &court=2     │ │ &court=3     │
│ &token=AAA   │ │ &token=BBB   │ │ &token=CCC   │ │ &token=DDD   │
└──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
       │                │                │                │
       └────────────────┴────────────────┴────────────────┘
                               │
Realtime Broadcast Channel
                    realtime:broadcast-trn_{trnId}
                    События: score_update { court, data, ts }
```

### Ключевые решения

1. **Court-lock**: каждый судья видит ВСЕ корты (для контекста), но может
   РЕДАКТИРОВАТЬ только свой (кнопки +/− активны только для `court=N`).
   Это исключает конфликты — два судьи НИКОГДА не правят один корт.

2. **Токен судьи**: UUID, генерируется админом, хранится в серверной БД.
   Валидация — при подключении к broadcast-каналу (или при загрузке state).
   Оффлайн: токен в URL, судья работает локально, синхронизация при reconnect.

3. **Без нового сервера**: всё через RPC + Broadcast (уже есть).

### Задачи

| ID | Задача | Роль | Файлы | Зависит от | Сложность |
|----|--------|------|-------|------------|-----------|
| **S7.1** | SQL: таблица `judge_sessions` + RPC `create_judge_session`, `validate_judge_token` | ARCH | `migrations/007_judge_sessions.sql` (new) | — | 1 час |
| **S7.2** | Админ-панель: секция «Запуск турнира» — выбор формата, назначение судей, генерация ссылок | ARCH | `admin.html` (или `admin-init.js`), `admin.css` | S6.1, S7.1 | 3 часа |
| **S7.3** | Генерация QR-кодов / копируемых ссылок для каждого судьи | ARCH | `admin-init.js`, `shared/qr-gen.js` (new, minimal) | S7.2 | 1 час |
| **S7.4** | SPA: парсинг URL-параметров `court`, `token`, `trnId` при загрузке | ARCH | `assets/js/main.js`, `assets/js/runtime.js` | — | 1 час |
| **S7.5** | Court-lock UI: кнопки ввода счёта активны ТОЛЬКО для своего корта | FORMAT | `assets/js/screens/core-render.js`, `assets/js/screens/components.js` | S7.4 | 2 часа |
| **S7.6** | Broadcast: score_update содержит `courtId` — применяем только чужие корты | ARCH | `assets/js/ui/kotc-sync.js`, `assets/js/integrations.js` | S7.4 | 2 часа |
| **S7.7** | Админ: обзорный экран — read-only сводка всех 4 кортов в реальном времени | ARCH | `admin-init.js`, `admin.css` | S7.6 | 2 часа |
| **S7.8** | Обработка reconnect: судья переподключается → запрашивает snapshot → получает актуальный стейт | ARCH | `shared/realtime.js`, `assets/js/integrations.js` | S7.6 | 1 час |
| **S7.9** | E2E тест: 2 судьи на разных кортах, одновременный ввод, проверка sync | QA | `tests/e2e/multi-judge.spec.ts` (new) | S7.6 | 2 часа |

**Итого Фаза 7: ~15 часов**

### Детали по ключевым шагам

#### S7.1 — SQL: judge_sessions
```sql
CREATE TABLE judge_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id TEXT NOT NULL,
  court_index   INT NOT NULL CHECK (court_index BETWEEN 0 AND 3),
  judge_name    TEXT DEFAULT '',
  token         TEXT NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  created_at    TIMESTAMPTZ DEFAULT now(),
  expires_at    TIMESTAMPTZ DEFAULT now() + interval '24 hours',
  UNIQUE(tournament_id, court_index)
);

-- RPC: админ создаёт сессии для турнира
CREATE FUNCTION create_judge_session(p_trn_id TEXT, p_court INT, p_name TEXT)
RETURNS judge_sessions ...;

-- RPC: валидация токена (вызывается при загрузке SPA)
CREATE FUNCTION validate_judge_token(p_token TEXT)
RETURNS JSONB ...; -- { ok, tournament_id, court_index, judge_name }
```

#### S7.4 — URL-параметры
```javascript
// main.js — при загрузке:
const params = new URLSearchParams(location.search);
const judgeMode = {
  trnId:  params.get('trnId'),
  court:  parseInt(params.get('court'), 10),
  token:  params.get('token'),
  active: !!(params.get('trnId') && params.get('court') !== null),
};
globalThis.judgeMode = judgeMode;
```

#### S7.5 — Court-lock UI
```javascript
// В renderScoreButtons(courtIndex):
const myСourt = globalThis.judgeMode?.court;
const isLocked = globalThis.judgeMode?.active && courtIndex !== myСourt;
// Если isLocked — кнопки disabled, но данные видны
```

---

## Фаза 8 — Единая база рейтингов и история турниров

> Сейчас: players и tournaments в localStorage (каждый браузер — свой мир).
> Цель: единый серверный источник правды + оффлайн-кэш в браузере.

### Архитектура синхронизации

```
┌──────────────────────────────────┐
│  Server DB                       │
│  players   — единая таблица      │
│  tournaments — история           │
│  tournament_results — результаты  │
│  rating_history — рейтинг/снимки │
└──────────┬───────────────────────┘
           │
     Pull on connect / Push on save
     Conflict: server wins (authoritative)
           │
     ┌─────┴─────┐
     │ localStorage │  ← оффлайн кэш
     │ kotc3_playerdb │ (работает без сети)
     └───────────┘
```

### Задачи

| ID | Задача | Роль | Файлы | Зависит от | Сложность |
|----|--------|------|-------|------------|-----------|
| **S8.1** | SQL: таблица `tournament_results` (tournament_id, player_id, placement, points, format) | ARCH | `migrations/008_tournament_results.sql` (new) | — | 1 час |
| **S8.2** | SQL: таблица `rating_history` (player_id, tournament_id, delta, new_total, date) | ARCH | `migrations/008_tournament_results.sql` | — | 30 мин |
| **S8.3** | SQL: RPC `finalize_tournament` — принимает результаты, рассчитывает рейтинги, пишет историю | ARCH | `migrations/009_finalize.sql` (new) | S8.1, S8.2 | 2 часа |
| **S8.4** | shared/players.js: sync — pull with merge при наличии сети | ARCH | `shared/players.js`, `shared/api.js` | — | 2 часа |
| **S8.5** | shared/players.js: push — отправка новых/изменённых игроков на сервер | ARCH | `shared/players.js`, `shared/api.js` | S8.4 | 1 час |
| **S8.6** | Экран завершения турнира: кнопка «Финализировать» → отправить результаты на сервер | FORMAT | `assets/js/screens/core-lifecycle.js`, `assets/js/ui/tournament-details.js` | S8.3 | 2 часа |
| **S8.7** | KOTC: финализация — собрать placements, вызвать `finalize_tournament` | FORMAT | `formats/kotc/kotc.js`, `formats/kotc/kotc-format.js` | S8.3 | 2 часа |
| **S8.8** | Thai: финализация — аналогично | FORMAT | `formats/thai/thai.js`, `formats/thai/thai-format.js` | S8.3 | 2 часа |
| **S8.9** | Админ-панель: вкладка «Рейтинг» — серверная таблица с историей | ARCH | `admin-init.js`, `admin.css` | S8.2 | 2 часа |
| **S8.10** | rating.html: показывать историю рейтинга из сервера, а не только текущий | FORMAT | `rating.html` | S8.2 | 1.5 часа |
| **S8.11** | Тесты: sync playerDB, finalize tournament, rating calculation | QA | `tests/unit/sync.test.js`, `tests/unit/finalize.test.js` (new) | S8.3–S8.5 | 3 часа |

**Итого Фаза 8: ~19 часов**

### Детали по ключевым шагам

#### S8.3 — finalize_tournament RPC
```sql
CREATE FUNCTION finalize_tournament(
  p_tournament_id TEXT,
  p_results JSONB  -- [{player_id, placement, points_earned}]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1. Записать результаты в tournament_results
  INSERT INTO tournament_results (tournament_id, player_id, placement, points)
  SELECT p_tournament_id, r->>'player_id', (r->>'placement')::int, (r->>'points')::numeric
  FROM jsonb_array_elements(p_results) r;

  -- 2. Обновить рейтинги игроков
  UPDATE players p
     SET total_pts = p.total_pts + tr.points,
         tournaments = p.tournaments + 1
    FROM tournament_results tr
   WHERE tr.tournament_id = p_tournament_id
     AND tr.player_id = p.id;

  -- 3. Записать снимок рейтинга
  INSERT INTO rating_history (player_id, tournament_id, delta, new_total, recorded_at)
  SELECT tr.player_id, p_tournament_id, tr.points, p.total_pts, now()
    FROM tournament_results tr
    JOIN players p ON p.id = tr.player_id
   WHERE tr.tournament_id = p_tournament_id;

  -- 4. Обновить статус турнира
  UPDATE tournaments SET status = 'finished' WHERE id = p_tournament_id;

  RETURN jsonb_build_object('ok', true, 'results_count', jsonb_array_length(p_results));
END;
$$;
```

#### S8.4 — Player sync strategy
```javascript
// shared/players.js — при наличии сети:
async function syncPlayers() {
  const local  = loadLocalPlayerDB();
  const remote = await apiGet('/players?select=*');

  // Merge: server wins on conflicts (by player.id)
  const merged = mergePlayerLists(local, remote, { authority: 'server' });

  // Push local-only players to server
  const localOnly = merged.filter(p => p._localOnly);
  if (localOnly.length) await apiPost('/players/bulk', localOnly);

  // Save merged to localStorage (offline cache)
  saveLocalPlayerDB(merged);
  return merged;
}
```

---

## Сводка: Все три фазы

| Фаза | Цель | Задачи | Время | Приоритет |
|-------|------|--------|-------|-----------|
| **6** | Безопасность (CSP + секреты) | S6.1–S6.7 | ~2.5 ч | 🔴 Критический |
| **7** | 4 судьи × 4 корта | S7.1–S7.9 | ~15 ч | 🔴 Критический |
| **8** | Единая БД игроков + рейтинги | S8.1–S8.11 | ~19 ч | 🟡 Высокий |

### Порядок выполнения

```
Фаза 6 (безопасность) ← делаем ПЕРВОЙ, это фундамент
    ↓
Фаза 7 (мультисудейство) ← основной функционал
    ↓
Фаза 8 (единая БД) ← зависит от 7 (финализация привязана к судейскому процессу)
```

### Что НЕ входит в план (осознанно)

| Отклонённая рекомендация | Причина |
|--------------------------|---------|
| Переезд SPA в Next.js | Ломает offline-first |
| IndexedDB вместо localStorage | Данные ~200 КБ, overkill |
| CRDT для конфликтов | Court-lock исключает конфликты |
| Turborepo / monorepo | Overhead для команды 1–3 чел |
| SolidJS / React переписывание | Работающий код не трогаем |
| Feature flags / canary | Не тот масштаб |

---

## Офлайн-гарантии (сохраняются во всех фазах)

- Судья работает без сети → очки сохраняются в localStorage
- При восстановлении сети → broadcast score_update + push state
- Court-lock гарантирует: один корт = один судья = нет конфликтов
- Player sync: server wins, но локальные данные не теряются (push перед merge)
- Финализация турнира: требует сеть (серверная операция), но счёт введён оффлайн
