# Деплой lpvolley.ru — инструкция для ИИ-агентов

## Стек
- **Сервер:** `157.22.173.248`, пользователь `root`
- **SSH-ключ:** `~/.ssh/id_ed25519` (уже в known_hosts)
- **Код на сервере:** `/var/www/ipt/`
- **Next.js:** `/var/www/ipt/web/`
- **Systemd-сервис:** `kotc-web.service`
- **Домен:** `https://lpvolley.ru`

---

## Полный цикл: коммит → деплой

### 1. Коммит (локально, только нужные файлы)

```bash
git add <конкретные файлы>   # НЕ git add -A
git commit -m "fix: описание"
git push origin main
```

### 2. Pull на сервере

```bash
ssh root@157.22.173.248 "cd /var/www/ipt && git pull origin main"
```

### 3. Сборка Next.js (только если менялись файлы в `web/`)

```bash
ssh root@157.22.173.248 "cd /var/www/ipt/web && npm run build"
```

Сборка занимает ~60–90 секунд. Убедись, что завершилась без ошибок.

### 4. Обновление статики и рестарт

```bash
ssh root@157.22.173.248 "
  cp -r /var/www/ipt/web/.next/static /var/www/ipt/web/.next/standalone/web/.next/static &&
  cp -r /var/www/ipt/web/public /var/www/ipt/web/.next/standalone/web/public &&
  systemctl restart kotc-web &&
  sleep 2 &&
  systemctl is-active kotc-web
"
```

Ожидаемый вывод: `active`

### 5. Проверка

```bash
curl -s -o /dev/null -w "%{http_code}" https://lpvolley.ru/calendar
# Ожидается: 200
```

---

## Когда НЕ нужна пересборка

Если изменения только в файлах **вне `web/`** (например, SPA в `assets/`, `formats/`, `index.html`):

```bash
# Достаточно git pull — Next.js эти файлы не затрагивает
ssh root@157.22.173.248 "cd /var/www/ipt && git pull origin main"
```

nginx раздаёт статику SPA напрямую из `/var/www/ipt/`, перезапуск не нужен.

---

## Когда НЕ нужен рестарт сервиса

| Изменение | Нужна сборка? | Нужен рестарт? |
|---|---|---|
| `web/app/**`, `web/lib/**`, `web/components/**` | ✅ да | ✅ да |
| `web/public/**` (статика) | ❌ нет | ❌ нет (cp достаточно) |
| `assets/`, `formats/`, `index.html` и др. SPA | ❌ нет | ❌ нет |
| `migrations/**` | ❌ нет | ❌ нет (применить вручную) |

---

## Диагностика

```bash
# Статус сервиса
ssh root@157.22.173.248 "systemctl status kotc-web --no-pager -l"

# Последние логи
ssh root@157.22.173.248 "journalctl -u kotc-web -n 50 --no-pager"

# Перезапустить nginx (если нужно)
ssh root@157.22.173.248 "systemctl reload nginx"
```

---

## Важно

- **Никогда не коммить** `.env`, `*.local`, секреты, `lpvolley_auth_v2.dart` и прочее, не относящееся к проекту.
- **Всегда указывай конкретные файлы** в `git add`, не используй `git add -A`.
- **Проверяй HTTP 200** после деплоя через `curl`.
