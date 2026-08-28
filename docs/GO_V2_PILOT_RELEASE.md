# Tournament Engine V2: безопасный pilot release

V2 выпускается параллельно legacy GO/RR/Thai/KOTC/Individual Mix. Старые турниры
остаются на `go_engine_version = 1`, рейтинг пилота — только `shadow`.

Production-факты, от которых нельзя отступать:

- SSH выполняется только пользователем `lpdeploy`; SSH-вход под `root` запрещён;
- `/var/www/ipt` — грязный runtime checkout, поэтому он не является release source
  и его нельзя очищать, reset-ить или использовать для сборки;
- сборка и чтение release env выполняются только под `lpdeploy`; `sudo -n`
  используется точечно для PostgreSQL, установки/swap runtime и systemd, но не
  для `bash`, `npm`, `node` или запуска кода из архива;
- app-роль из `DATABASE_URL` не имеет прав на полный backup; `pg_dump`, `psql` и
  проверка backup выполняются локальной ролью PostgreSQL через
  `sudo -n -u postgres`;
- production-номера `102` и `104` уже заняты Play Malibu и Individual Mix.
  Единственная V2-последовательность: `105 → 106 → 107 → 108 → 109`;
- `web/public/images/users`, `images/players`, `images/tournaments` и `coach`
  содержат
  runtime uploads, которых нет в git; их нельзя заменять release-архивом.

## 1. Чистый и подписанный release локально

Работайте в отдельном чистом worktree/branch `codex/go-v2-pilot`. Не переносите
в release временные файлы из грязного `F:\lpvolley\worktree-v3`.

1. В обоих package roots выполните clean `npm ci` и
   `npm audit --audit-level=high`; затем запустите все unit, typecheck,
   `npm run benchmark:go-v2`, clean Linux build и browser E2E. Benchmark
   выполняет по 20 детерминированных измерений fixtures на 120/170 матчей,
   проверяет независимый validator и блокирует выпуск при `p95 > 2 с` либо
   `p99 > 5 с`.
2. Зафиксируйте только проверенные файлы. SSH-подпись обязательна и у commit, и
   у annotated tag.
3. Убедитесь, что `git status --porcelain` пуст.
4. Создайте immutable archive и SHA-256 sidecar:

   ```bash
   ./scripts/package-go-v2-pilot.sh \
     --release-ref go-v2-pilot-2026-08-28 \
     --signing-key C:/Users/User/.ssh/codex_ipt \
     --signer-principal t9923503503@gmail.com \
     --output-dir ../lpvolley-releases
   ```

   Скрипт локально проверяет обе git-signature, создаёт подписанный manifest,
   detached SSH-подписи архива/manifest и сырые подписанные Git commit/tag
   objects для независимой серверной проверки. Поле из архива не считается
   доказательством подписи. Внутри также сохраняются отдельные SHA-256 миграций:

   - `105_go_tournament_engine_v2.sql`;
   - `106_go_v2_live_schedule.sql`;
   - `107_go_v2_classification_rounds.sql`;
   - `108_go_v2_pilot_live_safety.sql`;
   - `109_go_v2_reserve_promotion.sql`.

`--allow-unsigned` допустим только для disposable rehearsal: production wrapper
откажется применять неподписанный архив.

## 2. Upload без использования server git

Загрузите архив и все созданные sidecars в каталог `lpdeploy`, не в
`/var/www/ipt`:

```bash
scp -i C:/Users/User/.ssh/codex_ipt \
  ../lpvolley-releases/lpvolley-go-v2-<sha>.tar.gz \
  ../lpvolley-releases/lpvolley-go-v2-<sha>.tar.gz.sha256 \
  ../lpvolley-releases/lpvolley-go-v2-<sha>.tar.gz.sig \
  ../lpvolley-releases/lpvolley-go-v2-<sha>.tar.gz.manifest.env \
  ../lpvolley-releases/lpvolley-go-v2-<sha>.tar.gz.manifest.env.sig \
  ../lpvolley-releases/lpvolley-go-v2-<sha>.tar.gz.commit \
  ../lpvolley-releases/lpvolley-go-v2-<sha>.tar.gz.tag \
  lpdeploy@157.22.173.248:/home/lpdeploy/releases/
```

Войдите тем же deployment account:

```bash
ssh -i C:/Users/User/.ssh/codex_ipt lpdeploy@157.22.173.248
```

