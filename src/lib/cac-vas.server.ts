import "server-only";

// CAC's VAS platform (vas.cac.gov.ng): the registry's own APIs, one API key for all of them.
//   Validation (documenter.getpostman.com/view/54596520/2sBY4VJcUc): the instant CAC check, src/lib/kyb.
//   Business name registration (documenter.getpostman.com/view/54951313/2sBY4PQfw8): src/lib/business-registration.
// Header X_API_KEY. Production https://vasapp.cac.gov.ng, staging (CAC's test registry, where applications can be
// approved or queried on demand) https://vasapp.oasisproducts.ng. CAC_VAS_ENV=staging|production pins one; unset,
// the environment that accepts the key is found on the first call. Every paid call is charged to the
// Shopinbos VAS wallet: a 403 means no balance, or the service isn't enabled on the account.

export function cacVasKey() {
  // Pasted keys sometimes keep their quotes or a trailing newline; neither is part of the key.
  const key = process.env.CAC_VAS_API_KEY?.trim().replace(/^["']+|["']+$/g, "").trim();
  return key && !/^your[-_]|^x+$/i.test(key) ? key : null;
}

export function cacVasReady() {
  return Boolean(cacVasKey());
}

const PRODUCTION = "https://vasapp.cac.gov.ng";
const STAGING = "https://vasapp.oasisproducts.ng";

/** CAC_VAS_ENV=staging|production pins the environment; unset, the one that accepts the key is found (below). */
function pinnedBase() {
  const env = process.env.CAC_VAS_ENV?.trim().toLowerCase();
  return env === "staging" || env === "sandbox" ? STAGING : env === "production" || env === "live" ? PRODUCTION : null;
}

// VAS keys only work on their own environment (a staging key gets 401 from production). Unpinned, the first call
// that gets 401 tries the other environment once, and the one that accepts the key is used from then on.
let detectedBase: string | null = null;

export function cacVasStaging() {
  return (pinnedBase() ?? detectedBase) === STAGING;
}

export function cacVasBase() {
  return pinnedBase() ?? detectedBase ?? PRODUCTION;
}

async function send(base: string, path: string, init: { method?: "GET" | "POST"; body?: unknown; timeoutMs?: number }, key: string) {
  const response = await fetch(`${base}${path}`, {
    method: init.method ?? "POST",
    headers: { X_API_KEY: key, Accept: "application/json", ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}) },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    signal: AbortSignal.timeout(init.timeoutMs ?? 30_000),
    cache: "no-store",
  });
  return { status: response.status, json: (await response.json().catch(() => null)) as unknown };
}

/** Calls a VAS endpoint. Throws only when CAC can't be reached (or no key is set); any answer comes back as is. */
export async function cacVasCall(path: string, init: { method?: "GET" | "POST"; body?: unknown; timeoutMs?: number } = {}): Promise<{ status: number; json: unknown }> {
  const key = cacVasKey();
  if (!key) throw new Error("CAC VAS is not configured (CAC_VAS_API_KEY).");
  const pinned = pinnedBase();
  const first = cacVasBase();
  const result = await send(first, path, init, key);
  if (result.status === 401 && !pinned && !detectedBase) {
    // The key may belong to the other environment: one try there.
    const other = first === PRODUCTION ? STAGING : PRODUCTION;
    const retry = await send(other, path, init, key).catch(() => null);
    if (retry && retry.status !== 401) {
      detectedBase = other;
      console.warn(`[cac-vas] the key works on ${other === STAGING ? "staging" : "production"}; set CAC_VAS_ENV to make it explicit`);
      return retry;
    }
    console.error("[cac-vas] CAC rejected CAC_VAS_API_KEY (401) on both production and staging. Copy the API key again from vas.cac.gov.ng → Api Configuration.");
    return result;
  }
  if (result.status !== 401 && !pinned) detectedBase = first;
  return result;
}

/** The reason in a VAS error answer ({ error } or { message } or { errors: [...] }), for logs and people. */
export function cacVasError(json: unknown): string {
  const body = (json && typeof json === "object" ? json : {}) as { error?: unknown; message?: unknown; errors?: unknown };
  const errors = Array.isArray(body.errors) ? body.errors.filter((e): e is string => typeof e === "string") : [];
  return [typeof body.error === "string" ? body.error : "", typeof body.message === "string" ? body.message : "", ...errors].find((text) => text.trim()) ?? "";
}
