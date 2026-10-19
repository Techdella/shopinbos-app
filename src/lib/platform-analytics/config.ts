// Shopinbos's own product analytics (not the sellers' store tags): which of Mixpanel and PostHog are connected, from env. Two halves each:
//   - tracking: the browser SDK on app pages (NEXT_PUBLIC_* keys) plus server events (sign-ups, leads);
//   - reporting: Admin › Analytics reads numbers back with a read-only key (never sent to the browser).
// Pure so tests can use it.

export type AnalyticsProvider = "mixpanel" | "posthog";

export const PROVIDER_LABELS: Record<AnalyticsProvider, string> = { mixpanel: "Mixpanel", posthog: "PostHog" };

type Env = Record<string, string | undefined>;

const clean = (value: string | undefined) => value?.trim() || "";

export function mixpanelConfig(env: Env = process.env) {
  const eu = (clean(env.NEXT_PUBLIC_MIXPANEL_REGION) || clean(env.MIXPANEL_REGION)).toLowerCase() === "eu";
  return {
    token: clean(env.NEXT_PUBLIC_MIXPANEL_TOKEN),
    projectId: clean(env.MIXPANEL_PROJECT_ID),
    serviceUser: clean(env.MIXPANEL_SERVICE_ACCOUNT_USERNAME),
    serviceSecret: clean(env.MIXPANEL_SERVICE_ACCOUNT_SECRET),
    eu,
    ingestHost: eu ? "https://api-eu.mixpanel.com" : "https://api.mixpanel.com",
    queryHost: eu ? "https://eu.mixpanel.com" : "https://mixpanel.com",
  };
}

export function posthogConfig(env: Env = process.env) {
  const ingestHost = (clean(env.NEXT_PUBLIC_POSTHOG_HOST) || "https://us.i.posthog.com").replace(/\/+$/, "");
  // The app (query) host: us.i.posthog.com → us.posthog.com; self-hosted keeps its own host.
  const appHost = (clean(env.POSTHOG_APP_HOST) || ingestHost.replace("://us.i.posthog.com", "://us.posthog.com").replace("://eu.i.posthog.com", "://eu.posthog.com")).replace(/\/+$/, "");
  return {
    key: clean(env.NEXT_PUBLIC_POSTHOG_KEY),
    ingestHost,
    appHost,
    projectId: clean(env.POSTHOG_PROJECT_ID),
    personalApiKey: clean(env.POSTHOG_PERSONAL_API_KEY),
  };
}

export type ProviderStatus = {
  provider: AnalyticsProvider;
  label: string;
  tracking: boolean;
  serverEvents: boolean;
  reporting: boolean;
  /** Env vars still missing for full use, in the order to set them. */
  missing: string[];
  dashboardUrl: string;
};

export function providerStatuses(env: Env = process.env): ProviderStatus[] {
  const mp = mixpanelConfig(env);
  const ph = posthogConfig(env);
  const missing = (pairs: Array<[string, string]>) => pairs.filter(([, value]) => !value).map(([name]) => name);
  return [
    {
      provider: "mixpanel",
      label: PROVIDER_LABELS.mixpanel,
      tracking: Boolean(mp.token),
      serverEvents: Boolean(mp.token),
      reporting: Boolean(mp.projectId && mp.serviceUser && mp.serviceSecret),
      missing: missing([["NEXT_PUBLIC_MIXPANEL_TOKEN", mp.token], ["MIXPANEL_PROJECT_ID", mp.projectId], ["MIXPANEL_SERVICE_ACCOUNT_USERNAME", mp.serviceUser], ["MIXPANEL_SERVICE_ACCOUNT_SECRET", mp.serviceSecret]]),
      dashboardUrl: mp.projectId ? `${mp.queryHost}/project/${mp.projectId}` : mp.queryHost,
    },
    {
      provider: "posthog",
      label: PROVIDER_LABELS.posthog,
      tracking: Boolean(ph.key),
      serverEvents: Boolean(ph.key),
      reporting: Boolean(ph.projectId && ph.personalApiKey),
      missing: missing([["NEXT_PUBLIC_POSTHOG_KEY", ph.key], ["POSTHOG_PROJECT_ID", ph.projectId], ["POSTHOG_PERSONAL_API_KEY", ph.personalApiKey]]),
      dashboardUrl: ph.projectId ? `${ph.appHost}/project/${ph.projectId}` : ph.appHost,
    },
  ];
}

/**
 * Pages where Shopinbos's own trackers may run: the app and portals on the app's own host. Never a seller's
 * storefront (their shoppers are theirs, with their own tags and consent banner) or a rider/email link page.
 */
const TRACKED_PREFIXES = ["/home", "/onboarding", "/supplier", "/logistics", "/signup", "/login", "/forgot-password", "/reset-password", "/marketplace", "/suppliers", "/products", "/chip", "/studio", "/builder", "/seller", "/channels", "/peggy"];

export function isTrackedPath(pathname: string) {
  if (pathname === "/") return true;
  return TRACKED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** True on the app's own host (or localhost), false on a store's subdomain or custom domain. */
export function isAppHost(hostname: string, appUrl: string) {
  if (hostname === "localhost" || hostname === "127.0.0.1") return true;
  try {
    return new URL(appUrl).hostname === hostname;
  } catch {
    return false;
  }
}
