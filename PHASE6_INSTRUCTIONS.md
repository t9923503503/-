# Инструкции для ИИ-агентов: Фазы 6–8

> **Перед началом работы:** прочитай `STATUS.md`, `PHASE6_PLAN.md`, этот файл.
> **Не начинай задачу**, пока зависимость не отмечена ✅.

---

## Роли

| Роль | Агент | Зона файлов |
|------|-------|-------------|
| **ARCH** | ИИ-1 | `shared/*`, `assets/js/main.js`, `assets/js/integrations*`, `assets/js/runtime.js`, `assets/js/ui/kotc-sync.js`, `admin.html`, `admin-init.js`, `index.html`, `sw.js`, `config.js`, `migrations/*` |
| **FORMAT** | ИИ-2 | `formats/kotc/*`, `formats/thai/*`, `assets/js/screens/*`, `assets/js/ui/*` (кроме kotc-sync.js), `rating.html` |

---

## ИИ-1 (ARCH) — Инструкция

### Контекст
Ты — архитектор. Работаешь с серверной логикой (SQL/RPC), shared-модулями, точкой входа (main.js), синхронизацией (integrations.js, realtime.js), админ-панелью и безопасностью (CSP, хранилище секретов).

### Фаза 6 — Твои задачи (делай ПЕРВЫМИ)

**S6.1 — Вынести inline `<script>` из admin.html**
1. Прочитай `admin.html` — найди inline `<script>` блок (~400 строк, строка 173+)
2. Создай файл `admin-init.js` — перенеси весь код IIFE 1:1
3. В `admin.html` замени `<script>...</script>` на `<script src="admin-init.js"></script>`
4. Проверь что в admin.html НЕ осталось inline JS (ни `<script>` без src, ни onclick=)

**S6.4 — Убрать `'unsafe-inline'` из CSP** (после S6.1 + FORMAT сделает S6.2, S6.3)
1. В `index.html` строка 7: убрать `'unsafe-inline'` из `script-src`
2. `style-src 'unsafe-inline'` — ОСТАВИТЬ (inline стили через JS неизбежны)
3. Если в `formats/kotc/kotc.html` или `formats/thai/thai.html` есть свой CSP — обновить тоже

**S6.5 — roomSecret → sessionStorage**
1. В `assets/js/integrations.js` найти ВСЕ обращения к `localStorage` с ключом `kotc3_sb_config`
2. Заменить `localStorage` → `sessionStorage` для ЭТОГО ключа
3. Ключ `kotc3_org_secret` в `shared/auth.js` — тоже → `sessionStorage`
4. НЕ трогать `kotc3_state`, `kotc3_playerdb`, `kotc3_tournaments` — они остаются в localStorage

**S6.6 — SW cache v60**
1. В `sw.js` обновить версию кэша: `v59` → `v60`
2. Добавить в CORE_ASSETS: `admin-init.js`
3. FORMAT добавит `formats/thai/thai-boot.js` — когда он закончит, добавь и его

### Фаза 7 — Твои задачи

**S7.1 — SQL: judge_sessions**
Создай `migrations/007_judge_sessions.sql`:
```sql
CREATE TABLE judge_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id TEXT NOT NULL,
  court_index   INT NOT NULL CHECK (court_index BETWEEN 0 AND 3),
  judge_name    TEXT DEFAULT '',
  token         TEXT NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  created_at    TIMESTAMPTZ DEFAULT now(),
  expires_at    TIMESTAMPTZ DEFAULT now() + interval '24 hours',
  UNIQUE(tournament_id, court_index)
);

ALTER TABLE judge_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE judge_sessions FROM PUBLIC, anon, authenticated;

-- Админ создаёт сессию
CREATE OR REPLACE FUNCTION create_judge_session(p_trn_id TEXT, p_court INT, p_name TEXT DEFAULT '')
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_row judge_sessions%ROWTYPE;
BEGIN
  INSERT INTO judge_sessions (tournament_id, court_index, judge_name)
  VALUES (p_trn_id, p_court, coalesce(p_name, ''))
  ON CONFLICT (tournament_id, court_index) DO UPDATE
     SET judge_name = EXCLUDED.judge_name,
         token = encode(gen_random_bytes(24), 'hex'),
         expires_at = now() + interval '24 hours'
  RETURNING * INTO v_row;
  RETURN jsonb_build_object('ok', true, 'token', v_row.token, 'court', v_row.court_index, 'expires_at', v_row.expires_at);
END; $$;

-- Судья валидирует токен
CREATE OR REPLACE FUNCTION validate_judge_token(p_token TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_row judge_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM judge_sessions WHERE token = p_token AND expires_at > now();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_TOKEN');
  END IF;
  RETURN jsonb_build_object('ok', true, 'tournament_id', v_row.tournament_id, 'court_index', v_row.court_index, 'judge_name', v_row.judge_name);
END; $$;

GRANT EXECUTE ON FUNCTION create_judge_session(TEXT, INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION validate_judge_token(TEXT) TO anon, authenticated;
```