Не используйте `root@…`, не выполняйте `git reset`, `git clean`, `git pull` и не
собирайте из текущего состояния `/var/www/ipt`. Dedicated wrapper распакует
проверенный архив во временный clean-каталог и передаст этот же архив сборщику.

Один раз создайте root-owned trust store из уже подтверждённого публичного ключа
(это не ротация SSH-ключа). В нём должна быть строка
`<principal> namespaces="git,lpvolley-release-archive,lpvolley-release-manifest" <public-key>`;
файл принадлежит root и не доступен на запись группе/остальным.

До извлечения любого кода независимо проверьте detached подпись системным
`ssh-keygen`, затем checksum. Только после этого извлеките bootstrap-wrapper в
домашний каталог (не поверх runtime checkout):

```bash
cd /home/lpdeploy/releases
ssh-keygen -Y verify \
  -f /etc/lpvolley/release-allowed-signers \
  -I t9923503503@gmail.com \
  -n lpvolley-release-archive \
  -s lpvolley-go-v2-<sha>.tar.gz.sig \
  < lpvolley-go-v2-<sha>.tar.gz
sha256sum --check lpvolley-go-v2-<sha>.tar.gz.sha256
mkdir -p go-v2-bootstrap
tar --no-same-owner --no-same-permissions -xzf lpvolley-go-v2-<sha>.tar.gz \
  -C go-v2-bootstrap ./scripts/deploy-go-v2-pilot.sh
```

## 3. Env и fail-closed preflight

В приватном `/var/www/ipt/scripts/deploy-server.env` задайте:

```dotenv
APP_DIR=/var/www/ipt
WEB_DIR=/var/www/ipt/web
SERVICE_NAME=kotc-web.service
GO_V2_RELEASE_ARCHIVE=/home/lpdeploy/releases/lpvolley-go-v2-<sha>.tar.gz
GO_V2_RELEASE_CHECKSUM_FILE=/home/lpdeploy/releases/lpvolley-go-v2-<sha>.tar.gz.sha256
GO_V2_RELEASE_ARCHIVE_SIGNATURE=/home/lpdeploy/releases/lpvolley-go-v2-<sha>.tar.gz.sig
GO_V2_RELEASE_MANIFEST=/home/lpdeploy/releases/lpvolley-go-v2-<sha>.tar.gz.manifest.env
GO_V2_RELEASE_MANIFEST_SIGNATURE=/home/lpdeploy/releases/lpvolley-go-v2-<sha>.tar.gz.manifest.env.sig
GO_V2_RELEASE_COMMIT_OBJECT=/home/lpdeploy/releases/lpvolley-go-v2-<sha>.tar.gz.commit
GO_V2_RELEASE_TAG_OBJECT=/home/lpdeploy/releases/lpvolley-go-v2-<sha>.tar.gz.tag
GO_V2_RELEASE_ALLOWED_SIGNERS_FILE=/etc/lpvolley/release-allowed-signers
GO_V2_RELEASE_SIGNER_PRINCIPAL=t9923503503@gmail.com
GO_V2_RELEASE_REF=<full-40-character-commit-sha>
GO_V2_DEPLOY_ACCOUNT=lpdeploy
GO_V2_DATABASE_NAME=lpbvolley
GO_V2_DB_BACKUP_DIR=/home/lpdeploy/lpvolley-backups/go-v2
GO_V2_SERVER_MIGRATION_102_PATH=/var/www/ipt/migrations/102_play_malibu_courts.sql
PERSISTENT_PUBLIC_PATHS=images/users,images/players,images/tournaments,coach
GO_V2_COURT_TOKEN_SECRET=<at-least-32-random-bytes>
SITE_URL=https://lpvolley.ru
CRON_SECRET=<at-least-32-url-safe-random-characters>
GO_V2_CRON_HEALTHCHECK_URL=http://127.0.0.1:3101/api/cron/telegram-flush
# V2 bridge выключен до запуска одного проверенного external relay.
GO_V2_TELEGRAM_BRIDGE_ENABLED=false
TELEGRAM_OUTBOX_OWNER=relay
```

`CRON_SECRET`, `TELEGRAM_OUTBOX_OWNER` и остальные runtime-переменные должны быть
видны не только deploy-wrapper, но и процессу `kotc-web.service` через его реальный
`EnvironmentFile`/unit. Не меняйте unit вслепую: сохраните его в evidence, внесите
переменные в фактически подключённый приватный env и выполните `daemon-reload` до
cutover. Authenticated cron healthcheck после swap проверяет именно окружение
нового процесса и при ошибке автоматически возвращает прежний runtime.

