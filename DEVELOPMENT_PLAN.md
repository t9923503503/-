# План развития приложения "Лютые Пляжники"

---

## ИНСТРУКЦИЯ ДЛЯ ИИ-АГЕНТОВ (ОБЯЗАТЕЛЬНО К ПРОЧТЕНИЮ)

> **Этот план рассчитан на одновременную работу 2-3 ИИ-агентов.**
> Каждый агент ОБЯЗАН выполнять протокол координации ниже.

### Роли агентов

| Роль | Зона файлов (НЕ ТРОГАТЬ чужое!) | Цвет |
|------|----------------------------------|------|
| **ARCH** | `shared/*`, `assets/js/main.js`, `index.html`, `sw.js`, `formats/kotc/*` (архитектура), `admin.html` | 🔵 |
| **FORMAT** | `formats/*/` (UI и бизнес-логика форматов), `assets/js/ui/*`, `assets/js/screens/components.js` | 🟣 |
| **QA** | `tests/*`, `scripts/*`, `playwright.config.ts`, `vitest.config.ts` | 🟢 |

### Протокол работы с задачами

**1. ПЕРЕД НАЧАЛОМ РАБОТЫ:**
- Прочитай `STATUS.md` — проверь нет ли конфликтов
- Прочитай этот план — найди задачу из СВОЕЙ роли
- Проверь колонку "Зависит от" — если зависимость не выполнена, выбери другую задачу
- Проверь что задача ещё не взята другим агентом (нет отметки 🔄)

**2. ВЗЯТИЕ ЗАДАЧИ В РАБОТУ:**
Отредактируй строку задачи в этом плане — добавь отметку:

```
До:  | A1.1 | **Error boundaries** — ... |
После: | A1.1 | 🔄 `ARCH 2026-03-22` **Error boundaries** — ... |
```

Формат отметки: `🔄 РОЛЬ ДАТА`

Также обнови `STATUS.md` — добавь задачу как `- [ ] **ID** — описание (in_progress, РОЛЬ)`

**3. ПОСЛЕ ЗАВЕРШЕНИЯ ЗАДАЧИ:**
Отредактируй строку задачи в этом плане:

```
До:  | A1.1 | 🔄 `ARCH 2026-03-22` **Error boundaries** — ... |
После: | A1.1 | ✅ `ARCH 2026-03-22→03-22` **Error boundaries** — ... |
```

Формат отметки: `✅ РОЛЬ ДАТА_СТАРТ→ДАТА_ФИНИШ`

Также обнови `STATUS.md`:
- Пометь задачу: `- [x] **ID** — описание ✅ (дата, файлы)`
- Добавь строку в таблицу CHANGELOG: `| дата | РОЛЬ | ID | файлы | заметки |`

**4. ЕСЛИ БЛОКЕР:**
- Запиши в секцию BLOCKED в `STATUS.md`: `[РОЛЬ] ID: описание проблемы → кто может разблокировать`
- Верни задачу в статус "не взята" (убери 🔄, поставь 🚫):
```
| A1.1 | 🚫 `ARCH blocked: нужен X от FORMAT` **Error boundaries** — ... |
```

### Правила параллельной работы

1. **НЕ ТРОГАЙ чужие файлы** — см. таблицу зон выше
2. **Если нужен файл из чужой зоны** — запиши в BLOCKED, жди пока владелец сделает
3. **Перед коммитом** прогони тесты своей зоны:
   - ARCH: `npm run test:unit` (проверить что shared/ не сломан)
   - FORMAT: проверить формат в браузере вручную
   - QA: `npm run test:gate`
4. **Не бери больше 1 задачи одновременно** — сначала закончи текущую
5. **Задачи с зависимостями** берутся только после того, как зависимость отмечена ✅

### Порядок выдачи задач

Агенты берут задачи **сверху вниз по фазам**. Фаза 2 начинается только когда все MUST-задачи Фазы 1 завершены (A1.1-A1.3, Q1.1-Q1.2). QA-задачи с зависимостями от ARCH/FORMAT ждут завершения зависимости.

### Пример промпта для запуска агента

