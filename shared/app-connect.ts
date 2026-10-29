// Connecting WhatsApp, Facebook & Instagram (and Google) from the phone app, without landing on the web's
// "Sell everywhere" page. Pure (no server or app imports), so the web (the sales-channel callback, the WhatsApp
// sign-up page and /api/mobile/connected), the phone (apps/mobile/src/lib/channels.ts) and tests share it.
//
// The phone opens the sign-in with expo-web-browser's openAuthSessionAsync(url, "shopinbos://connected"):
//   Facebook & Instagram, Google: /api/app/sales-channels/<platform>/connect?app=shopinbos://connected → the platform
//     → .../callback, which finishes the connection;
//   WhatsApp: APP_WHATSAPP_CONNECT_PATH?app=shopinbos://connected, a small page that runs Meta's Embedded Signup
//     (the same popup and POST /api/app/inbox/whatsapp as the web's WhatsApp card).
// Both end on APP_CONNECTED_PATH?to=shopinbos://connected?channel=<platform>&status=connected|problem|closed: a small
// page that sends the browser to that address (and has a "Back to the app" button, because Chrome on Android only
// opens an app's address after a tap once a sign-in has taken a while). The in-app browser sees its own scheme,
// closes, and the app shows how it went on its own Connect accounts screen.

export type AppConnectStatus = "connected" | "problem" | "closed";

/** The web route that hands the result back to the app. */
export const APP_CONNECTED_PATH = "/api/mobile/connected";

/** The app's own return address for connecting accounts (app.json "scheme"), used when the app sends none. */
export const APP_CONNECTED_DEEP_LINK = "shopinbos://connected";

/** The web page that runs WhatsApp's Embedded Signup for the phone app. */
export const APP_WHATSAPP_CONNECT_PATH = "/channels/whatsapp";

const STATUSES: readonly AppConnectStatus[] = ["connected", "problem", "closed"];

export function isAppConnectStatus(value: unknown): value is AppConnectStatus {
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value);
}

/**
 * True for the app's "connected" return address (shopinbos://connected, or Expo Go's exp://…/--/connected). Older
 * app versions sent shopinbos://channels and read ?connected=<platform> instead (src/lib/sales-channels/pure.ts).
 */
export function isConnectedReturn(appReturn: string | null | undefined): boolean {
  const path = (appReturn ?? "").split(/[?#]/)[0];
  return /^shopinbos:\/\/\/?connected\/?$/.test(path) || /^exps?:\/\/[^/]+\/--\/connected\/?$/.test(path);
}

/** shopinbos://connected?channel=meta&status=connected, keeping anything else already on the app's address. */
export function appConnectedDeepLink(appReturn: string, channel: string, status: AppConnectStatus): string {
  const [path, query = ""] = appReturn.split("#")[0].split("?");
  const params = new URLSearchParams(query);
  params.set("channel", channel);
  params.set("status", status);
  return `${path}?${params.toString()}`;
}

/** The channel and outcome the web put on the app's return address (null when it isn't one). */
export function readAppConnectedLink(url: string | null | undefined): { channel: string; status: AppConnectStatus } | null {
  if (!url) return null;
  const params = new URLSearchParams(url.split("#")[0].split("?")[1] ?? "");
  const channel = params.get("channel");
  const status = params.get("status");
  if (!channel || !/^[a-z_]{2,20}$/.test(channel) || !isAppConnectStatus(status)) return null;
  return { channel, status };
}

/** The web page (path and query) that sends the in-app browser back to the app's address. */
export function appConnectedPagePath(deepLink: string): string {
  return `${APP_CONNECTED_PATH}?to=${encodeURIComponent(deepLink)}`;
}

/** The WhatsApp sign-up page for the app (path and query), with the app's return address. */
export function appWhatsAppConnectPath(appReturn: string): string {
  return `${APP_WHATSAPP_CONNECT_PATH}?app=${encodeURIComponent(appReturn)}`;
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

/**
 * The small "Back to the app" page: goes to the app's address straight away (a refresh and a script, whichever the
 * browser allows) and shows one button for browsers that only open an app after a tap. `deepLink` must already be
 * checked (appReturnUrl in src/lib/sales-channels/pure.ts): it is escaped here, never trusted.
 */
export function appConnectedPageHtml(deepLink: string, words: { lang: string; title: string; body: string; button: string }): string {
  const href = escapeHtml(deepLink);
  return `<!doctype html>
<html lang="${escapeHtml(words.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0;url=${href}">
<title>${escapeHtml(words.title)}</title>
<style>
  :root { color-scheme: light dark; --bg: #FAF7F1; --ink: #0E2A38; --soft: #6E6E68; --btn: #0E2A38; --btn-ink: #F4F1EA; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0E2A38; --ink: #F4F1EA; --soft: #B9C3C7; --btn: #73D8C8; --btn-ink: #0E2A38; } }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center; padding: 24px 16px; background: var(--bg); color: var(--ink); font: 16px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 360px; text-align: center; }
  h1 { margin: 0 0 8px; font-size: 22px; letter-spacing: -0.3px; }
  p { margin: 0 0 22px; color: var(--soft); }
  a { display: inline-block; min-height: 48px; padding: 13px 26px; border-radius: 999px; background: var(--btn); color: var(--btn-ink); font-weight: 700; text-decoration: none; }
</style>
</head>
<body>
<main>
<h1>${escapeHtml(words.title)}</h1>
<p>${escapeHtml(words.body)}</p>
<a href="${href}" id="back">${escapeHtml(words.button)}</a>
</main>
<script>try { window.location.replace(document.getElementById("back").getAttribute("href")); } catch (e) {}</script>
</body>
</html>`;
}
