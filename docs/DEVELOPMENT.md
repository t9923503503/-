# Разработка

## Структура

- **Корень** — Vite multi-page сборка (`vite.config.js`): точки входа `index.html`, `admin.html`, `formats/kotc/kotc.html`, `formats/thai/thai.html` и др. Исходники: `assets/`, `shared/`, `formats/`.
- **`web/`** — Next.js 15 App Router, Tailwind. Публичные страницы и операторская админка; данные с общим доступом — через API и PostgreSQL, не через `localStorage` на клиенте для «шареных» сущностей.

## Локальный запуск

### Судейский SPA

```bash
npm install
npm run dev
```

Сервер Vite: порт **8000** (см. `vite.config.js`, секция `server.port`).

Просмотр production-сборки Vite:

```bash
npm run build
npx vite preview
```

[`serve.mjs`](../serve.mjs) — отдельный простой сервер: корень файлов = каталог репозитория (где лежит скрипт), не каталог `dist/`. Для проверки заголовков iframe в связке с Next удобнее поднять Next на `:3000` и `ALLOWED_ORIGINS=http://localhost:3000 node serve.mjs 8000` из корня репозитория.

### Next.js (`web/`)

```bash
cd web
npm install
cp .env.local.example .env.local   # заполнить значения
npm run dev
```

По умолчанию dev-сервер Next: `http://localhost:3000`.

Сборка и production-старт:

```bash
cd web
npm run build    # postbuild: scripts/postbuild-standalone-static.mjs
npm run start
```

## Переменные окружения (Next.js)

Пример: [`web/.env.local.example`](../web/.env.local.example).

- `APP_API_BASE` — базовый URL вашего API (PostgREST/прокси).
- `POSTGREST_JWT_SECRET` / `APP_SUPABASE_ANON_KEY` — по схеме авторизации.
- `DATABASE_URL` — прямое подключение к PostgreSQL, если оно используется кодом приложения.
- **`JUDGE_PIN`** (или legacy **`SUDYAM_PIN`**) — PIN входа судей (`/sudyam`, `/court`, cookie `sudyam_session`). В dev без переменных используется fallback **2525**; в production переменная обязательна (`web/lib/judge-pin.ts`).
- **`ADMIN_PIN`** / **`ADMIN_CREDENTIALS_JSON`** / **`ADMIN_SESSION_SECRET`** — админка `/admin/*`, отдельно от судейского PIN; не задавайте тем же значением, что `JUDGE_PIN`.

Секреты админки и прочие prod-переменные — см. код `web/middleware.ts`, route handlers и комментарии в `DEPLOY.md`.

## Миграции БД

SQL-файлы в [`migrations/`](../migrations/). Применяйте на целевой БД в порядке номеров файлов (процесс зависит от вашего хостинга — см. `DEPLOY.md`).

## Тесты (корень репозитория)

```bash
npm run test:unit
npx playwright test tests/smoke.spec.ts --reporter=list
npm run test:gate
```

Дополнительно: `npm run test:e2e:thai`, полный Playwright — `npm run test:smoke`.

## Thai format (`formats/thai/thai.html`) — URL

Параметры запроса (в дополнение к `mode`, `n`, `seed`, `trnId`):

- **`courts`** — число матчей (пар) в одном туре R1; опционально (нет параметра = legacy-расписание из генератора).
- **`tours`** — число туров R1; опционально.

Сборка ссылки: [`shared/format-links.js`](../shared/format-links.js) — `buildThaiFormatUrl({ mode, n, seed, courts?, tours?, trnId? })`. Копия для статики вручную синхронизируется с [`web/public/shared/format-links.js`](../web/public/shared/format-links.js).

На странице Thai **нет** отдельного UI для смены `courts`/`tours`: меняются через URL или лаунчер.

## Важные правила (SPA + shared)

Они подходят для судейского контура и общих модулей:

1. **Offline-first** — сетевые вызовы опциональны, с fallback.
2. **globalThis** — модули в `shared/` часто экспортируют API в `globalThis` для classic scripts.
3. **Service Worker** — новый `.js`, отдаваемый с корня статики, добавляйте в `CORE_ASSETS` в `sw.js` и увеличивайте версию кэша.
4. **CSP (статический судейский контур)** — не возвращайте `'unsafe-inline'` в `script-src` там, где все скрипты подключаются через `src=`.
5. **Секреты Cloud** — конфиг вида `kotc3_sb` / room secret храните в **`sessionStorage`**, не в `localStorage`.
6. **Режим судьи** — `globalThis.judgeMode` (замороженный объект после инициализации): `court`, `trnId`, `token`, `judgeName`, `active`.

Новый пользовательский функционал (календарь, рейтинги публично, админка оператора) — в **`web/`**; не добавляйте такие сценарии в `assets/js/screens/home.js` и аналоги как основное место.

## Legacy KOTC в `web/public/kotc/`

Не править без необходимости. См. `web/public/kotc/DEPRECATED.md` и `web/public/kotc/INLINE_HANDLER_RULES.md`.
