# Play Hub Integration Specification
## lpvolley.ru → play.lpvolley.ru (Subdomain Architecture)

**Status:** Production Ready
**Module:** lpvolley_auth_v11_final.dart
**Target:** Flutter Web (CanvasKit) on play.lpvolley.ru
**Date:** 2026-03-24

---

## 1. ARCHITECTURE DECISION (ADR)

### Problem
- Main site (lpvolley.ru) = SEO, static content (Next.js)
- Game hub = real-time, 60 FPS UI, animations, live stats
- Need unified codebase for iOS/Android/Web

### Solution
**Subdomain Split:**
- `lpvolley.ru` — Next.js (public info, calendar, rankings)
- `play.lpvolley.ru` — Flutter Web PWA (auth, game, live dashboard)

### Benefits
- SEO intact on main domain
- Flutter code reusable for mobile apps
- Separate deployment pipelines
- Shared authentication via cookies

---

## 2. AUTHENTICATION INTEGRATION

### Cookie-Based SSO

#### Setting Cookies (Flutter Side - Already Implemented)
```dart
html.document.cookie = 'auth_token=$token; '
    'Path=/; '
    'Domain=.lpvolley.ru; '  // Note the dot - applies to all subdomains
    'Secure; '
    'SameSite=Lax; '
    'Max-Age=2592000'; // 30 days
```

#### Reading Cookies (Backend/Next.js Side)
```javascript
// In Next.js middleware or getServerSideProps
const authToken = req.cookies['auth_token'];
if (authToken) {
  // Verify token and attach user to context
}
```

#### Cookie Requirements
| Property | Value | Why |
|---|---|---|
| Domain | `.lpvolley.ru` | Shared across all subdomains |
| Secure | true | HTTPS only |
| SameSite | Lax | CSRF protection while allowing top-level navigation |
| Max-Age | 2592000 | 30 days |
| HttpOnly | false* | Flutter Web needs JS access |

*Note: Set `HttpOnly` only on cookies issued by backend. Flutter-set cookies are accessible to JS.

---

## 3. DEEP LINKING (return_url)

### URL Pattern
```
https://play.lpvolley.ru/auth?return_url=/calendar/tournament/123
```

### Implementation (Already in v11)
```dart
/// Extract return_url from query params
static String? _getReturnUrlFromQuery() {
  final uri = Uri.base;
  return uri.queryParameters['return_url'];
}

/// After successful login, redirect to return_url
WidgetsBinding.instance.addPostFrameCallback((_) {
  final returnUrl = next.returnUrl ?? '/';
  html.window.location.href = returnUrl;
});
```

### Links from Main Site
```html
<!-- In lpvolley.ru/calendar -->
<a href="https://play.lpvolley.ru/auth?return_url=https://lpvolley.ru/calendar">
  Войти
</a>
```

---

## 4. API ENDPOINTS (Backend Must Implement)

### Authentication Endpoints

#### POST /api/v1/auth/login
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (200):**
```json
{
  "token": "eyJhbGc...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "Иван Петров"
  }
}
```

#### POST /api/v1/auth/register
```json
{
  "name": "Иван Петров",
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (201):** Same as login

#### POST /api/v1/auth/vk
VK OAuth callback handler.

**Response:** Same as login

#### POST /api/v1/auth/reset-password
```json
{
  "email": "user@example.com"
}
```

**Response (200):**
```json
{
  "message": "Reset link sent to email"
}
```

### Player Data Endpoint

#### GET /api/v1/players/me
Requires valid `auth_token` cookie.

**Response (200):**
```json
{
  "id": "uuid",
  "name": "Иван Петров",
  "avatar_url": "https://...",
  "elo": 1650,
  "win_rate": 0.62,
  "streak": 5,
  "achievements": [
    { "id": "win_10", "name": "10 побед подряд" }
  ]
}
```

---

## 5. CORS CONFIGURATION

### Nginx Config (for play.lpvolley.ru)

```nginx
# /etc/nginx/sites-available/play.lpvolley.ru

upstream flutter_web {
  server localhost:8080;  # Flutter Web dev server or static files
}

server {
  listen 443 ssl http2;
  server_name play.lpvolley.ru;

  ssl_certificate /etc/letsencrypt/live/lpvolley.ru/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/lpvolley.ru/privkey.pem;

  # CanvasKit requires these headers
  add_header Cross-Origin-Opener-Policy "same-origin";
  add_header Cross-Origin-Embedder-Policy "require-corp";

  # CORS for API calls to lpvolley.ru
  location /api {
    proxy_pass https://lpvolley.ru;
    proxy_set_header Host lpvolley.ru;
    proxy_set_header Origin https://play.lpvolley.ru;
    proxy_set_header Cookie $http_cookie;  # Forward auth_token
  }

  # Static Flutter Web files
  location / {
    proxy_pass http://flutter_web;
    proxy_set_header Host $host;
    proxy_set_header Connection "upgrade";
    proxy_http_version 1.1;
  }
}
```

### Backend CORS Headers (Next.js)

```javascript
// web/app/api/v1/auth/login/route.ts

