# AGENTS.md — Задачи для 3 агентов

Документ описывает разбивку работ по проекту **Beach Volleyball Calendar** на 3 агента для параллельной сборки.

---

## Общая архитектура

```
Vite 6 + React 19 + TypeScript
Tailwind CSS v4
Zustand + persist
React Router v7
Framer Motion 12
```

Маршруты: `/` · `/create` · `/profile` · `/tournament/:id`

---

## Agent 1 — CONFIG (инфраструктура)

**Зона ответственности:** конфигурационные файлы и базовые источники без бизнес-логики.

### Файлы

| Файл | Описание |
|------|----------|
| `package.json` | Зависимости: vite, react, react-dom, react-router-dom, zustand, framer-motion, tailwindcss, @tailwindcss/vite, @vitejs/plugin-react |
| `vite.config.ts` | `@vitejs/plugin-react` + `@tailwindcss/vite` |
| `tsconfig.json` | Ссылка на `tsconfig.app.json` |
| `tsconfig.app.json` | strict, jsx: react-jsx, moduleResolution: bundler |
| `index.html` | `<div id="root">` + `<script src="/src/main.tsx">` |
| `src/main.tsx` | `createRoot` + `RouterProvider` |
| `src/index.css` | `@import "tailwindcss"` + глобальные стили body |
| `src/types.ts` | Интерфейс `Tournament`, типы `Category`, `EntryType` |

### Зависимости от других агентов
Нет. Запускается первым.

### Готовность к запуску
Когда Agent 1 закончит — проект компилируется без ошибок (страницы-заглушки допустимы).

---

## Agent 2 — STORE + PAGES

**Зона ответственности:** состояние приложения и страницы (бизнес-логика).

> Ждёт `src/types.ts` от Agent 1.

### Файлы

| Файл | Описание |
|------|----------|
| `src/store/tournaments.ts` | Zustand store + persist. Содержит: `tournaments[]`, `currentUser`, `filters`, `setFilters`, `getById`, `joinTournament`, `leaveTournament`, `addTournament` |
| `src/pages/Calendar.tsx` | Шапка + переключатель Ближайшие/Архив + 2 ряда FilterChips + grid + empty state. Использует `useMemo` для фильтрации |
| `src/pages/Tournament.tsx` | Детальная страница. `AnimatePresence` на списке участников. Кнопки «Записаться» / «Отменить». Share via `navigator.share` / clipboard |
| `src/pages/CreateTournament.tsx` | Форма создания: format, category, entryType, level, date, time, price, totalSlots. Вызывает `addTournament`, редиректит на `/` |
| `src/pages/Profile.tsx` | Фильтрует `tournaments` по `currentUser` в `players[]`, отображает через `TournamentCard` |

### Начальные данные стора
```ts
tournaments: [
  { id: 't_101', category: 'mix', entryType: 'individual', format: 'King of the Court',
    level: 'Medium', startTs: 1743174000000, price: 1500,
    slots: { taken: 8, total: 12 }, status: 'upcoming', players: ['Анна С.', 'Олег М.'] },
  { id: 't_102', category: 'men', entryType: 'team', format: 'Double Elimination',
    level: 'Pro', startTs: Date.now() + 7200000, price: 2000,
    slots: { taken: 11, total: 12 }, status: 'upcoming', players: [] },
  { id: 't_100', category: 'women', entryType: 'individual', format: 'Олимпийка',
    level: 'Beginner', startTs: Date.now() - 86400000 * 10, price: 800,
    slots: { taken: 16, total: 16 }, status: 'past', players: [] },
]
```

### Зависимости от других агентов
- `src/types.ts` (Agent 1) — нужен до начала работы
- `src/components/TournamentCard.tsx` (Agent 3) — нужен для Profile.tsx и Calendar.tsx

---

## Agent 3 — COMPONENTS + APP SHELL

**Зона ответственности:** переиспользуемые компоненты и главный лейаут.

> Ждёт `src/types.ts` (Agent 1) и `src/store/tournaments.ts` (Agent 2).

### Файлы

| Файл | Описание |
|------|----------|
| `src/components/FilterChips.tsx` | Props: `options: {label, value}[]`, `value: string`, `onChange: (v) => void`. Активный чип: `bg-white text-zinc-900`. `whileTap={{ scale: 0.93 }}` |
| `src/components/TournamentCard.tsx` | Цветная полоса слева (mix=purple, men=blue, women=pink). Прогресс-бар. Badges (level, category, entryType, price). Кнопка «Перейти →» + «📤». `whileTap={{ scale: 0.97 }}` |
| `src/App.tsx` | `<Outlet />` + нижняя навигация: `[📅 Календарь]` · `[+]` (FloatingActionButton) · `[👤 Профиль]`. NavLink active → `text-emerald-400`. FAB позиционируется через `absolute left-1/2 -translate-x-1/2 -top-6` |
| `src/router.tsx` | `createBrowserRouter`: `/` → Calendar, `/create` → CreateTournament, `/profile` → Profile, `/tournament/:id` → TournamentPage |

### Цвета категорий

| Категория | Tailwind класс |
|-----------|---------------|
| mix       | `bg-purple-500` |
| men       | `bg-blue-500` |
| women     | `bg-pink-500` |

### Зависимости от других агентов
- `src/types.ts` (Agent 1)
- `src/store/tournaments.ts` (Agent 2)
- Все страницы (Agent 2) — нужны для `router.tsx`

---

## Порядок слияния

```
Agent 1 → Agent 2 (параллельно с Agent 3) → Agent 3 (router + App)
```

1. Agent 1 завершает конфиг и types
2. Agent 2 и Agent 3 работают параллельно над своими файлами
3. Agent 3 финализирует `router.tsx` и `App.tsx` последним (импортирует страницы Agent 2)

---

## Проверка после сборки

```bash
cd apps/volleyball-calendar
npm install
npm run dev
```

Чеклист:
- [ ] Стартует без ошибок TS на `localhost:5173`
- [ ] Отображаются 2 карточки «Ближайшие» и 1 в «Архив»
- [ ] Фильтры меняют список, состояние сохраняется после reload
- [ ] Клик на карточку → страница турнира
- [ ] Кнопка «Записаться» добавляет участника в список
- [ ] Кнопка «Отменить» удаляет себя из списка
- [ ] Страница «Профиль» показывает только мои турниры
- [ ] Страница «Создать» → форма → турнир появляется в календаре
- [ ] `/tournament/unknown` → экран «Турнир не найден» с кнопкой «← В календарь»
- [ ] Кнопка «📤 Поделиться» копирует ссылку