```
Роль: ARCH
Контекст:
- Проект: f:\2103\ФИНАЛ
- Координация: прочитай STATUS.md и план из этого файла
- Зона: shared/*, assets/js/main.js, index.html, sw.js, formats/kotc/* (архитектура)
- НЕ трогай файлы FORMAT (formats/*/UI) и QA (tests/*)
Задача: A1.1 — Error boundaries
Требования:
1) Отметь задачу 🔄 в плане и STATUS.md
2) Выполни задачу
3) Прогони: npm run test:unit
4) Отметь задачу ✅ в плане, STATUS.md + CHANGELOG
5) Дай отчёт: что сделано, файлы, результаты тестов
```

---

## Контекст

Предыдущий квартальный план полностью выполнен: Thai-формат production-ready (95%+), IPT стабилен, shared-слой из 9 модулей создан, CI/CD на GitHub Actions работает, release gate настроен. Однако при аудите выявлены серьёзные пробелы: KOTC — лишь iframe-обёртка над legacy-кодом (~6000 строк дублирования), нет error boundaries, CSP использует `unsafe-inline`, accessibility отсутствует, нет build system. Нужен сбалансированный план без привязки к срокам — приоритизированный backlog по фазам.

---

## ФАЗА 1: Стабилизация продакшена

**Цель:** Сделать приложение надёжным — не падает, не теряет данные, безопасно.

### ARCH

| ID | Задача | Файлы | Зависит от |
|----|--------|-------|------------|
| A1.1 | ✅ `ARCH 2026-03-22→2026-03-22` **Error boundaries** — глобальный `window.onerror` + `onunhandledrejection`, toast вместо белого экрана, лог последних 50 ошибок в localStorage | `assets/js/main.js`, новый `assets/js/ui/error-handler.js` | — |
| A1.2 | ✅ `ARCH 2026-03-22→2026-03-22` **Валидация состояния** — guard-функции в app-state (bounds check на scores[ci][mi][ri]), enforce лимита eventLog (450), sanitize ответов API | `assets/js/state/app-state.js`, `shared/players.js`, `shared/api.js` | — |
| A1.3 | ✅ `ARCH 2026-03-22→2026-03-22` **CSP fix** — убрать `unsafe-inline` из `index.html` (строка 7), вынести inline-скрипты (строки 43-50) в отдельный файл. Исправить auth fallback: `crypto.subtle` недоступен → блокировать, а не `return true` | `index.html`, `assets/js/ui/roster-auth.js` | — |
| A1.4 | ✅ `ARCH 2026-03-22→2026-03-22` **Retry + offline** — exponential retry (3 попытки) в `shared/api.js`, try/catch на все `localStorage.setItem` с QuotaExceededError toast, offline-баннер (`navigator.onLine`) | `shared/api.js`, `shared/utils.js`, `assets/js/main.js` | A1.1 |
| A1.5 | ✅ `ARCH 2026-03-22→2026-03-22` **State refactor (начало)** — обернуть 20+ глобалов из `app-state.js` в объект `AppState` с геттерами/сеттерами, адаптер через `globalThis.AppState` | `assets/js/state/app-state.js` | A1.2 |

### QA

| ID | Задача | Файлы | Зависит от |
|----|--------|-------|------------|
| Q1.1 | ✅ `QA 2026-03-22→03-22` **Тесты error handling** — unit: onerror перехватывает; smoke: corrupted localStorage не роняет страницу | `tests/unit/error-handler.test.js`, `tests/smoke/` | A1.1, A1.4 |
| Q1.2 | ✅ `QA 2026-03-22→03-22` **Тесты безопасности** — unit: без `crypto.subtle` доступ заблокирован; CSP парсинг HTML — нет `unsafe-inline` | `tests/unit/roster-auth.test.js` | A1.3 |
| Q1.3 | ✅ `QA 2026-03-22→03-22` **Release gate v2** — добавить проверку CSP, localStorage error handling; обновить smoke для offline | `scripts/release-gate.mjs`, `tests/smoke/` | A1.3, A1.4 |
| Q1.4 | ✅ `QA 2026-03-22→03-22` **Базовая a11y** — `aria-label` на score-кнопки (`shared/ui-kit.js`), интерактивные `div` → `button`, `aria-current="page"` на активный таб, keyboard-навигация Tab+Enter | `shared/ui-kit.js`, `assets/js/screens/components.js`, `assets/js/screens/core.js` | — |

### Контрольная точка
- Error handler ловит ошибки, показывает toast
- CSP без `unsafe-inline`, auth не пропускает без crypto
- API retry работает, quota мониторится
- Keyboard-навигация по табам работает
- Release gate v2 проходит

