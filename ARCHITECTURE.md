# 🏗 ARCHITECTURE.md — Архитектура системы «Лютые Пляжники»

> Документ описывает текущее состояние системы, выявленные проблемы и рекомендации по улучшению.
> Обновлён: 2026-03-23

---

## 1. Общая схема системы

```
┌─────────────────────────────────────────────────────────────────┐
│                         sv-ugra.ru                              │
│              Публичный сайт (Next.js / web/)                    │
│   /players  /rankings  /calendar  /profile  /register           │
│   /admin/* (админ-панель)  /sudyam/* (судейский вход)           │
└─────────────────┬───────────────────────────────────────────────┘
                  │ iframe или отдельная вкладка
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Судейское приложение (SPA)                     │
│                  index.html + assets/js/                        │
│                                                                 │
│  Экраны: HOME · PLAYERS · SVOD · STATS · RATING · ROSTER       │
│  Форматы: IPT · Thai · KOTC (открываются в отдельной вкладке)   │
└──────────┬────────────────────────────────┬────────────────────┘
           │                                │
           ▼                                ▼
    localStorage                     Supabase (опцион.)
    (offline-first)                  WebSocket Broadcast
                                     + REST API
```

---

## 2. Точки входа (HTML-страницы)

| Страница | Путь | Назначение | Статус |
|----------|------|------------ |--------|
| **Главная судейского app** | `index.html` | Хаб: расписание, ростер, счёт | ✅ Основная |
| **KOTC формат** | `formats/kotc/kotc.html` | King of the Court (4 корта, ротация) | ✅ |
| **Thai формат** | `formats/thai/thai.html` | ThaiVolley32 (R1→R2, 32 игрока) | ✅ |
| **IPT сессия** | `ipt-session.html` | IPT round-robin (устаревший стиль) | ⚠️ Legacy |
| **Админ-панель** | `admin.html` | Быстрый запуск форматов, актив/архив | ✅ |
| **Профиль игрока** | `profile.html` | Редактирование имени, пола, статистика | ⚠️ Изолированная |
| **Рейтинг** | `rating.html` | Таблица лидеров с фильтрами | ⚠️ Изолированная |
| **Регистрация** | `register.html` | OAuth через Google, запись на турнир | ⚠️ Изолированная |

---

## 3. Архитектура JS (судейский app)

### 3.1 Порядок загрузки (`main.js`)

```
main.js (ES-module, точка входа)
  │
  ├─ [async] shared/* — ES-модули, экспортируются в globalThis
  │   ├─ shared/i18n.js       → globalThis.i18n
  │   ├─ shared/api.js        → globalThis.sharedApi
  │   ├─ shared/auth.js       → globalThis.sharedAuth
  │   ├─ shared/players.js    → globalThis.sharedPlayers
  │   ├─ shared/realtime.js   → globalThis.sharedRealtime
  │   ├─ shared/timer.js      → globalThis.sharedTimer
  │   ├─ shared/ui-kit.js     → globalThis.sharedUiKit
  │   └─ shared/utils.js      → globalThis.sharedUtils
  │
  └─ [sequential] classic scripts (script-tag порядок):
      1. error-handler.js       — window.onerror boundary
      2. app-state.js           — глобальное состояние
      3. domain/players.js      — БД игроков
      4. domain/tournaments.js  — метаданные турниров
      5. domain/timers.js       — таймеры
      6. integrations/config.js — Supabase / Google конфиг
      7. ui/*.js                — UI-логика (auth, stats, forms)
      8. screens/*.js           — рендеры экранов
      9. integrations.js        — Supabase sync + polling
      10. kotc-sync.js          — realtime listener
      11. runtime.js            — клики, аудио, toast
```

### 3.2 Глобальное состояние (`app-state.js`)

```javascript
// Настройки корта
nc = 4            // кол-во кортов
ppc = 4           // игроков на корте
fixedPairs = false

// Счёт
scores[ci][mi][ri]      // корт → мужчина → раунд
divScores[key][mi][ri]  // дивизион → мужчина → раунд

// Ростер
ALL_COURTS[ci].men[]   // имена мужчин по кортам
ALL_COURTS[ci].women[] // имена женщин по кортам

// UI
activeTabId = 'home'   // текущий экран
```

---

## 4. Хранилище данных (localStorage)

