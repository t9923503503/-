# Задание для Cursor — Фазы 7–8 (оставшиеся задачи)

> **Контекст:** Фаза 6 (безопасность) — завершена ✅. Фаза 7 частично выполнена.
> **Обязательно прочитай:** `PHASE6_PLAN.md` (полная архитектура), `CLAUDE.md`, `STATUS.md`

---

## ЧТО УЖЕ СДЕЛАНО (НЕ трогай)

### Фаза 6 ✅
- **S6.1** ✅ `admin.html` → inline script вынесен в `admin-init.js`
- **S6.2** ✅ `thai.html` → inline module вынесен в `formats/thai/thai-boot.js`
- **S6.3** ✅ `kotc.html` onclick заменён на addEventListener в `kotc.js`
- **S6.4** ✅ CSP: `'unsafe-inline'` убран из `script-src` в `index.html`
- **S6.5** ✅ `sessionStorage` вместо `localStorage` для секретов (`integrations.js`, `shared/auth.js`, `shared/api.js`)
- **S6.6** ✅ SW cache v61, добавлены thai-файлы + `admin-init.js`

### Фаза 7 (частично) ✅
- **S7.1** ✅ SQL миграция: `migrations/007_judge_sessions.sql` — таблица + 3 RPC
- **S7.2** ✅ Админ: вкладка «Судьи» в `admin.html` + логика в `admin-init.js`
- **S7.4** ✅ `judgeMode` парсинг URL в `main.js` → `globalThis.judgeMode`
- **S7.5** ✅ Court-lock UI — кнопки счёта disabled для чужих кортов, баннер 🔒, guard в handler'ах
- **S7.6** ✅ Broadcast: `courtId` в payload, echo prevention в `integrations.js`

---

## ТВОИ ЗАДАЧИ

### Приоритет 1: Оставшиеся задачи Фазы 7

#### ~~S6.4-extra~~: CSP мета-теги для format-страниц ✅ (уже было сделано)
Добавить CSP `<meta>` в `formats/kotc/kotc.html` и `formats/thai/thai.html`:
```html
<meta http-equiv="Content-Security-Policy"
  content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self' https://sv-ugra.ru; img-src 'self' data:;">
```
У этих страниц **нет** inline-скриптов (уже вынесены), поэтому `script-src 'self'` безопасен.

#### ~~S6.7~~: Тест CSP-валидации ✅ (уже был сделан — `tests/unit/csp-check.test.js`)
Файл: `tests/unit/csp-check.test.js` (новый)
- Прочитать все `.html` файлы проекта (кроме `node_modules`, `dist`, `playwright-report`)
- Проверить: нет `<script>` без `src=` (кроме `<script type="module" src=...>`)
- Проверить: нет `onclick=`, `onload=`, `onerror=` и прочих inline event handler'ов
- Проверить: если есть CSP meta-tag, то `script-src` НЕ содержит `'unsafe-inline'`

#### ~~S7.3~~: QR-коды для судейских ссылок ✅ (2026-03-24, `shared/qr-gen.js`, `admin-init.js`, `admin.html`)
Файлы: `admin-init.js`, `shared/qr-gen.js` (новый)
- Минимальный QR-генератор (можно взять tiny qrcode library или SVG-based)
- В `admin-init.js` функция `showJudgeLinks()` уже генерирует текстовые ссылки
- Добавить QR-код рядом с каждой ссылкой (для быстрого сканирования телефоном)
- QR должен содержать полный URL: `{origin}/index.html?trnId=X&court=N&token=T&judge=Name`
- Добавить `shared/qr-gen.js` в SW cache (`sw.js`)

#### ~~S7.7~~: Админ — обзор кортов в реальном времени ✅ (2026-03-24, `admin-init.js`, `admin.html` — live-карточки 4 кортов, опрос каждые 30с)
Файлы: `admin-init.js`, `admin.html`, `admin.css`
- Новая секция внутри вкладки «Судьи» (после назначения)
- 4 карточки — по одной на корт — показывают:
  - Имя судьи
  - Текущий раунд
  - Счёт текущего матча
  - Статус: онлайн/офлайн (по Broadcast heartbeat)
- Обновлять по событиям из Broadcast канала `state_updated`
- Read-only — админ НЕ может редактировать счёт

#### ~~S7.8~~: Reconnect snapshot ✅ (2026-03-24, `assets/js/integrations.js` — `request_snapshot`/`snapshot_response` handlers + 5s timeout fallback)
Файлы: `assets/js/integrations.js`, `shared/realtime.js`
- При reconnect судьи (например, потеря Wi-Fi → восстановление):
  - Запросить текущий state через Broadcast `request_snapshot`
  - Другие клиенты (или админ) отвечают `snapshot_response` с полным state
  - Принимающий клиент мержит: для каждого корта берёт данные с бо́льшим `scoreTs`