**S7.2 — Админ-панель: запуск турнира с судьями**
В `admin-init.js` добавить новую вкладку/секцию «Запуск турнира»:
- Выбор формата (KOTC / Thai / IPT)
- 4 поля «Судья корт N» (имя, необязательно)
- Кнопка «Создать и выдать ссылки» → вызывает `create_judge_session` × 4
- Показывает 4 ссылки формата: `{baseUrl}/index.html?trnId={id}&court={0-3}&token={token}`
- Кнопка «Копировать все» и кнопки «Копировать» рядом с каждой ссылкой

**S7.4 — Парсинг URL-параметров в main.js**
В `assets/js/main.js` после загрузки shared-модулей:
```javascript
const _params = new URLSearchParams(location.search);
globalThis.judgeMode = Object.freeze({
  active:  !!_params.get('trnId') && _params.get('court') !== null,
  trnId:   _params.get('trnId') || '',
  court:   parseInt(_params.get('court'), 10) || 0,
  token:   _params.get('token') || '',
});
```

**S7.6 — Broadcast с courtId**
В `assets/js/integrations.js` и `assets/js/ui/kotc-sync.js`:
- При отправке `score_update` добавить поле `courtId`
- При получении `score_update`:
  - Если `courtId === myCourtId` — игнорировать (эхо от себя)
  - Иначе — применить (обновление от другого судьи)
- `scoreTs[courtId]` уже есть — использовать для LWW

**S7.7 — Обзорный экран админа**
В `admin-init.js` добавить вкладку «Live» (или секцию внутри «Турниры»):
- Подключается к broadcast-каналу турнира (read-only)
- Показывает 4 карточки (по корту): текущий счёт, раунд, последнее обновление
- Обновляется в реальном времени

**S7.8 — Reconnect snapshot**
В `shared/realtime.js` уже есть `_reconnected` event и `request_snapshot`.
Доработать: при reconnect судья запрашивает state ВСЕХ кортов (не только своего).

### Фаза 8 — Твои задачи

**S8.1–S8.3 — SQL: tournament_results + rating_history + finalize_tournament**
См. `PHASE6_PLAN.md` секция «Детали по ключевым шагам → S8.3».

**S8.4–S8.5 — Player sync**
В `shared/players.js`:
- `syncPlayers()` — pull from server, merge (server wins), push local-only
- Вызывается при загрузке SPA если есть сеть
- При оффлайне — работаем с localStorage как раньше

**S8.9 — Админ: вкладка «Рейтинг»**
Показать `rating_history` с фильтрами: по игроку, по дате, по турниру. С пагинацией.

---

## ИИ-2 (FORMAT) — Инструкция

### Контекст
Ты — разработчик форматов и UI. Работаешь с экранами форматов (KOTC, Thai), UI-компонентами, рендерингом кортов и страницами рейтинга/профиля.

### Фаза 6 — Твои задачи (делай ПЕРВЫМИ)

**S6.2 — Вынести inline `<script type="module">` из thai.html**
1. Прочитай `formats/thai/thai.html` — найди inline `<script type="module">` (строка 304+)
2. Создай `formats/thai/thai-boot.js` — перенеси весь код
3. В `thai.html` замени на `<script type="module" src="thai-boot.js"></script>`
4. Проверь что все import пути корректны (относительные от thai-boot.js)

