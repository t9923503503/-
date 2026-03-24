# Памятка для Claude / ИИ-агентов

## Перед работой

1. Прочитай **`STATUS.md`** — актуальный этап, зоны файлов, BLOCKED.
2. Прочитай **`CURSOR_TASK.md`** — активные задачи (Фаза 7 остатки + Фаза 8).
3. Прочитай **`PHASE6_PLAN.md`** — архитектура мультисудейства и единой БД (Фазы 7–8).

## Текущий фокус

- **Фазы 1–6** — полностью завершены ✅.
- **Фаза 7** — мультисудейство: S7.3, S7.7, S7.8, S7.9 остались.
- **Фаза 8** — единая БД рейтингов: S8.1–S8.11 не начата.

## Синхронизация документов

После завершения задачи обновляй **`STATUS.md`** (чеклист + CHANGELOG) и **`CURSOR_TASK.md`** (отметь задачу как done).

## ⚠️ АРХИТЕКТУРНОЕ ПРАВИЛО — ОБЯЗАТЕЛЬНО К ИСПОЛНЕНИЮ

**Весь новый функционал разрабатывается ТОЛЬКО в Next.js (`web/`).**

- Хранилище данных — **PostgreSQL** через `web/lib/db.ts` (`getPool()`).
- **localStorage ЗАПРЕЩЁН** для хранения данных, которые должны видеть все пользователи.
- SPA (`index.html`, `assets/js/`) — **только судейский интерфейс** (KOTC, Thai, IPT — live-управление матчем). Новые страницы там не создавать.
- Публичные страницы (архив, рейтинги, турниры) — Next.js App Router (`web/app/`).
- Админ-панель — Next.js `/admin/*` с cookie-авторизацией (`requireApiRole`).
- API — Next.js Route Handlers (`web/app/api/`), авторизация через `requireApiRole(req, 'operator')`.

**Примеры:**
- Архив турниров → `/archive` (Next.js SSR) + `/admin/archive` (ввод результатов)
- Рейтинги → `/rankings` (уже есть)
- НЕ НАДО делать фичи в `assets/js/screens/home.js` или других SPA-файлах

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