| Ключ | Содержимое | TTL |
|------|-----------|-----|
| `kotc3_state` | Весь турнир: ростер, очки, история | До сброса |
| `kotc3_timers` | Состояние таймеров | До сброса |
| `kotc3_playerdb` | База игроков (имя, пол, рейтинг) | Постоянно |
| `kotc3_tournaments` | Архив турниров | Постоянно |
| `kotc3_locale` | Язык (`ru`/`en`) | Постоянно |
| `kotc3_solar` | Тема (пляж/ночь) | Постоянно |
| `kotc3_roster_pwd_hash` | SHA-256 хэш пароля ростера | Постоянно |
| `kotc3_org_secret` | API-токен организатора | Постоянно |
| `kotc3_sb_config` | Supabase room code + secret | Постоянно |
| `kotc3_kotc_session_*` | Состояние KOTC-сессии | До завершения |

---

## 5. Форматы турниров

### 5.1 Thai Format (ThaiVolley32)

```
thai.html → thai.js → thai-format.js

Параметры URL: ?mode=MF&n=32&seed=1&trnId=xxx

Фазы:
1. ROSTER   — заполнение 4 групп по 8 игроков (M+W)
2. STAGE 1  — каждый играет с каждым в своей группе
3. SEEDING  — ранжирование для R2 (Thai Scoring: 0/1/2/3 очка)
4. STAGE 2  — финалы по дивизионам (HD/AV/MD/LT)
5. FINISHED — экспорт результатов (JSON/CSV)
```

### 5.2 KOTC Format (King of the Court)

```
kotc.html → kotc.js → kotc-format.js

Параметры URL: ?nc=4&ppc=4&trnId=xxx

Фазы:
1. ROSTER      — распределение игроков по 4 кортам
2. STAGE 1     — ротационный счёт (победитель остаётся)
3. STANDINGS   — общий рейтинг после Stage 1
4. DIVISIONS   — финалы по дивизионам
5. FINISHED    — итоги + экспорт
```

### 5.3 IPT Format (Integrated)

```
ipt-session.html (legacy, встроен в main app)

Структура: группы × 8 игроков → раунд-робин → финалы
⚠️ Не мигрирован на standalone архитектуру
```

---

## 6. Авторизация

| Слой | Механизм | Где |
|------|---------|-----|
| **Ростер** | SHA-256(соль:пароль), `crypto.subtle` | `ui/roster-auth.js`, localStorage |
| **Организатор** | PIN-код → cookie (Next.js) | `web/app/api/sudyam-auth/` |
| **Администратор** | HMAC-SHA256 сессия → cookie (24ч) | `web/lib/admin-auth.ts`, `web/middleware.ts` |

### Защита ростера (локальная)
```
Пароль → SHA-256(соль:пароль) → в localStorage
Разблокировка → sessionStorage (сброс при закрытии вкладки)
⚠️ Только HTTPS (crypto.subtle недоступен на HTTP)
```

---

## 7. i18n (локализация)

```
shared/i18n.js — лёгкий движок (no deps)

Определение языка:
1. localStorage['kotc3_locale'] (ручная установка)
2. navigator.language (браузер)
3. Fallback: 'ru'

Файлы: locales/ru.json, locales/en.json (~450 ключей каждый)

Использование во всех файлах:
function tr(key, params) {
  return globalThis.i18n?.t(key, params) ?? key;
}
```

---

## 8. PWA / Service Worker

```
sw.js — Cache v59 (сброс кэша вручную при изменении версии)

Стратегия:
- CORE_ASSETS (~60 файлов) → Cache First
- HTML-навигация → Network First → fallback index.html
- API → Network Only (данные не кэшируются)

Offline:
- Полная работа без сети (LocalStorage)
- Supabase sync возобновляется при восстановлении
- Баннер "Приложение работает офлайн"
```

---

## 9. Supabase (опциональный облачный sync)

```
Используется если настроен roomCode + roomSecret:

REST API:
  GET/POST /tournaments   — CRUD турниров
  GET      /leaderboard   — публичный рейтинг
  POST     /results       — сохранение результатов

Realtime (WebSocket broadcast):
  Канал: realtime:broadcast-trn_{trnId}
  События: score_update, phase_change, snapshot, request_snapshot
  Задержка: 1–2 секунды
  Reconnect: exponential backoff (1s→30s)
```

---

## 10. Backend (Next.js / web/)

```
web/
├── middleware.ts    — Auth gate: /admin/* и /sudyam/*
├── app/
│   ├── api/
│   │   ├── tournaments/     — CRUD турниров
│   │   ├── players/         — API игроков
│   │   ├── leaderboard/     — публичный рейтинг
│   │   ├── tournament-register/ — регистрация
│   │   └── admin/
│   │       ├── merge/       — слияние дублей игроков
│   │       ├── requests/    — заявки организаторов
│   │       └── roster/      — управление составами
│   ├── admin/       — UI страницы админки
│   └── sudyam/      — страницы организатора
└── lib/
    ├── auth.ts      — cookie-хелперы
    ├── admin-auth.ts— HMAC-SHA256 сессии
    └── admin-queries.ts — запросы к БД
```