---

## ФАЗА 2: Миграция KOTC

**Цель:** Перевести KOTC с iframe-bridge на standalone формат (как Thai), устранить дублирование ~6000 строк.

### FORMAT

| ID | Задача | Файлы | Зависит от |
|----|--------|-------|------------|
| F2.0 | ✅ **Аудит legacy KOTC** — карта `web/public/kotc/assets/js/` (~6000 строк): что переиспользовать из shared/, что KOTC-специфичное (King stays, challenge, ротация) | `web/public/kotc/` (чтение) → документ миграции | — |

### ARCH

| ID | Задача | Файлы | Зависит от |
|----|--------|-------|------------|
| A2.1 | ✅ **KOTC math extraction** — вытащить бизнес-логику в `formats/kotc/kotc-format.js` (ES module, чистые функции) по паттерну `formats/thai/thai-format.js` | `formats/kotc/kotc-format.js` (новый) | F2.0 |
| A2.2 | ✅ **KOTC standalone page** — переписать `formats/kotc/kotc.html` с iframe на полноценную страницу, подключить shared/ модули, переписать `kotc.js` на shared-компоненты | `formats/kotc/kotc.html`, `formats/kotc/kotc.js`, `formats/kotc/kotc.css` | A2.1 |
| A2.3 | ✅ **KOTC в навигацию** — `buildKotcFormatUrl()` в `shared/format-links.js`, launcher в roster.js, карточки KOTC на home.js | `shared/format-links.js`, `assets/js/screens/roster.js`, `assets/js/screens/home.js` | A2.2 |
| A2.4 | ✅ **SW update** — добавить `formats/kotc/*` в CORE_ASSETS, инкрементировать CACHE_VERSION | `sw.js` | A2.2 |

### FORMAT

| ID | Задача | Файлы | Зависит от |
|----|--------|-------|------------|
| F2.1 | ✅ **KOTC UI экраны** — roster (4 на корт, ротация), courts (King stays, challenge), standings (рейтинг сессии) на shared/ui-kit | `formats/kotc/kotc.js`, `formats/kotc/kotc.css` | A2.1, A2.2 |

### QA

| ID | Задача | Файлы | Зависит от |
|----|--------|-------|------------|
| Q2.1 | ✅ **KOTC unit-тесты** — ротация, очки, определение победителя, edge cases (46 тестов) | `tests/unit/kotc-format.test.js` | A2.1 |
| Q2.2 | ✅ `QA 2026-03-22→03-22` **KOTC E2E** — создание сессии из хаба, полный цикл, навигация хаб↔KOTC (5 тестов) | `tests/e2e/kotc-flow.spec.ts` | A2.2, F2.1 |
| Q2.3 | ✅ `QA 2026-03-22→03-22` **Regression** — Thai E2E + IPT smoke + hub smoke проходят (8/8 passed) | существующие тесты | A2.3 |

### Контрольная точка
- ✅ `formats/kotc/kotc-format.js` содержит чистые функции, unit-тесты зелёные (46/46)
- ✅ KOTC запускается из хаба как standalone (не iframe)
- ✅ Legacy `web/public/kotc/` помечен deprecated
- ✅ Regression Thai/IPT зелёный (8/8 smoke + Thai E2E)
- ✅ KOTC E2E 5/5 passed, unit 139/139 passed

---

## ФАЗА 3: Инфраструктура и рефакторинг

**Цель:** Build system, разбить монолиты, экспорт данных.

### ARCH

| ID | Задача | Файлы | Зависит от |
|----|--------|-------|------------|
| A3.1 | ✅ `ARCH 2026-03-22→03-22` **Vite build** — 9 HTML entry points, ES modules bundled + tree-shaken, classic scripts copied via post-build plugin. `npm run build` → dist/ (452ms). `npm run dev` → Vite HMR | `vite.config.js` (новый), `package.json` | Фаза 2 |
| A3.2 | ✅ `ARCH 2026-03-22→03-22` **Разбить монолиты** — `core.js` → 3 файла (render/lifecycle/navigation), `roster.js` → 3 файла (format-launcher/edit/list). main.js + sw.js обновлены, все функции работают | `assets/js/screens/core-*.js`, `assets/js/screens/roster-*.js` | A3.1 |
| A3.3 | ✅ `ARCH 2026-03-22→03-22` **Admin dashboard** — Quick Launch (Thai/IPT/KOTC), Active/Finished toggle, кнопка "Открыть" на карточках турниров | `admin.html` | A3.1 |

