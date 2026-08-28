# Telegram-вход и бот LPVOLLEY

Дата: 2026-08-05.

> **Режим выпуска в РФ:** Telegram-вход не является публичным способом
> авторизации. Production-код работает fail-closed и допускает только числовые
> ID из `TELEGRAM_AUTH_BETA_USER_IDS`; интерфейс beta открывается по
> `/login?telegramBeta=1`. Для всех пользователей готовится VK ID, а Telegram
> останется добровольной привязкой и каналом уведомлений.

Статус: owner-only Telegram-вход и relay развёрнуты в production. Фотоархив
выпущен 2026-08-10: миграция `080` применена, web и установленный relay обновлены;
команда `/gallery` доступна только owner scope из `TELEGRAM_ADMIN_USER_IDS`.

## Что получает пользователь

- В закрытой beta владелец сайта может войти через `@Lpvolley_bot` без email и пароля.
- Для остальных пользователей Telegram-вход, новая привязка и регистрационная анкета
  бота закрыты; публичным способом авторизации должен стать VK ID. Уже связанные
  аккаунты могут продолжать получать уведомления и отключить привязку.
- Сайт открывает Telegram в новой вкладке, а шестизначный код пользователь вводит
  только в исходной вкладке `lpvolley.ru`.
- После кода сайт явно показывает Telegram-профиль и просит выбрать действие:
  войти в связанный аккаунт, создать новый либо сначала войти по email и связать
  Telegram со старым аккаунтом.
- Пересланная deep-link ссылка не является credential и сама по себе не создаёт
  сессию. Код хранится в БД только как HMAC, действует внутри короткого intent и
  блокируется после пяти ошибок.
- Кнопка «Это не я» в боте закрывает intent. Один intent и одна browser-secret
  используются не более одного раза.
- Карточка игрока не присваивается автоматически по имени: новую связь подтверждает
  только явно разрешённый модератор.

Email остаётся действующим способом входа для существующих аккаунтов. Production
не выдаёт legacy bearer-ссылки привязки; новая привязка выполняется только через
browser-bound OTP flow с явным согласием. Отвязка требует свежего входа по
email/паролю и trusted Origin.

## Архитектура

Боевой сервер не имеет исходящего доступа к Telegram API. Основной режим — локальный
relay на машине с доступом к Telegram:

```text
Telegram ⇄ local relay (long polling / sendMessage)
                 │ HTTPS + Bearer TELEGRAM_AGENT_SECRET
                 ▼
       lpvolley.ru/api/telegram/agent ⇄ PostgreSQL
```

Сервер владеет аккаунтами, browser-bound intent, HMAC-кодами, очередями и
дедупликацией. Relay приносит подтверждённый Telegram `from.id`, забирает outbox и
доставляет сообщения. `telegram_user_id` — единственный Telegram auth subject;
`telegram_chat_id` и `telegram_private_chat_id` — только адреса доставки.

Webhook `app/api/telegram/webhook/route.ts` — запасной режим. Он реализует тот же
кодовый flow и кнопку отказа, но включается только при настроенных
`TELEGRAM_BOT_TOKEN` и `TELEGRAM_WEBHOOK_SECRET` на сервере.

## Фотоотчёт турнира через Telegram

Команда `/gallery` доступна только Telegram ID из `TELEGRAM_ADMIN_USER_IDS` и только в личном чате с ботом.

1. Организатор выбирает один из последних завершённых турниров.
2. Первое присланное фото становится главным общим фото. Шаг можно пропустить командой `/skip`.
3. Следующие фото добавляются в галерею; можно отправить один Telegram-альбом или снимки по одному.
4. Лимит — 20 фото в галерее, не считая главного. `/done` завершает сценарий, `/cancel` останавливает его без удаления уже сохранённых снимков.

Relay скачивает максимальную доступную Telegram-версию файла и отправляет её в защищённый
`/api/admin/tournaments/[id]/media` с Bearer `TELEGRAM_AGENT_SECRET` и Telegram user ID. Web повторно
проверяет allowlist, принимает фото только для завершённого турнира, уменьшает главный кадр до 1600 px,
галерею до 1280 px, создаёт WebP-миниатюру и не позволяет превысить лимит ни в API, ни в базе.

Для релиза галереи сначала применяется `migrations/080_tournament_gallery.sql`, затем одновременно
обновляются web runtime и relay. До успешного web smoke новый relay не запускать.

Production release 2026-08-10: web build `Gyruh7rass51YZTyUTYk-`, relay SHA-256
`3E0CB477ECC3A56288C174B3E31ADCE16CABFA8B33AAF1C05B651443CD4CFF7E`.

## Source of truth и конфигурация relay

