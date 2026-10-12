import "server-only";

// One fetch wrapper for the SMS providers: 15-second timeout, network errors returned rather than thrown,
// and a JSON body that is {} when the provider sends something else.

export async function call(url: string, init: RequestInit): Promise<{ ok: boolean; status: number; json: Record<string, unknown> } | { error: string }> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) }).catch((error: Error) => error);
  if (res instanceof Error) return { error: res.message || "network error" };
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, json: json && typeof json === "object" ? json : {} };
}