### FORMAT

| ID | Задача | Файлы | Зависит от |
|----|--------|-------|------------|
| F3.1 | ✅ `FORMAT 2026-03-22→03-22` **Экспорт архива** — JSON + CSV кнопки на FINISHED экранах Thai и KOTC. Общий модуль `shared/export-utils.js` (BOM для Excel Cyrillic) | `shared/export-utils.js` (новый), `formats/thai/thai.html`, `formats/kotc/kotc.js` | — |

### QA

| ID | Задача | Файлы | Зависит от |
|----|--------|-------|------------|
| Q3.1 | ✅ `QA 2026-03-22→03-22` **Build smoke** — 8 тестов: SW CORE_ASSETS, main.js APP_SCRIPT_ORDER, dist HTML/JS, CSP. Release gate расширен до 5 шагов (+vite build) | `tests/unit/build-smoke.test.js`, `scripts/release-gate.mjs` | A3.1 |
| Q3.2 | ✅ `QA 2026-03-22→03-22` **Stress-тест localStorage** — 7 тестов: QuotaExceeded, 450 history, 200 players, 50 tournaments, combined <500KB, export roundtrip | `tests/unit/localstorage-stress.test.js` | F3.1 |

### Контрольная точка
- ✅ `npm run build` генерирует рабочий бандл (452ms, 9 entry points)
- ✅ `core.js` и `roster.js` разбиты на модули (6 файлов)
- ✅ Экспорт JSON/CSV работает (Thai + KOTC)
- ✅ Admin dashboard: Quick Launch, Active/Finished toggle, турниры с "Открыть"

---

## ФАЗА 4: Платформенные возможности

**Цель:** i18n, real-time sync, продвинутая accessibility, рейтинговые множители.

> **Примечание для агентов:** A4.1 закрыта на уровне **инфраструктуры** — `shared/i18n.js`, каталог `locales/`, строки в shared и критичные toasts. Перенос **хардкода с экранов** (home, roster, навигация, KOTC и т.д.) на `t()` — это **Фаза 5, задачи S5.8–S5.11**; не трактуйте A4.1 как «ещё не сделано», если видите русский в `home.js`.

### ARCH

| ID | Задача | Файлы | Зависит от |
|----|--------|-------|------------|
| A4.1 | ✅ `ARCH 2026-03-22→2026-03-22` **i18n (инфраструктура)** — `shared/i18n.js` (ru/en), `locales/ru.json` + `locales/en.json`, shared-модули и toast-сообщения | `shared/i18n.js`, `locales/*` | A3.1 |
| A4.2 | ✅ **Real-time sync** — расширить `shared/api.js` для Supabase realtime. Переработать `kotc-sync.js` (270 строк) в общий `shared/realtime.js`. Организатор вводит счёт → зрители видят за 1-2 сек | `shared/realtime.js` (новый), `sw.js` | A1.4 |
| A4.3 | ✅ `ARCH 2026-03-22→2026-03-22` **Рейтинговые множители** — `BASE_POINTS * FORMAT_MULTIPLIER` (x1.0 Thai, x0.8 KOTC и т.д.), фильтр по формату в `rating.html` | `rating.html`, `shared/ratings.js` | — |

### FORMAT

| ID | Задача | Файлы | Зависит от |
|----|--------|-------|------------|
| F4.1 | ✅ **Продвинутая a11y** — focus trap в модалах, auto-focus при открытии, стрелки для табов, `role="tablist/tab/tabpanel"` | `assets/js/screens/components.js`, `assets/js/screens/core-navigation.js`, `shared/ui-kit.js`, `assets/js/runtime.js` | Q1.4 |

### QA

| ID | Задача | Файлы | Зависит от |
|----|--------|-------|------------|
| Q4.1 | ✅ `QA 2026-03-22→2026-03-22` **i18n тесты** — все ключи ru.json есть в en.json; smoke: переключение языка не ломает UI | `tests/unit/i18n.test.js` | A4.1 |
| Q4.2 | ✅ **Real-time integration** — два клиента синхронизируются; offline-клиент получает данные при reconnect | `tests/unit/realtime.test.js` | A4.2 |
| Q4.3 | ✅ `QA 2026-03-22→2026-03-22` **Финальный аудит** — полный прогон всех тестов, обновление документации | `STATUS.md`, `DEVELOPMENT_PLAN.md` | все задачи Ф4 |

