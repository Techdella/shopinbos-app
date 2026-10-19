// Pages the phone app opens on the web (through /auth/handoff) are marked "opened from the app" for as long as the
// borrowed session lasts. App store rules don't allow selling digital things (the store launch fee, plans, AI credits)
// inside an app except through Apple/Google in-app purchase, so purchase screens hide themselves in those sessions.
// The website itself is unchanged.

export const APP_SESSION_COOKIE = "sib_app";
/** Matches the borrowed access token in /auth/handoff (up to an hour). */
export const APP_SESSION_MAX_AGE = 60 * 60;

export function hasAppSessionCookie(cookieHeader: string) {
  return cookieHeader.split(/;\s*/).includes(`${APP_SESSION_COOKIE}=1`);
}
