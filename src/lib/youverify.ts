import "server-only";
import { readYouverifyIdentity, type YouverifyIdentityResult } from "./youverify-rules";

// Youverify (doc.youverify.co) checks IDs and businesses: the owner's BVN or NIN for the Shopinbos Wallet
// (src/lib/wallet) and BN/RC numbers for suppliers and delivery partners (src/lib/kyb). Requests carry the
// secret key in a `token` header (no "Bearer"). Sandbox and live keys are separate: YOUVERIFY_ENV=sandbox|live pins
// one, else the environment that accepts the key is found on the first request.
// Each live check is charged to the Shopinbos Youverify plan. The parsing rules are in ./youverify-rules.ts.

function secret() {
  const key = process.env.YOUVERIFY_SECRET_KEY?.trim();
  return key && !/^your[-_]|^x+$/i.test(key) ? key : null;
}

export function youverifyReady() {
  return Boolean(secret());
}

const SANDBOX = "https://api.sandbox.youverify.co";
const LIVE = "https://api.youverify.co";

// Keys only work on their own environment (a sandbox key gets 401 from live). YOUVERIFY_ENV=sandbox|live pins it;
// unset, the first request finds which one accepts the key and the rest use it.
let detectedBase: string | null = null;

function pinnedBase() {
  const env = process.env.YOUVERIFY_ENV?.trim().toLowerCase();
  return env === "sandbox" ? SANDBOX : env === "live" || env === "production" ? LIVE : null;
}

async function send(base: string, path: string, init: { method: "GET" | "POST"; body?: Record<string, unknown> }, key: string, timeoutMs: number) {
  const response = await fetch(`${base}${path}`, {
    method: init.method,
    headers: { token: key, Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { status: response.status, json: (await response.json().catch(() => null)) as unknown };
}

async function request(path: string, init: { method: "GET" | "POST"; body?: Record<string, unknown> }, timeoutMs: number) {
  const key = secret();
  if (!key) throw new Error("Youverify is not configured");
  const pinned = pinnedBase();
  const first = pinned ?? detectedBase ?? LIVE;
  const result = await send(first, path, init, key, timeoutMs);
  if (result.status === 401 && !pinned && !detectedBase) {
    // The key may belong to the other environment: one try there. A rejected key is never retried twice.
    const other = first === LIVE ? SANDBOX : LIVE;
    const retry = await send(other, path, init, key, timeoutMs);
    if (retry.status !== 401) detectedBase = other;
    return retry.status === 401 ? result : retry;
  }
  if (result.status !== 401 && !pinned) detectedBase = first;
  return result;
}

/** POSTs a quick check. Throws only when Youverify can't be reached. */
export async function youverifyPost(path: string, body: Record<string, unknown>, timeoutMs = 30_000): Promise<{ status: number; json: unknown }> {
  const result = await request(path, { method: "POST", body }, timeoutMs);
  if (result.status >= 400 && result.status !== 404 && result.status !== 422) {
    const message = (result.json as { message?: unknown } | null)?.message;
    // Shows in the Vercel logs: 401 key / environment, 402 balance, 403 plan, 429 too fast.
    console.error(`[youverify] ${path} answered ${result.status}: ${typeof message === "string" ? message : ""}`);
  }
  return result;
}

export type YouverifyHealth =
  | { state: "not_set" }
  | { state: "ok"; environment: "sandbox" | "live" }
  | { state: "key_rejected" | "no_balance" | "plan_limit" | "unreachable" | "other"; status?: number; message?: string };

/**
 * Whether the key works, for the team (Admin → Wallets): a free authenticated request (the bank list), so it
 * costs no checks. Says which environment the key belongs to, or why Youverify refuses it.
 */
export async function youverifyHealth(): Promise<YouverifyHealth> {
  if (!secret()) return { state: "not_set" };
  try {
    const result = await request("/v2/api/identity/ng/bank-account-number/bank-list", { method: "GET" }, 15_000);
    const message = (result.json as { message?: unknown } | null)?.message;
    const text = typeof message === "string" ? message : undefined;
    if (result.status >= 200 && result.status < 300) return { state: "ok", environment: (pinnedBase() ?? detectedBase) === SANDBOX ? "sandbox" : "live" };
    if (result.status === 401) return { state: "key_rejected", status: 401, message: text };
    if (result.status === 402) return { state: "no_balance", status: 402, message: text };
    if (result.status === 403) return { state: "plan_limit", status: 403, message: text };
    return { state: "other", status: result.status, message: text };
  } catch (error) {
    return { state: "unreachable", message: error instanceof Error ? error.message : undefined };
  }
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