### Контрольная точка ✅ ФАЗА 4 ЗАВЕРШЕНА
- ✅ Переключение ru/en работает (shared/i18n.js + locales/)
- ✅ Real-time sync (shared/realtime.js — WebSocket broadcast channels)
- ✅ Рейтинги с множителями по формату (shared/ratings.js — 7 форматов)
- ✅ Продвинутая a11y (FocusTrap, AriaTabList в ui-kit.js)
- ✅ Все тесты зелёные: 193 unit + 7 smoke

---

## Фаза 5 — Безопасность + Code Quality

> **Статус:** ARCH S5.1–S5.11 ✅ (включая i18n экранов S5.8–S5.11).

### ARCH

| ID | Задача | Файлы | Зависит от |
|----|--------|-------|------------|
| S5.1 | ✅ `ARCH 2026-03-22→2026-03-22` **Убрать web/.next/ из git** — `.gitignore` + `git rm --cached` (закоммитить staged) | `.gitignore` | — |
| S5.2 | ✅ `ARCH 2026-03-22→2026-03-22` **Убрать hardcoded секрет** — `FALLBACK_ADMIN_SESSION_SECRET` | `web/middleware.ts` | — |
| S5.3 | ✅ `ARCH 2026-03-22→2026-03-22` **CSP style-src** — offline-banner: класс `is-visible` + CSS; Vite `transformIndexHtml` убирает unsafe-inline (кроме register/profile с inline `<style>`) | `vite.config.js`, `shared/api.js`, `assets/app.css`, `shared/base.css`, `scripts/release-gate.mjs` | — |
| S5.4 | ✅ `ARCH 2026-03-22→2026-03-22` **SW cache** — `admin.css` в CORE_ASSETS, v59 | `sw.js` | — |
| S5.5 | ✅ `ARCH 2026-03-22→2026-03-22` **admin.css** — стили вынесены из `<style>` | `admin.html`, `admin.css` | — |
| S5.6 | ✅ `ARCH 2026-03-22→2026-03-22` **Legacy KOTC** — `web/public/kotc/DEPRECATED.md`, не трогать до обновления Next | `web/public/kotc/` | — |
| S5.7 | ✅ `ARCH 2026-03-22→2026-03-22` **Realtime snapshot** — `request_snapshot` + тесты | `shared/realtime.js`, `tests/unit/realtime.test.js` | — |

### FORMAT

| ID | Задача | Файлы | Зависит от |
|----|--------|-------|------------|
| S5.8 | ✅ `FORMAT 2026-03-22→2026-03-22` **i18n: home.js** — `tr()` + ключи `home.*` в локалях | `assets/js/screens/home.js`, `locales/*.json` | — |
| S5.9 | **i18n: roster screens** — format-launcher, edit, list | `assets/js/screens/roster-*.js`, `locales/*.json` | ✅ |
| S5.10 | **i18n: navigation + runtime** — табы, toast, модалки | `assets/js/screens/core-navigation.js`, `assets/js/runtime.js`, `assets/js/screens/components.js`, `locales/*.json` | ✅ |
| S5.11 | **i18n: format pages** — KOTC кнопки, заголовки | `formats/kotc/kotc.js`, `locales/*.json` (`kotc.html` — статика; строки UI в JS + `_boot`) | ✅ |

### Контрольная точка
- git status — нет web/.next/ файлов
- CSP: нет `unsafe-inline` в style-src
- admin.html — нет inline style= атрибутов
- i18n.t() работает во всех экранах, ru↔en переключение
- Все тесты зелёные

---

## Фаза 6 — Production Hardening (внешний аудит) 🔄 2026-03-23

**Цель:** закрыть критичные внешние риски релиза: auth/redirect, негативные сценарии API, базовый security perimeter.

### Расклад на 2 ИИ

| Роль | Агент | Зона |
|------|-------|------|
| **ARCH** | **ИИ-1** | `web/middleware.ts`, `web/app/api/*`, `web/next.config.ts`, `web/app/(robots|sitemap).ts` |
| **FORMAT** | **ИИ-2** | `web/app/calendar/*`, `web/components/calendar/*`, `web/components/rankings/*` |