- Если никто не ответил за 5 сек — работаем с локальным стейтом (offline-first)

#### ~~S7.9~~: E2E тест мультисудейства ✅ (2026-03-24, `tests/e2e/multi-judge.spec.ts` — 4 теста, все прошли)
Файл: `tests/e2e/multi-judge.spec.ts` (новый)
- 2 browser context'а (Playwright)
- Судья 1: `?trnId=test&court=0&token=a`
- Судья 2: `?trnId=test&court=1&token=b`
- Судья 1 вводит счёт на корте 0 → проверить что кнопки корта 1 disabled
- Судья 2 вводит счёт на корте 1 → проверить что кнопки корта 0 disabled
- Оба видят счёт друг друга (через sync, если Supabase подключён, или через localStorage)

---

### Приоритет 2: Фаза 8 — Единая БД рейтингов

#### ~~S8.1 + S8.2~~: SQL миграции ✅ (уже было — `migrations/008_tournament_results.sql`)
Файл: `migrations/008_tournament_results.sql` (новый)
```sql
CREATE TABLE tournament_results (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id  TEXT NOT NULL,
  player_id      TEXT NOT NULL,
  placement      INT NOT NULL,
  points         NUMERIC NOT NULL DEFAULT 0,
  format         TEXT NOT NULL DEFAULT '',
  division       TEXT DEFAULT '',
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE rating_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id      TEXT NOT NULL,
  tournament_id  TEXT NOT NULL,
  delta          NUMERIC NOT NULL DEFAULT 0,
  new_total      NUMERIC NOT NULL DEFAULT 0,
  recorded_at    TIMESTAMPTZ DEFAULT now()
);
```
+ RLS, индексы, GRANT для authenticated.

#### ~~S8.3~~: RPC `finalize_tournament` ✅ (уже было — `migrations/009_finalize.sql`)

#### ~~S8.4 + S8.5~~: Player sync ✅ (уже было — `syncPlayersWithServer()` в `shared/api.js`)

#### ~~S8.6~~: Финализация из хаба ✅ (уже было — `assets/js/ui/tournament-details.js`)

#### ~~S8.7~~: KOTC финализация ✅ (уже было — `formats/kotc/kotc.js`)

#### ~~S8.8~~: Thai финализация ✅ (уже было — `formats/thai/thai-boot.js`)

#### ~~S8.9~~: Админ — вкладка «Рейтинг» ✅ (уже было — `admin-init.js`, `admin.html`)

#### ~~S8.10~~: rating.html — история из сервера ✅ (2026-03-24, `rating.html` — Supabase RPC → static JSON → localStorage cache)

#### ~~S8.11~~: Тесты ✅ (уже было — `tests/unit/finalize.test.js` — 13 тестов sync/finalize/delta)

---

## ВАЖНЫЕ ПРАВИЛА

1. **Offline-first**: всё должно работать без сети. Серверные вызовы — опциональные, с try/catch и fallback.

2. **globalThis pattern**: shared/ модули экспортируют в `globalThis` для доступа из classic scripts:
   ```javascript
   // shared/something.js
   export function foo() { ... }
   globalThis.foo = foo;
   ```

3. **Не трогай файлы, которые уже изменены** (см. список ✅ выше), если нет прямой необходимости.

4. **SW cache**: любой новый `.js` файл добавляй в `CORE_ASSETS` в `sw.js` и бампни версию.

5. **Тесты**: после каждого этапа проверяй `npm run test:unit` (199 тестов должны пройти + твои новые).

6. **CSP**: НЕ добавляй `'unsafe-inline'` в `script-src`. Все скрипты через `src=`.

7. **sessionStorage для секретов**: `kotc3_sb` (Supabase config) хранится в `sessionStorage`, НЕ `localStorage`.

8. **judgeMode**: уже определён в `globalThis.judgeMode` (frozen object) при загрузке. Используй его.
   ```javascript
   const jm = globalThis.judgeMode;
   if (jm?.active) {
     // judge mode: jm.court, jm.trnId, jm.token, jm.judgeName
   }
   ```

9. **Порядок**: Фаза 7 (S7.3, S7.7, S7.8, S7.9) → Фаза 8 (S8.1–S8.11). Не перепрыгивай.

---

## Быстрый старт

```bash
npm run dev          # dev-сервер на :8055
npm run test:unit    # 199 unit tests
npx playwright test  # e2e
```

Ключевые файлы для понимания архитектуры:
- `assets/js/main.js` — bootstrap, script loading, judgeMode init
- `assets/js/integrations.js` — Supabase connect, broadcast, sync
- `admin-init.js` — вся логика админ-панели
- `formats/kotc/kotc.js` — KOTC format module
- `formats/thai/thai-boot.js` — Thai format module
- `shared/api.js` — API layer (apiFetch, Supabase RPC)
- `migrations/007_judge_sessions.sql` — текущая SQL миграция
