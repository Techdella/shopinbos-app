import { appHostPath } from "@shared/app-links";
import { appRouteFor, routeHref } from "@shared/notifications";
import { appScreenFor } from "@/lib/web";
import { captureEntry } from "@/lib/seller-onboarding";

// Links from outside the app. An app.shopinbos.com link that iOS opened in the app (universal links,
// shared/app-links.ts) goes to the app's screen for that page, the same one openPath picks; one the app has no
// screen for lands on the start screen. Anything else (shopinbos:// sign-in returns, Expo dev links) passes through
// untouched. Never throws: a bad link must not crash the app on launch. A /signup link opens sign-up.

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    // What the link carried (?intent=add_product&productSlug=…, ?ref=, ?invite=): kept through sign-in, used by
    // the seller onboarding (app/onboarding) and the sign-up (lib/auth.ts syncAccount sends the referral).
    const query = path.indexOf("?");
    if (query >= 0) captureEntry(path.slice(query).split("#")[0] ?? "");
    const webPath = appHostPath(path);
    if (webPath === null) return path;
    if (/^\/signup\/?(\?|$)/.test(webPath)) return "/signup";
    const route = appScreenFor(webPath) ?? appRouteFor(webPath);
    return route ? routeHref(route) : "/";
  } catch {
    return "/";
  }
}
