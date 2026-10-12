// Scheduled jobs (Vercel Cron or any scheduler) call with `Authorization: Bearer $CRON_SECRET`. Compared in
// constant time so the secret can't be guessed byte by byte from response timings. Pure so tests can use it.
import { createHash, timingSafeEqual } from "node:crypto";

/** "ok", "unconfigured" (no CRON_SECRET, refuse everything) or "denied". */
export function cronAuthorization(header: string | null | undefined, secret: string | null | undefined): "ok" | "unconfigured" | "denied" {
  if (!secret) return "unconfigured";
  if (!header) return "denied";
  // Hash both sides so the comparison is the same length whatever was sent.
  const sent = createHash("sha256").update(header).digest();
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(sent, expected) ? "ok" : "denied";
}