Сначала выполните только read-only preflight:

```bash
bash /home/lpdeploy/releases/go-v2-bootstrap/scripts/deploy-go-v2-pilot.sh \
  --env-file /var/www/ipt/scripts/deploy-server.env \
  --preflight-only
```

Он проверяет пользователя `lpdeploy`, узкие non-interactive sudo-команды,
root-owned trust store, detached SSH-подписи архива и manifest, встроенные
SSH-подписи исходных Git commit и annotated tag, совпадение внешнего подписанного
manifest с копией в архиве, SHA-256 и порядок миграций, legacy-таблицы/колонки,
runtime-роль, отсутствие частично установленной V2-схемы и наличие всех локальных
файлов, на которые ссылаются `players/users/tournaments/gallery` и
`coach_exercise_photos`. Дополнительно строится SHA-256 manifest всех файлов из
persistent allow-list, включая ещё не привязанные к БД uploads. При любом
расхождении ничего не меняется.

На аудите 2026-08-28 отдельно зафиксированы три DB-ссылки на runtime-local
uploads, которых нет в git/clean archive:
`/images/users/u6-1785772522380-49c1147a.jpg`,
`/images/users/u32-1785950536232-00faf0c7.jpg` и
`/images/users/u41-vk-1786610322048-c979c068.jpg`. В production source/runtime
они присутствуют, и counts совпадают: wrapper обязан перенести их из текущего
runtime и повторно проверить SHA-256. Blocker возникает только если preflight
реально не найдёт файл в текущем production runtime; не исключайте эти ссылки из
проверки и не подменяйте их файлами из clean archive.

## 4. Обязательная репетиция backup/restore

Production backup нельзя делать app-ролью из `DATABASE_URL`. Создайте полный dump:

```bash
sudo -n -u postgres pg_dump -d lpbvolley -Fc > /home/lpdeploy/lpvolley-backups/rehearsal.dump
sudo -n -u postgres pg_restore --list \
  < /home/lpdeploy/lpvolley-backups/rehearsal.dump \
  > /home/lpdeploy/lpvolley-backups/rehearsal.restore-list.txt
```

Восстановите его в disposable PostgreSQL, примените к копии строго
`105 → 106 → 107 → 108 → 109` из
проверенного архива, затем повторите grants, counts legacy-данных, V2 tests,
typecheck/build и smoke legacy-маршрутов. Restore выполняется потоком, чтобы роль
`postgres` не зависела от прав чтения файла:

```bash
cat /home/lpdeploy/lpvolley-backups/rehearsal.dump \
  | sudo -n -u postgres pg_restore -d <disposable_db> --clean --if-exists
```

После применения всех пяти миграций обязательно запустите транзакционный тест
неизменяемости preview/second-approval истории. Он сам выполняет `ROLLBACK` и
проверяет права именно через runtime-роль `lpbvolley`:

```bash
sudo -n -u postgres psql -X -v ON_ERROR_STOP=1 -d <disposable_db> \
  -f tests/db/go-v2-preview-approval-immutability.sql
sudo -n -u postgres psql -X -v ON_ERROR_STOP=1 -d <disposable_db> \
  -f tests/db/go-v2-cross-tournament-scope.sql
sudo -n -u postgres psql -X -v ON_ERROR_STOP=1 -d <disposable_db> \
  -f tests/db/go-v2-telegram-at-most-once.sql
```

Только после успешной репетиции добавьте в приватный env:

```dotenv
GO_V2_REHEARSAL_CONFIRMED=RESTORE_AND_TESTS_PASSED
GO_V2_DEPLOY_CONFIRM=APPLY_GO_V2_PILOT
```

## 5. Production apply и atomic runtime replacement

До запуска полного wrapper проверьте фактическое состояние relay. На аудите перед
этим пилотом работающий external relay не был найден, поэтому начальная установка
выполняется с `GO_V2_TELEGRAM_BRIDGE_ENABLED=false`: V2 events не переносятся в
очередь доставки. Не имитируйте остановку несуществующего процесса. Если relay
уже появился, подготовьте release-версию `telegram-bot/bot.mjs`, проверьте
`node --check`, остановите единственный relay и V2 bridge timer на maintenance
window. В приватном deploy env укажите ровно одно правдивое состояние cutover:

```dotenv
GO_V2_TELEGRAM_RELAY_STOP_CONFIRMED=RELAY_STOPPED_FOR_CUTOVER
# либо, только при выключенном bridge и подтверждённом отсутствии процесса:
GO_V2_TELEGRAM_RELAY_STOP_CONFIRMED=NO_RELAY_RUNNING_BRIDGE_DISABLED
```

```bash
bash /home/lpdeploy/releases/go-v2-bootstrap/scripts/deploy-go-v2-pilot.sh \
  --env-file /var/www/ipt/scripts/deploy-server.env
```

Wrapper:

1. независимо повторно проверяет archive/manifest signatures, исходные подписанные
   Git commit/tag objects и migration hashes; никакому `SIGNATURE_VERIFIED` внутри
   архива не доверяет;
2. создаёт `pg_dump -Fc` через local `postgres` и обязательно выполняет
   `pg_restore --list`;
3. сохраняет безопасные systemd metadata (без вывода env/secrets), runtime HEAD
   (если читается), legacy counts, release и
   migration hashes, а также read-only копию и checksum production
   `102_play_malibu_courts.sql` в закрытый evidence-каталог;
4. после подтверждённого backup, но до установки V2, выполняет отдельную
   идемпотентную data-fix
   `scripts/data-fixes/20260828_fix_womens_tournament_division.sql`: только
   проверенная запись `Лютый женский рандом тай` может изменить категорию
   `Мужской → Женский`; другое имя, статус или неожиданная категория блокируют
   выпуск, а результат сохраняется в evidence;
5. применяет только `105 → 106 → 107 → 108 → 109` через
   `psql -X -v ON_ERROR_STOP=1`;
6. проверяет V2 tables/grants;
7. запускает release-версию `deploy-server.sh` под `lpdeploy` (не через `sudo`)
   с `--source-archive`,
    `--no-pull`, `--skip-static-sync` и `--skip-migrations`; legacy Vite-static
    при V2 pilot не переписывается. Clean standalone вместе с `.next/static` и
    `npm ci/build` выполняются во временном каталоге без root; `sudo` применяется
    только к проверенным install/swap/systemd-командам. `public` полностью
    готовится в staging на том же filesystem, поверх него
    накладывается только allow-list runtime uploads и до остановки сервиса
    проверяется persistent SHA-256 manifest. Затем выполняется короткий guarded
    swap всего `web/.next/standalone`: `stop → rename old → rename staged → start`.
    После `stop`, но до rename, выполняется последний локальный overlay allow-list,
    поэтому uploads, появившиеся во время долгой сборки после preflight, также
    попадают в successor runtime; исходный SHA-manifest проверяется ещё раз.
    Предыдущий runtime сохраняется. Любая ошибка start/healthcheck автоматически
    возвращает его, запускает прежнюю версию и сохраняет failed runtime для аудита.
    После успеха wrapper повторно сверяет каждый DB-referenced файл и SHA-256.

Перед остановкой wrapper сверяет реальный `WorkingDirectory`/`ExecStart` systemd с
`/var/www/ipt/web/.next/standalone/web`. Если unit запускает внешний checkout или
другой runtime, deploy завершается до swap: сначала нужен стабильный unit-path
(либо эквивалентная атомарно переключаемая indirection), а не последовательный
`rsync` живых `.next`-частей.

Ни `migrate.mjs`, ни glob `migrations/*.sql`, ни повторный запуск `104` здесь не
используются. Если обнаружена полная или частичная V2-схема, wrapper завершится
ошибкой: сначала нужен явный аудит состояния, а не слепой повтор миграций.

## 6. Smoke без публикации

1. Создайте новый GO-турнир в `draft`, выберите Engine V2 и оставьте
   `goV2PublicEnabled` выключенным.
2. Убедитесь, что `go_engine_version = 2` записан в отдельной колонке. JSON
   `settings.goEngineVersion`/`settings.go_engine_version` не является источником
   активации и удаляется при сохранении.
3. Public structure должен отвечать `404`, пока V2 не опубликован явно. Одного
   `settings.goV2PublicEnabled=true` недостаточно: это только аварийный kill-switch.
4. Выполните shadow fixtures `22/23/30/31/32/48`, сохраните input/schedule hashes
   и validator results. Rating projection остаётся нулевой.
5. Проверьте legacy GO, RR, Thai, KOTC и Individual Mix после restart.

Публиковать можно только один UUID закрытого пилота. Используйте штатный
директорский клиент с canonical request hash и обязательным envelope:

1. включите `settings.goV2PublicEnabled` только у выбранного UUID;
2. вызовите `POST /api/admin/go-v2/tournaments/{id}/publication/preview` с
   `payload.toState=published`;
3. если preview имеет risk `red` (есть команды или расписание), второй отличный
   admin должен проверить точные `inputHash`, aggregate version, команды и
   successor `scheduleHash`, затем подтвердить preview через существующий
   `/approvals/{previewId}`;
4. вызовите `publication/commit` с теми же `previewId`, `inputHash`, target и для
   red-операции `confirmRed=true`/`redApprovalId`;
5. проверьте immutable revision, projection `publication_state=published`, новый
   aggregate version и только затем ожидайте HTTP `200` public structure.

Для закрытия вызовите тот же `preview → commit` с
`payload.toState=unpublished`: это amber-операция, которая атомарно закрывает
public API и сохраняет аудит. При аварии `goV2PublicEnabled=false` закрывает API
немедленно как дополнительный fail-closed kill-switch; после стабилизации всё
равно зафиксируйте `unpublished` отдельной компенсирующей revision.

## 7. Единственный владелец Telegram

V2 worker только идемпотентно мостит события в общий `telegram_outbox`, а один
внешний relay является единственным отправителем **V2-уведомлений** в Telegram
Bot API. Это ограничение пока не относится ко всем legacy-модулям: старый web
ещё использует `TELEGRAM_BOT_TOKEN` для существующих функций, поэтому удалять
его из production env в этом пилоте нельзя.

1. До готовности relay держать `GO_V2_TELEGRAM_BRIDGE_ENABLED=false`. В этом
   состоянии authenticated cron healthcheck возвращает `status=disabled` и не
   потребляет V2 event.
2. Подготовленный в разделе 5 relay не запускать до успешного применения всей
   последовательности `105 → 106 → 107 → 108 → 109`,
   runtime swap и authenticated cron healthcheck.
3. В его локальном `.env` задать `TELEGRAM_OUTBOX_OWNER=relay`; bot token и
   `TELEGRAM_AGENT_SECRET` не копировать в release archive и не выводить в лог.
4. После успешного web release запустить ровно один экземпляр обновлённого relay,
   проверить его heartbeat и только затем атомарно установить
   `GO_V2_TELEGRAM_BRIDGE_ENABLED=true` в web env с restart/smoke.
   Он атомарно claim-ит строки через `/api/telegram/agent`, повторяет потерянный
   ack с тем же `claimId` и записывает provider receipt.
5. На web оставить один timer, который раз в минуту только строит V2 bridge:

   ```bash
   curl --fail --silent --show-error \
     -H "Authorization: Bearer ${CRON_SECRET}" \
     https://lpvolley.ru/api/cron/telegram-flush
   ```

`200` — bridge обработан; `409` — overlapping bridge worker; `502` — обработка
V2 event завершилась ошибкой; `503` — owner/schema не готовы; `500` —
необработанная ошибка. Ошибка worker никогда не маскируется HTTP 200. Unique
dedup и lease исключают параллельную доставку одной строки, потерянный успешный
ack повторяется идемпотентно. Перед `sendMessage` relay записывает durable
provider-attempt fence. Сетевой timeout или падение после этого fence переводит
строку в `delivery_unknown`/dead-letter без автоматической повторной отправки:
это сохраняет строгий ноль автоматических дублей ценой возможного пропуска,
который оператор разбирает вручную. Абсолютный exactly-once provider delivery
Telegram API без idempotency key не обещается.

## 8. Мониторинг и rollback

Следите за V2 5xx, restarts, solver timeout/infeasible/p95, validator failures,
pending/dead-letter обеих notification queues, disruptions, finish requests и
строгим нулём rating projections.

Rollback приложения:

1. выключить `goV2PublicEnabled` у пилотного UUID;
2. установить `GO_V2_TELEGRAM_BRIDGE_ENABLED=false`, остановить V2 bridge cron и
   relay; legacy Telegram runtime/token не менять этим rollback;
3. развернуть предыдущий проверенный runtime archive;
4. вернуть `go_engine_version = 1` только пилотному турниру, если V2 state ещё не
   материализован; иначе сохранить аудит и разбирать отдельной операцией;
5. оставить additive таблицы/колонки `105/106/107/108/109` на месте.

DB restore — аварийная операция в отдельном maintenance window: он откатывает и
unrelated legacy activity после backup. DROP V2-таблиц и удаление аудита запрещены.