### ARCH (ИИ-1)

| ID | Задача | Файлы | Статус |
|----|--------|-------|--------|
| S6.1 | Исправить редирект `/sudyam` без `localhost` leak (учесть reverse proxy headers) | `web/middleware.ts`, `web/app/sudyam/page.tsx` | ✅ `ARCH 2026-03-23→2026-03-23` |
| S6.2 | Негативный сценарий `tournamentId`: `404/400` вместо `500` | `web/app/api/tournament-register/route.ts` | ✅ `ARCH 2026-03-23→2026-03-23` |
| S6.3 | Добавить базовые security headers + `robots/sitemap` | `web/next.config.ts`, `web/app/robots.ts`, `web/app/sitemap.ts` | ✅ `ARCH 2026-03-23→2026-03-23` |
| S6.5 | Усилить auth судей: rate limit + lock window + `Retry-After` | `web/app/api/sudyam-auth/route.ts` | ✅ `ARCH 2026-03-23→2026-03-23` |

### FORMAT (ИИ-2)

| ID | Задача | Файлы | Статус |
|----|--------|-------|--------|
| S6.4 | UX-polish закрытых турниров: скрыть/заблокировать form path и выровнять CTA | `web/app/calendar/[id]/page.tsx`, `web/app/calendar/[id]/register/page.tsx` | ✅ `FORMAT 2026-03-23→2026-03-23` |
| S6.6 | Проверить и выровнять player links рейтинга + guard для `/api/archive` в smoke (чтобы не падал gate) | `web/components/rankings/PlayerRow.tsx`, `assets/js/screens/home.js` | ✅ `FORMAT 2026-03-23→2026-03-23` |

### Контрольная точка
- `/sudyam` не редиректит на localhost извне
- `/api/tournament-register` на несуществующий id возвращает `404`
- `/api/sudyam-auth` ограничивает brute-force (`429`, `Retry-After`)
- В проде есть `robots.txt` и `sitemap.xml`
- Применены базовые security headers на публичных страницах

---

## Приоритеты (если время ограничено — отбрасываем снизу)

1. **MUST:** A1.1-A1.3 (error handling, CSP, auth fix) — без этого продакшен небезопасен
2. **MUST:** Фаза 2 целиком (KOTC миграция) — устранение ~6000 строк дублирования
3. **SHOULD:** A3.1 (Vite build) — 27 скриптов загружаются вручную
4. **SHOULD:** A3.2 (разбить монолиты) — core.js 1135 строк, roster.js 1194 строки
5. **SHOULD:** F3.1 (экспорт) — организаторам нужны отчёты
6. **DONE:** A4.1–A4.3, Q4.1–Q4.3 (Фаза 4 закрыта; см. примечание про i18n экранов → S5.8–S5.11)
7. **IN PROGRESS:** Фаза 5 — безопасность, CSP style-src, admin CSS, SW, realtime snapshot, i18n экранов
8. **COULD (после Ф5):** новые локали помимо ru/en, расширение ключей в `locales/*`

---

## Риски

| Риск | Митигация |
|------|-----------|
| KOTC legacy (~6000 строк) сильно связан, трудно извлечь | F2.0 аудит первым; если буксует — оставить iframe и фокус на инфраструктуру |
| Vite ломает порядок загрузки 27 classic scripts | Vite для новых форматов, legacy bundle как fallback, миграция файл за файлом |
| localStorage переполнение на турнире (5MB) | A1.4 мониторинг quota в Фазе 1; архивация в API; LZ-string сжатие |
| Supabase downtime во время турнира | Offline-first (PWA), real-time — опциональный слой |
| Файловые конфликты ARCH/FORMAT/QA | Чёткие зоны в STATUS.md; конфликты через BLOCKED |

---

## Верификация

После каждой фазы прогонять:
```bash
npm run test:unit                              # vitest — unit тесты
npx playwright test tests/smoke.spec.ts        # hub regression
npx playwright test tests/e2e --reporter=list  # E2E все форматы
npm run test:gate                              # полный release gate
```

Для KOTC-миграции дополнительно: ручная проверка запуска KOTC из хаба, полный цикл в браузере.
