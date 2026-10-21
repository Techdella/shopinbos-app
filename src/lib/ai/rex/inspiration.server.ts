import "server-only";
import { safeFetch, UnsafeUrlError } from "@/lib/security/safe-fetch.server";
import { isEmptyInspiration, parseInspirationHtml, type InspirationLink } from "@/lib/ai/rex/inspiration";

// Reads a store page a seller gave Rex as inspiration. Only public addresses (safeFetch checks every hop), only
// HTML, at most 1.5 MB, eight seconds. The words never leave this request except as Rex's prompt.

const MAX_BYTES = 1_500_000;

export class InspirationError extends Error {}

async function readCapped(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))));
}

/** "zara.com/ng" → "https://zara.com/ng". Null when it isn't a web address. */
export function normaliseInspirationUrl(raw: string) {
  const value = raw.trim();
  if (!value || /\s/.test(value)) return null;
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function readInspirationLink(raw: string): Promise<InspirationLink> {
  const url = normaliseInspirationUrl(raw);
  if (!url) throw new InspirationError("That doesn't look like a web address. Paste the full link, like https://example.com.");
  let response: Response;
  try {
    response = await safeFetch(url, {
      headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "Mozilla/5.0 (compatible; ShopinbosRex/1.0; +https://app.shopinbos.com)" },
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    if (error instanceof UnsafeUrlError) throw new InspirationError("Rex can only read public web pages.");
    throw new InspirationError("Rex couldn't open that page. Check the link, or add a screenshot of it instead.");
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new InspirationError("That page didn't open for Rex. Add a screenshot of it instead.");
  }
  if (!(response.headers.get("content-type") ?? "").includes("html")) {
    await response.body?.cancel().catch(() => undefined);
    throw new InspirationError("That link isn't a web page. Add a screenshot instead.");
  }
  const link = parseInspirationHtml(await readCapped(response), response.url || url);
  if (isEmptyInspiration(link)) {
    throw new InspirationError("Rex couldn't see much on that page (it may need a login, like Instagram). Add a screenshot of it instead.");
  }
  return link;
}
