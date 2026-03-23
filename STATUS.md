# 📋 STATUS.md — Координация агентов

> **КАЖДЫЙ АГЕНТ ЧИТАЕТ ЭТОТ ФАЙЛ ПЕРЕД НАЧАЛОМ РАБОТЫ**
>
> Обновляй свою секцию после каждой завершённой задачи.
> Не трогай чужие секции (кроме BLOCKED).
>
> Формат: `- [ ] Задача` → `- [x] Задача ✅ (дата, файлы)`

---

## Текущий этап: ФАЗА 5 ЗАВЕРШЕНА ✅ — все задачи S5.1–S5.11 выполнены

### Фаза 5 задачи
- [x] **S5.1** — Убрать web/.next/ из git ✅ (2026-03-22, `.gitignore`; при необходимости закоммитить staged `git rm`)
- [x] **S5.2** — Убрать hardcoded секрет ✅ (2026-03-22, `web/middleware.ts` — `getAdminSessionSecret()`, prod без env → throw)
- [x] **S5.3** — CSP style-src + offline banner + Vite dist ✅ (2026-03-22, `vite.config.js`, `shared/api.js`, `assets/app.css`, `scripts/release-gate.mjs`)
- [x] **S5.4** — SW cache ✅ (2026-03-22, `sw.js` v59, `admin.css` в CORE_ASSETS)
- [x] **S5.5** — admin.css ✅ (2026-03-22, `admin.css`, `admin.html`)
- [x] **S5.6** — Решить судьбу web/public/kotc/ ✅ (2026-03-22, web/public/kotc/DEPRECATED.md)
- [x] **S5.7** — Realtime: snapshot после reconnect ✅ (2026-03-22, shared/realtime.js, tests/unit/realtime.test.js)
- [x] **S5.8** — i18n: home.js (FORMAT) ✅ (2026-03-22, `assets/js/screens/home.js`, `locales/ru.json`, `locales/en.json` — `tr()` + ключи `home.*`)
- [x] **S5.9** — i18n: roster screens (FORMAT) ✅ (2026-03-23, уже полностью на `tr()`, все ключи в locales)
- [x] **S5.10** — i18n: navigation + runtime (FORMAT) ✅ (2026-03-23, `runtime.js` fmtDateLong locale-aware, `components.js` tooltip i18n)
- [x] **S5.11** — i18n: format pages (FORMAT) ✅ (2026-03-23, `kotc.html` + `kotc.js` — _boot() уже заменяет HTML placeholder'ы через i18n)

### Предыдущие этапы
- ФАЗА 4 ЗАВЕРШЕНА ✅ (A4.1 ✅, Q4.1 ✅, A4.3 ✅, F4.1 ✅, A4.2 ✅, Q4.2 ✅, Q4.3 ✅)

---

## 🗺️ Квартальный план

- Основной файл плана: `QUARTER_PRODUCT_ROADMAP.md`

---

## 🤝 Инструкция: работа 2–3 ИИ параллельно

### Роли
- **ИИ-1 (ARCH):** архитектура, shared-слой, интеграции, migration.
- **ИИ-2 (FORMAT):** функционал форматов, UI сценарии формата, валидации.
- **ИИ-3 (QA):** unit/e2e/smoke, regression, gate-скрипты, документация тестов.

### Правила запуска
- Перед стартом каждый ИИ читает `STATUS.md`.
- Каждый ИИ берёт только свои задачи и сразу помечает их `in_progress` (или пишет в секции своей роли, что взял задачу).
- Одновременно не трогать один и тот же файл несколькими ИИ.

### Правила синхронизации
- После завершения задачи: `- [x] ... ✅ (дата, файлы)`.
- В `CHANGELOG` добавить строку: кто, что, какие файлы, что сделано.
- Если задача блокируется — писать в `🚧 BLOCKED` в формате:
  `[РОЛЬ] ЗАДАЧА: проблема → кто разблокирует`.

### Разделение зон файлов (по умолчанию)
- **ARCH:** `shared/*`, `assets/js/main.js`, `assets/js/integrations*`, `formats/kotc/*`.
- **FORMAT:** `formats/thai/*`, форматные экраны и логика формата.
- **QA:** `tests/*`, `playwright.config.ts`, `vitest.config.ts`, `scripts/release-gate.mjs`.

### Merge policy
- Мелкие изменения — отдельные коммиты по задаче.
- Перед push обязательно прогон:
  - `npm run test:unit`
  - `npx playwright test tests/smoke.spec.ts --reporter=list`
  - `npm run test:e2e:thai`
- После зелёных тестов обновить `STATUS.md`, только затем push.

---

## 🔵 ARCH — Архитектор

### Фаза 1 (Стабилизация) — ARCH завершён ✅

- [x] **A1.1** — Error boundaries ✅ (2026-03-22, `assets/js/ui/error-handler.js`, `assets/js/main.js`)
- [x] **A1.2** — Валидация состояния ✅ (2026-03-22, `assets/js/state/app-state.js`: getScore/setScore/pushHistory/sanitizePlayer)
- [x] **A1.3** — CSP fix + auth fallback ✅ (2026-03-22, `index.html`: убран unsafe-inline из script-src, `assets/js/init-helpers.js`: вынесен inline-скрипт, `assets/js/ui/roster-auth.js`: guard на crypto.subtle)
- [x] **A1.4** — Retry + offline ✅ (2026-03-22, `shared/api.js`: _withRetry, offline banner, _safeSetItem)
- [x] **A1.5** — State refactor ✅ (2026-03-22, `assets/js/state/app-state.js`: globalThis.AppState с геттерами/сеттерами)

> **QA-агент:** все ARCH задачи готовы. Q1.4 независима — можно делать сразу. Q1.2 (тесты CSP+auth) — A1.3 готова. Q1.1+Q1.3 (тесты retry+offline) — A1.4 готова.

### Фаза 2 (KOTC Миграция) — ARCH завершён ✅

- [x] **F2.0** — Аудит legacy KOTC ✅ (2026-03-22, план миграции в `plans/mellow-jumping-mitten.md`)
- [x] **A2.1** — KOTC math extraction ✅ (2026-03-22, `formats/kotc/kotc-format.js`: 370 строк чистых функций)
- [x] **A2.2** — KOTC standalone page ✅ (2026-03-22, `formats/kotc/kotc.html`, `kotc.js`, `kotc.css`)
- [x] **A2.3** — KOTC в навигацию ✅ (2026-03-22, `shared/format-links.js`, `roster.js`, `home.js`)
- [x] **A2.4** — SW update ✅ (2026-03-22, `sw.js` v53)
- [x] **F2.1** — KOTC UI экраны ✅ (2026-03-22, `formats/kotc/kotc.js`, `kotc.css`)
- [x] **Q2.1** — KOTC unit-тесты ✅ (2026-03-22, 46 тестов, `tests/unit/kotc-format.test.js`)

- [x] **Q2.2** — KOTC E2E ✅ (2026-03-22, `tests/e2e/kotc-flow.spec.ts`, 5 тестов)
- [x] **Q2.3** — Regression ✅ (2026-03-22, smoke 8/8 + Thai E2E 1/1 passed)

> **Фаза 2 полностью завершена.** Следующая: Фаза 3 (Vite build, разбить монолиты, экспорт).

---

### Этап 0

- [x] **A0.1** — Создать shared/ ✅ (2026-03-20)
  - Файлы: `shared/utils.js`, `shared/players.js`, `shared/timer.js`, `shared/table.js`, `shared/ui-kit.js`, `shared/api.js`, `shared/auth.js`, `shared/base.css`
  - **API:** sharedUtils, sharedPlayers, sharedTimer, sharedTable, sharedUiKit, sharedApi, sharedAuth + globalThis exports

- [x] **A0.2** — Перевести IPT на shared/ (proof of concept) ✅ (2026-03-20)
  - Файлы: `assets/js/main.js` (dynamic import preload), `assets/js/ui/ipt-format.js` (sharedPlayers bridge в generateIPTGroups)

- [x] **A0.3** — Format Launcher (хаб → формат) ✅ (2026-03-20)
  - Файлы: `assets/js/screens/roster.js` (Thai таб + _renderThaiCard + launchThaiFormat → formats/thai/thai.html)

### Этап 1

- [x] **A1.1** — Format page HTML template ✅ (2026-03-20)
  - Файлы: `formats/thai/thai.html` (standalone ES-module page, загружает shared/ + thai-format.js)

- [x] **A1.2** — Навигация внутри формата (pill-табы туров, табы групп) ✅ (2026-03-20)
  - Файлы: `formats/thai/thai.html` (pill-tabs туров, group-tabs, экраны roster/courts/standings/r2/finished)

- [x] **A1.3** — Server sync: save/load tournament state ✅ (2026-03-20)
  - Файлы: `shared/api.js` (apiGet, apiPost, saveTournamentToServer, loadTournamentFromServer, syncTournamentAsync)

- [x] **A1.4** — Rating integration ✅ (2026-03-20)
  - Файлы: `formats/thai/thai.html` (_thaiFinishTournament hook + updatePlayerRatings via shared/api)

- [x] **A1.5** — Карточки тай-турниров на главной ✅ (2026-03-20)
  - Файлы: `assets/js/screens/home.js` (isThai detection + Thai card HTML + кнопка открывает thai.html)

---

## 🟣 FORMAT — Формат-разработчик

### Этап 0

- [x] **F0.1** — Core Math: thai-format.js (НЕТ зависимостей, можно начинать сразу) ✅ (2026-03-20)
  - Ветка: `format/thai`
  - Блокирует: F1.3, F1.7, F1.9, F1.10
  - Файлы: `formats/thai/thai-format.js`
  - **СТАТУС:** Функции написаны (thaiCalcPoints, thaiCalcCoef, thaiZeroSumMatch, thaiZeroSumTour, thaiTiebreak, thaiCalcStandings, thaiGenerateSchedule, thaiValidateSchedule, thaiSeedR2, thaiCalcProgress) — требуется Q0.2 unit tests

- [x] **F0.2** — Schedule Generator (НЕТ зависимостей, можно начинать сразу) ✅ (2026-03-20)
  - Ветка: `format/thai`
  - Зависит от: —
  - Блокирует: F1.5
  - Файлы: `formats/thai/thai-format.js` (в том же файле)
  - **СТАТУС:** Функции написаны и экспортированы — требуется Q0.4 schedule validation tests

- [x] **F0.3** — Начало UI ростер-панели (таб «Тай-микст»)
  - Ветка: `format/thai`
  - Зависит от: **A0.1** ← ЖДИ пока ARCH не отметит DONE
  - Файлы: `formats/thai/thai-roster.js`, `formats/thai/thai.html`

### Этап 1

- [x] **F1.1** — Ростер-панель полная (списки, превью, запуск)
- [x] **F1.2** — Карточка корта (score +/−, diff/pts badges) ✅ (2026-03-20)
  - Файлы: `formats/thai/thai.html` (CSS + _renderCourts + _thaiScore), `shared/ui-kit.js` (bugfix `??` → compat)
- [x] **F1.3** — Zero-Sum бар + блокировка ✅ (2026-03-20)
  - Файлы: `formats/thai/thai.html` (_renderZeroSumBar, _canAdvanceTour, блокировка кнопки «Следующий тур»)
- [x] **F1.4** — Кросс-таблица standings ✅ (2026-03-20, `formats/thai/thai.html`)
- [x] **F1.5** — Бейдж судей ✅ (2026-03-20, `formats/thai/thai.html`, `formats/thai/thai.css`)
- [x] **F1.6** — Переключатель Score/Diff ✅ (2026-03-20, `formats/thai/thai.html`)
- [x] **F1.7** — Экран посева R2 ✅ (2026-03-20)
  - Файлы: `formats/thai/thai.html` (_buildR1Standings, _renderR2Seed, зоны Hard/Advance/Medium/Lite)
- [x] **F1.8** — R2 игровой экран ✅ (2026-03-20, `formats/thai/thai.html`)
- [x] **F1.9** — Экран FINISHED ✅ (2026-03-20)
  - Файлы: `formats/thai/thai.html` (_renderFinished, подиум 🥇🥈🥉, итоговая таблица PTS/DIFF/WINS/K)
- [x] **F1.10** — Номинации (6 алгоритмов + UI) ✅ (2026-03-20, `formats/thai/thai.html`, `formats/thai/thai-format.js`, `formats/thai/thai.css`)
- [x] **F1.11** — Telegram-отчёт ✅ (2026-03-20, `formats/thai/thai.html`)
- [x] **F1.12** — CSS стили ✅ (2026-03-20, `formats/thai/thai.css`)

---

## 🟢 QA — Тестировщик + Интегратор

### Фаза 1 (Стабилизация)

- [x] **Q1.4** — Базовая a11y ✅ (2026-03-22, `shared/ui-kit.js`, `assets/js/screens/core.js`, `assets/js/screens/components.js`, `assets/app.css`)
- [x] **Q1.2** — Тесты безопасности ✅ (2026-03-22, `tests/unit/roster-auth.test.js`)
- [x] **Q1.1** — Тесты error handling ✅ (2026-03-22, `tests/unit/error-handler.test.js`, `tests/smoke.spec.ts`, `assets/js/screens/roster.js`)
- [x] **Q1.3** — Release gate v2 ✅ (2026-03-22, `scripts/release-gate.mjs`, `tests/unit/api-storage.test.js`, `tests/smoke.spec.ts`)

### Этап 0

- [x] **Q0.1** — Настройка тестовой инфраструктуры ✅ (2026-03-21, `tests/`, `vitest.config.ts`, `playwright.config.ts`, `package.json`)
  - Ветка: `qa/tests`
  - Блокирует: Q0.2
  - Файлы: `tests/`, `vitest.config.ts`, `playwright.config.ts`, `package.json`

- [x] **Q0.2** — Unit-тесты Core Math (по контракту, параллельно с F0.1)
  - Ветка: `qa/tests`
  - Зависит от: Q0.1
  - Файлы: `tests/unit/thai-format.test.js`
  - Тесты: `npm run test:unit` — все пройдены

- [x] **Q0.3** — IPT Regression после рефактора ✅ (2026-03-20, `tests/smoke/ipt-regression.spec.ts`)
  - Ветка: `qa/tests`
  - Зависит от: **A0.2** ← ЖДИ пока ARCH не отметит DONE
  - Блокирует: A0.3
  - Файлы: `tests/smoke/ipt-regression.spec.ts`

- [x] **Q0.4** — Unit-тесты Schedule Generator ✅ (2026-03-20, `tests/unit/thai-schedule.test.js`)
  - Ветка: `qa/tests`
  - Зависит от: **F0.2** ← ЖДИ пока FORMAT не отметит DONE
  - Файлы: `tests/unit/thai-schedule.test.js`

### Этап 1

- [x] **Q1.1** — E2E: создание тай-турнира ✅ (2026-03-20, `tests/e2e/thai-create.spec.ts`)
- [x] **Q1.2** — E2E: полный R1 ✅ (2026-03-20, `tests/e2e/thai-full-r1.spec.ts`)
- [x] **Q1.3** — E2E: посев R2 ✅ (2026-03-20, `tests/e2e/thai-r2-seed.spec.ts`)
- [x] **Q1.4** — E2E: R2 → FINISHED → номинации ✅ (2026-03-20, `tests/e2e/thai-r2-finished.spec.ts`)
- [x] **Q1.5** — Unit-тесты номинаций ✅ (2026-03-20, `tests/unit/thai-nominations.test.js`)
- [x] **Q1.6** — Regression: хаб не сломался ✅ (2026-03-21, `tests/smoke.spec.ts`, `playwright.config.ts`; `npx playwright test tests/smoke.spec.ts` = 5/5)
- [x] **Q1.7** — Mobile testing ✅ (2026-03-20, `tests/e2e/thai-mobile.spec.ts`)
- [x] **Q1.8** — THAI_GUIDE.md ✅ (2026-03-20, `THAI_GUIDE.md`)

---

## 🚧 BLOCKED

> Если что-то мешает работе — пишите сюда.
> Формат: `[АГЕНТ] ЗАДАЧА: описание проблемы → кто может разблокировать`

(пусто)

---

## 📝 CHANGELOG

> Кто что сделал — для быстрой сверки.

| Дата | Агент | Задача | Файлы | Заметки |
|------|-------|--------|-------|---------|
| 2026-03-20 | ARCH | Инвентарь кода | PLATFORM_ROADMAP.md, STATUS.md | Добавлена секция "ЧТО УЖЕ ЕСТЬ" с детальным описанием структуры, проблем и готовности компонентов |
| 2026-03-20 | FORMAT | F0.1 | formats/thai/thai-format.js | Добавлена контрактная функция `thaiCalcProgress` + экспорт в модуль |
| 2026-03-20 | FORMAT | F0.3 | formats/thai/thai-roster.js, formats/thai/thai.html | Монтирован roster panel: чекбоксы, поиск, авто-баланс, блок старт до полного набора |
| 2026-03-20 | FORMAT | F1.1 | formats/thai/thai-roster.js, formats/thai/thai.html | Ростер полный: stable order под индексы расписания + превью туров и пары + disabled старт до полного набора |
| 2026-03-20 | QA | Q0.4 | tests/unit/thai-schedule.test.js | 36 unit-тестов schedule generator: 6 комбинаций + seed reproducibility + negative cases |
| 2026-03-20 | ARCH | A0.1 | shared/*.js, shared/base.css | Создан shared/ (8 модулей): utils, players, timer, table, ui-kit, api, auth, base.css |
| 2026-03-20 | ARCH | A0.2 | assets/js/main.js, ipt-format.js | PoC: dynamic import preload shared/ в main.js; sharedPlayers bridge в generateIPTGroups |
| 2026-03-20 | ARCH | A0.3 | assets/js/screens/roster.js | Format Launcher: Thai таб в ростере, _renderThaiCard, launchThaiFormat → thai.html |
| 2026-03-20 | ARCH | A1.1+A1.2 | formats/thai/thai.html | Standalone format page: ES-module, shared/ imports, pill-tabs туров, экраны R1/R2/finished |
| 2026-03-20 | ARCH | A1.3 | shared/api.js | Server sync: apiGet/apiPost, saveTournamentToServer, syncTournamentAsync |
| 2026-03-20 | ARCH | A1.4 | formats/thai/thai.html | Rating integration hook: _thaiFinishTournament → updatePlayerRatings |
| 2026-03-20 | ARCH | A1.5 | assets/js/screens/home.js | Thai-карточки на главной: isThai detection, thaiMeta badge, кнопка открывает thai.html |
| 2026-03-20 | FORMAT | F1.2 | formats/thai/thai.html, shared/ui-kit.js | Карточки кортов: 8 карт/тур, +/− счёт, diff/pts badges, persist в localStorage. Bugfix: ?? → compat в ui-kit.js |
| 2026-03-20 | FORMAT | F1.3 | formats/thai/thai.html | Zero-Sum бар (ok/warn/bad), блокировка «Следующий тур» до Σ=0 + все счета введены |
| 2026-03-20 | FORMAT | F1.7 | formats/thai/thai.html | R2 посев: _buildR1Standings → thaiSeedR2 → 4 зоны (Hard/Advance/Medium/Lite) по полам |
| 2026-03-20 | FORMAT | F1.9 | formats/thai/thai.html | FINISHED: подиум 🥇🥈🥉 + итоговая таблица (PTS, DIFF, WINS, K) + _thaiFinishTournament |
| 2026-03-21 | ARCH | UX flow hardening | shared/format-links.js, assets/js/main.js, assets/js/screens/home.js, assets/js/screens/roster.js | Унифицирован генератор ссылок Thai в shared, нормализация mode/n/seed, стабильный launch из home/roster |
| 2026-03-21 | QA | E2E edge cases | tests/e2e/thai-edge-cases.spec.ts | Добавлены edge-case тесты: запрет старта с неполным ростером и бейджи отдыха при n=10 |
| 2026-03-21 | ARCH | KOTC MVP shell | formats/kotc/kotc.html, formats/kotc/kotc.js, formats/kotc/kotc.css | Создана целевая структура formats/kotc/*: legacy-open + iframe-embed MVP |
| 2026-03-21 | QA | Release gates | package.json, scripts/release-gate.mjs | Добавлены test:e2e:thai и test:gate (unit + smoke + e2e), gate прогоняется зелёным |
| 2026-03-21 | ARCH | Admin Panel MVP | web/app/admin/*, web/app/api/admin/*, web/lib/admin-*.ts, web/components/admin/AdminShell.tsx, web/middleware.ts, tests/unit/admin-reports.test.js | Реализованы `/admin` (login + разделы), CRUD турниров/игроков, manual overrides с reason, RBAC (admin/operator/viewer), audit log, CSV/Telegram отчеты; проверки: `npx tsc --noEmit`, `npm run build` (web), `npm run test:unit` |
| 2026-03-21 | ARCH | Admin security hardening | web/lib/admin-auth.ts, web/lib/admin-audit.ts, web/lib/admin-constants.ts, web/db/migrations/20260321_admin_audit_log.sql, web/app/api/admin/*, web/app/admin/*, web/components/admin/AdminShell.tsx, web/middleware.ts | Убран runtime DDL из кода приложения; добавлена actor-based signed admin session (id+role), аудит теперь пишет `actor_id`; сохранены строгие cookie flags и defense-in-depth RBAC в каждом admin API |
| 2026-03-21 | ARCH | Admin hardening v2 | web/lib/admin-auth.ts, web/app/api/admin/tournaments/route.ts, web/app/api/admin/players/route.ts, web/ADMIN_SECURITY.md | В production legacy PIN fallback выключен по умолчанию (`ADMIN_ALLOW_LEGACY_PIN=true` только вручную); при actor-credentials логин требует `id`; для DELETE обязателен `reason`; добавлена security-документация по миграциям/сессиям/ENV |
| 2026-03-21 | QA | Admin auth policy tests | web/lib/admin-auth-policy.ts, tests/unit/admin-auth-policy.test.js, web/lib/admin-auth.ts | Вынесена policy-логика auth в чистый модуль без Next runtime зависимостей; добавлены unit-тесты (parse credentials, legacy pin policy, actor-id requirement), suite: 84/84 ✅ |
| 2026-03-21 | ARCH+QA | Admin input validation hardening | web/lib/admin-validators.ts, web/app/api/admin/tournaments/route.ts, web/app/api/admin/players/route.ts, web/app/api/admin/overrides/route.ts, tests/unit/admin-validators.test.js | Добавлена нормализация/валидация payload для CRUD и overrides (whitelist статусов, обязательные поля, числовые guardrail’ы); suite: 87/87 ✅, `npx tsc --noEmit` + `npm run build` (web) ✅ |
| 2026-03-22 | QA | Q1.4 | shared/ui-kit.js, assets/js/screens/core.js, assets/js/screens/components.js, assets/app.css | Добавлены `aria-label` для score-кнопок и icon-nav, активный таб помечается `aria-current`, логотип/история турниров переведены на `button`, добавлены focus-visible стили; `npm run test:unit` = 89/89 |
| 2026-03-22 | QA | Q1.2 | tests/unit/roster-auth.test.js | Добавлены unit-тесты на блокировку roster-auth без `crypto.subtle` и на отсутствие `unsafe-inline` в `script-src`; `npm run test:unit` = 91/91 |
| 2026-03-22 | QA | Q1.1 | tests/unit/error-handler.test.js, tests/smoke.spec.ts, assets/js/screens/roster.js | Добавлен unit-тест на `window.onerror`; smoke покрывает bootstrap при corrupted localStorage; в `roster.js` добавлен безопасный парсинг selection-state |
| 2026-03-22 | QA | Q1.3 | scripts/release-gate.mjs, tests/unit/api-storage.test.js, tests/smoke.spec.ts | Release gate расширен до preflight + unit + smoke + e2e; добавлен unit-тест на quota-handling `safeSetItem`; smoke проверяет offline banner; `npm run test:gate` ✅ |
| 2026-03-22 | ARCH | A1.1 Error boundaries | assets/js/ui/error-handler.js (новый), assets/js/main.js | window.onerror+onunhandledrejection, toast, лог 50 ошибок в localStorage |
| 2026-03-22 | ARCH | A1.2 Валидация состояния | assets/js/state/app-state.js | getScore/setScore bounds check, pushHistory лимит 450, sanitizePlayer |
| 2026-03-22 | ARCH | A1.3 CSP fix + auth | index.html, assets/js/init-helpers.js (новый), assets/js/ui/roster-auth.js | убран unsafe-inline из script-src, вынесен inline-скрипт, guard на crypto.subtle |
| 2026-03-22 | ARCH | A1.4 Retry + offline | shared/api.js | exponential retry x3, offline banner, _safeSetItem с QuotaExceeded toast |
| 2026-03-22 | ARCH | A1.5 AppState | assets/js/state/app-state.js | globalThis.AppState — адаптер с геттерами/сеттерами для 20+ глобалов |
| 2026-03-22 | ARCH | F2.0 Аудит KOTC | план миграции | Аудит legacy KOTC (~11 000 строк, 33 JS-файла): карта shared-reuse, KOTC-специфичное, план 8 шагов |
| 2026-03-22 | ARCH | A2.1 kotc-format.js | formats/kotc/kotc-format.js | Чистые функции KOTC: ротация, ранкинг, дивизионы, импорт thaiCalcPoints/thaiCalcCoef (~370 строк) |
| 2026-03-22 | QA | Q2.1 KOTC unit-тесты | tests/unit/kotc-format.test.js | 46 тестов: ротация, matchups, ранкинг, дивизионы, edge cases — все зелёные |
| 2026-03-22 | ARCH+FORMAT | A2.2+F2.1 KOTC standalone | formats/kotc/kotc.html, kotc.js, kotc.css | Standalone страница: roster/courts/standings/divisions/finished, Web Audio таймеры, Telegram export (~1600 строк) |
| 2026-03-22 | ARCH | A2.3 KOTC навигация | shared/format-links.js, assets/js/screens/roster.js, assets/js/screens/home.js | buildKotcFormatUrl(), KOTC таб в ростере (4 формата), KOTC карточки на home.js |
| 2026-03-22 | ARCH | A2.4 SW update | sw.js | CACHE_VERSION v51→v53, formats/kotc/* в CORE_ASSETS |
| 2026-03-22 | QA | Q2.2 KOTC E2E | tests/e2e/kotc-flow.spec.ts | 5 E2E тестов: load roster, start stage1, score entry, persistence, hub KOTC tab |
| 2026-03-22 | QA | Q2.3 Regression | существующие тесты | smoke 8/8, Thai E2E 1/1, unit 139/139 — всё зелёное после KOTC миграции |
| 2026-03-22 | ARCH | A3.1 Vite build | vite.config.js, package.json | 9 HTML entry points, ES modules bundled, classic scripts copied post-build, 452ms build |
| 2026-03-22 | FORMAT | F3.1 Экспорт | shared/export-utils.js, formats/thai/thai.html, formats/kotc/kotc.js | JSON+CSV кнопки на FINISHED, BOM для Excel Cyrillic, sw.js v54 |
| 2026-03-22 | ARCH | A3.2 Split монолиты | assets/js/screens/core-*.js, roster-*.js, main.js, sw.js | core.js→3 файла (render/lifecycle/navigation), roster.js→3 файла (format-launcher/edit/list), sw v55 |
| 2026-03-22 | QA | Q3.1 Build smoke | tests/unit/build-smoke.test.js, scripts/release-gate.mjs | 8 тестов: SW/main.js/dist consistency, CSP. Release gate 4→5 шагов (+vite build) |
| 2026-03-22 | QA | Q3.2 localStorage stress | tests/unit/localstorage-stress.test.js | 7 тестов: QuotaExceeded, 450 history, 200 players, 50 tournaments, combined <500KB |
| 2026-03-22 | ARCH | A3.3 Admin dashboard | admin.html | Quick Launch (Thai/IPT/KOTC), Active/Finished toggle, кнопка "Открыть" на турнирах |
| 2026-03-22 | ARCH | A4.1 i18n | shared/i18n.js, locales/ru.json, locales/en.json, assets/js/main.js, sw.js | i18n: detect locale, lazy JSON load, t() с {{params}}, globalThis bridge, SW v56 |
| 2026-03-22 | QA | Q4.1 i18n тесты | tests/unit/i18n.test.js | 10 тестов: key parity, non-empty, 50+ keys, translation ratio, exports, placeholders |
| 2026-03-22 | ARCH | A4.3 Ratings | shared/ratings.js, tests/unit/ratings.test.js | FORMAT_MULTIPLIERS (7 форматов), PLACEMENT_POINTS (24), calcRatingPoints, participation bonus |
| 2026-03-22 | FORMAT | F4.1 a11y | shared/ui-kit.js, assets/js/runtime.js, assets/js/screens/components.js, assets/js/screens/core-navigation.js | FocusTrap в confirm/player card/tournament modal, AriaTabList в nav pills + top nav |
| 2026-03-22 | ARCH | A4.2 Realtime | shared/realtime.js, sw.js | WebSocket realtime sync через Supabase Broadcast channels, auto-reconnect, tournament sync helpers, SW v57 |
| 2026-03-22 | QA | Q4.2 Realtime тесты | tests/unit/realtime.test.js | 14 тестов: noop channel, mock WebSocket connect/join/broadcast/reconnect/destroy, tournament sync helpers |
| 2026-03-22 | QA | Q4.3 Финальный аудит | STATUS.md, DEVELOPMENT_PLAN.md | 193 unit + 7 smoke = все зелёные. Фаза 4 завершена. |
| 2026-03-22 | ARCH | S5.1 .gitignore | .gitignore | web/.next/ и web/.env.local добавлены в .gitignore |
| 2026-03-22 | ARCH | S5.2 Hardcoded secret | web/middleware.ts | Убран FALLBACK_ADMIN_SESSION_SECRET; `getAdminSessionSecret()` как в admin-auth (prod только env) |
| 2026-03-22 | ARCH | S5.3 CSP style-src | vite.config.js, shared/api.js, assets/app.css, shared/base.css, release-gate.mjs | Offline banner: класс `is-visible`; Vite post transform убирает unsafe-inline в dist (кроме register/profile с `<style>`) |
| 2026-03-22 | ARCH | S5.4 SW cache | sw.js | CORE_ASSETS + `admin.css`, CACHE_VERSION v59 |
| 2026-03-22 | ARCH | S5.5 admin.css | admin.html, admin.css | Блок `<style>` вынесен в `admin.css` |
| 2026-03-22 | ARCH | S5.6 Legacy KOTC | web/public/kotc/DEPRECATED.md | Документирован как legacy, указатель на formats/kotc/ |
| 2026-03-22 | ARCH | S5.7 Reconnect snapshot | shared/realtime.js, tests/unit/realtime.test.js | request_snapshot после reconnect, onSnapshotRequest для организаторов, 198 тестов ✅ |
| 2026-03-22 | ARCH | Фаза 5 security/CSP | web/middleware.ts, vite.config.js, shared/api.js, admin.html+admin.css, sw.js v59, release-gate.mjs, locales | Секрет middleware; offline-banner `.is-visible`; Vite strip style-src unsafe-inline; admin CSS вынесен; gate проверяет style-src |
| 2026-03-22 | FORMAT | S5.8 i18n home | assets/js/screens/home.js, locales/ru.json, locales/en.json | `tr()` + ключи `home.*`; карточки/архив/модалка/история |
| 2026-03-22 | FORMAT | S5.9 i18n roster | assets/js/screens/roster-format-launcher.js, roster-edit.js, roster-list.js, locales/*.json | IPT/Thai/KOTC карточки, стандартные настройки, фильтр истории К1–К4, toast ротации |
| 2026-03-22 | ARCH | S5.10 i18n nav+runtime+UI | assets/js/screens/core-navigation.js, runtime.js, components.js, locales/*.json | `nav.*`, `score.*`, `pcard.*`, дивизионные подписи, модалка турнира, player card |
| 2026-03-22 | FORMAT | S5.11 i18n KOTC page | formats/kotc/kotc.js, locales/*.json | `initI18n` + `kotcFmt.*`; этапы, таблицы, экспорт CSV, 199 unit ✅ |

---

## 🔗 КОНТРАКТЫ (интерфейсы между агентами)

### shared/ui-kit.js (🔵 ARCH пишет, 🟣 FORMAT использует)

```javascript
// ARCH гарантирует этот API:
ScoreCard.render({ team1, team2, score1, score2, onScore }) → HTML string
CourtCard.render({ courtName, color, matches, onScore }) → HTML string
DoubleClickInput.attach(element, { onConfirm, min, max })
```

### shared/table.js (🔵 ARCH пишет, 🟣 FORMAT использует)

```javascript
// ARCH гарантирует этот API:
CrossTable.render({
  columns: [{ key, label, width }],
  rows: [{ rank, name, ...values }],
  highlights: { gold: [0], silver: [1], bronze: [2] }
}) → HTML string
```

### shared/players.js (🔵 ARCH пишет, 🟣 FORMAT использует)

```javascript
// ARCH гарантирует этот API:
loadPlayerDB() → Player[]
savePlayerDB(players)
searchPlayers(query, { gender, limit }) → Player[]
getPlayerById(id) → Player | null
```

### formats/thai/thai-format.js (🟣 FORMAT пишет, 🟢 QA тестирует)

```javascript
// FORMAT гарантирует этот API:
thaiCalcPoints(diff) → 0|1|2|3
thaiCalcCoef(diffs[]) → number
thaiZeroSumMatch(diff1, diff2) → boolean
thaiZeroSumTour(allDiffs[]) → boolean
thaiTiebreak(a, b) → number (comparator)
thaiCalcStandings(group) → Standing[]
thaiGenerateSchedule({ men, women, mode }) → Tour[]
thaiValidateSchedule(schedule, allPlayers) → { valid, errors }
thaiSeedR2(r1Groups, gender) → R2Group[]
thaiCalcNominations(r1Stats, r2Stats) → Nomination[]
```
