# 🏗️ PLATFORM ROADMAP v3 — Лютые Пляжники

> **Цель:** Платформа для 8 турнирных форматов пляжного волейбола
>
> **Сервер:** VPS (adminvps.ru) · API — проектируем с нуля · Деплой: git push → сервер
>
> **Приоритет форматов:** IPT (есть) → Thai Mixed → King of the Court → Monster → Camp → ...
>
> **Рейтинг:** Единая таблица + множитель формата (x1.0 Thai, x0.8 KOTC, x0.6 Monster...)
>
> **3 ИИ-агента работают параллельно, координация через STATUS.md**
>
> **Факт из текущего репозитория (важно для планирования):**
> - Полный форк KOTC уже есть в `web/public/kotc/` (включая screens/ui/domain/sync-логику) — вместо “пишем с нуля” нужно переносить/адаптировать в целевую архитектуру платформы.
> - Thai Mixed фактически уже “вшит” как ThaiVolley32 в текущий UI (`assets/js/screens/roster.js`, `assets/js/screens/core.js`, `assets/js/screens/courts.js`) — этап FORMAT в первую очередь про выделение чистой математики/контрактов и догрузку отсутствующих UI частей (ZS-бар, R2 seed, финал/номинации, таблицы).

---

## ✅ ИНВЕНТАРЬ СУЩЕСТВУЮЩЕГО КОДА

### Что УЖЕ ЕСТЬ

#### ROOT ПРИЛОЖЕНИЕ (Static SPA, ~16k строк JS)
```
index.html                     ← Main hub shell
ipt-session.html              ← IPT standalone (627 строк)
rating.html                   ← Public leaderboard

assets/js/                    ← ~16,000 строк кода
  ├── main.js                 ← Bootstrap (27 files loader)
  ├── state/
  │   └── app-state.js        ← Global state, ranking
  ├── domain/
  │   ├── players.js          ← loadPlayerDB, CRUD (274 л)
  │   ├── tournaments.js      ← getTournaments, CRUD (206 л)
  │   └── timers.js           ← createTimer, startTimer (417 л)
  ├── screens/
  │   ├── core.js             ← Tab navigation, tournament lifecycle
  │   ├── roster.js           ← Tournament roster editor
  │   ├── courts.js           ← Main scoring interface (300 л)
  │   ├── ipt.js              ← IPT game screen (361 л) ✓ ПОЛНОСТЬЮ РАБОЧИЙ
  │   ├── home.js, players.js, stats.js, svod.js
  │   └── components.js       ← Modals, dropdowns
  ├── ui/
  │   ├── ipt-format.js       ← IPT rotation, scoring (432 л) ✓ ЭКСПОРТИРУЕТСЯ
  │   ├── roster-auth.js      ← SHA-256 password protection (206 л)
  │   ├── kotc-sync.js        ← Supabase optional sync (270 л)
  │   ├── stats-recalc.js, players-controls.js, etc.
  │   └── tournament-form.js, results-form.js
  └── integrations/
      └── config.js           ← Empty stubs

assets/app.css                ← 2000+ lines, dark theme
sw.js                         ← Service Worker
manifest.webmanifest          ← PWA metadata

formats/thai/
  └── thai-format.js          ← Pure ES module, 522 л ✓ МАТЕМАТИКА ГОТОВА
                                (thaiCalcPoints, thaiCalcCoef, thaiZeroSumMatch,
                                 thaiTiebreak, thaiCalcStandings, thaiGenerateSchedule,
                                 thaiValidateSchedule, thaiSeedR2)

tests/
  ├── unit/
  │   └── ipt-format.test.js  ← Vitest примеры
  └── smoke/
      └── smoke.spec.ts       ← Playwright примеры

serve.mjs                     ← Local dev server
package.json, vitest.config.ts, playwright.config.ts
```

#### WEB ПРИЛОЖЕНИЕ (Next.js, React, ~optional)
```
web/
  ├── app/api/*               ← Route handlers (leaderboard, players, tournaments, auth)
  ├── app/                    ← Pages (layout, home, calendar, players, rankings, profile)
  ├── lib/
  │   ├── auth.ts, db.ts, types.ts, queries.ts
  ├── public/kotc/            ← ✓ ПОЛНЫЙ ФОРК корневого приложения
  │   ├── index.html
  │   ├── assets/
  │   │   ├── app.css
  │   │   └── js/             ← Все screens, domain, ui
  │   ├── config.js
  │   └── sw.js
  └── [Node.js backend structure]
```

