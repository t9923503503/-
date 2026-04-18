# GO Live Module — Документация для агентов

> Последнее обновление: 2026-04-14

## Обзор

Модуль GO Live (`Groups + Olympic`) — это многоэтапная система управления турниром в реальном времени. Страница администратора находится по адресу:

```
/admin/tournaments/[id]/go-live
```

Реализован как `GoOperatorPanel` с 4 вкладками:

| Вкладка | Компонент | Назначение |
|---------|-----------|-----------|
| Группы | `GoGroupStandings` | Таблицы групп, счёт, ТО |
| Расписание | `GoScheduleGrid` | CSS Grid: корт × слот, LIVE-индикаторы |
| Сетка | `GoBracketView` + `GoSeedEditor` | Олимпийская сетка, посев, anti-collision |
| Корты | `GoCourtSlotsGrid` + PIN-коды | 8 слотов на корт (4M/4Ж), DnD, match-ready |

---

## Стадии турнира (`GoOperatorStage`)

```
setup → groups_ready → groups_live → groups_finished
      → bracket_preview → bracket_ready → bracket_live → finished
```

Действия управляются через `POST /api/admin/tournaments/[id]/go-action`.

---

## Структура базы данных

### Основные таблицы (migration 047–050)
| Таблица | Назначение |
|---------|-----------|
| `go_round` | Раунд (r1=группы, r2=олимпийка). Содержит `finalized_settings` JSONB |
| `go_group` | Группы в r1 |
| `go_team` | Команды (2 игрока). Поле `initial_bucket`: hard/medium/lite |
| `go_court` | Корты с PIN-кодами для судей. Поле `last_cleared_at` |
| `go_match` | Матчи с `judge_state` JSONB и оптимистичным версионированием |
| `go_bracket_slot` | Слоты олимпийской сетки |
| `go_group_standing` | Таблица очков групп |

### Слоты кортов (migration 051)
| Таблица | Назначение |
|---------|-----------|
| `go_court_slot` | 8 слотов на корт: 1–4 = M, 5–8 = W (для mixed). Поля: `player_id`, `player_name`, `assigned_by` |
| `go_court_slot_history` | Snapshot перед каждой очисткой корта (для Undo) |

---

## API эндпоинты

### Существующие
| Метод | Путь | Auth | Назначение |
|-------|------|------|-----------|
| POST | `/api/admin/tournaments/[id]/go-action` | operator | Действия: bootstrap, start/finish stages, посев |
| GET | `/api/admin/tournaments/[id]/go-standings` | viewer | Группы + матчи |
| GET | `/api/admin/tournaments/[id]/go-bracket` | viewer | Сетка + seedDraft |
| POST | `/api/admin/tournaments/[id]/reset-go` | admin | Полный сброс |

### Новые (слоты кортов)
| Метод | Путь | Auth | Назначение |
|-------|------|------|-----------|
| GET | `/api/admin/tournaments/[id]/go-court-slots` | viewer | Корты + слоты + игроки турнира |
| PATCH | `/api/admin/tournaments/[id]/go-court-slots/[slotId]` | operator | Назначить/освободить игрока |
| POST | `/api/admin/tournaments/[id]/go-court-slots/clear/[courtId]` | operator | Атомарная очистка (snapshot → clear) |
| POST | `/api/admin/tournaments/[id]/go-court-slots/restore/[historyId]` | operator | Атомарное восстановление (Undo) |

### Судейский интерфейс (без авторизации)
| Метод | Путь | Назначение |
|-------|------|-----------|
| GET | `/api/go/judge/[pin]` | Снапшот матча для судьи |
| POST | `/api/go/judge/[pin]/action` | Действия судьи (point_won, undo...) |

---

## Файловая структура

