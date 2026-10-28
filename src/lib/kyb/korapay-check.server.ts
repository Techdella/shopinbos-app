import "server-only";

import { korapayIdentityHealth, korapayIdentityPost, korapayIdentityReady, korapayLivenessReady } from "@/lib/korapay";

// Admin › Developers › "Test Korapay Identity": one real CAC lookup of a well-known registered company (each live
// lookup is paid from the Korapay NGN balance), with Korapay's own answer shown as it came, plus the key's
// environment and balance. When partners' CAC, NIN or selfie checks fail, this says why (Identity not enabled, no
// balance, a test key on the live site…) without reading the Vercel logs.

/** Dangote Cement Plc: public, active and on CAC's register. A test key uses Korapay's sandbox number instead. */
const LIVE_SAMPLE = { id: "RC208767", registration_type: "RC", registration_name: "DANGOTE CEMENT PLC" };
const SANDBOX_SAMPLE = { id: "RC00000011", registration_type: "RC" };

export interface KorapayCheck {
  configured: boolean;
  livenessKey: boolean;
  health: Awaited<ReturnType<typeof korapayIdentityHealth>>;
  cac: { httpStatus: number; ok: boolean; message: string; companyName: string | null; sample: string } | null;
}

export async function runKorapayCheck(): Promise<KorapayCheck> {
  const configured = korapayIdentityReady();
  const health = await korapayIdentityHealth();
  if (!configured) return { configured, livenessKey: korapayLivenessReady(), health, cac: null };
  const sample = health.state === "ok" && health.environment === "test" ? SANDBOX_SAMPLE : LIVE_SAMPLE;
  try {
    const { status, json } = await korapayIdentityPost("/identities/ng/cac", { ...sample, verification_consent: true }, 20_000);
    const reply = (json ?? {}) as { status?: unknown; message?: unknown; data?: { name?: unknown } | null };
    return {
      configured,
      livenessKey: korapayLivenessReady(),
      health,
      cac: {
        httpStatus: status,
        ok: status >= 200 && status < 300 && reply.status === true,
        message: typeof reply.message === "string" ? reply.message.slice(0, 300) : "",
        companyName: typeof reply.data?.name === "string" ? reply.data.name : null,
        sample: sample.id,
      },
    };
  } catch (error) {
    return { configured, livenessKey: korapayLivenessReady(), health, cac: { httpStatus: 0, ok: false, message: error instanceof Error ? error.message : "Korapay could not be reached", companyName: null, sample: sample.id } };
  }
}
