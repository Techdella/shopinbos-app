import "server-only";

import { korapayIdentityHealth, korapayIdentityPost, korapayIdentityReady, korapayLivenessReady } from "@/lib/korapay";

// Admin › Developers › "Test Korapay Identity": one real CAC lookup of a well-known registered company (each live
// lookup is paid from the Korapay NGN balance), with Korapay's own answer shown as it came, plus the key's
// environment and balance. When partners' CAC, NIN or selfie checks fail, this says why (Identity not enabled, no
// balance, a test key on the live site…) without reading the Vercel logs.

/** Dangote Cement Plc: public, active and on CAC's register. A test key uses Korapay's sandbox number instead. */
const LIVE_NUMBER = "208767";
const SANDBOX_NUMBER = "00000011";

/**
 * The request shapes tried, in order, until one works: Korapay's documented example first, then the variations a
 * "One or more fields are invalid" answer could be about (the name, the RC prefix, the type field). Only a lookup
 * that works is charged, and the first one that works stops the test.
 */
function variants(digits: string) {
  return [
    // What partner and supplier CAC checks send (src/lib/kyb/cac.ts korapayCacBody), then the alternatives.
    { label: "Digits only, type RC (what checks send)", body: { id: digits, registration_type: "RC" } },
    { label: "As documented (RC number, type RC)", body: { id: `RC${digits}`, registration_type: "RC" } },
    { label: "RC number, no type", body: { id: `RC${digits}` } },
  ];
}

export interface KorapayAttempt { label: string; body: Record<string, unknown>; httpStatus: number; ok: boolean; message: string; details: string }

export interface KorapayCheck {
  configured: boolean;
  livenessKey: boolean;
  health: Awaited<ReturnType<typeof korapayIdentityHealth>>;
  cac: { httpStatus: number; ok: boolean; message: string; companyName: string | null; sample: string } | null;
  /** Every request shape tried, with Korapay's answer to each (its `data`/`errors` too: they name the field). */
  attempts: KorapayAttempt[];
}

/** Korapay's error details (which field, why), short. */
function detailsOf(json: unknown) {
  const reply = (json ?? {}) as { data?: unknown; errors?: unknown; error?: unknown };
  const details = reply.errors ?? reply.error ?? (reply.data && typeof reply.data === "object" && !("name" in (reply.data as object)) ? reply.data : null);
  return details ? JSON.stringify(details).slice(0, 400) : "";
}

export async function runKorapayCheck(): Promise<KorapayCheck> {
  const configured = korapayIdentityReady();
  const health = await korapayIdentityHealth();
  if (!configured) return { configured, livenessKey: korapayLivenessReady(), health, cac: null, attempts: [] };
  const digits = health.state === "ok" && health.environment === "test" ? SANDBOX_NUMBER : LIVE_NUMBER;
  const attempts: KorapayAttempt[] = [];
  let cac: KorapayCheck["cac"] = null;
  for (const variant of variants(digits)) {
    const body = { ...variant.body, verification_consent: true };
    try {
      const { status, json } = await korapayIdentityPost("/identities/ng/cac", body, 20_000);
      const reply = (json ?? {}) as { status?: unknown; message?: unknown; data?: { name?: unknown } | null };
      const ok = status >= 200 && status < 300 && reply.status === true;
      const message = typeof reply.message === "string" ? reply.message.slice(0, 300) : "";
      attempts.push({ label: variant.label, body, httpStatus: status, ok, message, details: ok ? "" : detailsOf(json) });
      if (!cac || ok) cac = { httpStatus: status, ok, message, companyName: typeof reply.data?.name === "string" ? reply.data.name : null, sample: String(body.id) };
      // Only a refused field is worth another shape; a key, access or balance problem answers the same every time.
      if (ok || status !== 422) break;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Korapay could not be reached";
      attempts.push({ label: variant.label, body, httpStatus: 0, ok: false, message, details: "" });
      cac ??= { httpStatus: 0, ok: false, message, companyName: null, sample: String(body.id) };
      break;
    }
  }
  return { configured, livenessKey: korapayLivenessReady(), health, cac, attempts };
}