**S6.3 — Убрать inline onclick из kotc.html и thai.html**
1. `formats/kotc/kotc.html` строка ~20: `<button onclick="history.length>1?...">← Хаб</button>`
   - Убрать onclick
   - Добавить `id="fmt-nav-back"`
   - В `formats/kotc/kotc.js` добавить addEventListener
2. `formats/thai/thai.html` — несколько onclick:
   - Строка ~226: кнопка «← Хаб» → аналогично kotc
   - Строка ~260: `onclick="thaiStartSession()"` → addEventListener в thai-boot.js
   - Строка ~276: `onclick="window._thaiToggleScoreView()"` → addEventListener
   - Динамические onclick в JS-шаблонах (строки 434, 582+) — эти onclick генерируются JavaScript'ом, их НЕ НУЖНО трогать (CSP `unsafe-inline` не блокирует программно созданные элементы с onclick, только те что в HTML-разметке). ВАЖНО: убирать нужно только onclick из СТАТИЧЕСКОГО HTML.

### Фаза 7 — Твои задачи

**S7.5 — Court-lock UI**
В `assets/js/screens/core-render.js` и `assets/js/screens/components.js`:
1. Проверяй `globalThis.judgeMode` перед рендером кнопок +/−
2. Если `judgeMode.active && courtIndex !== judgeMode.court`:
   - Кнопки ввода счёта → `disabled`
   - Добавить CSS-класс `court-locked` для визуального отличия (затемнение)
   - Показать бейдж «Корт судьи {N}» на активном корте
3. Навигация: если `judgeMode.active`, автоматически открывать вкладку своего корта

**S7.5 дополнение — Индикатор «кто судит»**
На каждом корте показать маленький бейдж: `👤 Судья: {имя}` (из URL или из broadcast).

### Фаза 8 — Твои задачи

**S8.6 — Экран завершения: кнопка «Финализировать»**
В `assets/js/screens/core-lifecycle.js`:
1. Когда статус турнира = FINISHED, показать кнопку «Отправить результаты на сервер»
2. Собрать результаты: `[{ player_id, placement, points }]`
3. Вызвать `globalThis.sharedApi.apiPost('/rpc/finalize_tournament', { p_tournament_id, p_results })`
4. Показать toast: «Результаты сохранены, рейтинги обновлены»
5. Кнопка доступна только при наличии сети

**S8.7 — KOTC финализация**
В `formats/kotc/kotc.js`:
- При переходе в фазу FINISHED: собрать standings → преобразовать в формат `[{player_id, placement, points}]`
- Предложить «Финализировать на сервере» (аналогично S8.6)

**S8.8 — Thai финализация**
В `formats/thai/thai.js`: аналогично S8.7.

**S8.10 — rating.html: история рейтинга**
Добавить в rating.html:
- Табы: «Текущий рейтинг» (уже есть) + «История»
- Таблица истории: дата, турнир, игрок, дельта, новый рейтинг
- API: `GET /rating_history?order=recorded_at.desc&limit=50`

---

## Правила координации

1. **Не трогай чужие файлы** — см. таблицу зон
2. **Фаза 6 → Фаза 7 → Фаза 8** — строгий порядок
3. Внутри фазы — зависимости указаны в `PHASE6_PLAN.md`
4. После завершения задачи:
   - Отметь в `STATUS.md`: `- [x] **S6.X** — описание ✅ (дата, файлы)`
   - Отметь в `PHASE6_PLAN.md`: добавь ✅ в строку задачи
5. Если блокер — пиши в `STATUS.md` секцию BLOCKED
6. Перед коммитом: `npm run test:unit`

---

## Порядок задач (рекомендуемый)

### ИИ-1 (ARCH)
```
S6.1 → S6.5 → [ждём FORMAT S6.2+S6.3] → S6.4 → S6.6
  → S7.1 → S7.4 → S7.2 → S7.3 → S7.6 → S7.7 → S7.8
  → S8.1 → S8.2 → S8.3 → S8.4 → S8.5 → S8.9
```

### ИИ-2 (FORMAT)
```
S6.2 → S6.3
  → S7.5
  → S8.6 → S8.7 → S8.8 → S8.10
```

QA-задачи (S6.7, S7.9, S8.11) — берёт любой после завершения зависимостей.
