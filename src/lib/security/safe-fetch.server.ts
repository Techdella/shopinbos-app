import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isPrivateAddress, urlShapeProblem } from "./ssrf";

// fetch() for URLs that came from users: checks the scheme and every address the host resolves to, and follows
// redirects by hand so each hop is checked too. A DNS answer could still change between this lookup and the
// connection (rebinding); the window is small and the metadata/loopback ranges are refused either way.

export class UnsafeUrlError extends Error {}

/** Throws UnsafeUrlError when the URL is not a public http(s) address. */
export async function assertPublicUrl(value: string, opts: { httpsOnly?: boolean } = {}) {
  const problem = urlShapeProblem(value, opts);
  if (problem) throw new UnsafeUrlError(problem);
  const host = new URL(value).hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return;
  const addresses = await lookup(host, { all: true, verbatim: true }).catch(() => []);
  if (!addresses.length) throw new UnsafeUrlError("host does not resolve");
  if (addresses.some((entry) => isPrivateAddress(entry.address))) throw new UnsafeUrlError("host resolves to a private address");
}

export async function safeFetch(value: string, init: RequestInit & { httpsOnly?: boolean; maxRedirects?: number } = {}) {
  const { httpsOnly, maxRedirects = 3, ...rest } = init;
  let url = value;
  for (let hop = 0; ; hop++) {
    await assertPublicUrl(url, { httpsOnly });
    const response = await fetch(url, { ...rest, redirect: "manual" });
    const location = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || !location) return response;
    await response.body?.cancel().catch(() => undefined);
    if (hop >= maxRedirects) throw new UnsafeUrlError("too many redirects");
    url = new URL(location, url).toString();
  }
}
