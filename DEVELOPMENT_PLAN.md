# План развития приложения "Лютые Пляжники"

---

## ИНСТРУКЦИЯ ДЛЯ ИИ-АГЕНТОВ (ОБЯЗАТЕЛЬНО К ПРОЧТЕНИЮ)

> **Этот план рассчитан на одновременную работу 2-3 ИИ-агентов.**
> Каждый агент ОБЯЗАН выполнять протокол координации ниже.

### Роли агентов

| Роль | Зона файлов (НЕ ТРОГАТЬ чужое!) | Цвет |
|------|----------------------------------|------|
| **ARCH** | `shared/*`, `assets/js/main.js`, `index.html`, `sw.js`, `formats/kotc/*` (архитектура), `admin.html` | 🔵 |
| **FORMAT** | `formats/*/` (UI и бизнес-логика форматов), `assets/js/ui/*`, `assets/js/screens/components.js` | 🟣 |
| **QA** | `tests/*`, `scripts/*`, `playwright.config.ts`, `vitest.config.ts` | 🟢 |

### Протокол работы с задачами

**1. ПЕРЕД НАЧАЛОМ РАБОТЫ:**
- Прочитай `STATUS.md` — проверь нет ли конфликтов
- Прочитай этот план — найди задачу из СВОЕЙ роли
- Проверь колонку "Зависит от" — если зависимость не выполнена, выбери другую задачу
- Проверь что задача ещё не взята другим агентом (нет отметки 🔄)

**2. ВЗЯТИЕ ЗАДАЧИ В РАБОТУ:**
Отредактируй строку задачи в этом плане — добавь отметку:

```
До:  | A1.1 | **Error boundaries** — ... |
После: | A1.1 | 🔄 `ARCH 2026-03-22` **Error boundaries** — ... |
```

Формат отметки: `🔄 РОЛЬ ДАТА`

Также обнови `STATUS.md` — добавь задачу как `- [ ] **ID** — описание (in_progress, РОЛЬ)`

**3. ПОСЛЕ ЗАВЕРШЕНИЯ ЗАДАЧИ:**
Отредактируй строку задачи в этом плане:

```
До:  | A1.1 | 🔄 `ARCH 2026-03-22` **Error boundaries** — ... |
После: | A1.1 | ✅ `ARCH 2026-03-22→03-22` **Error boundaries** — ... |
```

Формат отметки: `✅ РОЛЬ ДАТА_СТАРТ→ДАТА_ФИНИШ`

Также обнови `STATUS.md`:
- Пометь задачу: `- [x] **ID** — описание ✅ (дата, файлы)`
- Добавь строку в таблицу CHANGELOG: `| дата | РОЛЬ | ID | файлы | заметки |`

**4. ЕСЛИ БЛОКЕР:**
- Запиши в секцию BLOCKED в `STATUS.md`: `[РОЛЬ] ID: описание проблемы → кто может разблокировать`
- Верни задачу в статус "не взята" (убери 🔄, поставь 🚫):
```
| A1.1 | 🚫 `ARCH blocked: нужен X от FORMAT` **Error boundaries** — ... |
```

### Правила параллельной работы

1. **НЕ ТРОГАЙ чужие файлы** — см. таблицу зон выше
2. **Если нужен файл из чужой зоны** — запиши в BLOCKED, жди пока владелец сделает
3. **Перед коммитом** прогони тесты своей зоны:
   - ARCH: `npm run test:unit` (проверить что shared/ не сломан)
   - FORMAT: проверить формат в браузере вручную
   - QA: `npm run test:gate`
4. **Не бери больше 1 задачи одновременно** — сначала закончи текущую
5. **Задачи с зависимостями** берутся только после того, как зависимость отмечена ✅

### Порядок выдачи задач

Агенты берут задачи **сверху вниз по фазам**. Фаза 2 начинается только когда все MUST-задачи Фазы 1 завершены (A1.1-A1.3, Q1.1-Q1.2). QA-задачи с зависимостями от ARCH/FORMAT ждут завершения зависимости.

### Пример промпта для запуска агента

