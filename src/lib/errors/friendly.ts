// Turns technical errors (browser, network, code) into words people understand. Pure, unit-tested in
// tests/friendly-errors.test.mjs. Messages our own APIs send ("Enter a valid phone number") pass through as they
// are; anything that reads like code is swapped for a plain message and reported to Admin › App errors.

export type ErrorKind = "storage" | "network" | "update" | "permission" | "code";

export const FRIENDLY_TEXT: Record<ErrorKind, string> = {
  storage: "Your browser is blocking this site from saving data. Turn on cookies and site data for Shopinbos in your browser settings (or open it in Chrome), then try again.",
  network: "We couldn't reach Shopinbos. Check your internet connection and try again.",
  update: "Shopinbos was just updated. Refresh the page and try again.",
  permission: "Your browser blocked that. Allow it in your browser settings, then try again.",
  code: "Something went wrong on our side. We've been told and are looking into it. Please try again.",
};

export const DEFAULT_FRIENDLY = "Something went wrong. Please try again.";

const RULES: Array<[ErrorKind, RegExp]> = [
  ["storage", /SecurityError|Access is denied for this document|(session|local)Storage|indexedDB|QuotaExceeded|The operation is insecure/i],
  ["update", /ChunkLoadError|Loading (CSS )?chunk|dynamically imported module|Importing a module script failed|Server Action .* was not found/i],
  ["network", /Failed to fetch|Network ?Error|Network request failed|Load failed|ERR_[A-Z_]+|timed? ?out|AbortError|signal is aborted|The operation was aborted|ECONNRESET|ETIMEDOUT|socket hang up/i],
  ["permission", /NotAllowedError|Permission denied|permission was denied/i],
  [
    "code",
    /\b(TypeError|ReferenceError|SyntaxError|RangeError|InternalError|EvalError)\b|Unexpected (token|end of JSON)|is not (a function|defined|iterable|valid JSON)|Cannot (read|set) propert|undefined|\bnull\b|Maximum call stack|Minified React error|Hydration|NEXT_[A-Z_]+|prisma|\bP\d{4}\b|Internal Server Error|status code \d{3}|HTTP \d{3}|\bat \S+ \(|\bat [\w$.]+:\d+|https?:\/\/|[{}<>\\]|\w+Exception\b|stack/i,
  ],
];

function messageOf(error: unknown) {
  if (error instanceof Error) return `${error.name && error.name !== "Error" ? `${error.name}: ` : ""}${error.message}`;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error && typeof (error as { message: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  return "";
}

/** What kind of technical error this is, or null when the message is already fit for people. */
export function errorKind(error: unknown): ErrorKind | null {
  const message = messageOf(error).trim();
  if (!message) return "code";
  for (const [kind, pattern] of RULES) if (pattern.test(message)) return kind;
  // Very long messages are dumps, not sentences for people.
  return message.length > 240 ? "code" : null;
}

/** The words to show: the message itself when it's already plain, else a friendly one. */
export function friendlyText(error: unknown, fallback = DEFAULT_FRIENDLY): { text: string; kind: ErrorKind | null } {
  const kind = errorKind(error);
  if (kind) return { text: kind === "code" && fallback !== DEFAULT_FRIENDLY && !errorKind(fallback) ? fallback : FRIENDLY_TEXT[kind], kind };
  return { text: messageOf(error).trim() || fallback, kind: null };
}

/**
 * A DOM Event someone rejected a promise with (a script, image or socket that failed to load) says nothing as text
 * ("[object Event]"): name its type and what it came from instead, e.g. `Event "error" on <script src=…/x.js>`.
 */
function eventText(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("type" in error) || typeof error.type !== "string" || !("target" in error)) return null;
  const name = (error as object).constructor?.name || "Event";
  const target = (error as { target?: unknown }).target as { tagName?: unknown; src?: unknown; href?: unknown; url?: unknown } | null;
  const tag = target && typeof target.tagName === "string" ? target.tagName.toLowerCase() : null;
  const source = target ? [target.src, target.href, target.url].find((value): value is string => typeof value === "string" && value.length > 0) : undefined;
  const on = tag ? ` on <${tag}${source ? ` src=${source.slice(0, 200)}` : ""}>` : source ? ` from ${source.slice(0, 200)}` : "";
  return `${name} "${error.type}"${on}`;
}

/** The technical details kept for Admin › App errors. */
export function errorDetails(error: unknown) {
  const message = messageOf(error).trim() || eventText(error) || String(error ?? "Unknown error");
  const name = error instanceof Error ? error.name : typeof error;
  const stack = error instanceof Error ? error.stack ?? null : null;
  return { name: name.slice(0, 120), message: message.slice(0, 2000), stack: stack ? stack.slice(0, 6000) : null };
}

/** One row per problem: the message without numbers and ids, plus where it happened. */
export function errorFingerprint(message: string, path: string) {
  const normal = message
    .toLowerCase()
    .replace(/[0-9a-f]{8,}|\d+/g, "#")
    .replace(/\s+/g, " ")
    .slice(0, 300);
  return `${normal}|${pagePattern(path)}`;
}

/** /s/ada-fashion/products/123 → /s/:slug/products/:id, so the same page groups together. */
export function pagePattern(path: string) {
  const clean = (path || "/").split(/[?#]/)[0] ?? "/";
  return clean
    .split("/")
    .map((part, index, parts) => {
      if (!part) return part;
      if (parts[index - 1] === "s" && index === 2) return ":slug";
      if (/\d/.test(part) && part.length > 6) return ":id";
      return part;
    })
    .join("/")
    .slice(0, 200);
}

/** A short browser label from the user agent ("Chrome 155 · Android 10"). */
export function browserLabel(userAgent: string | null | undefined) {
  const ua = userAgent ?? "";
  if (!ua) return "Unknown browser";
  const browser =
    /Shopinbos/i.test(ua) ? "Shopinbos app" :
    /FBAN|FBAV|Instagram/i.test(ua) ? "Facebook/Instagram in-app" :
    /Edg\/(\d+)/.test(ua) ? `Edge ${RegExp.$1}` :
    /OPR\/(\d+)/.test(ua) ? `Opera ${RegExp.$1}` :
    /SamsungBrowser\/(\d+)/.test(ua) ? `Samsung Internet ${RegExp.$1}` :
    /Chrome\/(\d+)/.test(ua) ? `Chrome ${RegExp.$1}` :
    /Firefox\/(\d+)/.test(ua) ? `Firefox ${RegExp.$1}` :
    /Version\/(\d+).*Safari/.test(ua) ? `Safari ${RegExp.$1}` :
    "Other browser";
  const os =
    /Android ([\d.]+)/.test(ua) ? `Android ${RegExp.$1}` :
    /(iPhone|iPad).*OS (\d+)/.test(ua) ? `iOS ${RegExp.$2}` :
    /Windows/.test(ua) ? "Windows" :
    /Mac OS X/.test(ua) ? "Mac" :
    /Linux/.test(ua) ? "Linux" :
    "";
  return os ? `${browser} · ${os}` : browser;
}
