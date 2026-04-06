# 📋 STATUS.md — Координация агентов

> **КАЖДЫЙ АГЕНТ ЧИТАЕТ ЭТОТ ФАЙЛ ПЕРЕД НАЧАЛОМ РАБОТЫ**
>
> Обновляй свою секцию после каждой завершённой задачи.
> Не трогай чужие секции (кроме BLOCKED).
>
> Формат: `- [ ] Задача` → `- [x] Задача ✅ (дата, файлы)`

---

## Текущий этап: сопровождение и новые фичи (фазы 5–8 по чеклисту ниже — закрыты)

Вход в проект: [`README.md`](README.md), для агентов — [`docs/AGENTS.md`](docs/AGENTS.md), деплой — [`docs/DEPLOY.md`](docs/DEPLOY.md).

### Новые задачи
- [x] Finished tournament photos: блок «Атмосфера площадки» переведён на перелистываемую галерею кадров + добавлено общее фото первым слайдом, hero-кнопка Thai board убрана ✅ (2026-04-06, `web/components/calendar/FinishedTournamentPage.tsx`, `web/components/calendar/FinishedTournamentGallery.tsx`, `web/public/images/tournaments/a19522bb-864e-4520-8182-61e035c27894/gallery/*`, `STATUS.md`)
- [x] Finished tournament UX: editorial summary оставлен сверху, фото вынесено отдельно, а полная таблица свёрнута в блок «Таблица начисления рейтинга» с пояснениями по очкам и дублю призёров ✅ (2026-04-06, `web/components/calendar/FinishedTournamentPage.tsx`, `STATUS.md`)
- [x] Calendar finished Thai: hero-фото турнира сверху + блок статистики из Thai-табло на странице завершённого турнира ✅ (2026-04-06, `web/app/calendar/[id]/page.tsx`, `web/components/calendar/FinishedTournamentPage.tsx`, `web/public/images/tournaments/a19522bb-864e-4520-8182-61e035c27894/hero.jpg`, `STATUS.md`)
- [x] Rankings medals: медали в карточках рейтинга, отдельный таб «Медали» с разбивкой по уровням/форматам + фильтры истории в профиле игрока ✅ (2026-04-06, `web/lib/types.ts`, `web/lib/queries.ts`, `web/app/api/leaderboard-medals/route.ts`, `web/app/rankings/RankingsClient.tsx`, `web/components/players/EpicProfile.tsx`, `tests/unit/rankings-medals-source-contract.test.js`, `STATUS.md`)
- [x] Admin archive results: нормализация дробного места (`32.5` → `32`) перед записью в `tournament_results.place integer`, чтобы `/api/admin/tournaments/[id]/results` не падал 500 ✅ (2026-04-06, `web/app/api/admin/tournaments/[id]/results/route.ts`, `web/lib/admin-queries-pg.ts`, `web/lib/admin-postgrest.ts`, `STATUS.md`)
- [x] Профиль игрока: призы по уровням (Hard/Advanced/Medium/Light) + рейтинг по форматам (KOTC/Double Trouble/Thai) ✅ (2026-04-06, `web/lib/queries.ts`, `web/components/players/EpicProfile.tsx`, `web/app/profile/page.tsx`, `STATUS.md`)
- [x] Страница завершённого турнира: эмоциональная landing page (hero с закатом, подиум, stats strip, share VK/Telegram, OG-метаданные) ✅ (2026-04-06, `web/components/calendar/FinishedTournamentPage.tsx`, `web/app/calendar/[id]/page.tsx`, `web/app/globals.css`, `STATUS.md`; задеплоено на prod 157.22.173.248, проверено 200)
- [x] Admin filter presets prod grant: добавлен доступ роли PostgREST `authenticated` к `admin_filter_presets`, чтобы `/api/admin/filter-presets` не падал 500 у авторизованного админа ✅ (2026-04-06, `migrations/029_admin_filter_presets_authenticated_grant.sql`, `STATUS.md`)
- [x] Admin players prod hotfix: grant/reload для `admin_filter_presets`/`players` в PostgREST и безопасный поиск по UUID (`id::text` в PG, без `id.ilike` в PostgREST) ✅ (2026-04-06, `migrations/028_admin_players_postgrest_grants.sql`, `web/lib/admin-postgrest.ts`, `web/lib/admin-queries-pg.ts`, `STATUS.md`)
- [x] Thai Next bootstrap: совместимость старых structural signatures без `rules=...`, чтобы уже инициализированные турниры не блокировались ложным `roster/settings drifted after initialization` после обновления кода ✅ (2026-04-06, `web/lib/thai-judge-config.ts`, `web/lib/sudyam-bootstrap.ts`, `web/lib/thai-live/service.ts`, `tests/unit/thai-judge-config.test.js`, `STATUS.md`)
- [x] Admin players refresh: расширенные поля игрока, DB-пресеты фильтров, bulk actions/export, новая `/admin/players` с фильтрами/пагинацией/модалкой, обновлённые AdminShell и dashboard ✅ (2026-04-06, `migrations/026_admin_players_profile_fields.sql`, `migrations/027_admin_filter_presets.sql`, `web/app/admin/players/page.tsx`, `web/app/api/admin/filter-presets/route.ts`, `web/app/api/admin/players/bulk/route.ts`, `web/app/api/admin/players/export/route.ts`, `web/lib/admin-queries-pg.ts`, `web/lib/admin-postgrest.ts`, `web/lib/admin-validators.ts`, `web/lib/admin-reports.ts`, `web/components/admin/AdminShell.tsx`, `web/app/admin/page.tsx`, `tests/unit/admin-players-source-contract.test.js`, `STATUS.md`)
- [x] Thai → рейтинг: синхронизация итогов последнего завершённого раунда в `tournament_results` (`POST /api/admin/tournaments/[id]/sync-thai-results`) + блок «Записать итоги в рейтинг / архив» на `/admin/tournaments/[id]/thai-live` ✅ (2026-04-05, `web/lib/thai-live/sync-tournament-results.ts`, `web/app/api/admin/tournaments/[id]/sync-thai-results/route.ts`, `web/components/thai-live/ThaiTournamentControlClient.tsx`, `STATUS.md`)
- [x] Thai зрительское табло `/live/thai/[id]`: снимок `settings.thaiSpectatorBoardSnapshot` при «Завершить R1/R2», при переводе турнира в `finished` (overrides + PUT турнира); при отсутствии живых Thai-раундов показывается архив + бейдж «Архив» ✅ (2026-04-06, `web/lib/thai-spectator.ts`, `web/lib/thai-live/service.ts`, `web/app/api/admin/overrides/route.ts`, `web/app/api/admin/tournaments/route.ts`, `web/lib/admin-queries-pg.ts`, `web/lib/admin-postgrest.ts`, `ThaiSpectatorBoard.tsx`, `STATUS.md`)
- [x] Табло Thai в архиве и профиле: `ArchiveTournament.thaiSpectatorBoardUrl` / `thaiSpectatorBoardHasSnapshot` (`web/lib/thai-archive-meta.ts`, `getArchiveTournaments`), ссылка на `/archive`, в истории турниров игрока (`fetchPlayerMatches` + `EpicProfile`) ✅ (2026-04-06, `web/app/archive/page.tsx`, `web/lib/queries.ts`, `web/lib/types.ts`, `STATUS.md`)
- [x] Thai: явное завершение турнира в календаре — кнопка «Завершить турнир в календаре» на `/admin/tournaments/[id]/thai-live` (`POST /api/admin/overrides` `tournament_status`/`finished`); подсказка в `ThaiOperatorPanel`, что R1/R2 ≠ статус в БД ✅ (2026-04-06, `ThaiTournamentControlClient.tsx`, `ThaiOperatorPanel.tsx`, `STATUS.md`)
- [x] Thai live: редирект `/court/tournament/[id]/thai-live` → `/admin/tournaments/[id]/thai-live` через `next.config.ts` `redirects` (без отдельной страницы, чтобы не было 404 без свежей сборки); `middleware` matcher `/court/:path*`; показ блока синхронизации рейтинга также при `rounds[].roundStatus === 'finished'` ✅ (2026-04-06, `web/next.config.ts`, `web/middleware.ts`, `ThaiTournamentControlClient.tsx`, `STATUS.md`)
- [x] Публичный архив и карточка турнира: колонка «В рейтинг» + пул (профи/½); единая логика `effectiveRatingPtsFromStored` для строк без backfill в БД ✅ (2026-04-04, `web/lib/rating-points.ts`, `web/lib/queries.ts`, `web/lib/admin-queries-pg.ts`, `web/lib/admin-postgrest.ts`, `web/app/archive/page.tsx`, `web/app/calendar/[id]/page.tsx`, `web/app/admin/archive/page.tsx`, `tests/unit/rating-points.test.js`, `package.json` `verify:release`, `STATUS.md`)
- [x] Рейтинг за место: профи — полные очки из `POINTS_TABLE`, новичок — `round(очки/2)`; поле `tournament_results.rating_pool`, архив `/admin/archive`, лидерборд и профиль считают по формуле ✅ (2026-04-04, `web/lib/rating-points.ts`, `web/lib/queries.ts`, `web/lib/admin-queries-pg.ts`, `web/lib/admin-postgrest.ts`, `migrations/024_tournament_results_rating_pool.sql`, `migrations/025_publish_tournament_results_rating_pool.sql`, `tests/unit/rating-points.test.js`, `STATUS.md`)
- [x] Thai Next: оператор может исправить счёт **уже подтверждённого** тура после турнира (`adminCorrectThaiTourScores` + аудит + UI «Исправить счёт тура» на `/admin/tournaments/[id]/thai-live`); для `tournaments.status=finished` по-прежнему блокируется вход судьи, но в bootstrap снова подгружаются `thaiOperatorState` / `thaiJudgeState`, чтобы видеть корты и туры ✅ (2026-04-04, `web/lib/thai-live/service.ts`, `web/app/api/admin/tournaments/[id]/thai-correct-tour/route.ts`, `web/components/thai-live/ThaiConfirmedTourScoreEditor.tsx`, `web/components/thai-live/ThaiOperatorPanel.tsx`, `web/lib/sudyam-bootstrap.ts`, `STATUS.md`)
- [x] PIN судей отдельно от админа (JUDGE_PIN / SUDYAM_PIN, dev fallback 2525); убран legacy-sudyam из admin credentials; /court и /court/tournament/* только после входа судьи; табло /live/thai без шапки сайта; компактнее fun-stats и игроки на корте в 2 колонки (MN: Монстры/Лютые) ✅ (2026-04-04, `web/lib/judge-pin.ts`, `web/lib/thai-spectator-court-split.ts`, `tests/unit/thai-spectator-court-split.test.ts`, `web/lib/auth.ts`, `web/middleware.ts`, `web/lib/admin-auth.ts`, `web/app/api/sudyam-auth/route.ts`, `web/lib/kotc-live/auth.ts`, `web/components/layout/SiteChrome.tsx`, `web/app/layout.tsx`, `ThaiSpectatorBoard.tsx`, `ThaiSpectatorFunStats.tsx`, `web/.env.local.example`, `docs/DEVELOPMENT.md`, `STATUS.md`)
- [x] Thai Next: печать расписания R1/R2 для админа (постер на корт) + условные пары П+Н / М+Ж / №1–8, легенда формирования R2 ✅ (2026-04-04, `web/lib/thai-live/print-schedule.ts`, `web/lib/thai-live/service.ts` `getThaiSchedulePrintPayload`, `web/app/api/admin/tournaments/[id]/schedule-print/route.ts`, `web/app/admin/tournaments/[id]/schedule-print/page.tsx`, `web/components/thai-live/ThaiSchedulePrintClient.tsx`, `web/components/thai-live/ThaiTournamentControlClient.tsx`, `tests/unit/thai-print-schedule.test.ts`, `STATUS.md`)
- [x] Thai Next: разные лимиты очков R1/R2 (`thaiPointLimitR1` / `thaiPointLimitR2` в `tournaments.settings`, fallback `thaiPointLimit`) ✅ (2026-04-04, `web/lib/thai-live/core.ts`, `web/lib/thai-live/service.ts`, `web/lib/thai-live/types.ts`, `web/app/admin/tournaments/page.tsx`, `ThaiOperatorPanel.tsx`, `ThaiSpectatorBoard.tsx`, `tests/unit/thai-live-core.test.js`, `STATUS.md`)
- [x] Thai Next: финальная «fun» статистика по подтверждённым матчам на табло зрителей + в `GET /api/public/thai-board` после `r1_finished`/`r2_finished` ✅ (2026-04-04, `web/lib/thai-live/tournament-fun-stats.ts`, `web/lib/thai-spectator.ts`, `web/components/thai-live/ThaiSpectatorFunStats.tsx`, `web/components/thai-live/ThaiSpectatorBoard.tsx`, `tests/unit/thai-tournament-fun-stats.test.ts`, `vitest.config.ts`, `tests/unit/thai-admin-live-source-contract.test.js`, `STATUS.md`)
- [x] Thai Next: публичное табло для зрителей (`/live/thai/[id]`) + JSON API без PIN/судейских ссылок ✅ (2026-04-04, `web/lib/thai-spectator.ts`, `web/app/live/thai/[tournamentId]/page.tsx`, `web/app/live/thai/layout.tsx`, `web/app/live/thai/[tournamentId]/not-found.tsx`, `web/app/api/public/thai-board/[tournamentId]/route.ts`, `web/components/thai-live/ThaiSpectatorBoard.tsx`, `web/components/thai-live/ThaiOperatorPanel.tsx`, `web/components/thai-live/ThaiTournamentControlClient.tsx`, `tests/unit/thai-admin-live-source-contract.test.js`, `STATUS.md`)
- [x] Prod deploy: Thai manual R1 copy/start hotfix ✅ (2026-04-04, `web/app/admin/tournaments/page.tsx`, `web/components/thai-live/ThaiOperatorPanel.tsx`, `web/lib/admin-legacy-sync.ts`, `web/lib/queries.ts`, `web/scripts/postbuild-standalone-static.mjs`, `web/next.config.ts`, `STATUS.md`; deployed updated Thai manual-start copy + operator banner to `lpvolley.ru` via uploaded local Next build artifacts after server-side build path hit stale checkout/resource issues, restarted `kotc-web.service`, verified `http://127.0.0.1:3101/` -> `200`, `https://lpvolley.ru/calendar` -> `200`, `https://lpvolley.ru/kotc/assets/app.css` -> `text/css`)
- [x] Thai admin: remaining manual/random copy clarified in page shell ✅ (2026-04-04, `web/app/admin/tournaments/page.tsx`, `STATUS.md`; added a late `subtitle` override plus explicit manual-mode note in the setup shell so the admin page no longer implies draw is required before manual R1 start)
- [x] Thai operator panel: manual bootstrap text no longer mentions draw ✅ (2026-04-04, `web/components/thai-live/ThaiOperatorPanel.tsx`, `STATUS.md`; bootstrap banner now tells operators that manual R1 setup is ready to start directly from filled court slots instead of implying draw preview is required)
- [x] Thai admin: ручной R1 старт без обязательной жеребьёвки ✅ (2026-04-04, `web/components/thai-live/ThaiOperatorPanel.tsx`, `tests/unit/thai-judge-source-contract.test.js`, `STATUS.md`; `thaiRosterMode=manual` now bootstraps R1 directly from manually filled court slots, while draw preview remains required only for random seeding mode)
- [x] Calendar/header UTF-8 hardening for public Next layout ✅ (2026-04-04, `web/app/layout.tsx`, `web/app/calendar/page.tsx`, `STATUS.md`; replaced remaining mojibake-prone public layout/calendar copy with `\u`-escaped Russian strings so public header/meta/calendar labels no longer depend on `.tsx` file encoding at build time)
- [x] Prod deploy: public header/calendar UTF-8 hotfix ✅ (2026-04-04, `web/components/layout/Header.tsx`, `web/components/layout/MobileNav.tsx`, `web/components/layout/Footer.tsx`, `web/app/layout.tsx`, `web/app/calendar/page.tsx`, `STATUS.md`; uploaded fixed Next sources to `lpvolley.ru`, rebuilt `/var/www/ipt/web`, restarted `kotc-web.service`, and verified `https://lpvolley.ru/calendar` returns 200 with correct `Главная`, `Судьям`, `КАЛЕНДАРЬ` in HTML)
- [x] Thai admin: ручной состав R1 по кортам + опциональный random seed ✅ (2026-04-04, `web/app/admin/tournaments/page.tsx`, `web/lib/admin-legacy-sync.ts`, `web/lib/thai-live/service.ts`, `web/lib/queries.ts`, `tests/unit/admin-legacy-sync.test.js`, `tests/unit/thai-judge-source-contract.test.js`, `STATUS.md`; added `thaiRosterMode` with `manual/random`, exposed the switch in admin tournament settings, made R1 bootstrap honor manual per-court roster order instead of always shuffling by seed, and fixed missing `PLAYER_DB_EXTERNAL_ID` constant in `web/lib/queries.ts` so `web` build stays green)
- [x] Фото: главная `LandingDesktop` показывала только градиенты — подключены `photo_url` игроков/турниров; внешние URL через `<img>` + VK `userapi` как постер; CSP `img-src` допускает `http:`; рейтинг — мини-аватар ✅ (2026-04-03, `web/components/landing/LandingDesktop.tsx`, `web/components/ui/PlayerPhoto.tsx`, `web/lib/tournament-poster.ts`, `web/components/calendar/TournamentCard.tsx`, `web/components/calendar/EventCard.tsx`, `web/components/players/EpicProfile.tsx`, `web/components/landing/Hero.tsx`, `web/app/rankings/RankingsClient.tsx`, `web/next.config.ts`, `STATUS.md`)
- [x] Next layout: `<meta charSet="utf-8" />` + `\u`-escape для русских подписей Header/MobileNav/Footer (инкогнито/прод без кэша) ✅ (2026-04-03, `web/app/layout.tsx`, `web/components/layout/Header.tsx`, `web/components/layout/MobileNav.tsx`, `web/components/layout/Footer.tsx`, `STATUS.md`; явный charset в `<head>`, строки в бандле не зависят от кодировки `.tsx` на сервере при сборке)
- [x] Next layout: исправлены битые UTF-8 строки в Header/MobileNav (кракозябры на iPhone) ✅ (2026-04-03, `web/components/layout/Header.tsx`, `web/components/layout/MobileNav.tsx`, `web/app/admin/tournaments/page.tsx`, `STATUS.md`; в исходниках были mojibake-символы вместо «Главная», «Судьям» и т.д.)
- [x] iPad/WebKit: Thai judge SW не перехватывает `/_next/static` + KOTC SW не перехватывает CSS ✅ (2026-04-03, `web/public/thai-judge-sw.js` v2 cache, `sw.js` v68, `web/public/kotc/sw.js` v59, `assets/js/main.js`, `web/public/kotc/index.html`+`main.js`, `web/components/thai-live/ThaiJudgeWorkspace.tsx` `updateViaCache:'none'`, `STATUS.md`; prod: scp+`npm run build`+`kotc-web` restart)
- [x] Public judge entry `/court` + header `Судьям` now opens active Thai tournaments ✅ (2026-04-03, `web/lib/queries.ts`, `web/app/court/page.tsx`, `web/components/layout/Header.tsx`, `web/components/layout/MobileNav.tsx`, `tests/unit/thai-judge-source-contract.test.js`, `STATUS.md`; added a public judge entry page that redirects straight to the tournament shell when only one Thai tournament is live, otherwise shows a compact list of active tournaments in progress, switched the site header/mobile `Судьям` CTA from operator `/sudyam` to `/court`, then hotfixed the SQL to tolerate legacy empty `time` values, cleaned up UTF-8 copy on the new page, and rebuilt/restarted prod standalone so `https://lpvolley.ru/court` returns 200)
- [x] nginx/DEPLOY: не отдавать HTML вместо CSS под `/kotc/` + healthcheck Content-Type ✅ (2026-04-03, `docs/nginx-lpvolley.example.conf`, `docs/DEPLOY.md`, `scripts/deploy-server.sh`, `scripts/deploy-server.env.example`, `STATUS.md`; эталонные `location ^~` с `try_files $uri =404` для `assets/`, `formats/`, `shared/`, `locales/`; опционально `KOTC_CSS_HEALTHCHECK_URL` + `probe_content_type_contains` в деплое)
- [x] Service worker: CSS network-first + no poison cache (Chrome/Safari) + `?v=` offline fallback ✅ (2026-04-03, `sw.js` v67, `web/public/kotc/sw.js` v58, `STATUS.md`; stylesheets always hit network first and only cache real `text/css` (reject `text/html` SPA fallbacks); `.js` entries are not cached when response is HTML; on fetch error still fall back to exact then `ignoreSearch` cache match)
- [x] Thai Judge: mobile compact mode for iPhone/iPad screens ✅ (2026-04-03, `web/components/thai-live/ThaiJudgeWorkspace.tsx`, `web/components/thai-live/ThaiTournamentJudgeWorkspace.tsx`, `tests/unit/thai-judge-source-contract.test.js`, `STATUS.md`; tightened the tournament shell and embedded judge workspace for mobile by removing duplicate meta, shortening tour/status labels, hiding secondary chips in embedded mode, compacting score controls, and trimming the standings table to the minimum columns needed during live judging; final pass made the shell UTF-8 clean, hid standings behind a closed-by-default `Табл.` accordion, removed embedded header noise, and switched tour tabs to `T1..T4`)
- [x] Thai Judge: tournament-level shell with `R1/R2` + court tap bar and `/court/[pin]` fallback ✅ (2026-04-03, `web/lib/thai-live/types.ts`, `web/lib/thai-live/service.ts`, `web/app/api/thai/judge/tournament/[tournamentId]/route.ts`, `web/app/court/tournament/[tournamentId]/page.tsx`, `web/app/court/[pin]/page.tsx`, `web/components/thai-live/ThaiTournamentJudgeWorkspace.tsx`, `web/components/thai-live/ThaiJudgeWorkspace.tsx`, `tests/unit/thai-judge-source-contract.test.js`, `STATUS.md`; added a common Thai judge shell driven by `tournamentId + selected round + selected court`, with top tabs for `R1/R2` and all court slots, while keeping the existing pin-based confirm flow and making `/court/[pin]` open the same shell with the matching court preselected)
- [x] Thai Judge: общий вход на турнир поверх PIN-ссылок ✅ (2026-04-03, `web/app/court/tournament/[tournamentId]/page.tsx`, `web/components/thai-live/ThaiOperatorPanel.tsx`, `tests/unit/thai-judge-source-contract.test.js`, `STATUS.md`; added public tournament-level Thai judge entry page that groups R1/R2 court links in one place, switched operator CTA from “open first court” to “open tournament”, and kept direct per-court PIN links as a secondary path)
- [x] Thai Next prod smoke: demo `M/N` 32-player tournament verified through `R1 -> R2` ✅ (2026-04-03, `STATUS.md`; on `lpvolley.ru` created demo tournament `THAI MN QA 32 R1R2 2026-04-03`, auto-filled roster to 32 men, bootstrapped `R1`, confirmed all 4 tours on 4 courts, finished `R1`, materialized `R2`, and verified by PostgreSQL that both rounds have 4 courts, each court has 4 tours and 8 matches; active `R2` judge pins: `KER7PVDT`, `LJWWYN2J`, `KR1BR5DV`, `DMD2MX3A`)
- [x] Thai Judge: visible `ROUND 1 / ROUND 2` nav in court workspace ✅ (2026-04-03, `web/lib/thai-live/service.ts`, `web/lib/thai-live/types.ts`, `web/components/thai-live/ThaiJudgeWorkspace.tsx`, `tests/unit/thai-judge-source-contract.test.js`, `STATUS.md`; judge snapshot now carries `roundNav`, `/court/[pin]` always shows explicit round tabs, and `ROUND 2` is visible immediately as part of the tournament model even before it becomes clickable after materialization)
- [x] Thai Next: 2-round default, dynamic R2 zones for 1-4 courts, single admin control block, compact judge standings ✅ (2026-04-03, `web/lib/thai-live/core.ts`, `web/lib/thai-live/service.ts`, `web/lib/sudyam-bootstrap.ts`, `web/lib/thai-live/types.ts`, `web/app/admin/tournaments/page.tsx`, `web/components/thai-live/ThaiJudgeWorkspace.tsx`, `web/components/thai-live/ThaiOperatorPanel.tsx`, `tests/unit/thai-live-core.test.js`, `tests/unit/thai-admin-live-source-contract.test.js`, `tests/unit/thai-judge-source-contract.test.js`, `STATUS.md`; Thai Next now treats R1+R2 as the default 2-round model with 4 tours per round, R2 seeding/materialization works for 1-4 courts with dynamic HARD/ADVANCE/MEDIUM/LIGHT subsets, admin reads materialized Thai state even without bootstrap signature, `/admin/tournaments` keeps a single Thai control block beside settings, and judge `/court/[pin]` renders a denser court/zone header plus live standings table under the match cards)
- [x] Thai judge source-contract refreshed for shared operator panel extraction ✅ (2026-04-03, `tests/unit/thai-judge-source-contract.test.js`, `STATUS.md`; source-contract expectations now follow the current Thai judge/Sudyam split where QR + bootstrap copy moved into `ThaiOperatorPanel`, full `npm run test:unit` is green again)
- [x] Thai Next: admin panel hosts the full live operator flow ✅ (2026-04-03, `web/app/admin/tournaments/page.tsx`, `web/app/api/admin/tournaments/[id]/thai-live/route.ts`, `web/app/api/admin/tournaments/[id]/thai-action/route.ts`, `web/components/thai-live/ThaiOperatorPanel.tsx`, `web/components/sudyam/SudyamFormatWorkspace.tsx`, `tests/unit/thai-admin-live-source-contract.test.js`, `STATUS.md`; Thai Next live-control now works directly inside `/admin/tournaments`: the table opens the selected tournament instead of routing Thai users to bare `/sudyam`, admin reads Thai live state via `/thai-live`, write actions go through `/thai-action`, and both admin + Sudyam reuse the same `ThaiOperatorPanel` UI)
- [x] Thai Next: fix M/N R2 seeding to use global Pro/Novice rankings ✅ (2026-04-03, `web/lib/thai-live/core.ts`, `web/components/sudyam/SudyamFormatWorkspace.tsx`, `tests/unit/thai-live-core.test.js`, `STATUS.md`; Thai `MN` R2 draft/confirm now seeds HARD/ADVANCE/MEDIUM/LIGHT from global R1 rankings for `primary` and `secondary` pools instead of taking same-place players per court)
- [x] Thai Next: R1 draw preview + explicit round controls + manual R2 seed editor ✅ (2026-04-03, `web/lib/thai-live/types.ts`, `web/lib/thai-live/service.ts`, `web/app/api/sudyam/bootstrap/route.ts`, `web/app/api/sudyam/thai/route.ts`, `web/app/api/admin/tournaments/[id]/preview-draw/route.ts`, `web/app/api/admin/tournaments/[id]/confirm-r2-seed/route.ts`, `web/app/api/admin/tournaments/[id]/apply-r2-seed/route.ts`, `web/components/thai-live/ThaiDrawPreview.tsx`, `web/components/thai-live/ThaiR2SeedEditor.tsx`, `web/components/sudyam/SudyamFormatWorkspace.tsx`, `STATUS.md`; Thai Sudyam now uses explicit R1 preview/confirm instead of auto-bootstrap, operator actions include finish R1/R2, R2 can be reviewed and edited before commit, and Thai draw reshuffle is now seed-driven instead of rebuilding the same assignment)
- [x] Thai Next: убрать ожидание остальных кортов в judge flow ✅ (2026-04-03, `web/lib/thai-live/service.ts`, `web/lib/thai-live/types.ts`, `web/components/thai-live/ThaiJudgeWorkspace.tsx`, `tests/unit/thai-judge-draft.test.js`, `tests/unit/thai-judge-source-contract.test.js`, `STATUS.md`; Thai judge теперь ведёт прогресс по каждому корту отдельно, `waiting` удалён из snapshot/nav/UI, после confirm корт сразу открывает следующий локальный тур или помечается завершённым без блокировки по другим кортам)
- [x] Thai Next: absolute QR + R1/R2 explanatory copy + roster gender filter + judge score hardening ✅ (2026-04-03, `web/components/sudyam/SudyamFormatWorkspace.tsx`, `web/components/thai-live/ThaiJudgeWorkspace.tsx`, `web/app/admin/tournaments/page.tsx`, `web/lib/thai-ui-helpers.ts`, `web/public/kotc/index.html`, `.deploy/web-stage/public/kotc/index.html`, `tests/unit/thai-judge-source-contract.test.js`, `tests/unit/thai-ui-helpers.test.ts`, `STATUS.md`; Thai Sudyam QR now encodes absolute `/court/[pin]` URLs, workspace copy explains R1→R2 zoning, admin roster list got `Все/M/W` gender filter, judge score UI now clamps to point limit and supports manual numeric entry via double tap; legacy KOTC CSP in source and staged deploy artifact no longer includes `unsafe-inline`, `npm run test:unit` green)
- [x] Prod migration verification for SQL up to `023` ✅ (2026-04-03, `STATUS.md`; prod DB/schema verification on `lpvolley.ru`, schema backup `/var/www/ipt/.deploy-backup/20260403-034347-db-schema-check`, confirmed `021/022/023` already applied by schema/grants, no extra SQL executed)
- [x] Thai rebuild: final-score engine + Sudyam operator workspace + judge tabs ✅ (2026-04-03, `web/lib/thai-live/core.ts`, `web/lib/thai-live/types.ts`, `web/lib/thai-live/service.ts`, `web/lib/sudyam-bootstrap.ts`, `web/app/api/sudyam/thai/route.ts`, `web/components/sudyam/SudyamFormatWorkspace.tsx`, `web/components/thai-live/ThaiJudgeWorkspace.tsx`, `web/app/admin/tournaments/page.tsx`, `web/lib/admin-legacy-sync.ts`, `tests/unit/thai-live-core.test.js`, `tests/unit/thai-judge-source-contract.test.js`, `tests/unit/sudyam-source-contract.test.js`, `tests/unit/thai-next-hardening-source-contract.test.js`, `tests/unit/admin-validators.test.js`, `tests/unit/admin-legacy-sync.test.js`, `STATUS.md`)
- [x] Thai judge mobile cleanup + KOTC-style court bar ✅ (2026-04-03, `web/lib/thai-live/types.ts`, `web/lib/thai-live/service.ts`, `web/components/thai-live/ThaiJudgeWorkspace.tsx`, `tests/unit/thai-judge-source-contract.test.js`, `STATUS.md`)
- [x] Thai Sudyam/judge compact visual refresh + prod bootstrap/grant hotfix ✅ (2026-04-02, `web/components/sudyam/SudyamFormatWorkspace.tsx`, `web/components/thai-live/ThaiJudgeWorkspace.tsx`, `migrations/023_thai_judge_grants.sql`, `STATUS.md`; prod: isolated Linux temp build, runtime backups `/var/www/ipt/.deploy-backup/20260402-2335-thai-ui`, `/var/www/ipt/.deploy-backup/20260402-2355-thai-ui-qr-fix`, manual `GRANT` for Thai judge tables to `lpbvolley`)
- [x] KOTC live serve state + waiting block ✅ (2026-04-02, `migrations/022_kotc_live_serve_state.sql`, `web/lib/kotc-live/types.ts`, `web/lib/kotc-live/service.ts`, `web/components/kotc-live/types.ts`, `web/components/kotc-live/api.ts`, `web/components/kotc-live/use-kotc-live-store.ts`, `web/components/kotc-live/judge/KotcLiveJudgeFlow.tsx`, `web/components/kotc-live/judge/JudgeScreen.tsx`, `web/components/kotc-live/judge/ViewerMode.tsx`, `tests/unit/kotc-judge-utils.test.js`, `tests/unit/kotc-live-api.test.js`, `tests/unit/kotc-live-source-contract.test.js`, `STATUS.md`)
- [x] Server deploy script for lpvolley.ru ✅ (2026-04-02, `scripts/deploy-server.sh`, `scripts/deploy-server.env.example`, `.gitignore`, `docs/DEPLOY.md`, `STATUS.md`)
- [x] Thai admin single selector for division/variant + `M/N` save compatibility ✅ (2026-04-02, `web/app/admin/tournaments/page.tsx`, `web/lib/admin-legacy-sync.ts`, `tests/unit/admin-legacy-sync.test.js`, `tests/unit/admin-validators.test.js`, `STATUS.md`)
- [x] Next standalone asset deploy hardening + prod static hotfix ✅ (2026-04-02, `web/scripts/postbuild-standalone-static.mjs`, `tests/unit/next-standalone-postbuild.test.js`, `STATUS.md`; prod: `/etc/nginx/sites-enabled/lpvolley`, `/etc/nginx/sites-available/lpvolley`)
- [x] Admin `/admin/*` no-store cache hardening for Next asset hashes ✅ (2026-04-02, `web/middleware.ts`, `STATUS.md`)
- [x] Thai Sudyam bootstrap/url hardening ✅ (2026-04-02, `web/lib/sudyam-bootstrap.ts`, `web/lib/build-thai-judge-url.ts`, `web/app/sudyam/page.tsx`, `web/components/sudyam/SudyamFormatWorkspace.tsx`, `formats/thai/thai-boot.js`, `tests/unit/build-thai-judge-url.test.js`)
- [x] Calendar filters + auto status/waitlist hardening ✅ (2026-04-02, `web/app/calendar/page.tsx`, `web/components/calendar/CalendarFilters.tsx`, `web/components/calendar/CalendarGrid.tsx`, `web/components/calendar/EventCard.tsx`, `web/lib/calendar.ts`, `web/lib/tournament-status.ts`, `web/lib/queries.ts`, `web/app/api/tournament-register/route.ts`, `web/lib/admin-queries-pg.ts`, `web/lib/admin-queries.ts`, `web/app/api/admin/requests/route.ts`, `tests/unit/calendar-utils.test.js`)
- [x] Calendar live signals + ICS/export + player notifications ✅ (2026-04-02, `web/app/calendar/[id]/page.tsx`, `web/components/calendar/EventCard.tsx`, `web/app/api/calendar/[id]/ics/route.ts`, `web/app/api/tournament-register/route.ts`, `web/app/api/admin/requests/route.ts`, `web/app/api/admin/roster/route.ts`, `web/lib/queries.ts`, `web/lib/types.ts`, `web/lib/tournament-links.ts`, `web/lib/tournament-notifications.ts`, `web/lib/email.ts`, `tests/unit/tournament-links.test.js`)
- [x] CSP inline-event bridge for KOTC/legacy roster UI ✅ (2026-04-02, `assets/js/main.js`, `web/public/kotc/assets/js/main.js`, `index.html`, `web/public/kotc/index.html`, `tests/unit/kotc-legacy-inline-bridge.test.js`)
- [x] Admin tournaments validation hardening ✅ (2026-04-02, `web/lib/admin-validators.ts`, `web/lib/admin-errors.ts`, `web/app/admin/tournaments/page.tsx`, `tests/unit/admin-validators.test.js`, `tests/unit/admin-errors.test.js`)
- [x] Calendar filters collapse toggle ✅ (2026-04-02, `web/components/calendar/CalendarFilters.tsx`)
- [x] Thai Judge v2 Next.js flow + PWA shell ✅ (2026-04-02, `migrations/021_thai_judge_v2.sql`, `web/lib/thai-live/*`, `web/app/api/thai/judge/[pin]/tour/[tourNumber]/confirm/route.ts`, `web/app/court/[pin]/page.tsx`, `web/app/court/[pin]/manifest.ts`, `web/components/thai-live/ThaiJudgeWorkspace.tsx`, `web/public/thai-judge-sw.js`, `web/lib/sudyam-bootstrap.ts`, `web/components/sudyam/SudyamFormatWorkspace.tsx`, `tests/unit/thai-live-core.test.js`, `tests/unit/thai-judge-draft.test.js`, `tests/unit/thai-judge-source-contract.test.js`)
- [x] Thai Next judge rollout via admin + Sudyam engine checks ✅ (2026-04-02, `web/lib/thai-judge-config.ts`, `web/app/admin/tournaments/page.tsx`, `web/app/api/admin/tournaments/route.ts`, `web/lib/admin-queries.ts`, `web/lib/admin-queries-pg.ts`, `web/lib/admin-postgrest.ts`, `web/lib/sudyam-bootstrap.ts`, `web/app/sudyam/page.tsx`, `web/components/sudyam/SudyamFormatWorkspace.tsx`, `tests/unit/thai-judge-config.test.js`, `tests/unit/thai-judge-source-contract.test.js`)
- [x] Thai Next Hardening: bootstrap lock + strict structural lock + reset escape hatch ✅ (2026-04-02, `web/lib/thai-judge-config.ts`, `web/lib/thai-live/service.ts`, `web/app/api/admin/tournaments/route.ts`, `web/app/api/admin/tournaments/[id]/reset-thai-next/route.ts`, `web/components/sudyam/SudyamFormatWorkspace.tsx`, `tests/unit/thai-judge-config.test.js`, `tests/unit/thai-judge-source-contract.test.js`, `tests/unit/thai-next-hardening-source-contract.test.js`)
- [x] Thai Next reset permission hardening + prod deploy ✅ (2026-04-02, `web/app/api/admin/tournaments/[id]/reset-thai-next/route.ts`, `STATUS.md`; deploy: `lpvolley.ru`, backup `/var/www/ipt/.deploy-backup/20260402-160456-thai-reset-admin`)

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

### Фаза 7 остатки (2026-03-24)
- [x] **S6.4-extra** — CSP meta в kotc.html и thai.html ✅ (уже было сделано ранее)
- [x] **S6.7** — CSP unit-тест ✅ (уже было — `tests/unit/csp-check.test.js`)
- [x] **S7.3** — QR-коды для судейских ссылок ✅ (2026-03-24, `shared/qr-gen.js`, `admin-init.js`, `admin.html`)
- [x] **S7.7** — Админ live-обзор кортов ✅ (2026-03-24, `admin-init.js`, `admin.html`)
- [x] **S7.8** — Reconnect snapshot ✅ (2026-03-24, `assets/js/integrations.js`)
- [x] **S7.9** — E2E тест мультисудейства ✅ (2026-03-24, `tests/e2e/multi-judge.spec.ts` — 4 теста, все прошли)

### Фаза 8 — Единая БД рейтингов (2026-03-24)
- [x] **S8.1+S8.2** — SQL миграции tournament_results + rating_history ✅ (уже было — `migrations/008_tournament_results.sql`)
- [x] **S8.3** — RPC finalize_tournament ✅ (уже было — `migrations/009_finalize.sql`)
- [x] **S8.4+S8.5** — Player sync ✅ (уже было — `shared/api.js` `syncPlayersWithServer()`)
- [x] **S8.6** — Финализация из хаба ✅ (уже было — `assets/js/ui/tournament-details.js`)
- [x] **S8.7** — KOTC финализация ✅ (уже было — `formats/kotc/kotc.js`)
- [x] **S8.8** — Thai финализация ✅ (уже было — `formats/thai/thai-boot.js`)
- [x] **S8.9** — Админ вкладка «Рейтинг» ✅ (уже было — `admin-init.js`, `admin.html`)
- [x] **S8.10** — rating.html история из сервера ✅ (2026-03-24, `rating.html` — static JSON → localStorage cache)
- [x] **S8.11** — Тесты finalize/sync ✅ (уже было — `tests/unit/finalize.test.js` 13 тестов)

### Фаза 6 задачи (2 ИИ)
- [x] **S6.1 (ARCH / ИИ-1)** — Исправить редиректы `/sudyam` без утечки localhost ✅ (2026-03-23, `web/middleware.ts`, `web/app/sudyam/page.tsx`)
- [x] **S6.2 (ARCH / ИИ-1)** — Обработка несуществующего `tournamentId` без 500 ✅ (2026-03-23, `web/app/api/tournament-register/route.ts`)
- [x] **S6.3 (ARCH / ИИ-1)** — Базовые security headers + `robots/sitemap` ✅ (2026-03-23, `web/next.config.ts`, `web/app/robots.ts`, `web/app/sitemap.ts`)
- [x] **S6.4 (FORMAT / ИИ-2)** — Закрытые турниры: registration page не принимает заявки ✅ (2026-03-23, `web/app/calendar/[id]/register/page.tsx`)
- [x] **S6.5 (ARCH / ИИ-1)** — Усилить `/api/sudyam-auth`: rate limit + защита от brute-force ✅ (2026-03-23, `web/app/api/sudyam-auth/route.ts`)
- [x] **S6.6 (FORMAT / ИИ-2)** — Ссылки профилей из рейтинга + guard для `/api/archive` в smoke ✅ (2026-03-23, `web/components/rankings/PlayerRow.tsx`, `assets/js/screens/home.js`)

### Предыдущие этапы
- ФАЗА 4 ЗАВЕРШЕНА ✅ (A4.1 ✅, Q4.1 ✅, A4.3 ✅, F4.1 ✅, A4.2 ✅, Q4.2 ✅, Q4.3 ✅)

---

## Актуальная документация

- **[`README.md`](README.md)** — обзор репозитория
- **[`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)** — локальная разработка и тесты
- **[`docs/DEPLOY.md`](docs/DEPLOY.md)** — чеклист деплоя
- **[`docs/AGENTS.md`](docs/AGENTS.md)** — краткая инструкция для ИИ-агентов
- **[`docs/ARCHITECTURE_PHASES_6_8.md`](docs/ARCHITECTURE_PHASES_6_8.md)** — архивный справочник (мультисудейство, БД рейтингов)
- **[`docs/LPVOLLEY_SITE_STRUCTURE.md`](docs/LPVOLLEY_SITE_STRUCTURE.md)** — структура сайта lpvolley.ru (контуры, роуты, API, auth)
- **[`docs/archive/CURSOR_TASK_2026-03.md`](docs/archive/CURSOR_TASK_2026-03.md)** — исторический backlog Cursor (март 2026)

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
| 2026-04-04 | FORMAT | Thai Next: отдельные лимиты очков R1 и R2 | `web/lib/thai-live/core.ts`, `service.ts`, `types.ts`, `web/app/admin/tournaments/page.tsx`, `ThaiOperatorPanel.tsx`, `ThaiSpectatorBoard.tsx`, `thai-live-core.test.js`, `STATUS.md` | В JSON турнира: `thaiPointLimitR1`, `thaiPointLimitR2` и устаревший `thaiPointLimit` (=R1). Судья и confirm используют лимит по `round_type`; Thai Next в админке — два степпера, legacy Thai — один на все. |
| 2026-04-04 | FORMAT | Thai Next: финальная fun-статистика на табло зрителей | `web/lib/thai-live/tournament-fun-stats.ts`, `web/lib/thai-spectator.ts`, `ThaiSpectatorFunStats.tsx`, `ThaiSpectatorBoard.tsx`, `thai-tournament-fun-stats.test.ts`, `vitest.config.ts`, `thai-admin-live-source-contract.test.js`, `STATUS.md` | После `r1_finished`/`r2_finished` payload зрителей и публичный JSON дополняются `funStats`: лидеры по победам (пулы MF/MN), напарники, победы 1–2 очка, +/-, минимум пропущенных, разгромные матчи, «идеальный мэтч» для пар с одной совместной игрой. `computeThaiFunStats` покрыт unit-тестами; `vitest` подключает `*.test.ts` и alias `@`→`web`. |
| 2026-04-04 | FORMAT | Thai Next: публичное табло зрителей | `web/lib/thai-spectator.ts`, `web/app/live/thai/*`, `web/app/api/public/thai-board/[tournamentId]/route.ts`, `ThaiSpectatorBoard.tsx`, `ThaiOperatorPanel.tsx`, `ThaiTournamentControlClient.tsx`, `thai-admin-live-source-contract.test.js`, `STATUS.md` | Страница `/live/thai/[tournamentId]` и `GET /api/public/thai-board/[tournamentId]` отдают тот же срез, что операторский контроль (раунды, корты, туры, таблицы, итоги), но без `pin`/`judgeUrl` и без кнопок действий; ссылка в панели оператора и на странице Thai Tournament Control. Доступно только для Thai + модуль Next и после bootstrap R1 (`getThaiOperatorStateSummary` не null). Проверки: `vitest thai-admin-live-source-contract`, `cd web && npm run build` ✅ |
| 2026-04-04 | ARCH | Архив + завершённый турнир: рейтинговые очки в UI | `web/lib/rating-points.ts` `effectiveRatingPtsFromStored`, `web/lib/queries.ts`, `admin-queries-pg.ts`, `admin-postgrest.ts`, `web/app/archive/page.tsx`, `web/app/calendar/[id]/page.tsx`, `web/app/admin/archive/page.tsx`, `tests/unit/rating-points.test.js`, `package.json` | Публичный `/archive`: колонки игровые очки, «В рейтинг», пул ★/½; `/calendar/[id]` заголовок колонки «В рейтинг». Если `rating_pts` в БД 0/null — показ по таблице мест и `rating_pool`. Добавлен `npm run verify:release` (unit + `web` build). **Прод-деплой из Cursor недоступен** (нет SSH/Render workspace); выкладка на VPS по `docs/DEPLOY.md` + миграции `024`/`025` при необходимости. |
| 2026-04-03 | ARCH | Thai judge SW v2: только shell/manifest; KOTC SW без перехвата CSS | `web/public/thai-judge-sw.js`, `sw.js`, `web/public/kotc/sw.js`, `assets/js/main.js`, `web/public/kotc/*`, `ThaiJudgeWorkspace.tsx`, prod deploy | `staleWhileRevalidate` для `/_next/static` ломал стили на WebKit; кэш `thai-judge-v1-*` сбрасывается при активации v2 |
| 2026-04-03 | ARCH | Prod nginx: убран дубль server_name (бэкап вне sites-enabled) | `/var/www/ipt/.deploy-backup/nginx/lpvolley.bak.20260403-pre-kotc-static`, `docs/DEPLOY.md`, `STATUS.md` | Файл бэкапа лежал в `sites-enabled/` и подключался вторым виртуальным хостом для `lpvolley.ru` → warning *conflicting server name*. Перенесён в `.deploy-backup/nginx/`; `nginx -t` без предупреждений. |
| 2026-04-03 | ARCH | Prod nginx: /kotc static без SPA-fallback | `/etc/nginx/sites-enabled/lpvolley` (backup `lpvolley.bak.20260403-pre-kotc-static`), `.deploy/lpvolley.nginx.sites-enabled`, `docs/nginx-lpvolley.example.conf`, `STATUS.md` | Добавлены `location ^~` для `/kotc/assets|formats|shared|locales/` с `alias` на дерево `/var/www/ipt/` (overlay как у текущего `location /kotc/`); отсутствующий `.css` → **404**, не `200`+`index.html`. Проверки: `curl -sI /kotc/assets/app.css` → `text/css` + `nosniff`; `curl -sI …/missing.css` → `404`. `nginx -t` + `reload` ✅ |
| 2026-04-03 | FORMAT | Thai admin live operator panel | `web/app/admin/tournaments/page.tsx`, `web/app/api/admin/tournaments/[id]/thai-live/route.ts`, `web/app/api/admin/tournaments/[id]/thai-action/route.ts`, `web/components/thai-live/ThaiOperatorPanel.tsx`, `web/components/sudyam/SudyamFormatWorkspace.tsx`, `tests/unit/thai-admin-live-source-contract.test.js`, `STATUS.md` | Thai Next live-flow moved into `/admin/tournaments`: the tournament list now opens Thai entries inline in the editor, admin reads live state via `/api/admin/tournaments/[id]/thai-live`, writes actions via `/api/admin/tournaments/[id]/thai-action`, and both admin + `/sudyam` reuse the same `ThaiOperatorPanel` so R1 preview, R1 finish, R2 seed preview/edit/confirm and court links share one UI contract. |
| 2026-04-03 | FORMAT | Thai judge mobile cleanup + KOTC-style court bar | `web/lib/thai-live/types.ts`, `web/lib/thai-live/service.ts`, `web/components/thai-live/ThaiJudgeWorkspace.tsx`, `tests/unit/thai-judge-source-contract.test.js`, `STATUS.md` | Added `courtNav` to Thai judge snapshots and confirm-refresh flow, removed the mobile `Баланс тура / Матчи` card, added a KOTC-style court pill bar above the header, and enlarged only the `+` score button on mobile. Checks: `npx vitest run tests/unit/thai-judge-source-contract.test.js tests/unit/thai-next-hardening-source-contract.test.js tests/unit/thai-judge-draft.test.js` ✅, `cd web && npm run build` ✅. |
| 2026-04-02 | ARCH+FORMAT+QA | KOTC live serve state + waiting block | `migrations/022_kotc_live_serve_state.sql`, `web/lib/kotc-live/types.ts`, `web/lib/kotc-live/service.ts`, `web/components/kotc-live/types.ts`, `web/components/kotc-live/api.ts`, `web/components/kotc-live/use-kotc-live-store.ts`, `web/components/kotc-live/judge/KotcLiveJudgeFlow.tsx`, `web/components/kotc-live/judge/JudgeScreen.tsx`, `web/components/kotc-live/judge/ViewerMode.tsx`, `tests/unit/kotc-judge-utils.test.js`, `tests/unit/kotc-live-api.test.js`, `tests/unit/kotc-live-source-contract.test.js`, `STATUS.md` | В live KOTC добавлено серверное состояние подающего на уровне court/slot: миграция сохраняет `active_slot_idx` и `server_slots_json`, snapshot/delta и клиентская нормализация теперь отдают `activeServerPlayerIdx`, `waitingServerPlayerIdx` и `serverPlayerIdxBySlot`. Добавлены команды `court.server_select` и `court.server_swap` с `expectedCourtVersion`; judge UI подсвечивает активного подающего, разрешает quick swap только по именам игроков и показывает inline-блок `Следующие` для следующего slot на корте. Проверки: `npx vitest run tests/unit/kotc-judge-utils.test.js tests/unit/kotc-live-api.test.js tests/unit/kotc-live-source-contract.test.js` ✅, `cd web && npm run build` ✅. |
| 2026-04-02 | ARCH | Server deploy script for lpvolley.ru | `scripts/deploy-server.sh`, `scripts/deploy-server.env.example`, `.gitignore`, `docs/DEPLOY.md`, `STATUS.md` | Добавлен server-side `bash`-сценарий деплоя: `git pull`, `npm ci`/build для корня и `web/`, sync `web/.next/static` + `web/public` в standalone, выкладка `dist/` в static-root, backup, `systemctl restart` и HTTP probes. Поддержаны режимы `mirror` (отдельный static dir) и `overlay` (текущий `/var/www/ipt`), env-шаблон вынесен в `scripts/deploy-server.env.example`, реальный env игнорируется через `.gitignore`; `docs/DEPLOY.md` обновлён инструкцией запуска. |
| 2026-04-02 | ARCH | Next standalone asset deploy hardening + prod static hotfix | `web/scripts/postbuild-standalone-static.mjs`, `tests/unit/next-standalone-postbuild.test.js`, `STATUS.md`; prod: `/etc/nginx/sites-enabled/lpvolley`, `/etc/nginx/sites-available/lpvolley` | Postbuild Next standalone теперь копирует не только `.next/static`, но и весь `web/public` в `.next/standalone/web/public`; добавлен unit-тест на этот контракт. На проде `lpvolley.ru` исправлен nginx alias `/_next/static` на активное standalone-дерево, `web/public` синхронизирован в standalone `public`, `kotc-web.service` перезапущен; внешние проверки `https://lpvolley.ru/_next/static/css/a5b5d767a38678be.css` → `200`, `https://lpvolley.ru/images/pravila/kotc.svg` → `200`, главная страница → `200`. |
| 2026-04-02 | FORMAT | Thai Next reset permission hardening + prod deploy | `web/app/api/admin/tournaments/[id]/reset-thai-next/route.ts`, `STATUS.md` | `POST /api/admin/tournaments/[id]/reset-thai-next` ужесточён до `requireApiRole(req, 'admin')`; повторно прогнаны `npx vitest run tests/unit/admin-validators.test.js tests/unit/thai-judge-config.test.js tests/unit/thai-next-hardening-source-contract.test.js tests/unit/thai-judge-source-contract.test.js tests/unit/sudyam-source-contract.test.js` ✅ и `cd web && npm run build` ✅; выложено на `lpvolley.ru` с backup ` /var/www/ipt/.deploy-backup/20260402-160456-thai-reset-admin`, `kotc-web.service` перезапущен, probe `http://127.0.0.1:3101/api/sudyam/bootstrap` → `401 Unauthorized` |
| 2026-04-02 | ARCH | Admin `/admin/*` no-store cache hardening | `web/middleware.ts`, `STATUS.md` | Для всех ответов `/admin/*` middleware теперь явно выставляет `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`, включая редирект на `/admin/login`; это убирает риск stale HTML после деплоя, когда браузер/прокси держит старую страницу и пытается загрузить уже удалённые hashed-файлы из `/_next/static/*`. |
| 2026-04-02 | FORMAT | Thai Next Hardening: bootstrap lock + strict structural lock + reset escape hatch | `web/lib/thai-judge-config.ts`, `web/lib/thai-live/service.ts`, `web/app/api/admin/tournaments/route.ts`, `web/app/api/admin/tournaments/[id]/reset-thai-next/route.ts`, `web/components/sudyam/SudyamFormatWorkspace.tsx`, `tests/unit/thai-judge-config.test.js`, `tests/unit/thai-judge-source-contract.test.js`, `tests/unit/thai-next-hardening-source-contract.test.js`, `STATUS.md` | `GET /sudyam` остаётся read-only, Thai bootstrap окончательно уходит в `POST /api/sudyam/bootstrap`; structural lock теперь не даёт сменить `format`, откатить `thaiJudgeModule` в legacy или обойти drift после первой инициализации; reset route чистит live-state таблицы и signature, а audit log пишет `beforeState/afterState/reason`; проверки: `npx vitest run tests/unit/thai-judge-config.test.js tests/unit/thai-judge-source-contract.test.js tests/unit/thai-next-hardening-source-contract.test.js` ✅ |
| 2026-04-02 | ARCH+FORMAT+QA | Thai Judge v2 Next.js flow + PWA shell | `migrations/021_thai_judge_v2.sql`, `web/lib/thai-live/*`, `web/app/api/thai/judge/[pin]/tour/[tourNumber]/confirm/route.ts`, `web/app/court/[pin]/page.tsx`, `web/app/court/[pin]/manifest.ts`, `web/components/thai-live/ThaiJudgeWorkspace.tsx`, `web/public/thai-judge-sw.js`, `web/lib/sudyam-bootstrap.ts`, `web/components/sudyam/SudyamFormatWorkspace.tsx`, `tests/unit/thai-live-core.test.js`, `tests/unit/thai-judge-draft.test.js`, `tests/unit/thai-judge-source-contract.test.js`, `STATUS.md` | Добавлен нормализованный Thai judge state в PostgreSQL без Prisma: bootstrap R1/courts/tours/matches, `/court/[pin]` как канонический judge-entry, `POST /api/thai/judge/[pin]/tour/[tourNumber]/confirm` с `409/422/404`, локальный draft в `localStorage`, judge-only manifest + service worker shell, overview в `/sudyam` теперь показывает PIN/QR и ссылки на кортовые judge pages; проверки: `cd web && npx tsc --noEmit` ✅, `npx vitest run tests/unit/thai-live-core.test.js tests/unit/thai-judge-draft.test.js tests/unit/thai-judge-source-contract.test.js tests/unit/sudyam-source-contract.test.js` ✅ |
| 2026-04-02 | ARCH | Prod DB migration: Thai Judge v2 | `migrations/021_thai_judge_v2.sql`, `STATUS.md` | `021_thai_judge_v2.sql` применена на продовой PostgreSQL БД `lpbvolley` через `psql -v ON_ERROR_STOP=1`; после прогона подтверждено наличие таблиц `thai_round`, `thai_court`, `thai_tour`, `thai_match`, `thai_match_player`, `thai_player_round_stat` и всех 6 индексов `idx_thai_*`. |
| 2026-04-02 | ARCH+FORMAT | Calendar filters + auto status/waitlist hardening | `web/app/calendar/page.tsx`, `web/components/calendar/CalendarFilters.tsx`, `web/components/calendar/CalendarGrid.tsx`, `web/components/calendar/EventCard.tsx`, `web/lib/calendar.ts`, `web/lib/tournament-status.ts`, `web/lib/queries.ts`, `web/app/api/tournament-register/route.ts`, `web/lib/admin-queries-pg.ts`, `web/lib/admin-queries.ts`, `web/app/api/admin/requests/route.ts`, `tests/unit/calendar-utils.test.js`, `STATUS.md` | `/calendar` получил GET-фильтры и корректную сортировку future→past; группировка событий теперь учитывает время и локацию; публичные карточки/детали показывают свободные места и waitlist; статусы `open/full/finished` вычисляются автоматически по вместимости и дате; approve заявок больше не переполняет основной состав и отправляет лишних игроков в waitlist; `cmd /c npm run test:unit` = 397/397, `cd web && cmd /c npm run build` ✅ |
| 2026-04-02 | ARCH+FORMAT+QA | Thai Sudyam bootstrap/url hardening | `web/lib/sudyam-bootstrap.ts`, `web/lib/build-thai-judge-url.ts`, `web/app/sudyam/page.tsx`, `web/components/sudyam/SudyamFormatWorkspace.tsx`, `formats/thai/thai-boot.js`, `tests/unit/build-thai-judge-url.test.js`, `STATUS.md` | Bootstrap API теперь отдаёт `thaiJudgeParams`; `/sudyam` строит Thai-ссылку через `kotcBaseUrl`; `thai-boot.js` автодогружает серверные params и roster через `/api/sudyam/bootstrap` при неполном URL, затем fallback'ом идёт в `/api/admin/roster`; `npm run test:unit` = 388/388 |
| 2026-04-02 | ARCH | API: турнирный state для SPA | `web/app/api/tournaments/[id]/route.ts`, `migrations/020_tournaments_game_state_sync.sql`, `shared/api.js`, `web/public/shared/api.js`, `_site/shared/api.js`, `web/.env.local.example`, `docs/LPVOLLEY_SITE_STRUCTURE.md` | GET/POST `/api/tournaments/:id` → `game_state`/`synced_at`; fallback `apiBase` из `supabaseUrl` origin; опц. `TOURNAMENT_SYNC_SECRET` + `X-Org-Secret` |
| 2026-04-02 | ARCH | Док: структура lpvolley.ru | docs/LPVOLLEY_SITE_STRUCTURE.md, README.md, STATUS.md | Контуры, маршруты+файлы+«Защита», API-группы; **поток SPA→БД** (`shared/api.js`, `/api/*`, `/rpc/*`, kotc live); LEGACY `admin.html`/legacy-sync; **TODO** `/sudyam2`; админ-акторы через **ENV** (не NextAuth); Mermaid TB; DEPLOY/`dist/` |
| 2026-04-02 | ARCH+QA | CSP inline-event bridge for KOTC/legacy roster UI | `assets/js/main.js`, `web/public/kotc/assets/js/main.js`, `index.html`, `web/public/kotc/index.html`, `tests/unit/kotc-legacy-inline-bridge.test.js`, `STATUS.md` | Общий bridge теперь снимает inline-атрибуты `onclick/oninput/onchange/onblur/ondblclick/onkeydown/onmousedown` и переводит их в `data-inline-*`; для выполнения bridge под строгим CSP в judge-страницах добавлен `unsafe-eval`; закрыт CSP-регресс в `/kotc` и корневом SPA; browser-check через Playwright ✅, `npm run build` ✅, `npm run test:unit` = 400/400 |
| 2026-04-02 | ARCH | Prod deploy: CSP inline bridge | `STATUS.md` | На `lpvolley.ru` точечно выложены `dist/index.html` и `dist/assets/main-4IsSJFgC.js` (+ map) в `/var/www/ipt`; бэкап: `/var/www/ipt/.deploy-backup/20260402-073037-csp-inline-bridge`; внешняя проверка `https://lpvolley.ru/kotc/?legacyTournamentId=24883358-c7b1-48ba-948f-eee300f21b4f&legacyFormat=thai&startTab=roster` прошла без CSP console violations |
| 2026-04-02 | ARCH+QA | Admin tournaments validation hardening | `web/lib/admin-validators.ts`, `web/lib/admin-errors.ts`, `web/app/admin/tournaments/page.tsx`, `tests/unit/admin-validators.test.js`, `tests/unit/admin-errors.test.js`, `STATUS.md` | Серверная нормализация `/api/admin/tournaments` больше не подставляет невалидный `level='open'`; добавлены явные guard'ы для `division`, `level` и `capacity>=4`, а constraint-ошибки PostgreSQL мапятся в `400` с понятным текстом вместо `500`; `cd web && npm run build` ✅, `npm run test:unit` = 406/406; на проде восстановлен `web/.next/standalone/web`, `GET /api/admin/tournaments` = 200, невалидный POST возвращает `400 {"error":"Capacity must be at least 4"}` |
| 2026-04-02 | ARCH | Calendar filters collapse toggle | `web/components/calendar/CalendarFilters.tsx`, `STATUS.md` | `/calendar` теперь держит фильтры скрытыми по умолчанию и раскрывает их по кнопке; при активных GET-фильтрах показывается бейдж `Активные фильтры`, а `Сбросить` остается доступным без раскрытия панели; `cd web && npm run build` ✅ |
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
| 2026-03-22 | ARCH | A4.2 Realtime | shared/realtime.js, sw.js | WebSocket realtime sync через broadcast channels, auto-reconnect, tournament sync helpers, SW v57 |
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
| 2026-03-23 | ARCH | S6.1 | web/middleware.ts, web/app/sudyam/page.tsx | Redirect теперь строится по `x-forwarded-host/proto`, fallback KOTC URL без localhost leak |
| 2026-03-23 | ARCH | S6.2 | web/app/api/tournament-register/route.ts | Добавлена pre-check в `tournaments`: несуществующий id -> 404, закрытый статус -> 400 |
| 2026-03-23 | ARCH | S6.3 | web/next.config.ts, web/app/robots.ts, web/app/sitemap.ts | Добавлены базовые security headers и генерация robots/sitemap через App Router |
| 2026-03-23 | FORMAT | S6.4 | web/app/calendar/[id]/register/page.tsx | Для finished/cancelled турниров форма скрыта и показан закрытый статус с возвратом к карточке турнира |
| 2026-03-23 | ARCH | S6.5 | web/app/api/sudyam-auth/route.ts | Добавлен IP rate limit (429 + Retry-After), fail-secure режим при отсутствии `SUDYAM_PIN` в production |
| 2026-03-23 | FORMAT | S6.6 | web/components/rankings/PlayerRow.tsx, assets/js/screens/home.js | Harden ссылки профилей в рейтинге (не генерировать `undefined`) и guard, чтобы smoke не дергал `/api/archive` (404) |
| 2026-03-24 | ARCH | Favicon legacy SPA | assets/favicon.png, index.html, admin.html, rating/register/profile/ipt-session, formats/thai + kotc HTML, web/public/kotc/*, sw.js, vite.config.js, scripts/validate-static.mjs | Единая PNG-иконка во вкладке для статики + кеш SW v63 / legacy kotc v52 |
| 2026-03-26 | ARCH | Partner search MVP | web/app/partner/page.tsx, web/components/calendar/TournamentRegisterForm.tsx, web/app/api/tournament-register/route.ts, web/lib/queries.ts, migrations/016_partner_search_flags.sql | Добавлены режимы регистрации (с партнёром/соло), флаг публичного поиска пары и рабочая витрина `/partner` с фильтрами по турниру/уровню/полу |
| 2026-03-26 | ARCH | Partner confirmation flow | web/app/api/partner/requests/*, web/components/partner/PartnerRequestButton.tsx, web/components/profile/PartnerInbox.tsx, web/components/profile/TelegramLinkForm.tsx, web/app/profile/page.tsx, web/app/partner/page.tsx, web/lib/telegram.ts, migrations/017_partner_requests.sql | Связано с ближайшими турнирами и календарём; добавлены запрос/подтверждение пары в личном кабинете, Telegram-уведомления через bot API и привязка `telegram_chat_id` |
| 2026-03-26 | ARCH | Profile SSR crash fix | web/lib/queries.ts, web/app/favicon.ico/route.ts | Добавлена UUID-валидация для player-query функций (исключает 500 при `profile?id=Имя`), добавлен роут для `/favicon.ico` с редиректом на существующую иконку |
| 2026-04-01 | DOCS | Аудит markdown | README.md, docs/*, CLAUDE.md, STATUS.md; удалены PHASE6_INSTRUCTIONS.md, CURSOR_TASK.md, PHASE6_PLAN.md | Единая точка входа, DEVELOPMENT/DEPLOY/AGENTS, архив справочника и CURSOR_TASK в docs/archive |
| 2026-04-01 | REPO | Наведение порядка в корне | to-delete/README.md, перенос файлов в to-delete/ | скриншоты tmp-*.png, --main.rar, kotc-live-deploy.tar, lpvolley_auth_v11_final.dart, ARCHITECTURE.md, DEPLOY.md (см. README в to-delete) |
| 2026-04-01 | QA | Thai R2 seed unit tests | tests/unit/thai-seed-r2.test.js | `thaiSeedR2`: зоны 4/3/2/1, разбиение по `ppc`, массив vs `{ players }`, пустой ростер |
| 2026-04-01 | QA | Thai schedule + build-smoke | tests/unit/thai-schedule.test.js, tests/unit/build-smoke.test.js | MF: конфликты в туре — отдельные множества муж/жен (индексы разных пулов); roster-скрипты проверяются в `DEFERRED_APP_SCRIPT_ORDER` |
| 2026-04-01 | ARCH+QA | Postgres SSL + KOTC live tests | web/lib/resolve-pg-ssl.ts, web/lib/db.ts, tests/unit/kotc-db-ssl.test.js, tests/unit/kotc-live-api.test.js | `resolvePgSsl` без импорта `pg` (убран таймаут Vitest); kotc-live тесты с timeout 30s на холодную трансформацию |
| 2026-04-01 | QA | Release gate | `npm run test:gate` | build + 358 unit + smoke(7) + e2e(17) — всё зелёное; контракт Thai в STATUS синхронизирован с `courts`/`tours` + meta |
| 2026-04-01 | FORMAT+ARCH+QA | Thai courts/tours rollout | thai-boot.js, DEVELOPMENT.md, home.js, roster.js, roster-format-launcher.js, locales, `web/lib/build-thai-judge-url.ts`, SudyamFormatWorkspace.tsx, playwright.config.ts, tests | Лаунчеры + home: `thaiMeta.courts/tours`; Sudyam CTA; E2E `thai-url-params`; gate: `reuseExistingServer` |
| 2026-04-02 | FORMAT | Thai admin single selector + M/N save fix | `web/app/admin/tournaments/page.tsx`, `web/lib/admin-legacy-sync.ts`, `tests/unit/admin-legacy-sync.test.js`, `tests/unit/admin-validators.test.js`, `STATUS.md` | Убран дублирующий Thai selector сверху: выбор состава теперь только в блоке «Формат турнира»; `Thai M/N` нормализуется к допустимому division `Мужской`, чтобы сохранение не падало на `400`; добавлены unit-тесты на нормализацию и валидацию. |
| 2026-04-02 | ARCH | Calendar live UX + notifications | `web/app/calendar/[id]/page.tsx`, `web/components/calendar/EventCard.tsx`, `web/app/api/calendar/[id]/ics/route.ts`, `web/app/api/tournament-register/route.ts`, `web/app/api/admin/requests/route.ts`, `web/app/api/admin/roster/route.ts`, `web/lib/queries.ts`, `web/lib/types.ts`, `web/lib/tournament-links.ts`, `web/lib/tournament-notifications.ts`, `web/lib/email.ts`, `tests/unit/tournament-links.test.js` | Карточки и страница турнира получили живые сигналы (места/waitlist/ищут пару), экспорт `.ics`, карту и таблицу результатов; добавлены уведомления игроку при отправке/одобрении/отклонении заявки и переводе из waitlist; проверено `cmd /c npm run test:unit` (407) и `cmd /c npm run build` в `web/` |


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
thaiGenerateSchedule({ men, women, mode, seed, courts?, tours? }) → Tour[] & { meta: { mode, n, courts, tours } }
thaiValidateSchedule(schedule, allPlayers?) → { valid, errors }
thaiSeedR2(r1Groups | { players, ppc? }, gender) → R2Group[]
thaiCalcNominations(r1Stats, r2Stats) → Nomination[]
```
| 2026-04-02 | ARCH | ICS download header byte-safe hotfix | `web/app/api/calendar/[id]/ics/route.ts`, `web/lib/tournament-links.ts`, `tests/unit/tournament-links.test.js`, `STATUS.md` | `Content-Disposition` for `.ics` now uses an ASCII `filename=` fallback plus RFC 5987 `filename*=` so Cyrillic tournament names no longer crash the response header in production. |
| 2026-04-02 | ARCH+FORMAT | Thai Next hardening | `web/lib/thai-live/service.ts`, `web/app/api/sudyam/bootstrap/route.ts`, `web/app/api/admin/tournaments/route.ts`, `web/app/api/admin/tournaments/[id]/reset-thai-next/route.ts`, `web/lib/sudyam-bootstrap.ts`, `web/app/sudyam/page.tsx`, `web/components/sudyam/SudyamFormatWorkspace.tsx`, `web/lib/thai-judge-config.ts`, `tests/unit/thai-next-hardening-source-contract.test.js`, `tests/unit/thai-judge-config.test.js` | Thai Next bootstrap moved out of GET into locked POST materialization; `/sudyam` now stays read-only and drives pending/blocking UI; admin PUT now blocks format/module/signature bypass after initialization; reset endpoint clears Thai live state plus bootstrap signature under audit. |
| 2026-04-03 | ARCH+FORMAT | Thai rebuild | `web/lib/thai-live/core.ts`, `web/lib/thai-live/types.ts`, `web/lib/thai-live/service.ts`, `web/lib/sudyam-bootstrap.ts`, `web/app/api/sudyam/thai/route.ts`, `web/components/sudyam/SudyamFormatWorkspace.tsx`, `web/components/thai-live/ThaiJudgeWorkspace.tsx`, `web/app/admin/tournaments/page.tsx`, `web/lib/admin-legacy-sync.ts`, `tests/unit/thai-live-core.test.js`, `tests/unit/thai-judge-source-contract.test.js`, `tests/unit/sudyam-source-contract.test.js`, `tests/unit/thai-next-hardening-source-contract.test.js`, `tests/unit/admin-validators.test.js`, `tests/unit/admin-legacy-sync.test.js`, `STATUS.md` | Thai Next switched from zero-sum confirmation to normal final-score validation with configurable point limit; `/sudyam` now exposes operator state for R1/R2, standings, finals and Thai actions; judge pages use tour tabs and no longer show balance cues; `M/N` now uses one ordered roster split into Profi/Novice pools instead of a male-only roster. |
| 2026-04-03 | ARCH+FORMAT | Thai draw preview + round controls + R2 seed editor | `web/lib/thai-live/types.ts`, `web/lib/thai-live/service.ts`, `web/app/api/sudyam/bootstrap/route.ts`, `web/app/api/sudyam/thai/route.ts`, `web/app/api/admin/tournaments/[id]/preview-draw/route.ts`, `web/app/api/admin/tournaments/[id]/confirm-r2-seed/route.ts`, `web/app/api/admin/tournaments/[id]/apply-r2-seed/route.ts`, `web/components/thai-live/ThaiDrawPreview.tsx`, `web/components/thai-live/ThaiR2SeedEditor.tsx`, `web/components/sudyam/SudyamFormatWorkspace.tsx`, `STATUS.md` | Thai Sudyam no longer auto-materializes R1 on page load: operators preview and reshuffle draw by seed, explicitly confirm R1 bootstrap, explicitly finish R1/R2 after all tours are confirmed, and can review/edit the computed HARD/ADVANCE/MEDIUM/LIGHT R2 seed before committing it to DB. |
| 2026-04-03 | ARCH | Prod migration verification | `STATUS.md` | На `lpvolley.ru` снят schema-only backup `/var/www/ipt/.deploy-backup/20260403-034347-db-schema-check`; реестр applied migrations не обнаружен, поэтому выполнена schema-based сверка. Подтверждено, что `021_thai_judge_v2.sql`, `022_kotc_live_serve_state.sql` и `023_thai_judge_grants.sql` уже отражены в схеме/правах, поэтому дополнительный SQL не запускался. Runtime verification: `kotc-web.service` active, `127.0.0.1:3101` -> `200`, `https://lpvolley.ru/` -> `200`, `https://lpvolley.ru/court/VQV8MK3N` -> `200`, свежих SQL/permission ошибок в journal нет. |
