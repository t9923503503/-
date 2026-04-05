# Admin Security Notes

## 1) DB schema policy

`admin_audit_log` is created only via migration:

- `web/db/migrations/20260321_admin_audit_log.sql`

The application runtime must not execute DDL (`CREATE TABLE`, `ALTER TABLE`) in production.

## 1.1) RLS and admin mutations (DELETE/UPDATE/INSERT)

The app talks to Postgres directly via `DATABASE_URL`. If Row Level Security (RLS) is enabled on tables, the DB role used
by `DATABASE_URL` must be able to mutate rows (or admin DELETE/UPDATE will silently affect `0` rows and the API may return
`404`/`403`).

For a private, server-only DB role you can simply bypass RLS (use the username from `DATABASE_URL`):

```sql
ALTER ROLE <app_db_user> BYPASSRLS;
```

Alternative: create explicit RLS policies for the role instead of `BYPASSRLS`.

## 2) Session and identity model

Admin session uses signed cookie `admin_session` with payload:

- `id` (actor identity)
- `role` (`admin` / `operator` / `viewer`)
- `exp` (expiration)

Cookie flags:

- `HttpOnly=true`
- `SameSite=Strict`
- `Secure=true` in production

## 3) Required environment variables

Use actor-based credentials in production:

- `ADMIN_SESSION_SECRET` (required in production)
- `ADMIN_CREDENTIALS_JSON` (recommended/expected in production)

Example:

```json
[
  { "id": "ops-admin-1", "role": "admin", "pin": "1234" },
  { "id": "ops-operator-1", "role": "operator", "pin": "5678" },
  { "id": "ops-viewer-1", "role": "viewer", "pin": "9012" }
]
```

Legacy fallback PINs are disabled in production by default.
To explicitly enable them (not recommended), set:

- `ADMIN_ALLOW_LEGACY_PIN=true`

## 4) API security

Every `web/app/api/admin/*` route validates RBAC via `requireApiRole`, regardless of middleware guards.

For destructive actions (delete/override), `reason` is required and logged in `admin_audit_log`.
