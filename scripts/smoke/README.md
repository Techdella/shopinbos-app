# Route smoke checks

Runs every app page (and key API routes) against a local Postgres as the right portal role, and fails on
5xx responses or rendered error boundaries. Supabase Auth is replaced by a tiny mock, so no real accounts
or network access are needed.

```bash
# 1. Local database with schema and seed data
export DATABASE_URL="postgresql://postgres@127.0.0.1:5433/shopinbos"
npx prisma db push
npm run db:seed

# 2. Build and start the app pointed at the mock auth server
export NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321" NEXT_PUBLIC_SUPABASE_ANON_KEY=smoke SUPABASE_SERVICE_ROLE_KEY=smoke
export SHOPINBOS_ADMIN_INVITE_EMAILS="admin@shopinbos.dev"
node scripts/smoke/mock-supabase-auth.mjs &
npm run build && npx next start -p 3100 &

# 3. Run the checks
SMOKE_BASE_URL=http://127.0.0.1:3100 node scripts/smoke/run-route-smoke.mjs
```

Mock users (token → role): `smoke-seller` (seeded demo store), `smoke-new-seller` (no store, for onboarding),
`smoke-supplier`, `smoke-logistics`, `smoke-admin`. Never point this at a production database: the app writes
to the database while pages render (for example auto-creating users).
