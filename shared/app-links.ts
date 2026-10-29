// iPhone universal links: which app.shopinbos.com pages open the phone app instead of Safari, for people who have
// it installed. Pure, so the web (src/app/.well-known/apple-app-site-association/route.ts), the phone app
// (apps/mobile/src/app/+native-intent.tsx) and tests/app-links.test.mjs share one list.
//
// Only pages the phone app has a screen for are listed: the phone maps them with appRouteFor (shared/notifications.ts),
// the same as a tapped notification. Shop pages (/s/<slug>), sign-in and sign-up, /auth/* and everything else stay
// on the web. iOS reads the file when the app is installed or updated, so a change here reaches phones slowly.

export const IOS_BUNDLE_ID = "com.shopinbos.app";
/** The host whose links open the app (app.json ios.associatedDomains lists the same one). */
export const APP_LINK_HOST = "app.shopinbos.com";

/** Pages the app can't show although a listed pattern covers them: Safari keeps them. Checked first. */
export const UNIVERSAL_LINK_EXCLUDED = ["/home/orders/new", "/supplier/products/new"];

/** Apple's path patterns: `*` is any run of characters (slashes too), `?` one character. */
export const UNIVERSAL_LINK_PATHS = [
  // Sellers
  "/home",
  "/home/orders",
  "/home/orders/*",
  "/home/messages",
  "/home/messages/partners",
  "/home/inbox",
  "/home/inbox/partners",
  "/home/reviews",
  "/home/reviews/*",
  "/home/marketing",
  "/home/marketing/*",
  "/home/products",
  "/home/products/*",
  "/home/inventory",
  "/home/inventory/*",
  "/home/notifications",
  "/home/notifications/*",
  "/home/payments",
  "/home/payments/*",
  "/home/payouts",
  "/home/payouts/*",
  "/home/shipping",
  "/home/logistics",
  "/home/wallet",
  "/home/settings",
  "/home/settings/*",
  "/home/legal/*",
  "/home/preorders",
  "/products",
  "/products/*",
  "/marketplace",
  "/marketplace/*",
  "/channels",
  // Suppliers
  "/supplier",
  "/supplier/dashboard",
  "/supplier/orders",
  "/supplier/orders/*",
  "/supplier/quotes",
  "/supplier/quotes/*",
  "/supplier/quote-requests",
  "/supplier/quote-requests/*",
  "/supplier/inbox",
  "/supplier/payouts",
  "/supplier/wholesale",
  "/supplier/products",
  "/supplier/products/*",
  "/supplier/wallet",
  "/supplier/verification",
  "/supplier/agreements",
  "/supplier/preorders",
  // Delivery companies and riders
  "/logistics",
  "/logistics/dashboard",
  "/logistics/bookings",
  "/logistics/bookings/*",
  "/logistics/jobs",
  "/logistics/jobs/*",
  "/logistics/cash",
  "/logistics/payouts",
  "/logistics/billing",
  "/logistics/wallet",
  "/logistics/connections",
  "/logistics/inbox",
  "/logistics/verification",
  "/logistics/quotes",
  "/rider",
  "/rider/drop/*",
];

function patternRegExp(pattern: string) {
  const body = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${body}$`);
}

/** True when iOS would open this path in the app (Apple's matching: excludes first, then the listed patterns). */
export function opensInApp(pathname: string): boolean {
  if (UNIVERSAL_LINK_EXCLUDED.some((pattern) => patternRegExp(pattern).test(pathname))) return false;
  return UNIVERSAL_LINK_PATHS.some((pattern) => patternRegExp(pattern).test(pathname));
}

/** The incoming link as a path on the app host ("/home/orders/abc?x=1"), or null when it's another host or scheme. */
export function appHostPath(url: string, host: string = APP_LINK_HOST): string | null {
  const match = /^https:\/\/([^/?#]+)(\/[^#]*)?/i.exec(url.trim());
  if (!match || match[1].toLowerCase() !== host) return null;
  return match[2] ?? "/";
}

/**
 * The apple-app-site-association file for a Team ID (Apple Developer › Membership, 10 characters). Universal links
 * use applinks; webcredentials lets iOS offer saved app.shopinbos.com passwords on the app's log-in screen.
 */
export function appleAppSiteAssociation(teamId: string) {
  const appID = `${teamId}.${IOS_BUNDLE_ID}`;
  return {
    applinks: {
      details: [
        {
          appIDs: [appID],
          components: [
            ...UNIVERSAL_LINK_EXCLUDED.map((path) => ({ "/": path, exclude: true })),
            ...UNIVERSAL_LINK_PATHS.map((path) => ({ "/": path })),
          ],
        },
      ],
    },
    webcredentials: { apps: [appID] },
  };
}

/** Apple Team IDs are 10 capital letters and digits. */
export function isAppleTeamId(value: string | null | undefined): value is string {
  return typeof value === "string" && /^[A-Z0-9]{10}$/.test(value.trim());
}
