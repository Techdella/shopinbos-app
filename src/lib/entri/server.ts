import "server-only";

// Entri (entri.com): "Connect" for a domain bought somewhere else. The seller logs in to the company they bought it
// from inside Entri's window and Entri adds our records there (or walks them through it when that company has no
// login API), so nobody copies DNS records. Needs ENTRI_APPLICATION_ID and ENTRI_SECRET from the Entri dashboard;
// without them "I already have a domain" isn't offered. Docs: https://developers.entri.com/connect/sdk

const TOKEN_URL = "https://api.goentri.com/token";

export function entriConfigured() {
  return Boolean(process.env.ENTRI_APPLICATION_ID?.trim() && process.env.ENTRI_SECRET?.trim());
}

/** A short-lived (60 minute) token for the browser to open Entri with. */
export async function entriToken(): Promise<{ applicationId: string; token: string } | null> {
  if (!entriConfigured()) return null;
  const applicationId = process.env.ENTRI_APPLICATION_ID!.trim();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ applicationId, secret: process.env.ENTRI_SECRET!.trim() }),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return null;
  const json = (await res.json().catch(() => null)) as { auth_token?: unknown } | null;
  return typeof json?.auth_token === "string" ? { applicationId, token: json.auth_token } : null;
}
