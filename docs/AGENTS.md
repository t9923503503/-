# Инструкция для ИИ-агентов

## Перед работой

1. [`README.md`](../README.md) — обзор репозитория.
2. [`STATUS.md`](../STATUS.md) — чеклист, CHANGELOG, блокировки.
3. [`CLAUDE.md`](../CLAUDE.md) — обязательные архитектурные правила.
4. При смене поведения деплоя или локального запуска — [`docs/DEVELOPMENT.md`](DEVELOPMENT.md), [`docs/DEPLOY.md`](DEPLOY.md).
5. Для KOTC Next использовать отдельную доску координации: [`docs/KOTC_NEXT_AI_PLAN.md`](KOTC_NEXT_AI_PLAN.md).

## Главное архитектурное правило

**Новый функционал для всех пользователей** (календарь, рейтинги, регистрации, операторская админка) — только в **Next.js** [`web/`](../web/), данные через **PostgreSQL** (например [`web/lib/db.ts`](../web/lib/db.ts)).

Судейский **SPA** в корне — только live-управление матчем (KOTC, Thai, IPT и т.д.). Новые публичные страницы там не создавать.

## Роли и зоны (по умолчанию)

| Роль | Зона |
|------|------|
| **ARCH** | `shared/*`, `assets/js/main.js`, `assets/js/integrations*`, `assets/js/runtime.js`, `assets/js/ui/kotc-sync.js`, `admin.html`, `admin-init.js`, `index.html`, `sw.js`, `migrations/*` |
| **FORMAT** | `formats/kotc/*`, `formats/thai/*`, `assets/js/screens/*`, `assets/js/ui/*` (кроме `kotc-sync.js`), `rating.html` |
| **QA** | `tests/*`, `scripts/*`, `playwright.config.ts`, `vitest.config.ts` |

После задачи обновляйте [`STATUS.md`](../STATUS.md) (и при необходимости CHANGELOG там же).

## Справочник по выполненным фазам

Детальные таблицы и диаграммы (мультисудейство, рейтинги): [`docs/ARCHITECTURE_PHASES_6_8.md`](ARCHITECTURE_PHASES_6_8.md).
