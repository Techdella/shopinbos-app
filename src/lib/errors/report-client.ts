// Browser side of Admin › App errors: friendlyError() gives the words to show and quietly reports technical errors
// (with the page, browser and, on the server, the signed-in account) to /api/public/client-errors.

import * as Sentry from "@sentry/nextjs";
import { DEFAULT_FRIENDLY, errorDetails, errorKind, friendlyText, type ErrorKind } from "./friendly";

type Source = "shown" | "unhandled" | "boundary";

const sent = new Set<string>();
const MAX_PER_PAGE = 20;

// What the person did just before an error (pages opened and buttons tapped), so the team can retrace it.
const trail: Array<{ at: number; what: string }> = [];
const TRAIL_SIZE = 12;

function remember(what: string) {
  trail.push({ at: Date.now(), what: what.slice(0, 120) });
  if (trail.length > TRAIL_SIZE) trail.shift();
}

/** "12s ago · Opened /home/logistics/partners", newest last. */
export function trailText(now = Date.now()) {
  return trail.map((step) => `${Math.max(0, Math.round((now - step.at) / 1000))}s ago · ${step.what}`).join("\n");
}

function tapLabel(target: EventTarget | null) {
  const element = target instanceof Element ? target.closest("button, a, [role=button], summary, label, input[type=submit]") : null;
  if (!element) return null;
  const text = (element.getAttribute("aria-label") || element.textContent || (element as HTMLInputElement).value || "").replace(/\s+/g, " ").trim();
  const href = element instanceof HTMLAnchorElement ? element.getAttribute("href") : null;
  return `Tapped ${element.tagName === "A" ? "link" : "button"} "${text.slice(0, 50) || "(no label)"}"${href ? ` → ${href.slice(0, 80)}` : ""}`;
}

function watchTrail() {
  remember(`Opened ${location.pathname}${location.search}`);
  let last = location.pathname + location.search;
  const onRoute = () => {
    const now = location.pathname + location.search;
    if (now !== last) remember(`Went to ${now}`);
    last = now;
  };
  for (const method of ["pushState", "replaceState"] as const) {
    const original = history[method].bind(history);
    history[method] = ((...args: Parameters<History["pushState"]>) => {
      const result = original(...args);
      onRoute();
      return result;
    }) as History["pushState"];
  }
  window.addEventListener("popstate", () => {
    remember("Pressed back/forward");
    onRoute();
  });
  document.addEventListener("click", (event) => {
    const label = tapLabel(event.target);
    if (label) remember(label);
  }, { capture: true, passive: true });
  document.addEventListener("submit", () => remember("Sent a form"), { capture: true, passive: true });
  document.addEventListener("visibilitychange", () => remember(document.hidden ? "Left the tab/app" : "Came back to the tab/app"), { passive: true });
}

/** Send a technical error to the admin error log. Never throws; each distinct error is sent once per page load. */
export function reportClientError(error: unknown, options: { source?: Source; shown?: string; digest?: string; kind?: ErrorKind } = {}) {
  try {
    if (typeof window === "undefined") return;
    const details = errorDetails(error);
    const key = `${details.message}|${location.pathname}`;
    if (sent.has(key) || sent.size >= MAX_PER_PAGE) return;
    sent.add(key);
    const kind = options.kind ?? errorKind(error) ?? "code";
    const body = JSON.stringify({
      ...details,
      kind,
      source: options.source ?? "shown",
      shown: options.shown?.slice(0, 500) ?? null,
      digest: options.digest ?? null,
      trail: trailText().slice(0, 3000) || null,
      path: `${location.pathname}${location.search}`.slice(0, 500),
    });
    // Error pages and bugs also go to Sentry, which keeps a replay of the session (it records uncaught errors itself).
    if (options.source === "boundary" || (options.source !== "unhandled" && kind === "code")) {
      Sentry.captureException(error, { tags: { source: options.source ?? "shown", page: location.pathname }, extra: { trail: trailText(), digest: options.digest } });
    }
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
  try {
    watchTrail();
  } catch {
    // The trail is a nice-to-have.
  }
  const noise = /ResizeObserver loop|^Script error\.?$|chrome-extension:|moz-extension:|safari-extension:|Non-Error promise rejection captured/i;
  window.addEventListener("error", (event) => {
    const error = event.error ?? event.message;
    // Tested apart: a cross-origin "Script error." has no filename, and a joined "Script error. " would slip past ^…$.
    if (noise.test(event.message ?? "") || noise.test(event.filename ?? "")) return;
    reportClientError(error, { source: "unhandled" });
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const text = reason instanceof Error ? `${reason.message} ${reason.stack ?? ""}` : String(reason ?? "");
    if (noise.test(text)) return;
    reportClientError(reason, { source: "unhandled" });
  });
}
