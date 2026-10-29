// Pages the phone app opens on the web (through /auth/handoff) are marked "opened from the app" for as long as the
// borrowed session lasts. App store rules don't allow selling digital things (plans, AI credits, themes, domains,
// add-ons, wallet top-ups) inside an app except through Apple/Google in-app purchase. The iPhone app ships as a free
// companion to the paid web tool (Apple 3.1.3(f), docs/store-payments-audit.md), which only holds while nothing the
// app shows sells or points to them. So in those sessions:
//   - the root layout marks <html data-in-app>: anything tagged data-purchase is hidden (globals.css), and
//     AppSessionGuard hides links to purchase pages (shared/store-payments.ts isDigitalPurchasePath);
//   - the endpoints that start a purchase refuse (app-session.server.ts appPurchaseRefusal);
//   - the credits and billing pages show a plain "not in the app" line instead.
// The website itself is unchanged.

export const APP_SESSION_COOKIE = "sib_app";
/** Matches the borrowed access token in /auth/handoff (up to an hour). */
export const APP_SESSION_MAX_AGE = 60 * 60;
/** Set on <html> in app sessions (data-in-app="1"). */
export const IN_APP_ATTRIBUTE = "data-in-app";

export function hasAppSessionCookie(cookieHeader: string) {
  return cookieHeader.split(/;\s*/).includes(`${APP_SESSION_COOKIE}=1`);
}

/** In the browser, outside React: true when this page was opened from the phone app (components use useAppSession). */
export function inAppSessionClient() {
  return typeof document !== "undefined" && hasAppSessionCookie(document.cookie);
}