```
Роль: ARCH
Контекст:
- Проект: f:\2103\ФИНАЛ
- Координация: прочитай STATUS.md и план из этого файла
- Зона: shared/*, assets/js/main.js, index.html, sw.js, formats/kotc/* (архитектура)
- НЕ трогай файлы FORMAT (formats/*/UI) и QA (tests/*)
Задача: A1.1 — Error boundaries
Требования:
1) Отметь задачу 🔄 в плане и STATUS.md
2) Выполни задачу
3) Прогони: npm run test:unit
4) Отметь задачу ✅ в плане, STATUS.md + CHANGELOG
5) Дай отчёт: что сделано, файлы, результаты тестов
```

---

## Контекст

Предыдущий квартальный план полностью выполнен: Thai-формат production-ready (95%+), IPT стабилен, shared-слой из 9 модулей создан, CI/CD на GitHub Actions работает, release gate настроен. Однако при аудите выявлены серьёзные пробелы: KOTC — лишь iframe-обёртка над legacy-кодом (~6000 строк дублирования), нет error boundaries, CSP использует `unsafe-inline`, accessibility отсутствует, нет build system. Нужен сбалансированный план без привязки к срокам — приоритизированный backlog по фазам.

---

## ФАЗА 1: Стабилизация продакшена

**Цель:** Сделать приложение надёжным — не падает, не теряет данные, безопасно.

### ARCH

| ID | Задача | Файлы | Зависит от |
|----|--------|-------|------------|
| A1.1 | **Error boundaries** — глобальный `window.onerror` + `onunhandledrejection`, toast вместо белого экрана, лог последних 50 ошибок в localStorage | `assets/js/main.js`, новый `assets/js/ui/error-handler.js` | — |
| A1.2 | **Валидация состояния** — guard-функции в app-state (bounds check на scores[ci][mi][ri]), enforce лимита eventLog (450), sanitize ответов API | `assets/js/state/app-state.js`, `shared/players.js`, `shared/api.js` | — |
| A1.3 | **CSP fix** — убрать `unsafe-inline` из `index.html` (строка 7), вынести inline-скрипты (строки 43-50) в отдельный файл. Исправить auth fallback: `crypto.subtle` недоступен → блокировать, а не `return true` | `index.html`, `assets/js/ui/roster-auth.js` | — |
| A1.4 | **Retry + offline** — exponential retry (3 попытки) в `shared/api.js`, try/catch на все `localStorage.setItem` с QuotaExceededError toast, offline-баннер (`navigator.onLine`) | `shared/api.js`, `shared/utils.js`, `assets/js/main.js` | A1.1 |
| A1.5 | **State refactor (начало)** — обернуть 20+ глобалов из `app-state.js` в объект `AppState` с геттерами/сеттерами, адаптер через `globalThis.AppState` | `assets/js/state/app-state.js` | A1.2 |

### QA

| ID | Задача | Файлы | Зависит от |
|----|--------|-------|------------|
| Q1.1 | **Тесты error handling** — unit: onerror перехватывает; smoke: corrupted localStorage не роняет страницу | `tests/unit/error-handler.test.js`, `tests/smoke/` | A1.1, A1.4 |
| Q1.2 | **Тесты безопасности** — unit: без `crypto.subtle` доступ заблокирован; CSP парсинг HTML — нет `unsafe-inline` | `tests/unit/roster-auth.test.js` | A1.3 |
| Q1.3 | **Release gate v2** — добавить проверку CSP, localStorage error handling; обновить smoke для offline | `scripts/release-gate.mjs`, `tests/smoke/` | A1.3, A1.4 |
| Q1.4 | **Базовая a11y** — `aria-label` на score-кнопки (`shared/ui-kit.js`), интерактивные `div` → `button`, `aria-current="page"` на активный таб, keyboard-навигация Tab+Enter | `shared/ui-kit.js`, `assets/js/screens/components.js`, `assets/js/screens/core.js` | — |

### Контрольная точка
- Error handler ловит ошибки, показывает toast
- CSP без `unsafe-inline`, auth не пропускает без crypto
- API retry работает, quota мониторится
- Keyboard-навигация по табам работает
- Release gate v2 проходит

---

## ФАЗА 2: Миграция KOTC

**Цель:** Перевести KOTC с iframe-bridge на standalone формат (как Thai), устранить дублирование ~6000 строк.

### FORMAT

| ID | Задача | Файлы | Зависит от |
|----|--------|-------|------------|
| F2.0 | **Аудит legacy KOTC** — карта `web/public/kotc/assets/js/` (~6000 строк): что переиспользовать из shared/, что KOTC-специфичное (King stays, challenge, ротация) | `web/public/kotc/` (чтение) → документ миграции | — |

### ARCH