#### Что ФУНКЦИОНИРУЕТ СЕЙЧАС
- ✅ **IPT format** — полностью рабочий (ротация, счёт, standings)
- ✅ **Thai format math** — основные формулы (очки по diff, коэф K, zero-sum проверки, standings)
- ✅ **Timers** — независимые для каждого корта
- ✅ **Player DB** — CRUD в localStorage
- ✅ **Roster auth** — SHA-256 пароль
- ✅ **Supabase sync** — опциональная (если конфиг есть)
- ✅ **PWA** — работает offline

#### СТРУКТУРНЫЕ ПРОБЛЕМЫ

| Проблема | Где | Что нужно |
|----------|-----|----------|
| **Нет shared/** | — | Создать: ui-kit, players, timer, table, utils, auth, base.css |
| **Нет formats/kotc/** | web/public/kotc/ существует | Мигрировать в formats/kotc/, переделать под shared/ |
| **Нет formats/ipt/** | assets/js/screens/ipt.js | Вытащить в formats/ipt/, переделать под shared/ |
| **Thai вшит в core.js** | assets/js/screens/core.js | Выделить UI в formats/thai/*.js, использовать shared/ |
| **Нет server/** | — | Создать Express/Fastify с API (tournament CRUD, players, sync, ratings) |
| **Нет formats/thai/thai.html** | — | Создать page shell для тай-сессии |
| **Нет formats/thai/thai-roster.js** | — | UI ростер-панели (списки, превью расписания) |
| **Нет formats/thai/thai.css** | — | Стили (ZS-бар, зоны, судьи, посев, FINISHED) |
| **Нет R2 seed UI** | — | Визуализация посева, ручная коррекция |
| **Нет FINISHED screen** | — | Победители, прогресс R1→R2, экран номинаций |
| **Нет Zero-Sum бара** | — | Live-индикатор баланса diff |
| **Нет номинаций** | — | 6 алгоритмов (MVP, Best Diff, etc.) |
| **Нет cross-table standings** | formats/thai/ | Отсутствует в тай-UI (есть в IPT) |

---

## 👥 АГЕНТЫ

| Агент | Роль | Зона |
|-------|------|------|
| 🔵 **ARCH** | Архитектор | shared/, hub, API, server, auth, рефакторинг |
| 🟣 **FORMAT** | Формат-разработчик | Тай-формат: math, schedule, UI сессии |
| 🟢 **QA** | Тестировщик + Интегратор | Тесты, docs, SW, деплой, code review |

---

## 📁 ЦЕЛЕВАЯ СТРУКТУРА ПРОЕКТА

```
/
├── index.html                    ← Хаб (ростер, рейтинг, история, формат-пикер)
├── assets/
│   ├── app.css                   ← Общие стили хаба
│   └── js/
│       ├── main.js               ← Bootstrap
│       ├── screens/              ← Экраны хаба (home, roster, players, stats, svod)
│       ├── domain/               ← Бизнес-логика хаба
│       └── ui/                   ← UI компоненты хаба
│
├── shared/                       ← 🔵 ARCH — общие модули для ВСЕХ форматов
│   ├── ui-kit.js                 ← ScoreCard, CourtCard, DoubleClickInput, HoldBtn
│   ├── players.js                ← loadPlayerDB, savePlayerDB, searchPlayers
│   ├── timer.js                  ← createTimer, startTimer, formatTime
│   ├── table.js                  ← CrossTable, StandingsTable
│   ├── api.js                    ← Server API client (REST)
│   ├── auth.js                   ← tournament_secret, organizer auth
│   ├── utils.js                  ← esc, escAttr, csvSafe, showToast
│   └── base.css                  ← Тёмная тема, кнопки, карточки, навигация
│
├── formats/                      ← Каждый формат — отдельная папка
│   ├── thai/                     ← 🟣 FORMAT
│   │   ├── thai.html             ← Страница тай-сессии
│   │   ├── thai.js               ← UI: рендер кортов, посев, FINISHED
│   │   ├── thai-format.js        ← Math: очки, кэф, ZS, schedule, seed, nominations
│   │   └── thai.css              ← Стили (цвета зон, ZS-бар)
│   ├── kotc/                     ← Будущий: King of the Court
│   │   ├── kotc.html
│   │   ├── kotc.js
│   │   └── kotc.css
│   ├── monster/                  ← Будущий: Monster/Queen & King
│   └── camp/                     ← Будущий: Camp/Elevator
│
├── server/                       ← 🔵 ARCH — серверная часть (Node.js)
│   ├── index.js                  ← Express/Fastify entry point
│   ├── routes/
│   │   ├── tournaments.js        ← CRUD турниров
│   │   ├── players.js            ← CRUD игроков
│   │   └── sync.js               ← Real-time state sync
│   ├── db/
│   │   ├── schema.sql            ← PostgreSQL схема
│   │   └── migrations/
│   └── package.json
│
├── tests/                        ← 🟢 QA
│   ├── unit/
│   ├── smoke/
│   └── integration/
│
├── STATUS.md                     ← Координация агентов
├── PLATFORM_ROADMAP.md           ← Этот файл
├── sw.js                         ← Service Worker
└── manifest.webmanifest
```

---

## 🌐 SERVER API (проектируем с нуля)

### Эндпоинты

```
POST   /api/tournaments              ← Создать турнир → { id, secret }
GET    /api/tournaments/:id          ← Получить состояние (public)
PUT    /api/tournaments/:id          ← Обновить состояние (secret required)
DELETE /api/tournaments/:id          ← Удалить (secret required)

GET    /api/players                   ← Все игроки
POST   /api/players                   ← Добавить игрока
PUT    /api/players/:id               ← Обновить
GET    /api/players/:id/stats         ← Статистика игрока

GET    /api/ratings                   ← Общий рейтинг
GET    /api/ratings?format=thai       ← Рейтинг по формату

WebSocket /api/ws/:tournamentId       ← Real-time sync (счёт, статус)
```

### Аутентификация (минимальная)

Без логина/пароля пользователей. Вместо этого:

```
1. Организатор создаёт турнир:
   POST /api/tournaments { format: "thai", name: "..." }
   → { id: "t_abc123", secret: "sec_xyz789" }

2. Организатор получает URL:
   https://sv-ugra.ru/formats/thai/thai.html?id=t_abc123&secret=sec_xyz789

3. Зрители видят только public URL:
   https://sv-ugra.ru/formats/thai/thai.html?id=t_abc123
   → Читают live-таблицу, но не могут менять счёт

4. secret хранится в sessionStorage организатора
   → Закрыл вкладку — нужно снова перейти по ссылке с secret
```

### Рейтинговые очки (единая таблица + множитель)

```javascript
// При завершении турнира:
const BASE_POINTS = {
  'hard_1': 100, 'hard_2': 90, 'hard_3': 80, 'hard_4': 72,
  'advance_1': 80, 'advance_2': 72, 'advance_3': 63,
  'medium_1': 60, 'medium_2': 55, 'medium_3': 45,
  'light_1': 40, 'light_2': 35, 'light_3': 30,
};

const FORMAT_MULTIPLIER = {
  'thai': 1.0,      // Полноценный турнир 32 игрока, 2 раунда
  'kotc': 0.8,      // Динамичный, но меньше матчей
  'ipt': 0.9,       // Индивидуальный трекинг
  'monster': 0.6,   // Малые группы
  'camp': 0.5,      // Тренировочный
  'americanka': 0.4, // Развлекательный
  'handicap': 0.7,  // С форой
  'random': 0.7,    // Случайные пары
};

// Финал: points = BASE_POINTS[zone_place] * FORMAT_MULTIPLIER[format]
// Организатор может установить свой множитель (1.5x для чемпионата, 0.5x для тренировки)
```

---

## 📋 ЭТАП 0: ИНФРАСТРУКТУРА (5–7 дней)

> Три потока работают параллельно с первого дня.

### Что делает каждый агент

```
                    День 1      День 2      День 3      День 4      День 5      День 6      День 7
🔵 ARCH     ┃ A0.1 shared/ui-kit,players,utils         ┃ A0.2 IPT → shared/     ┃ A0.3 launcher  ┃ A0.4 API ┃ review ┃
🟣 FORMAT   ┃ F0.1 Core Math (0 зависимостей)          ┃ F0.2 Schedule Generator ┃ F0.3 roster UI ┃          ┃ review ┃
🟢 QA       ┃ Q0.1 test setup  ┃ Q0.2 unit tests math  ┃ Q0.3 IPT regression    ┃ Q0.4 sched tests┃ review  ┃
```

---

### 🔵 ARCH

#### A0.1 — shared/ модули (День 1–2)

**Файлы:** `shared/ui-kit.js`, `shared/players.js`, `shared/timer.js`, `shared/table.js`, `shared/utils.js`, `shared/auth.js`, `shared/base.css`

**Источники:**

| Модуль | Откуда | Что вытащить |
|--------|--------|-------------|
| ui-kit.js | ipt.js, ipt-format.js | ScoreCard (+/−, двойной клик), CourtCard, HoldToConfirm |
| players.js | domain/players.js | loadPlayerDB, savePlayerDB, searchPlayers, getById |
| timer.js | domain/timers.js | createTimer, start, pause, formatTime |
| table.js | screens/ipt.js | CrossTable (рендер standings с колонками) |
| utils.js | main.js, core.js | esc, escAttr, csvSafe, showToast, showConfirm |
| auth.js | ui/roster-auth.js | hashPassword, checkAuth |
| base.css | assets/app.css | Тёмная тема, кнопки, карточки (без format-specific) |

**Правило:** Каждый модуль — чистые функции. Не зависят от DOM, не зависят друг от друга (кроме utils).

**DONE когда:**
- [ ] Все файлы shared/ созданы и имеют чистый API
- [ ] `npm run validate:static` проходит
- [ ] Старое приложение НЕ СЛОМАНО (shared/ пока никто не использует)

#### A0.2 — IPT на shared/ (День 3–4)

Переключить IPT на shared-компоненты. Proof of concept.

**DONE когда:**
- [ ] IPT работает как раньше
- [ ] ipt.js использует `shared/ui-kit.js` для кортов
- [ ] ipt.js использует `shared/table.js` для standings
- [ ] 🟢 QA подтверждает: Q0.3 regression OK

#### A0.3 — Format Launcher (День 5)

**DONE когда:**
- [ ] Из ростера можно запустить IPT через `formats/ipt/ipt.html`
- [ ] Из формата можно вернуться в хаб
- [ ] Tournament ID передаётся через URL параметр

#### A0.4 — Server API skeleton (День 5–6)

Минимальный Express/Fastify сервер с endpoints для турниров.

```
server/
  index.js          ← entry point, port 3000
  routes/
    tournaments.js  ← POST/GET/PUT/DELETE
    players.js      ← GET/POST/PUT
```

Первая версия может хранить данные в JSON-файлах, PostgreSQL — позже.

**DONE когда:**
- [ ] `POST /api/tournaments` возвращает `{ id, secret }`
- [ ] `GET /api/tournaments/:id` возвращает state
- [ ] `PUT /api/tournaments/:id` (с secret) обновляет state
- [ ] Сервер запускается: `cd server && npm start`

---

### 🟣 FORMAT

#### F0.1 — Core Math (День 1–2)

**НОЛЬ зависимостей. Начинать НЕМЕДЛЕННО.**

Файл: `formats/thai/thai-format.js`

```javascript
// Все функции — чистые, без побочных эффектов:
thaiCalcPoints(diff)                    → 0|1|2|3
thaiCalcCoef(diffs)                     → number
thaiZeroSumMatch(diff1, diff2)          → boolean
thaiZeroSumTour(allDiffs)               → boolean
thaiTiebreak(a, b)                      → number (comparator)
thaiCalcStandings(group)                → Standing[]
thaiSeedR2(r1Groups, gender)            → R2Group[]
thaiCalcProgress(r1Stats, r2Stats)      → { delta_pts, delta_rank }
```
В текущем UI ThaiVolley32 уже реализованы ключевые формулы: `thaiDiffToPts` и `thaiCalcK(diffSum)` в `assets/js/screens/core.js`. На этом этапе нужно “вытащить” их в чистый модуль `formats/thai/thai-format.js` по контракту, не переизобретая алгоритмы.

**DONE когда:**
- [ ] Все функции написаны и экспортированы
- [ ] 🟢 QA подтверждает: Q0.2 unit tests pass

#### F0.2 — Schedule Generator (День 3–4)

**НОЛЬ зависимостей. Можно писать параллельно с A0.2.**

```javascript
thaiGenerateSchedule({ men, women, mode })  → Tour[]
thaiValidateSchedule(schedule, players)      → { valid, errors }
```

6 комбинаций: MF×8, MF×10, MM×8, MM×10, WW×8, WW×10

Логика “пар на тур” для ppc=4 и правила партнёрства уже детерминированы в текущем UI (`assets/js/screens/core.js`: `iptMatchupsR1`, `partnerW/partnerM`). Поэтому F0.2 — это формализация/экстракция этих правил (и валидация инвариантов), а не разработка нового расписания “с нуля”.

**DONE когда:**
- [ ] Все 6 комбинаций генерируют валидное расписание
- [ ] thaiValidateSchedule проходит для всех
- [ ] 🟢 QA подтверждает: Q0.4 schedule tests pass

#### F0.3 — Ростер-панель (День 5–6)

**ЗАВИСИТ ОТ A0.1** — ждать пока ARCH не отметит A0.1 DONE.

Таб «Тай-микст» в карточке формата ростера.

**DONE когда:**
- [ ] Таб отображается
- [ ] Выбор: корты (1–4), размер (8/10), состав (М/М, Ж/Ж, М/Ж), режим (Score/Diff)
- [ ] Списки игроков с чекбоксами + авто-баланс

---

### 🟢 QA

#### Q0.1 — Тестовая инфраструктура (День 1)

```
tests/
  unit/
    thai-format.test.js
    thai-schedule.test.js
    shared-ui-kit.test.js
  smoke/
    ipt-regression.spec.ts
    thai-launch.spec.ts
```

**DONE когда:**
- [ ] vitest настроен, `npm run test:unit` запускается
- [ ] Playwright настроен, `npm run test:smoke` запускается

#### Q0.2 — Unit-тесты Core Math (День 1–2)

Писать по контракту (сигнатуры из F0.1), **параллельно с FORMAT**.

**30+ тестов:**
- thaiCalcPoints: 8 cases (negative, 0, 1, 2, 3, 6, 7, 99)
- thaiCalcCoef: 5 cases (zeros, positive, negative, edge 60, mixed)
- thaiZeroSumMatch: 4 cases
- thaiZeroSumTour: 4 cases
- thaiTiebreak: 6 cases
- thaiCalcStandings: 3 cases (empty, partial, full)

**DONE когда:**
- [ ] Все тесты написаны
- [ ] Тесты проходят с реализацией F0.1: `npm run test:unit`

#### Q0.3 — IPT Regression (День 4–5)

**ЗАВИСИТ ОТ A0.2** — ждать пока ARCH не отметит A0.2 DONE.

Проверить что IPT не сломался после перехода на shared/.

**DONE когда:**
- [ ] IPT запускается из ростера
- [ ] Счёт вводится и сохраняется
- [ ] Кросс-таблица обновляется
- [ ] Навигация К1–К4 работает

#### Q0.4 — Schedule Generator тесты (День 5–6)

**ЗАВИСИТ ОТ F0.2** — ждать пока FORMAT не отметит F0.2 DONE.

**20+ тестов:**
- 6 комбинаций × validate = 6 tests
- Инвариант: каждый играет 4 матча = 6 tests
- Инвариант: отдых = 0 (при 8) или 1 (при 10) = 6 tests
- Edge: seed reproducibility = 2 tests

**DONE когда:**
- [ ] Все тесты проходят

---

## ⛩️ GATE 0 — Переход к Этапу 1

**Критерии (ВСЕ должны быть выполнены):**

- [ ] shared/ модули созданы и работают (A0.1)
- [ ] IPT переведён на shared/ без регрессий (A0.2 + Q0.3)
- [ ] Format launcher работает (A0.3)
- [ ] Server API skeleton запускается (A0.4)
- [ ] Core Math написан и протестирован (F0.1 + Q0.2)
- [ ] Schedule Generator написан и протестирован (F0.2 + Q0.4)
- [ ] Все ветки смержены в dev
- [ ] `npm run test:unit` — 0 failures
- [ ] `npm run test:smoke` — 0 failures

**Кто решает:** 🟢 QA проверяет все критерии и даёт GO/NO-GO.

---

## 📋 ЭТАП 1: ТАЙ-ФОРМАТ (6–8 дней)

### Что делает каждый агент

```
                    День 1-2         День 3-4         День 5-6         День 7-8
🔵 ARCH     ┃ A1.1-2 tmpl + nav   ┃ A1.3 server sync ┃ A1.4 rating     ┃ review        ┃
🟣 FORMAT   ┃ F1.1-3 roster+R1    ┃ F1.4-6 ZS+table  ┃ F1.7-9 seed+R2  ┃ F1.10-12 fin  ┃
🟢 QA       ┃ Q1.1 E2E create     ┃ Q1.2 E2E R1 full ┃ Q1.3-4 E2E R2   ┃ Q1.5-8 docs   ┃
```

### 🔵 ARCH — Этап 1

| ID | Задача | Зависит от | DONE |
|----|--------|-----------|------|
| A1.1 | Format page HTML template (thai.html shell) | A0.3 | [ ] |
| A1.2 | Навигация внутри формата (pills туров, tabs групп) | A0.1 | [ ] |
| A1.3 | Server: save/load tournament state по API | A0.4 | [ ] |
| A1.4 | Rating: thaiResults → Professional Points (BASE × MULTIPLIER) | A1.3 | [ ] |
| A1.5 | Карточки тай-турниров на главной hub | A1.3 | [ ] |
| A1.6 | WebSocket: real-time sync счёта между устройствами | A1.3 | [ ] |

### 🟣 FORMAT — Этап 1

| ID | Задача | Зависит от | DONE |
|----|--------|-----------|------|
| F1.1 | Ростер-панель полная (списки, превью расписания, запуск) | F0.3, A1.1 | [ ] |
| F1.2 | Карточка корта (score +/−, двойной клик, diff/pts badges) | A0.1 | [ ] |
| F1.3 | Zero-Sum бар + блокировка «Сохранить» | F0.1 | [ ] |
| F1.4 | Кросс-таблица standings (с колонкой отдыха при 10) | A0.1 | [ ] |
| F1.5 | Бейдж судей (кто отдыхает) | F0.2 | [ ] |
| F1.6 | Переключатель Score/Diff | F1.2 | [ ] |
| F1.7 | Экран посева R2 (визуализация + ручная коррекция) | F0.1 | [ ] |
| F1.8 | R2 игровой экран (reuse R1 + цвета зон) | F1.2 | [ ] |
| F1.9 | Экран FINISHED (победители + прогресс R1→R2) | F0.1 | [ ] |
| F1.10 | Номинации (6 алгоритмов + UI) | F0.1 | [ ] |
| F1.11 | Telegram-отчёт (шаблон + копирование в буфер) | F1.9 | [ ] |
| F1.12 | CSS стили (зоны, ZS-бар, судьи, посев, FINISHED) | — | [ ] |

### 🟢 QA — Этап 1

| ID | Задача | Зависит от | DONE |
|----|--------|-----------|------|
| Q1.1 | E2E: создать тай-турнир из ростера | F1.1 | [ ] |
| Q1.2 | E2E: полный R1 (4–5 туров, ввод, ZS, standings) | F1.2, F1.3, F1.4 | [ ] |
| Q1.3 | E2E: посев R2 (авто + ручная коррекция) | F1.7 | [ ] |
| Q1.4 | E2E: R2 → FINISHED → номинации → Telegram | F1.9, F1.10, F1.11 | [ ] |
| Q1.5 | Unit-тесты номинаций | F1.10 | [ ] |
| Q1.6 | Regression: хаб не сломался | A1.5 | [ ] |
| Q1.7 | Mobile testing (320–414px viewports) | F1.12 | [ ] |
| Q1.8 | THAI_GUIDE.md документация | F1.11 | [ ] |

---

## ⛩️ GATE 1 — Thai формат готов

- [ ] Полный цикл: ростер → R1 → посев → R2 → FINISHED → номинации → рейтинг
- [ ] Server sync работает (2 устройства видят одинаковый счёт)
- [ ] Mobile: тест на 320px (iPhone SE)
- [ ] Все тесты проходят
- [ ] THAI_GUIDE.md написан
- [ ] Мерж в main → деплой на сервер

---

## 📋 ЭТАП 2: KING OF THE COURT (5–7 дней)

> Второй приоритет после Thai. Использует shared/ по полной.
>
> Отдельно: UI/логика KOTC уже существуют как форк приложения в `web/public/kotc/`. На этапе 2 нужно переносить/адаптировать их в целевую архитектуру (formats/kotc/* + shared/*), а не строить механику “с нуля”.

### Уникальная механика KOTC

```
- Таймер (15 мин) — shared/timer.js ✓
- Очередь команд (Queue) — НОВЫЙ компонент
- Сторона короля / претендента — НОВЫЙ компонент
- Очко только на стороне короля
- Проиграл — в конец очереди
- Счётчик в одно касание (tap = +1 для короля)
```

### Параллельная работа

```
🔵 ARCH ──── Queue компонент → shared/queue.js (переиспользуется Американкой)
🟣 FORMAT ── KOTC format page: king-side scoring, tap-to-score
🟢 QA ────── Тесты + Camp формат (простой, может делать сам)
```

| ID | Задача | Агент | Строк |
|----|--------|-------|-------|
| K2.1 | shared/queue.js — компонент очереди | 🔵 ARCH | ~120 |
| K2.2 | KOTC format page (HTML shell) | 🔵 ARCH | ~80 |
| K2.3 | King-side scoring logic | 🟣 FORMAT | ~150 |
| K2.4 | Queue UI (drag-reorder, add/remove) | 🟣 FORMAT | ~200 |
| K2.5 | Timer integration | 🟣 FORMAT | ~60 |
| K2.6 | Tap-to-score (one-touch, mobile-first) | 🟣 FORMAT | ~100 |
| K2.7 | KOTC standings + history | 🟣 FORMAT | ~150 |
| K2.8 | KOTC → Professional Points | 🔵 ARCH | ~30 |
| K2.9 | E2E тесты | 🟢 QA | ~120 |
| K2.10 | KOTC_GUIDE.md | 🟢 QA | ~200 |

---

## 📋 ЭТАП 3: ЕЩЁ 2 ФОРМАТА + ПОЛИРОВКА (6–10 дней)

### Monster/Queen (4–5 дней)

| Задача | Агент |
|--------|-------|
| Round-Robin для 4–5 игроков | 🟣 FORMAT |
| Личные очки/разница в малых группах | 🟣 FORMAT |
| Monster format page | 🔵 ARCH + 🟣 FORMAT |
| Тесты | 🟢 QA |

### Полировка (2–3 дня)

| Задача | Агент |
|--------|-------|
| PWA: sw.js кэширует все format pages | 🟢 QA |
| Server: PostgreSQL вместо JSON-файлов | 🔵 ARCH |
| Mobile: финальное тестирование | 🟢 QA |
| rating.html: учитывает все форматы + множители | 🔵 ARCH |
| README обновлён под платформу | 🟢 QA |
| Деплой на сервер | 🟢 QA + 🔵 ARCH |

---

## 📊 СУММАРНАЯ ОЦЕНКА

| Этап | Календарных дней | Строк | Результат |
|------|-----------------|-------|-----------|
| 0. Инфраструктура | 5–7 | ~2500 | shared/, API, launcher |
| 1. Thai format | 6–8 | ~2800 | Полный цикл тай-турнира |
| 2. KOTC | 5–7 | ~1200 | Король площадки |
| 3. Monster + polish | 6–10 | ~1500 | Третий формат + деплой |
| **ИТОГО** | **22–32** | **~8000** | **3 формата + платформа** |

> При параллельной работе 3 агентов: **~12–16 календарных дней** до деплоя Thai.

---

## 📁 ВЛАДЕНИЕ ФАЙЛАМИ

```
🔵 ARCH:
  shared/*                    ← ВСЕ shared модули
  server/*                    ← ВСЕ серверные файлы
  index.html                  ← hub рефакторинг
  assets/js/main.js
  assets/js/screens/core.js
  assets/js/screens/roster.js ← format picker (общая часть)
  assets/js/domain/*          ← рефакторинг под shared
  assets/js/ui/ipt-format.js  ← рефакторинг под shared
  assets/js/screens/ipt.js    ← рефакторинг под shared

🟣 FORMAT:
  formats/thai/*              ← ВСЕ файлы тай-формата
  formats/kotc/*              ← ВСЕ файлы KOTC (этап 2)

🟢 QA:
  tests/*                     ← ВСЕ тесты
  STATUS.md
  sw.js
  manifest.webmanifest
  docs/*
  playwright.config.ts
  vitest.config.ts
  package.json
```

**Правило:** Не трогай чужие файлы. Если нужно — пиши в STATUS.md секцию BLOCKED.

---

## 🔗 КОНТРАКТЫ (API между агентами)

### shared/ui-kit.js (🔵 → 🟣)

```javascript
ScoreCard.render({ team1Name, team2Name, score1, score2, onScore }) → HTMLString
CourtCard.render({ label, color, matches[], onScore }) → HTMLString
DoubleClickInput.attach(element, { onConfirm, min, max }) → void
HoldToConfirm.render({ text, duration_ms, onConfirm }) → HTMLString
```

### shared/table.js (🔵 → 🟣)

```javascript
CrossTable.render({ columns[], rows[], highlights }) → HTMLString
// columns: [{ key: 'pts', label: 'D', width: '40px' }]
// rows: [{ rank: 1, name: 'Иванов', pts: 9, coef: 2.57, rest: 3 }]
```

### shared/api.js (🔵 → 🟣)

```javascript
API.createTournament({ format, name, config }) → { id, secret }
API.getTournament(id) → TournamentState
API.updateTournament(id, secret, state) → OK
API.onUpdate(id, callback) → unsubscribe  // WebSocket
```

### formats/thai/thai-format.js (🟣 → 🟢)

```javascript
thaiCalcPoints(diff) → 0|1|2|3
thaiCalcCoef(diffs[]) → number
thaiZeroSumMatch(diff1, diff2) → boolean
thaiZeroSumTour(allDiffs[]) → boolean
thaiTiebreak(a, b) → number
thaiCalcStandings(group) → Standing[]
thaiGenerateSchedule({ men, women, mode }) → Tour[]
thaiValidateSchedule(schedule, players) → { valid, errors[] }
thaiSeedR2(r1Groups, gender) → R2Group[]
thaiCalcNominations(r1Stats, r2Stats) → Nomination[]
```

---

## ⚠️ ПРАВИЛА ДЛЯ АГЕНТОВ

### Перед каждой задачей
```
1. git pull origin dev
2. Прочитать STATUS.md — ОБЯЗАТЕЛЬНО
3. Мои зависимости DONE? Если нет → другая задача или BLOCKED
4. Работать в СВОЕЙ ветке (arch/*, format/*, qa/*)
```

### После каждой задачи
```
1. npm run test:unit (если есть тесты)
2. npm run validate:static
3. git commit + push
4. Обновить STATUS.md:
   - [x] Задача ✅ (дата)
   - Файлы: перечислить
   - Разблокирует: перечислить зависимые задачи
5. Если сломал чужой тест → СТОП → BLOCKED в STATUS.md
```

### Формат отчёта
```
## [АГЕНТ] Задача ID — DONE
- Файлы: shared/ui-kit.js, shared/utils.js
- Что сделано: ScoreCard компонент с +/−, двойной клик, HoldToConfirm
- Тесты: npm run test:unit — 47 passed, 0 failed
- Разблокирует: F0.3, F1.1, F1.2
- Заметки: API изменён — CourtCard теперь принимает onScore(courtIdx, teamIdx, newScore)
```