Репозиторный [`telegram-bot/bot.mjs`](../telegram-bot/bot.mjs) — source of truth.
`F:\lpvolley\telegram-bot\bot.mjs` — установленная runtime-копия. `.env`, `.offset`
и другие runtime-файлы нельзя переносить в репозиторий.

Обязательные значения `F:\lpvolley\telegram-bot\.env`:

```dotenv
BOT_TOKEN=<BotFather token>
SITE_BASE=https://lpvolley.ru
TELEGRAM_AGENT_SECRET=<тот же длинный секрет, что на web>
TELEGRAM_ADMIN_USER_IDS=<числовые user id через запятую>
TELEGRAM_OUTBOX_OWNER=relay
```

Каждый ID из `TELEGRAM_ADMIN_USER_IDS` должен принадлежать доверенному организатору.
Каждый организатор обязан заранее открыть приватный чат с ботом и нажать Start;
иначе Telegram не позволит боту доставить заявку владельца beta. Автоматического назначения админов по группе
или каналу нет.

Серверные env:

```dotenv
SITE_BASE_URL=https://lpvolley.ru
PLAYER_SESSION_SECRET=<длинный случайный секрет>
TELEGRAM_INTENT_HASH_SECRET=<отдельный длинный случайный секрет>
TELEGRAM_AGENT_SECRET=<совпадает с relay>
TELEGRAM_ADMIN_USER_IDS=<тот же allowlist>
TELEGRAM_AUTH_BETA_USER_IDS=353922461
TELEGRAM_BOT_USERNAME=Lpvolley_bot
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=Lpvolley_bot
TELEGRAM_CHANNEL_ID=<канал или группа для анонсов>
TELEGRAM_OUTBOX_OWNER=relay
```

`TELEGRAM_BOT_TOKEN` на web в relay-режиме не нужен. Секреты не выводить в логи,
diff, shell history или документацию.

Для GO V2 серверный cron только переводит доменные события в общий
`telegram_outbox`. Локальный relay остаётся единственным процессом, вызывающим
Bot API; строки он получает атомарным claim/lease и подтверждает receipt с тем же
`claimId`. Старый и новый relay одновременно не запускать.

## Обязательные release blockers закрытой beta

Даже owner-only запуск запрещён, пока не выполнены все пункты:

1. Опубликована реальная Политика обработки персональных данных с реквизитами
   оператора. `/pravila` сейчас является правилами турниров и не заменяет её.
2. Политика опубликована на `/privacy`, а явное согласие на обработку Telegram
   identity фиксируется с версией политики и временем. Предзаполненный checkbox не использовать.
   Создание или привязка публичной карточки игрока требует отдельного применимого
   основания; ссылка на политику не заменяет согласие на распространение данных.
3. `TELEGRAM_ADMIN_USER_IDS` явно настроен и проверен на web и relay; минимум один
   модератор начал приватный чат с ботом.
4. Пройдены агрегированные migration preflight и ручной разбор всех ненулевых
   конфликтов ownership.
5. Nginx канонизирует `www` на apex и нормализует client IP до приложения.

## Nginx перед запуском

На ingress нужен один канонический origin и недоверенный клиентский XFF нельзя
пропускать дальше:

```nginx
server {
    server_name www.lpvolley.ru;
    return 308 https://lpvolley.ru$request_uri;
}

location / {
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_pass http://127.0.0.1:3101;
}
```

Добавить общий per-IP rate limit на `/api/auth/telegram-start` и остальные auth
routes. Приложение использует последнее значение нормализованного XFF; схема выше
гарантирует, что это адрес непосредственного клиента, а не подставленный header.

## Атомарная выкладка

Старый web и старый relay несовместимы с финальной схемой. Оба процесса должны быть
остановлены до миграции и оставаться остановленными до запуска соответствующего
нового кода. Telegram updates сохранятся у Telegram и будут прочитаны по offset после
возобновления relay.

### 1. Подготовить relay, но не запускать

```powershell
Copy-Item -LiteralPath '.\telegram-bot\bot.mjs' -Destination 'F:\lpvolley\telegram-bot\bot.mjs' -Force
node --check '.\telegram-bot\bot.mjs'
node --check 'F:\lpvolley\telegram-bot\bot.mjs'
Get-FileHash '.\telegram-bot\bot.mjs' -Algorithm SHA256
Get-FileHash 'F:\lpvolley\telegram-bot\bot.mjs' -Algorithm SHA256
Stop-ScheduledTask -TaskName 'LPVOLLEY Telegram Bot' -ErrorAction SilentlyContinue
```

Хеши должны совпасть. Проверить обязательные env без печати их значений.

### 2. Открыть maintenance window и сделать backup