```
web/
├── app/
│   ├── admin/tournaments/[id]/go-live/page.tsx   — Server component, рендерит GoOperatorPanel
│   ├── api/admin/tournaments/[id]/
│   │   ├── go-action/route.ts
│   │   ├── go-standings/route.ts
│   │   ├── go-bracket/route.ts
│   │   ├── reset-go/route.ts
│   │   └── go-court-slots/                       — НОВОЕ
│   │       ├── route.ts                           — GET
│   │       ├── [slotId]/route.ts                  — PATCH
│   │       ├── clear/[courtId]/route.ts           — POST (atomic)
│   │       └── restore/[historyId]/route.ts       — POST (atomic undo)
│   └── api/go/
│       └── judge/[pin]/
│           ├── route.ts
│           └── action/route.ts
├── components/go-next/
│   ├── GoOperatorPanel.tsx                        — Главный панельный компонент
│   ├── GoGroupStandings.tsx
│   ├── GoBracketView.tsx
│   ├── GoMatchCard.tsx
│   ├── GoProgressBar.tsx
│   ├── GoSeedEditor.tsx                           — + anti-collision detection
│   ├── GoSpectatorBoard.tsx
│   ├── GoJudgeScreen.tsx
│   ├── courts/                                    — НОВОЕ
│   │   ├── GoCourtSlotsGrid.tsx                   — Контейнер, polling 3s, anti-stale
│   │   ├── GoCourtSlotCard.tsx                    — Карточка корта, match-ready checker, undo
│   │   ├── GoSlotItem.tsx                         — Строка слота (drop zone)
│   │   └── GoFreePlayersList.tsx                  — Панель свободных игроков (DnD source)
│   ├── schedule/                                  — НОВОЕ
│   │   └── GoScheduleGrid.tsx                     — CSS Grid, Active/Delayed zones
│   └── setup/                                     — НОВОЕ
│       └── GoRosterConfigPanel.tsx                — Формат, уровни, шаблон, пресеты
└── lib/go-next/
    ├── index.ts                                   — Re-exports
    ├── types.ts                                   — GoAdminSettings (+teamGenderFormat, levelCount)
    ├── core.ts                                    — Алгоритмы групп/расписания/таблиц
    ├── bracket-generator.ts
    ├── service.ts                                 — bootstrap_groups: initGoCourtSlots + finalized_settings
    ├── sync-tournament-results.ts
    └── court-slots.ts                             — НОВОЕ: slotGender, initGoCourtSlots, loadCourtsWithSlots

web/lib/go-next-config.ts                          — validateGoSetup (поддержка levelCount=2)
```

---

## Ключевые алгоритмы

### Match-Ready Checker (`GoCourtSlotCard`)
```
Все 4 игрока матча присутствуют в слотах правильного пола →  ✅ зелёный заголовок
Хотя бы 1 игрок из матча находится в слоте ДРУГОГО корта  →  ⚠️ мигающий красный
Иначе                                                       →  нейтральный серый
```

### Anti-Collision Bracket (`GoSeedEditor`)
- Для каждой пары раунда 1: `(pos_2k-1, pos_2k)`
- Проверить, из одной ли группы обе команды
- Δseed ≤ 2 → кнопка «Разместить» (swap)
- Δseed > 2 → алерт без swap
- После swap: жёлтый border на 2 секунды

### finalized_settings
При `bootstrap_groups` текущие `GoAdminSettings` сохраняются в `go_round.finalized_settings`. Это защищает турнир от случайного изменения настроек в разгар соревнования.

### Anti-stale polling (Court Slots)
```typescript
lastActionAt = Date.now() // при каждой мутации
// В setInterval:
if (Date.now() - lastActionAt < 2500) return; // игнорируем stale poll
```

---

## Фаза 2 — визуальная доработка (2026-04-14)

### Architectural Rules
- Серверные контракты и API-типы в рамках фазы не изменяются.
- Логика представления вынесена в helper/view-model слой:
  - `buildGoScheduleViewModel(...)`
  - `buildGoBracketViewModel(...)`
  - `buildRosterLevelSummary(...)`
- `brackets` остаётся источником структуры сетки, `matches` используется только как live/result overlay.
- `GoBracketView` сохраняет обратную совместимость: `matches?: GoMatchView[]` опционален, layout не зависит от его наличия.

### Scope Limitations (Non-goals)
- В рамках фазы поддерживается только single elimination с BYE для неполной сетки.
- Не поддерживаются: double elimination, матч за 3 место, ручной reseeding, ручное редактирование bracket из UI, SVG/Canvas rendering.
- Расписание поддерживает один активный фильтр: `all | g:* | b:*`.
- Отдельная timezone-настройка не вводится (локальное browser-время).

