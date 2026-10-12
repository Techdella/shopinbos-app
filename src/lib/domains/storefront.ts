export interface StorefrontStoreRef {
  slug: string;
  customDomain?: string | null;
}

function getAppUrl() {
  const fallback = "https://app.shopinbos.com";
  const raw = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? fallback;

  try {
    return new URL(raw);
  } catch {
    return new URL(fallback);
  }
}

export function normalizeDomain(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .replace(/:\d+$/, "")
    .replace(/\.+$/, "");
}

export function getPlatformRootDomain() {
  const explicit = process.env.NEXT_PUBLIC_ROOT_DOMAIN?.trim();
  if (explicit) return normalizeDomain(explicit).replace(/^www\./, "");
  return getAppUrl().hostname.replace(/^www\./, "");
}

export function buildPlatformSubdomainOrigin(slug: string) {
  const appUrl = getAppUrl();
  const rootDomain = getPlatformRootDomain();
  const port = appUrl.port ? `:${appUrl.port}` : "";

  if (rootDomain === "localhost") {
    return `${appUrl.protocol}//${slug}.localhost${port}`;
  }

  return `${appUrl.protocol}//${slug}.${rootDomain}${port}`;
}

export function buildStorefrontOrigin(store: StorefrontStoreRef) {
  if (store.customDomain) {
    const domain = normalizeDomain(store.customDomain);
    const protocol = domain === "localhost" || domain.endsWith(".localhost") ? getAppUrl().protocol : "https:";
    return `${protocol}//${domain}`;
  }

  return buildPlatformSubdomainOrigin(store.slug);
}

export function buildStorefrontUrl(store: StorefrontStoreRef, pathname = "/") {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return new URL(normalizedPath, `${buildStorefrontOrigin(store)}/`).toString();
}

export function buildDirectStorefrontPath(slug: string, pathname = "/") {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return normalizedPath === "/" ? `/s/${slug}` : `/s/${slug}${normalizedPath}`;
}

export function getPublicStorefrontPath(basePath: string, pathname = "/") {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return basePath ? (normalizedPath === "/" ? basePath : `${basePath}${normalizedPath}`) : normalizedPath;
}

export function getStorefrontBasePathForHost(hostHeader: string | null | undefined, slug: string) {
  const host = normalizeDomain(hostHeader ?? "");
  const appHost = normalizeDomain(getAppUrl().host);
  const rootDomain = getPlatformRootDomain();

  if (!host || host === appHost || host === rootDomain || host === `www.${rootDomain}`) {
    return buildDirectStorefrontPath(slug);
  }

  return "";
}

export function getSubdomainSlug(hostHeader: string | null | undefined) {
  const host = normalizeDomain(hostHeader ?? "");
  const rootDomain = getPlatformRootDomain();

  if (!host) return null;

  if (rootDomain === "localhost") {
    if (!host.endsWith(".localhost")) return null;

    const subdomain = host.slice(0, -".localhost".length);
    if (!subdomain || subdomain.includes(".")) return null;

    return subdomain;
  }

  if (host === rootDomain || host === `www.${rootDomain}` || !host.endsWith(`.${rootDomain}`)) {
    return null;
  }

  const subdomain = host.slice(0, -(`.${rootDomain}`.length));
  if (!subdomain || subdomain.includes(".") || subdomain === "www") return null;

  return subdomain;
}