| ID | Задача | Файлы | Зависит от |
|----|--------|-------|------------|
| A2.1 | **KOTC math extraction** — вытащить бизнес-логику в `formats/kotc/kotc-format.js` (ES module, чистые функции) по паттерну `formats/thai/thai-format.js` | `formats/kotc/kotc-format.js` (новый) | F2.0 |
| A2.2 | **KOTC standalone page** — переписать `formats/kotc/kotc.html` с iframe на полноценную страницу, подключить shared/ модули, переписать `kotc.js` на shared-компоненты | `formats/kotc/kotc.html`, `formats/kotc/kotc.js`, `formats/kotc/kotc.css` | A2.1 |
| A2.3 | **KOTC в навигацию** — `buildKotcFormatUrl()` в `shared/format-links.js`, launcher в roster.js, карточки KOTC на home.js | `shared/format-links.js`, `assets/js/screens/roster.js`, `assets/js/screens/home.js` | A2.2 |
| A2.4 | **SW update** — добавить `formats/kotc/*` в CORE_ASSETS, инкрементировать CACHE_VERSION | `sw.js` | A2.2 |

### FORMAT

| ID | Задача | Файлы | Зависит от |
|----|--------|-------|------------|
| F2.1 | **KOTC UI экраны** — roster (4 на корт, ротация), courts (King stays, challenge), standings (рейтинг сессии) на shared/ui-kit | `formats/kotc/kotc.js`, `formats/kotc/kotc.css` | A2.1, A2.2 |

### QA

| ID | Задача | Файлы | Зависит от |
|----|--------|-------|------------|
| Q2.1 | **KOTC unit-тесты** — ротация, очки, определение победителя, edge cases | `tests/unit/kotc-format.test.js` | A2.1 |
| Q2.2 | **KOTC E2E** — создание сессии из хаба, полный цикл, навигация хаб↔KOTC | `tests/e2e/kotc-*.spec.ts` | A2.2, F2.1 |
| Q2.3 | **Regression** — все Thai E2E (6 spec) + IPT smoke + hub smoke проходят после KOTC-миграции | существующие тесты | A2.3 |

### Контрольная точка
- `formats/kotc/kotc-format.js` содержит чистые функции, unit-тесты зелёные
- KOTC запускается из хаба как standalone (не iframe)
- Legacy `web/public/kotc/` помечен deprecated
- Regression Thai/IPT зелёный

---

## ФАЗА 3: Инфраструктура и рефакторинг

**Цель:** Build system, разбить монолиты, экспорт данных.

### ARCH

| ID | Задача | Файлы | Зависит от |
|----|--------|-------|------------|
| A3.1 | **Vite build** — заменить `serve.mjs` + ручную загрузку 27 скриптов на Vite multi-page (index.html, thai.html, kotc.html). Минификация, tree-shaking. Обратная совместимость: classic scripts через rollup input | `vite.config.js` (новый), `package.json`, `assets/js/main.js` | Фаза 2 |
| A3.2 | **Разбить монолиты** — `core.js` (1135 строк) → `core-navigation.js` + `core-lifecycle.js` + `core-render.js`. `roster.js` (1194 строки) → `roster-list.js` + `roster-format-launcher.js` + `roster-edit.js` | `assets/js/screens/core.js`, `assets/js/screens/roster.js` | A3.1 |
| A3.3 | **Admin dashboard** — расширить `admin.html`: список активных турниров, быстрый запуск любого формата, архив завершённых | `admin.html`, `assets/js/screens/admin.js` (новый) | A3.1 |

### FORMAT

| ID | Задача | Файлы | Зависит от |
|----|--------|-------|------------|
| F3.1 | **Экспорт архива** — кнопка "Экспорт" на экране FINISHED: JSON (полное состояние) + CSV (standings для Excel). Общая функция `exportTournament()` в shared/ | `shared/utils.js`, `formats/thai/thai.html`, `formats/kotc/kotc.js` | — |

### QA

| ID | Задача | Файлы | Зависит от |
|----|--------|-------|------------|
| Q3.1 | **Build smoke** — Vite build не ломает тесты, SW кэширует правильные пути | `scripts/release-gate.mjs`, `tests/smoke/` | A3.1 |
| Q3.2 | **Stress-тест localStorage** — работа при ~4MB, экспорт/импорт без потери данных | `tests/unit/` | F3.1 |

