import { appHostPath } from "@shared/app-links";
import { appRouteFor, routeHref } from "@shared/notifications";
import { appScreenFor } from "@/lib/web";

// Links from outside the app. An app.shopinbos.com link that iOS opened in the app (universal links,
// shared/app-links.ts) goes to the app's screen for that page, the same one openPath picks; one the app has no
// screen for lands on the start screen. Anything else (shopinbos:// sign-in returns, Expo dev links) passes through
// untouched. Never throws: a bad link must not crash the app on launch.

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const webPath = appHostPath(path);
    if (webPath === null) return path;
    const route = appScreenFor(webPath) ?? appRouteFor(webPath);
    return route ? routeHref(route) : "/";
  } catch {
    return "/";
  }
}
