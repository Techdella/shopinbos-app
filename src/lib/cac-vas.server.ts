import "server-only";

// CAC's VAS platform (vas.cac.gov.ng): the registry's own APIs, one API key for all of them.
//   Validation (documenter.getpostman.com/view/54596520/2sBY4VJcUc): the instant CAC check, src/lib/kyb.
//   Business name registration (documenter.getpostman.com/view/54951313/2sBY4PQfw8): src/lib/business-registration.
// Header X_API_KEY. Production https://vasapp.cac.gov.ng; CAC_VAS_ENV=staging uses https://vasapp.oasisproducts.ng,
// CAC's test registry (applications there can be approved or queried on demand). Every paid call is charged to the
// Shopinbos VAS wallet: a 403 means no balance, or the service isn't enabled on the account.

export function cacVasKey() {
  const key = process.env.CAC_VAS_API_KEY?.trim();
  return key && !/^your[-_]|^x+$/i.test(key) ? key : null;
}

export function cacVasReady() {
  return Boolean(cacVasKey());
}

export function cacVasStaging() {
  return process.env.CAC_VAS_ENV?.trim().toLowerCase() === "staging";
}

export function cacVasBase() {
  return cacVasStaging() ? "https://vasapp.oasisproducts.ng" : "https://vasapp.cac.gov.ng";
}

/** Calls a VAS endpoint. Throws only when CAC can't be reached (or no key is set); any answer comes back as is. */
export async function cacVasCall(path: string, init: { method?: "GET" | "POST"; body?: unknown; timeoutMs?: number } = {}): Promise<{ status: number; json: unknown }> {
  const key = cacVasKey();
  if (!key) throw new Error("CAC VAS is not configured (CAC_VAS_API_KEY).");
  const response = await fetch(`${cacVasBase()}${path}`, {
    method: init.method ?? "POST",
    headers: { X_API_KEY: key, Accept: "application/json", ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}) },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    signal: AbortSignal.timeout(init.timeoutMs ?? 30_000),
    cache: "no-store",
  });
  return { status: response.status, json: (await response.json().catch(() => null)) as unknown };
}

/** The reason in a VAS error answer ({ error } or { message } or { errors: [...] }), for logs and people. */
export function cacVasError(json: unknown): string {
  const body = (json && typeof json === "object" ? json : {}) as { error?: unknown; message?: unknown; errors?: unknown };
  const errors = Array.isArray(body.errors) ? body.errors.filter((e): e is string => typeof e === "string") : [];
  return [typeof body.error === "string" ? body.error : "", typeof body.message === "string" ? body.message : "", ...errors].find((text) => text.trim()) ?? "";
}
