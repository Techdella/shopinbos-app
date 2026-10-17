import "server-only";

// Korapay Identity for Shopinbos Wallet KYC: checks a Nigerian BVN or NIN against the name and date of birth the
// owner typed (https://developers.korapay.com/docs/nigeria-bvn, /nigeria-nin). No money moves through Korapay:
// payments are settled by Paystack straight to each business's bank (src/lib/wallet).
//
// Env: KORAPAY_SECRET_KEY. A test key runs Korapay's sandbox (BVN 22222222222 and NIN 55555555555 pass there).
// Each live lookup is charged to the Shopinbos Korapay balance.

const KORAPAY_BASE = "https://api.korapay.com/merchant/api/v1";

function secret() {
  const key = process.env.KORAPAY_SECRET_KEY?.trim() ?? "";
  return key && !key.includes("your_") && !key.includes("your-") ? key : "";
}

/** Korapay's key is set, so ID checks can run. */
export function korapayIdentityReady() {
  return Boolean(secret());
}

function korapayBase() {
  // Tests only: KORAPAY_API_BASE_URL points these calls at a local stub. Ignored on the live site.
  const stub = process.env.VERCEL_ENV !== "production" ? process.env.KORAPAY_API_BASE_URL?.trim() : "";
  return stub && /^https?:\/\//.test(stub) ? stub.replace(/\/+$/, "") : KORAPAY_BASE;
}

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

const match = (value: unknown) => {
  const field = value && typeof value === "object" ? (value as Record<string, unknown>).match : undefined;
  return typeof field === "boolean" ? field : null;
};

export interface KorapayIdentity {
  reference: string | null;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  dateOfBirth: string | null;
  /** Korapay's verdict on each field we sent (null when it didn't say). */
  matches: { firstName: boolean | null; lastName: boolean | null; dateOfBirth: boolean | null };
}

export type IdentityResult = { ok: true; identity: KorapayIdentity } | { ok: false; notFound: boolean; message: string };

/**
 * Looks up a BVN or NIN (POST /identities/ng/bvn | nin) with the owner's consent and the details to match. Never
 * throws: an unknown number comes back as notFound, anything else (no balance, Korapay down) as a message.
 */
export async function verifyKorapayIdentity(input: { type: "bvn" | "nin"; id: string; firstName: string; lastName: string; dateOfBirth: string }): Promise<IdentityResult> {
  const key = secret();
  if (!key) return { ok: false, notFound: false, message: "ID checks aren't set up yet." };
  try {
    const response = await fetch(`${korapayBase()}/identities/ng/${input.type}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        id: input.id,
        verification_consent: true,
        validation: { first_name: input.firstName, last_name: input.lastName, date_of_birth: input.dateOfBirth },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    const json = (await response.json().catch(() => null)) as { status?: boolean; message?: string; data?: Record<string, unknown> | null } | null;
    if (!response.ok || json?.status !== true || !json.data) {
      const message = json?.message ?? `Korapay answered ${response.status}`;
      const notFound = (response.status >= 400 && response.status < 500 && response.status !== 401 && response.status !== 403) || /not found|invalid|does not exist/i.test(message);
      return { ok: false, notFound, message };
    }
    const data = json.data;
    const validation = data.validation && typeof data.validation === "object" ? (data.validation as Record<string, unknown>) : {};
    return {
      ok: true,
      identity: {
        reference: text(data.reference),
        firstName: text(data.first_name),
        lastName: text(data.last_name),
        middleName: text(data.middle_name),
        dateOfBirth: text(data.date_of_birth),
        matches: { firstName: match(validation.first_name), lastName: match(validation.last_name), dateOfBirth: match(validation.date_of_birth) },
      },
    };
  } catch (error) {
    return { ok: false, notFound: false, message: error instanceof Error ? error.message : "Korapay could not be reached" };
  }
}
