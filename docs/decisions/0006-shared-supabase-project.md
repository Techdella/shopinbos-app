# 0006 — Reuse the existing Supabase project, in a separate `shopinbos` schema

- Status: accepted (owner chose the existing project `zdnwdkykcqaarlpwqjow`, 2026-10-10)
- Date: 2026-10-10

## Context

The spec asks for a new Supabase project. The owner wants to keep the existing one. Its `public`
schema holds the legacy app's 53 live tables, including `"User"` and `"Store"`, which the new schema also defines.
Applying the new migrations to `public` would fail, or break the legacy app.

## Decision

- All new tables, enums and RLS helper functions live in a Postgres schema named **`shopinbos`**
  (`schemas = ["shopinbos"]` and `@@schema("shopinbos")` in Prisma).
- Migrations never reference `public`. A unit test fails the build if one does, or if a migration drops anything.
- `DIRECT_URL` carries `?schema=shopinbos`, so Prisma's `_prisma_migrations` table also lives there.
- Storage buckets are prefixed `sb-` (`sb-public-store`, `sb-private`, `sb-ai-generated`, `sb-imports`), and
  storage policies are created only if missing. Nothing that exists is changed or dropped.
- `shopinbos` isn't in Supabase's exposed API schemas, so PostgREST can't reach it. All reads go through our server.
  Realtime and mobile direct reads (later phases) are protected by RLS, and `anon` has no access.
- Supabase Auth (`auth.users`) is shared. A legacy user who signs in gets a fresh `shopinbos."User"` row,
  linked by `supabaseId`. **No legacy data is migrated** (SPEC: reference only).

## Consequences

- Rehearsed locally: legacy schema loaded, then migrations, drift check and seed applied. The 53 legacy tables were
  unchanged and `public._prisma_migrations` was never created.
- Auth settings are shared with the legacy app: enabling phone sign-in and the Send SMS hook doesn't affect email logins,
  but changing the email template from link to code would. Do that only once the legacy app no longer sends magic links.
- When the legacy app is retired, its `public` tables can be dropped (owner decision; take a backup first).