export async function POST(req: Request) {
  const res = new Response(JSON.stringify(data), { status: 200 });

  res.headers.set(
    'Access-Control-Allow-Origin',
    'https://play.lpvolley.ru'
  );
  res.headers.set(
    'Access-Control-Allow-Credentials',
    'true'
  );
  res.headers.set(
    'Access-Control-Allow-Methods',
    'POST, GET, OPTIONS'
  );

  return res;
}
```

---

## 6. DEPLOYMENT CHECKLIST

### Prerequisites
- [ ] Flutter SDK 3.27+ installed
- [ ] CanvasKit renderer available
- [ ] Nginx reverse proxy configured
- [ ] SSL certificate for `play.lpvolley.ru` (wildcard or subdomain)
- [ ] PostgreSQL accessible to backend
- [ ] API endpoints implemented (section 4)

### Build & Deploy Steps

#### 1. Build Flutter Web
```bash
cd apps/play-lpvolley  # or separate Flutter repo
flutter pub get
flutter build web \
  --web-renderer canvaskit \
  --release \
  --source-maps
```

**Output:** `build/web/` directory

#### 2. Deploy to Server
```bash
ssh deployer@lpvolley.ru
cd /var/www/play.lpvolley.ru/html

# Backup current
sudo mv . ../backup_$(date +%s)

# Upload new build
scp -r build/web/* deployer@lpvolley.ru:/var/www/play.lpvolley.ru/html/
```

#### 3. Verify PWA Manifest
```bash
curl https://play.lpvolley.ru/manifest.json
# Should return valid JSON with icons, name, etc.
```

#### 4. Check Service Worker
```bash
curl https://play.lpvolley.ru/service_worker.js
# Should return JavaScript file with SW code
```

#### 5. Nginx Reload
```bash
sudo systemctl reload nginx
# or
sudo nginx -t && sudo systemctl reload nginx
```

#### 6. Verify CanvasKit
```bash
curl https://play.lpvolley.ru
# Check for: <script src="main.dart.js"></script>
# And CanvasKit WASM files loaded
```

---

## 7. CRITICAL CHECKS (STOP FACTORS)

### ❌ DO NOT
1. **Use HTML Renderer**
   Blur/Glassmorphism will be broken on mobile. Only `--web-renderer canvaskit`

2. **Remove autoDispose**
   Without it, browser tab will consume memory indefinitely
   ```dart
   // WRONG:
   final authProvider = NotifierProvider<AuthNotifier, AuthState>(...);

   // RIGHT:
   final authProvider = NotifierProvider.autoDispose<AuthNotifier, AuthState>(...);
   ```

3. **Switch to StateNotifier**
   Riverpod 2.0 uses `Notifier` / `AutoDisposeNotifier` for modern style
   ```dart
   // WRONG:
   class AuthNotifier extends StateNotifier<AuthState> { ... }

   // RIGHT:
   class AuthNotifier extends AutoDisposeNotifier<AuthState> { ... }
   ```

4. **Replace withValues with withOpacity**
   `withOpacity` is deprecated in Flutter 3.27+
   ```dart
   // WRONG:
   Colors.white.withOpacity(0.05)

   // RIGHT:
   Colors.white.withValues(alpha: 0.05)
   ```

5. **Skip dispose() for TextEditingController**
   Memory leak in browser. Every field needs cleanup:
   ```dart
   @override
   void dispose() {
     _emailCtrl.dispose();    // ✅ Required
     _passCtrl.dispose();     // ✅ Required
     _nameCtrl.dispose();     // ✅ Required
     _resetCtrl.dispose();    // ✅ In bottom sheet
     super.dispose();
   }
   ```

6. **Use http.Client without proper headers**
   Must include `Authorization: Bearer $token` or rely on cookies
   ```dart
   // WRONG:
   final response = await http.get(Uri.parse('/api/v1/players/me'));

   // RIGHT:
   final response = await http.get(
     Uri.parse('https://lpvolley.ru/api/v1/players/me'),
     headers: {'Cookie': 'auth_token=$token'},
   );
   ```

---

## 8. MONITORING & LOGS

### Check Service Status
```bash
# Check if Flutter Web is serving
curl -I https://play.lpvolley.ru
# Expected: 200 OK

# Check if auth endpoints are accessible
curl -X POST https://lpvolley.ru/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test"}'
```

### Browser Console Errors
If "Application error" appears:
1. Open DevTools (F12)
2. Check Console tab for JavaScript errors
3. Check Network tab for 401/403 on API calls
4. Verify auth_token cookie is set and sent

### Nginx Logs
```bash
sudo tail -f /var/log/nginx/play.lpvolley.ru_access.log
sudo tail -f /var/log/nginx/play.lpvolley.ru_error.log
```

---

## 9. ROLLBACK PROCEDURE

If deployment breaks:
```bash
ssh deployer@lpvolley.ru
sudo rm -rf /var/www/play.lpvolley.ru/html/*
sudo mv /var/www/play.lpvolley.ru/backup_* /var/www/play.lpvolley.ru/html
sudo systemctl reload nginx
```

---

## Summary

| Component | Responsibility |
|---|---|
| **lpvolley_auth_v11_final.dart** | Frontend (Flutter) - Ready to deploy |
| **API Endpoints** | Backend team - Must implement section 4 |
| **Nginx Config** | DevOps - Must configure section 5 |
| **Database** | Backend - Ensure `/api/v1/players/me` returns user data |
| **Deployment** | DevOps - Follow section 6 checklist |

**This module is production-ready. No refactoring needed.**
