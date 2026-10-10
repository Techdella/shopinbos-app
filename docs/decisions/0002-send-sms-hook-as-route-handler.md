# 0002 — Supabase Send SMS hook runs as a Next.js route, not an Edge Function

- Status: accepted (owner, 2026-10-10)
- Date: 2026-10-10

## Context

Spec section 12 says to implement the Supabase Send SMS hook as an Edge Function. Supabase also
supports HTTPS hooks pointing at any URL, signed with Standard Webhooks.

## Decision

The hook is `POST /api/auth/hooks/send-sms` in `apps/web`. It verifies the Standard Webhooks
signature (`SUPABASE_AUTH_HOOK_SECRET`), rejects requests more than 5 minutes old, and sends
the code with `@shopinbos/integrations/otp`: WhatsApp authentication template first, then Termii SMS.

Why: one codebase and one set of tested adapters (Vitest in Node). This keeps the rule that apps only reach
third parties through `packages/integrations`, and there's no Deno copy of the WhatsApp/Termii clients to keep in sync.

## Consequences

- Sign-in depends on the Vercel deployment being up (it already does for the API).
- To switch to an Edge Function later, wrap the same `sendOtp` logic; the adapters use only `fetch` and Web Crypto.