### Контрольная точка
- `npm run build` генерирует рабочий бандл
- `core.js` и `roster.js` разбиты на модули
- Экспорт JSON/CSV работает
- Admin-скелет показывает список турниров

---

## ФАЗА 4: Платформенные возможности

**Цель:** i18n, real-time sync, продвинутая accessibility, рейтинговые множители.

### ARCH

| ID | Задача | Файлы | Зависит от |
|----|--------|-------|------------|
| A4.1 | **i18n** — `shared/i18n.js` (ru/en), извлечь hardcoded строки в `locales/ru.json` + `locales/en.json`. Начать с shared/ модулей и toast-сообщений | `shared/i18n.js` (новый), `locales/` (новая папка) | A3.1 |
| A4.2 | **Real-time sync** — расширить `shared/api.js` для Supabase realtime. Переработать `kotc-sync.js` (270 строк) в общий `shared/realtime.js`. Организатор вводит счёт → зрители видят за 1-2 сек | `shared/realtime.js` (новый), `shared/api.js` | A1.4 |
| A4.3 | **Рейтинговые множители** — `BASE_POINTS * FORMAT_MULTIPLIER` (x1.0 Thai, x0.8 KOTC и т.д.), фильтр по формату в `rating.html` | `rating.html`, `shared/ratings.js` (новый) | — |

### FORMAT

| ID | Задача | Файлы | Зависит от |
|----|--------|-------|------------|
| F4.1 | **Продвинутая a11y** — focus trap в модалах, auto-focus при открытии, стрелки для табов, `role="tablist/tab/tabpanel"` | `assets/js/screens/components.js`, `assets/js/screens/core.js`, `shared/ui-kit.js` | Q1.4 |

### QA

| ID | Задача | Файлы | Зависит от |
|----|--------|-------|------------|
| Q4.1 | **i18n тесты** — все ключи ru.json есть в en.json; smoke: переключение языка не ломает UI | `tests/unit/i18n.test.js` | A4.1 |
| Q4.2 | **Real-time integration** — два клиента синхронизируются; offline-клиент получает данные при reconnect | `tests/integration/` (новая папка) | A4.2 |
| Q4.3 | **Финальный аудит** — полный прогон всех тестов, обновление документации | `STATUS.md`, `PLATFORM_ROADMAP.md` | все задачи Ф4 |

### Контрольная точка
- Переключение ru/en работает
- Real-time sync между двумя клиентами
- Рейтинги с множителями по формату
- Все тесты зелёные

---

## Приоритеты (если время ограничено — отбрасываем снизу)

1. **MUST:** A1.1-A1.3 (error handling, CSP, auth fix) — без этого продакшен небезопасен
2. **MUST:** Фаза 2 целиком (KOTC миграция) — устранение ~6000 строк дублирования
3. **SHOULD:** A3.1 (Vite build) — 27 скриптов загружаются вручную
4. **SHOULD:** A3.2 (разбить монолиты) — core.js 1135 строк, roster.js 1194 строки
5. **SHOULD:** F3.1 (экспорт) — организаторам нужны отчёты
6. **COULD:** A4.1 (i18n) — переносится если не хватает времени
7. **COULD:** A4.2 (real-time) — offline-first и так работает
8. **COULD:** A4.3 (рейтинги) — можно добавить позже

---

## Риски

| Риск | Митигация |
|------|-----------|
| KOTC legacy (~6000 строк) сильно связан, трудно извлечь | F2.0 аудит первым; если буксует — оставить iframe и фокус на инфраструктуру |
| Vite ломает порядок загрузки 27 classic scripts | Vite для новых форматов, legacy bundle как fallback, миграция файл за файлом |
| localStorage переполнение на турнире (5MB) | A1.4 мониторинг quota в Фазе 1; архивация в API; LZ-string сжатие |
| Supabase downtime во время турнира | Offline-first (PWA), real-time — опциональный слой |
| Файловые конфликты ARCH/FORMAT/QA | Чёткие зоны в STATUS.md; конфликты через BLOCKED |

---

## Верификация

После каждой фазы прогонять:
```bash
npm run test:unit                              # vitest — unit тесты
npx playwright test tests/smoke.spec.ts        # hub regression
npx playwright test tests/e2e --reporter=list  # E2E все форматы
npm run test:gate                              # полный release gate
```

Для KOTC-миграции дополнительно: ручная проверка запуска KOTC из хаба, полный цикл в браузере.