```bash
sudo systemctl stop kotc-web.service
pg_dump "$DATABASE_URL" --format=custom \
  --file="pre-telegram-auth-$(date +%Y%m%d-%H%M%S).dump"
```

### 3. Preflight и миграции

`075` делает fail-fast проверку без вывода PII. Она считает:

- аккаунты без email/password и без валидного Telegram subject;
- невалидные Telegram subjects;
- canonical `users.player_id`, конфликтующие с approved request;
- canonical links без подтверждающего approved request/claim;
- approved request/claim на карточку, принадлежащую другому аккаунту.

Любое ненулевое значение откатывает **обе** миграции. Не ослаблять проверку: сначала
снять агрегаты отдельным аудитом и вручную разрешить каждую связь.

Запускать оба файла одной командой и одной транзакцией:

```bash
psql -v ON_ERROR_STOP=1 --single-transaction "$DATABASE_URL" \
  -f migrations/074_telegram_registration.sql \
  -f migrations/075_telegram_web_auth.sql
```

Во время первого успешного cutover `075` намеренно гасит недоставленные персональные
строки старого `telegram_outbox`: у них нет immutable subject/provenance, и после
переноса chat ID их нельзя доставить безопасно. Persistent marker делает повторный
запуск идемпотентным и не гасит новые сообщения. Backup из шага 2 обязателен.

### 4. Запустить новый web, проверить агент, затем relay

Развернуть новый web-код штатным способом, настроить env и запустить сервис:

```bash
sudo systemctl start kotc-web.service
curl --fail-with-body -sS -X POST https://lpvolley.ru/api/telegram/agent \
  -H "Authorization: Bearer $TELEGRAM_AGENT_SECRET" \
  -H 'Content-Type: application/json' \
  --data '{"action":"help"}'
```

Только после успешного smoke-test:

```powershell
Start-ScheduledTask -TaskName 'LPVOLLEY Telegram Bot'
```

Переход на production `__Host-` cookies намеренно инвалидирует старые domain cookies;
пользователи один раз войдут заново. Не возвращать старые имена cookie ради
совместимости: это снова разрешит sibling-subdomain cookie injection.

Если атомарная миграция упала, схема откатилась: устранить причину до повторного
запуска. После успешной миграции нельзя откатывать только constraints; остановить
web/relay и использовать backup/PITR по согласованной процедуре.

## End-to-end проверка закрытой beta

1. В приватном окне открыть `/login?telegramBeta=1&returnTo=%2Fprofile`. Обычный
   `/login` не должен показывать Telegram CTA.
2. Нажать «Продолжить в Telegram»; бот должен прислать шестизначный код и кнопку
   «Это не я», но не login URL.
3. Ввести код в **исходной** вкладке. Неверные коды уменьшают остаток попыток;
   пятая ошибка закрывает intent.
4. На тестовой БД проверить оба явных варианта для нового Telegram: «Создать аккаунт
   и войти» и «У меня уже есть аккаунт — войти по email». На production не создавать
   лишний аккаунт только ради smoke-test; до выбора аккаунт не создаётся.
5. Для связанного Telegram проверить вход, предупреждение при смене уже открытого
   аккаунта и сохранение безопасного `returnTo`.
6. Переслать deep link в другой Telegram: он не должен дать вход первому или второму
   браузеру. Отправить код в другой браузер: без browser-secret он бесполезен.
7. Нажать «Это не я»: исходная вкладка должна показать закрытый intent.
8. Проверить, что Telegram-only аккаунт нельзя оставить без единственного login method,
   legacy link в production возвращает `410`, а unlink требует свежего password login.
9. С неразрешённого Telegram ID проверить, что `/register`, `reg:start`, legacy-link
   и web-login не создают аккаунт и не собирают анкету; разрешены только публичные
   списки игр/турниров и функции уже связанного аккаунта, не создающие новую identity.

## Основные файлы

| Назначение | Файл |
|---|---|
| Web intent | `web/app/api/auth/telegram-start/route.ts` |
| Код, решение аккаунта, session | `web/app/api/auth/telegram-login/route.ts` |
| OTP/HMAC helpers | `web/lib/telegram-web-auth.ts` |
| Bot onboarding и moderation | `web/lib/telegram-registration.ts` |
| Relay API | `web/app/api/telegram/agent/route.ts` |
| Запасной webhook | `web/app/api/telegram/webhook/route.ts` |
| UI входа | `web/components/profile/PlayerAuthPanel.tsx` |
| Миграции | `migrations/074_telegram_registration.sql`, `migrations/075_telegram_web_auth.sql` |
| Relay source | `telegram-bot/bot.mjs` |

VK OAuth не входит в этот релиз; его следует делать отдельным auth provider после
стабилизации Telegram-потока и политики объединения аккаунтов.
