// Browser side of Admin › App errors: friendlyError() gives the words to show and quietly reports technical errors
// (with the page, browser and, on the server, the signed-in account) to /api/public/client-errors.

import { DEFAULT_FRIENDLY, errorDetails, errorKind, friendlyText } from "./friendly";

type Source = "shown" | "unhandled" | "boundary";

const sent = new Set<string>();
const MAX_PER_PAGE = 20;

/** Send a technical error to the admin error log. Never throws; each distinct error is sent once per page load. */
export function reportClientError(error: unknown, options: { source?: Source; shown?: string; digest?: string } = {}) {
  try {
    if (typeof window === "undefined") return;
    const details = errorDetails(error);
    const key = `${details.message}|${location.pathname}`;
    if (sent.has(key) || sent.size >= MAX_PER_PAGE) return;
    sent.add(key);
    const body = JSON.stringify({
      ...details,
      kind: errorKind(error) ?? "code",
      source: options.source ?? "shown",
      shown: options.shown?.slice(0, 500) ?? null,
      digest: options.digest ?? null,
      path: `${location.pathname}${location.search}`.slice(0, 500),
    });
    void fetch("/api/public/client-errors", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true, credentials: "same-origin" }).catch(() => undefined);
  } catch {
    // Reporting must never break the page.
  }
}

/**
 * The message to show for a caught error. Plain messages (ours) are shown as they are; technical ones become a
 * friendly message (or the fallback given) and are reported so the team can see them, with the account.
 */
export function friendlyError(error: unknown, fallback: string = DEFAULT_FRIENDLY): string {
  const { text, kind } = friendlyText(error, fallback);
  if (kind) reportClientError(error, { source: "shown", shown: text });
  return text;
}

/** Report errors nothing caught (window "error" and "unhandledrejection"), skipping browser-extension noise. */
export function listenForUnhandledErrors() {
  if (typeof window === "undefined") return;
  const noise = /ResizeObserver loop|^Script error\.?$|chrome-extension:|moz-extension:|safari-extension:|Non-Error promise rejection captured/i;
  window.addEventListener("error", (event) => {
    const error = event.error ?? event.message;
    const text = `${event.message ?? ""} ${event.filename ?? ""}`;
    if (noise.test(text)) return;
    reportClientError(error, { source: "unhandled" });
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const text = reason instanceof Error ? `${reason.message} ${reason.stack ?? ""}` : String(reason ?? "");
    if (noise.test(text)) return;
    reportClientError(reason, { source: "unhandled" });
  });
}
