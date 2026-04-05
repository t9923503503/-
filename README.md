# Лютые Пляжники — монорепозиторий

Два связанных контура:

1. **Судейский SPA (статика + Vite)** — корень репозитория: `index.html`, `assets/js/`, `formats/`, `shared/`, админка `admin.html`. Offline-first, PWA (`sw.js`).
2. **Публичный сайт и API (Next.js)** — каталог [`web/`](web/): календарь, рейтинги, регистрация, `/admin/*`, маршруты API, PostgreSQL через [`web/lib/db.ts`](web/lib/db.ts).

## Документация

| Документ | Назначение |
|----------|------------|
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Локальный запуск, env, тесты, правила разработки |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Универсальный чеклист деплоя (standalone Next, статика, миграции) |
| [docs/AGENTS.md](docs/AGENTS.md) | Кратко для ИИ-агентов (зоны файлов, что читать первым) |
| [docs/ARCHITECTURE_PHASES_6_8.md](docs/ARCHITECTURE_PHASES_6_8.md) | Архивный справочник: мультисудейство, единая БД рейтингов (фазы 6–8) |
| [docs/LPVOLLEY_SITE_STRUCTURE.md](docs/LPVOLLEY_SITE_STRUCTURE.md) | Структура lpvolley.ru: контуры монорепо, маршруты Next.js, API, auth |
| [CLAUDE.md](CLAUDE.md) | Памятка для Claude / Cursor (обязательные правила проекта) |
| [STATUS.md](STATUS.md) | Координация агентов, чеклист, CHANGELOG |

Исторический backlog: [`docs/archive/CURSOR_TASK_2026-03.md`](docs/archive/CURSOR_TASK_2026-03.md).

Временное место перед удалением из репозитория: [`to-delete/README.md`](to-delete/README.md) (скриншоты `tmp-*.png`, архивы, устаревшие md из корня).

## Подпроекты в `apps/`

- `apps/volleyball-calendar/` — отдельное приложение (см. `AGENTS.md` внутри).
- `apps/play-lpvolley/` — см. `README.md` внутри.

## Быстрый старт

```bash
# Судейский SPA (Vite, порт по умолчанию 8000 — см. vite.config.js)
npm install
npm run dev

# Next.js (отдельный package.json)
cd web && npm install && npm run dev
```

Подробнее: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).
