# 0003 — Clients sign in through `/api/auth/otp/*`, not Supabase directly

- Status: accepted
- Date: 2026-10-10

Web and mobile call `POST /api/auth/otp/start` and `POST /api/auth/otp/verify` instead of calling
Supabase Auth from the client. The server applies the spec's limits: 5 code requests per phone per minute,
lock for 15 minutes after 5 wrong codes, and the same answer whether or not an account exists (SPEC 8.1, 14).
Verify sets the web session cookie and returns tokens. The Expo apps hand those tokens to supabase-js,
which stores them in the keychain/keystore (expo-secure-store) and refreshes them.

Counters use Upstash Redis when `UPSTASH_REDIS_REST_*` is set, else in-memory (dev only).
