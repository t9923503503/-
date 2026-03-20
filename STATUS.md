# 📋 STATUS.md — Координация агентов

> **КАЖДЫЙ АГЕНТ ЧИТАЕТ ЭТОТ ФАЙЛ ПЕРЕД НАЧАЛОМ РАБОТЫ**
>
> Обновляй свою секцию после каждой завершённой задачи.
> Не трогай чужие секции (кроме BLOCKED).
>
> Формат: `- [ ] Задача` → `- [x] Задача ✅ (дата, файлы)`

---

## Текущий этап: ЭТАП 1 — ФОРМАТЫ (ARCH A0.x ✅ все выполнены)

---

## 🔵 ARCH — Архитектор

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

### Этап 0

- [ ] **Q0.1** — Настройка тестовой инфраструктуры
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
- [ ] **Q1.6** — Regression: хаб не сломался
- [x] **Q1.7** — Mobile testing ✅ (2026-03-20, `tests/e2e/thai-mobile.spec.ts`)
- [x] **Q1.8** — THAI_GUIDE.md ✅ (2026-03-20, `THAI_GUIDE.md`)

---

## 🚧 BLOCKED

> Если что-то мешает работе — пишите сюда.
> Формат: `[АГЕНТ] ЗАДАЧА: описание проблемы → кто может разблокировать`

(пусто)
[ARCH] Q1.6 — `npm run test:smoke` (Browser smoke) нестабилен: при открытии хаба кнопка `.nb[data-tab="home"]` не кликается (timeout), вероятно из-за сетевых/внешних зависимостей Supabase/CDN → добавить жёсткую деградацию при недоступном Supabase (guard/try-catch вокруг init) и/или локальный fallback скриптов; затем пере-запустить smoke.

---

## 📝 CHANGELOG

> Кто что сделал — для быстрой сверки.

| Дата | Агент | Задача | Файлы | Заметки |
|------|-------|--------|-------|---------|
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
thaiGenerateSchedule({ men, women, mode }) → Tour[]
thaiValidateSchedule(schedule, allPlayers) → { valid, errors }
thaiSeedR2(r1Groups, gender) → R2Group[]
thaiCalcNominations(r1Stats, r2Stats) → Nomination[]
```
