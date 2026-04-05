# Памятка для Claude / ИИ-агентов

## Перед работой

1. Прочитай **[`README.md`](README.md)** — структура репозитория и быстрый старт.
2. Прочитай **[`STATUS.md`](STATUS.md)** — чеклист, CHANGELOG, блокировки.
3. Прочитай **[`docs/AGENTS.md`](docs/AGENTS.md)** — зоны файлов и приоритеты для агентов.
4. При работе с окружением и выкладкой: [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md), [`docs/DEPLOY.md`](docs/DEPLOY.md).
5. Архитектура выполненных фаз 6–8 (справочник): [`docs/ARCHITECTURE_PHASES_6_8.md`](docs/ARCHITECTURE_PHASES_6_8.md).

## Текущий фокус

По [`STATUS.md`](STATUS.md): фазы 5–8 в чеклисте **закрыты**; дальнейшие задачи ведите через CHANGELOG и новые пункты в `STATUS.md`. Исторический текст задач Cursor: [`docs/archive/CURSOR_TASK_2026-03.md`](docs/archive/CURSOR_TASK_2026-03.md).

## Синхронизация документов

После завершения задачи обновляй **[`STATUS.md`](STATUS.md)** (чеклист + CHANGELOG).

## Архитектурное правило

**Весь новый функционал для общего доступа разрабатывается в Next.js (`web/`).**

- Хранилище данных — **PostgreSQL** через `web/lib/db.ts` (`getPool()`).
- **localStorage** не использовать для данных, которые должны видеть все пользователи (сервер — источник правды).
- SPA (`index.html`, `assets/js/`) — **только судейский интерфейс** (KOTC, Thai, IPT — live-управление матчем). Новые публичные страницы там не создавать.
- Публичные страницы (архив, рейтинги, турниры) — Next.js App Router (`web/app/`).
- Админ-панель оператора — Next.js `/admin/*` с cookie-авторизацией (`requireApiRole`).
- API — Next.js Route Handlers (`web/app/api/`), авторизация через `requireApiRole(req, 'operator')` где принято в проекте.

**Примеры:**

- Архив турниров → `/archive` (Next.js SSR) + `/admin/archive` (ввод результатов)
- Рейтинги → `/rankings`
- Не добавлять публичные фичи в `assets/js/screens/home.js` или других SPA-файлах как основное место

## Роли агентов

| Роль | Зона файлов |
|------|-------------|
| **ARCH** | `shared/*`, `assets/js/main.js`, `assets/js/integrations*`, `assets/js/runtime.js`, `assets/js/ui/kotc-sync.js`, `admin.html`, `admin-init.js`, `index.html`, `sw.js`, `migrations/*` |
| **FORMAT** | `formats/kotc/*`, `formats/thai/*`, `assets/js/screens/*`, `assets/js/ui/*` (кроме kotc-sync.js), `rating.html` |
| **QA** | `tests/*`, `scripts/*`, `playwright.config.ts`, `vitest.config.ts` |

## Тесты (ориентир)

```bash
npm run test:unit
npx playwright test tests/smoke.spec.ts --reporter=list
npm run test:gate
```
