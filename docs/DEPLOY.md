# Деплой (универсальный чеклист)

Ниже — схема по фактам репозитория, без привязки к одному провайдеру. Подставьте свои домены, TLS и способ запуска процессов (systemd, Docker, PaaS).

## Компоненты

| Компонент | Сборка | Раздача |
|-----------|--------|---------|
| Next.js (`web/`) | `cd web && npm ci && npm run build` | Node: `npm run start` или запуск из артефакта **standalone** |
| Судейский SPA | В корне: `npm ci && npm run build` → каталог `dist/` | Статика с root = `dist/` (или `npx vite preview` для проверки) |

## Серверный deploy-скрипт

В репозитории есть готовый server-side сценарий: [`scripts/deploy-server.sh`](../scripts/deploy-server.sh).

Что делает скрипт:

- `git fetch/pull` в серверном checkout;
- `npm ci` + `npm run build` в корне;
- `npm ci` + `npm run build` в `web/`;
- синхронизирует `web/.next/static` и `web/public` в `web/.next/standalone/web/*`;
- выкладывает `dist/` в целевой static-root;
- опционально запускает миграции;
- делает backup, `systemctl restart` и HTTP healthcheck.

Быстрый старт на сервере:

```bash
cd /var/www/ipt
cp scripts/deploy-server.env.example scripts/deploy-server.env
nano scripts/deploy-server.env
chmod +x scripts/deploy-server.sh
./scripts/deploy-server.sh
```

`deploy-server.env` уже добавлен в `.gitignore`; храните реальный env только на сервере.

### Режимы выкладки статики

- **`STATIC_SYNC_MODE=mirror`** — предпочтительный вариант, если nginx/Caddy раздаёт **отдельный каталог** со статикой. В этом режиме используется `rsync --delete`, а целевой каталог полностью зеркалится из `dist/`.
- **`STATIC_SYNC_MODE=overlay`** — режим для текущей схемы, где SPA-файлы лежат прямо в git-checkout (`/var/www/ipt`). Скрипт копирует только файлы из `dist/`, не удаляя лишнее вокруг. Для такого режима нужно явно подтвердить риск: `ALLOW_SYNC_TO_APP_DIR=1`.

Для текущего `lpvolley.ru` можно использовать конфиг из примера:

```bash
STATIC_TARGET_DIR=/var/www/ipt
STATIC_SYNC_MODE=overlay
ALLOW_SYNC_TO_APP_DIR=1
SERVICE_NAME=kotc-web.service
PUBLIC_HEALTHCHECK_URL=https://lpvolley.ru/calendar
```

Если нужно пропустить часть шага во время hotfix-деплоя:

```bash
./scripts/deploy-server.sh --skip-root-build
./scripts/deploy-server.sh --skip-web-build --skip-restart
./scripts/deploy-server.sh --run-migrations
```

## Next.js: standalone

В [`web/next.config.ts`](../web/next.config.ts) задано `output: 'standalone'`. После `npm run build`:

- Исполняемая часть обычно лежит под `web/.next/standalone` (trace root учитывает родительский каталог — см. `outputFileTracingRoot`).
- Скрипт [`web/scripts/postbuild-standalone-static.mjs`](../web/scripts/postbuild-standalone-static.mjs) копирует `.next/static` внутрь standalone-дерева, чтобы один процесс отдавал и серверный бандл, и статику Next.

На сервере нужны:

- Установленные **production**-зависимости или только артефакт standalone (зависит от того, как вы упаковываете).
- Все **переменные окружения** из [`web/.env.local.example`](../web/.env.local.example) и любые дополнительные (секрет сессии админки, PIN судей и т.д.) — задайте в панели хостинга или в unit-файле, **не** коммитьте `.env.local`.

Проверьте:

- HTTPS на публичном домене.
- Редиректы и `x-forwarded-host` / `x-forwarded-proto`, если приложение за reverse proxy (см. [`web/middleware.ts`](../web/middleware.ts) для логики редиректов `/sudyam`).