---

## ⚠️ 11. Выявленные проблемы и что исправить

### 🔴 Критические

| # | Проблема | Файл | Решение |
|---|---------|------|---------|
| C1 | Стартовый экран — РОСТЕР вместо HOME | `assets/js/main.js:149` | ✅ Исправлено (2026-03-23) |
| C2 | Кнопка ✕ вела на `lpvolley.ru` вместо `sv-ugra.ru` | `config.js:11` | ✅ Исправлено (2026-03-23) |
| C3 | Fallback для ✕: `document.referrer` перекрывал `SITE_URL` | `core-navigation.js`, `core.js` | ✅ Исправлено (2026-03-23) |

### 🟡 Важные

| # | Проблема | Файл | Решение |
|---|---------|------|---------|
| W1 | `ipt-session.html` — legacy, не использует shared-модули | `ipt-session.html` | Мигрировать на standalone архитектуру |
| W2 | `core.js` дублирует логику из `core-navigation.js` (exit button) | `core.js:870–910` | Убрать дубликат, оставить только в `core-navigation.js` |
| W3 | `admin.html` не интегрирован с основным i18n | `admin.html`, `admin.css` | Подключить `shared/i18n.js` |
| W4 | `rating.html`, `profile.html`, `register.html` — изолированы от app-state | — | Унифицировать через API (web/) |
| W5 | SW cache version — ручное обновление (v59), легко забыть | `sw.js:1` | Автоматизировать через vite/build |
| W6 | Нет CSRF-защиты на `/api/admin/*` маршрутах | `web/app/api/admin/` | Добавить csrf-токен или проверку Origin |

### 🟢 Улучшения

| # | Проблема | Файл | Решение |
|---|---------|------|---------|
| I1 | `fmtDateLong()` — дата всегда в `ru-RU` формате | `runtime.js:289` | ✅ Исправлено (2026-03-23) |
| I2 | Tooltip очков `"оч"` хардкод | `components.js:358` | ✅ Исправлено (2026-03-23) |
| I3 | Резервные имена в `resetRosterNames()` — только русские | `roster-edit.js:244` | Подтянуть из DB игроков |
| I4 | `history.titleCount` — захардкоженное "450" в локалях | `locales/*.json` | Динамически из `tournamentHistory.length` |
| I5 | Нет индикатора версии приложения для пользователя | — | Добавить версию в footer/nav |

---

## 12. Конфигурация (что менять при деплое)

```javascript
// config.js — ОБЯЗАТЕЛЬНО проверить перед деплоем
window.APP_CONFIG = {
  supabaseUrl:     'https://xxx.supabase.co',  // или '' для offline
  supabaseAnonKey: 'eyJ...',                   // или '' для offline
  googleClientId:  'xxx.apps.googleusercontent.com', // для OAuth
};

var SITE_URL = 'https://sv-ugra.ru';  // ← главная страница сайта
```

```bash
# web/.env.local — серверные переменные
ADMIN_SESSION_SECRET=случайная-строка-32-символа
DATABASE_URL=postgresql://...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
```

---

## 13. Тесты

```bash
npm run test:unit          # 199 unit-тестов (Vitest) — должны быть все зелёные
npx playwright test tests/smoke.spec.ts --reporter=list  # Smoke (7 тестов)
npm run test:gate          # Release gate (CSP, SW assets, build)
```

---

## 14. Структура репозитория (ключевые файлы)

```
F:\2103\ФИНАЛ\
├── index.html              ← Главный судейский app
├── config.js               ← SITE_URL + APP_CONFIG (настроить при деплое)
├── sw.js                   ← PWA Service Worker (версия кэша)
├── manifest.webmanifest    ← PWA manifest
├── assets/
│   ├── js/
│   │   ├── main.js         ← Точка входа, порядок загрузки
│   │   ├── runtime.js      ← Клики, аудио, toast, confirm
│   │   ├── state/app-state.js ← Весь глобальный стейт
│   │   └── screens/        ← Рендеры всех экранов
│   └── app.css             ← Глобальные стили
├── shared/                 ← ES-модули (i18n, api, auth, realtime...)
├── formats/kotc/           ← KOTC standalone
├── formats/thai/           ← Thai standalone
├── locales/                ← Переводы (ru.json, en.json)
├── web/                    ← Next.js backend (sv-ugra.ru)
├── tests/                  ← Unit + E2E + Smoke тесты
├── DEVELOPMENT_PLAN.md     ← Дорожная карта (фазы 1–5)
├── STATUS.md               ← Текущее состояние задач
└── ARCHITECTURE.md         ← Этот файл
```
