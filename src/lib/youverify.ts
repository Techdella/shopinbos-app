import "server-only";
import { readYouverifyIdentity, type YouverifyIdentityResult } from "./youverify-rules";

// Youverify (doc.youverify.co) checks IDs and businesses: the owner's BVN or NIN for the Shopinbos Wallet
// (src/lib/wallet) and BN/RC numbers for suppliers and delivery partners (src/lib/kyb). Requests carry the
// secret key in a `token` header (no "Bearer"). YOUVERIFY_ENV=sandbox uses the sandbox, whose keys are separate.
// Each live check is charged to the Shopinbos Youverify plan. The parsing rules are in ./youverify-rules.ts.

function secret() {
  const key = process.env.YOUVERIFY_SECRET_KEY?.trim();
  return key && !/^your[-_]|^x+$/i.test(key) ? key : null;
}

export function youverifyReady() {
  return Boolean(secret());
}

function base() {
  return process.env.YOUVERIFY_ENV?.trim().toLowerCase() === "sandbox" ? "https://api.sandbox.youverify.co" : "https://api.youverify.co";
}

/** POSTs a quick check. Throws only when Youverify can't be reached. */
export async function youverifyPost(path: string, body: Record<string, unknown>, timeoutMs = 30_000): Promise<{ status: number; json: unknown }> {
  const key = secret();
  if (!key) throw new Error("Youverify is not configured");
  const response = await fetch(`${base()}${path}`, {
    method: "POST",
    headers: { token: key, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { status: response.status, json: await response.json().catch(() => null) };
}

/**
 * Looks up a BVN or NIN with the owner's consent and compares the name and date of birth they typed. Never throws:
 * an unknown number comes back as notFound, a registry that's down as pending, anything else as a message.
 */
export async function verifyYouverifyIdentity(input: { type: "bvn" | "nin"; id: string; firstName: string; lastName: string; dateOfBirth: string }): Promise<YouverifyIdentityResult> {
  if (!secret()) return { ok: false, notFound: false, message: "ID checks aren't set up yet." };
  const details = { firstName: input.firstName, lastName: input.lastName, dateOfBirth: input.dateOfBirth };
  try {
    const { status, json } = await youverifyPost(
      `/v2/api/identity/ng/${input.type}`,
      input.type === "nin"
        ? { id: input.id, isSubjectConsent: true, validations: { data: details } }
        : { id: input.id, isSubjectConsent: true, validation: details },
    );
    return readYouverifyIdentity(status, json, details);
  } catch (error) {
    return { ok: false, notFound: false, message: error instanceof Error ? error.message : "Youverify could not be reached" };
  }
}