### GoBracketView — CSS-линии между раундами
- Геометрия: `SLOT_H=56px`, `BASE_GAP=4px`, `slotGapForRound(R)=(2^(R-1)-1)×60`.
- Connector-колонка: `border-r border-t` / `border-r border-b` + горизонтальный stub.
- Layout contract: фиксированная высота слота, однострочный label, `truncate`, без динамического роста карточки от score/badges.
- Цвета уровней: `HARD/LYUTYE=red`, `MEDIUM=green`, `LITE=blue`.
- Score overlay: счёт трактуется как атрибут матча; в этой фазе применяется упрощённое отображение overlay на оба слота пары.

### GoScheduleGrid — 5 улучшений
- Время: `scheduledAt -> HH:MM`, fallback `#slotIndex`.
- При нескольких матчах одного `slotIndex` выбирается первое валидное время по стабильной сортировке.
- Цветные бейджи `groupLabel` с детерминированным mapping + neutral fallback.
- Счёт `setsA:setsB` в live/finished ячейке с подсветкой победителя.
- Фильтр: `'all' | 'g:A' | 'b:HARD'` (single-filter).
- LIVE-бейдж: `animate-pulse` + `ring`.

### GoRosterConfigPanel — BYE summary
- `nextPowerOf2(n)` + `byeInfo(count)` -> `{ gridSize, byeCount, ok }`.
- Подсчёт по реальным активным командам уровня (preview-модель, не финальная турнирная логика).
- BYE summary показывается как прогноз single-elimination, без учёта будущих overrides/reseeding.
- При `levelCount=2` блок `MEDIUM` остаётся в UI как информативный неактивный блок (`не используется`).

---

## Настройки турнира (`GoAdminSettings`)

Хранятся в `tournaments.settings` JSONB. Ключевые поля:

```typescript
{
  courts: number,                    // количество кортов
  groupFormula: { hard, medium, lite }, // команд каждого уровня в группе
  matchFormat: 'single15'|'single21'|'bo3',
  seedingMode: 'serpentine'|'random'|'manual',
  enabledPlayoffLeagues: ('lyutye'|'hard'|'medium'|'lite')[],
  bracketSizes: { [league]: 4|8|16 },
  // НОВЫЕ
  teamGenderFormat?: 'male'|'female'|'mixed',  // default: 'mixed'
  levelCount?: 2|3,                             // default: 3
}
```

При `levelCount=2` Medium в формуле группы игнорируется (приравнивается к 0).

---

## Публичные страницы

| URL | Компонент | Назначение |
|-----|-----------|-----------|
| `/go/[tournamentId]/live` | `GoSpectatorBoard` | Публичное табло (группы, сетка, live) |
| `/court/[pin]` | `GoJudgeScreen` | Судейский интерфейс по PIN |

---

## Тесты

```bash
npm run test:unit          # все юнит-тесты
# GO-specific:
npx vitest run tests/unit/go-core.test.js
npx vitest run tests/unit/go-bracket.test.js
npx vitest run tests/unit/go-next-module.test.js
npx vitest run tests/unit/go-next-source-contract.test.js
```

---

## Деплой

```bash
# 1. Применить новую миграцию (только один раз)
psql $DATABASE_URL < migrations/051_go_court_slots.sql

# 2. Собрать и задеплоить
cd web && npm run build
# Затем по стандартному docs/DEPLOY.md
```

---

## Известные ограничения / Отложено

- **WebSocket**: сейчас используется polling (3s для слотов, 8s для основного состояния)
- **Auto-clear slots**: очистка слотов при завершении матча не реализована (нужен event trigger)
- **Публичное табло слотов**: отдельная страница для TV / Telegram-бот не реализована
- **Прогноз задержек**: прогнозная линия в расписании (история средних времён матчей) не реализована
- **@dnd-kit/core**: рекомендуется установить для touch-совместимого DnD на планшетах (`npm install @dnd-kit/core`); текущая реализация использует HTML5 Drag and Drop API