## nginx: CSS и SPA-fallback (lpvolley.ru)

Если для `/kotc/` используется `try_files $uri $uri/ /kotc/index.html` **без** отдельных `location` для `assets/`, `formats/` и т.д., то при отсутствии файла на диске (ошибка выкладки) или при слишком широком fallback nginx отдаёт **HTML** вместо `*.css`. С заголовком `X-Content-Type-Options: nosniff` браузеры **не применяют** такой ответ как таблицу стилей — страница выглядит «без CSS» (Chrome, Safari, iPad).

**Что сделать на сервере:** в `server { ... }` добавить блоки с `try_files $uri =404` для префиксов со статикой **выше** общего `location /kotc/` с fallback на `index.html`. Готовый шаблон путей и порядка — в [`docs/nginx-lpvolley.example.conf`](nginx-lpvolley.example.conf).

После правок: `sudo nginx -t && sudo systemctl reload nginx`.

**Важно:** не храните резервные копии вида `lpvolley.bak*` внутри **`/etc/nginx/sites-enabled/`** — nginx подключает **каждый** файл из этой папки, и второй `server { server_name lpvolley.ru; }` даст предупреждение *conflicting server name* и игнорирование одного из блоков. Бэкапы конфигов — в `sites-available`, в `/var/www/ipt/.deploy-backup/nginx/` или другое место вне `sites-enabled`.

Проверка с сервера или ноутбука:

```bash
curl -sI 'https://lpvolley.ru/kotc/assets/app.css' | tr -d '\r' | grep -i content-type
# ожидается: Content-Type: text/css; charset=utf-8 (или эквивалент с text/css)
```

Опционально включите проверку в [`scripts/deploy-server.sh`](../scripts/deploy-server.sh) переменной `KOTC_CSS_HEALTHCHECK_URL` в `deploy-server.env` (см. [`scripts/deploy-server.env.example`](../scripts/deploy-server.env.example)).

Если **весь** трафик идёт только в Node (один `proxy_pass /` без статики nginx), не добавляйте поверх глобальный `try_files ... /index.html` — он перехватит запросы раньше прокси.

## Судейский SPA (Vite `dist/`)

1. Сборка в корне репозитория: `npm ci && npm run build`.
2. Раздавайте содержимое каталога **`dist/`** как статику (nginx, Caddy, S3+CDN и т.д.) с корректными MIME.

[`serve.mjs`](../serve.mjs) в репозитории раздаёт **корень проекта** (исходники), а не `dist/`; его можно использовать для локальных экспериментов с заголовками `frame-ancestors`. Для продакшена скопируйте нужные заголовки из `serve.mjs` в конфиг reverse proxy, нацелив корень на `dist/`.

Переменные `serve.mjs`: **`PORT`**, **`ALLOWED_ORIGINS`** (список origin через запятую для `frame-ancestors`, вместе с `'self'` в политике).

## База данных

- Примените SQL из [`migrations/`](../migrations/) на целевой PostgreSQL в порядке имён файлов.
- Убедитесь, что строка подключения в prod совпадает с тем, что ожидает приложение (`DATABASE_URL` или доступ через API — как настроено у вас).

## Связка Next ↔ судейский iframe

Страницы вида `/sudyam` во Next могут встраивать статический турнирный UI. Нужно согласовать:

- заголовки **frame-ancestors** / **X-Frame-Options** на стороне статики (`serve.mjs` или прокси);
- **CORS/connect-src** в CSP судейских HTML, если с них идут запросы на другой origin API.

## Контрольный список перед выкладкой

- [ ] Prod env заданы для `web/`, секреты не в git.
- [ ] Миграции применены.
- [ ] `npm run build` (корень) и `web/npm run build` проходят без ошибок.
- [ ] Smoke: `npm run test:gate` (или минимум unit + целевой smoke) в CI или локально.
- [ ] TLS и корректные редиректы HTTP → HTTPS.
