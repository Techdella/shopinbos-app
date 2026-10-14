import { normalizeDomain } from "./storefront";

// Tests only: VERCEL_API_BASE_URL points domain calls at a local stub. Ignored on the live site.
const VERCEL_API_BASE = (process.env.VERCEL_ENV !== "production" && process.env.VERCEL_API_BASE_URL) || "https://api.vercel.com";
const DOMAIN_SUGGESTION_TLDS = ["com", "store", "shop", "ng", "co"];

export interface DomainSearchResult {
  domain: string;
  ending: string;
  available: boolean;
  price: number | null;
  /** Yearly renewal price (USD), when available. */
  renewalPrice: number | null;
  currency: string;
}

export interface VercelDomainVerification {
  type: string;
  domain: string;
  value: string;
  reason: string;
}

export interface VercelProjectDomain {
  name: string;
  apexName: string;
  projectId: string;
  verified: boolean;
  redirect?: string | null;
  redirectStatusCode?: 301 | 302 | 307 | 308 | null;
  gitBranch?: string | null;
  customEnvironmentId?: string | null;
  updatedAt?: number;
  createdAt?: number;
  verification?: VercelDomainVerification[];
}

export interface VercelDomainConfig {
  configuredBy: "CNAME" | "A" | "http" | "dns-01" | null;
  acceptedChallenges: Array<"dns-01" | "http-01">;
  recommendedIPv4: Array<{ rank: number; value: string[] }>;
  recommendedCNAME: Array<{ rank: number; value: string }>;
  misconfigured: boolean;
}

export interface VercelAssignedDomain {
  domain: string;
  verified: boolean;
  verification: VercelDomainVerification[];
  configuration: VercelDomainConfig | null;
}

export interface VercelRegistrarPrice {
  years: number;
  purchasePrice: number;
  renewalPrice: number;
  transferPrice: number;
}

export interface VercelDomainOrderItem {
  purchaseType: string;
  autoRenew: boolean;
  years: number;
  domainName: string;
  status: string;
  price: number;
  error?: {
    code?: string;
    details?: Record<string, string>;
  };
}

export interface VercelDomainOrder {
  orderId: string;
  domains: VercelDomainOrderItem[];
  status: "draft" | "purchasing" | "completed" | "failed";
  error?: {
    code?: string;
    message?: string;
  };
}

export interface VercelContactInformation {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address1: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  address2?: string;
  companyName?: string;
  fax?: string;
  additional?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface VercelRegistrarPurchaseResult {
  orderId: string;
  _links?: Record<string, unknown>;
}

export class VercelApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "VercelApiError";
  }
}

function getVercelDomainConfig() {
  const token = process.env.VERCEL_TOKEN?.trim();
  const project = process.env.VERCEL_PROJECT_ID_OR_NAME?.trim();
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  const teamSlug = process.env.VERCEL_TEAM_SLUG?.trim();

  return {
    token,
    project,
    teamId,
    teamSlug,
    configured: Boolean(token && project),
  };
}

export function hasVercelDomainConfig() {
  return getVercelDomainConfig().configured;
}

async function readVercelError(res: Response): Promise<{ message: string; code?: string }> {
  const fallback = `Vercel API request failed with ${res.status}`;
  // Read the body once: json() then text() on the same response would fail the second time.
  const text = await res.text().catch(() => "");
  try {
    const json = JSON.parse(text) as {
      error?: { message?: string; code?: string };
      message?: string;
      code?: string;
    };

    return { message: json.error?.message ?? json.message ?? fallback, code: json.error?.code ?? json.code };
  } catch {
    return { message: text || fallback };
  }
}

function getTeamQuery() {
  const { teamId, teamSlug } = getVercelDomainConfig();
  const query = new URLSearchParams();

  if (teamId) query.set("teamId", teamId);
  if (teamSlug) query.set("slug", teamSlug);

  return query;
}

async function vercelRequest<T>(pathname: string, init?: RequestInit) {
  const { token, configured } = getVercelDomainConfig();
  if (!configured || !token) {
    throw new Error("Vercel domain integration is not configured.");
  }

  const query = getTeamQuery();
  const suffix = query.toString();
  const url = `${VERCEL_API_BASE}${pathname}${suffix ? `${pathname.includes("?") ? "&" : "?"}${suffix}` : ""}`;

  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const { message, code } = await readVercelError(res);
    throw new VercelApiError(message, res.status, code);
  }

  // Some registrar endpoints (auto-renew) answer 204 with no body.
  if (res.status === 204) return undefined as T;

  return (await res.json()) as T;
}

async function getProjectDomain(domain: string) {
  const { project } = getVercelDomainConfig();
  return vercelRequest<VercelProjectDomain>(
    `/v9/projects/${encodeURIComponent(project!)}/domains/${encodeURIComponent(domain)}`,
  );
}

async function addProjectDomain(domain: string) {
  const { project } = getVercelDomainConfig();
  return vercelRequest<VercelProjectDomain>(
    `/v10/projects/${encodeURIComponent(project!)}/domains`,
    {
      method: "POST",
      body: JSON.stringify({ name: domain }),
    },
  );
}

async function verifyProjectDomain(domain: string) {
  const { project } = getVercelDomainConfig();
  return vercelRequest<VercelProjectDomain>(
    `/v9/projects/${encodeURIComponent(project!)}/domains/${encodeURIComponent(domain)}/verify`,
    {
      method: "POST",
    },
  );
}

async function getDomainConfig(domain: string) {
  return vercelRequest<VercelDomainConfig>(`/v6/domains/${encodeURIComponent(domain)}/config`);
}

async function getDomainAvailability(domain: string) {
  return vercelRequest<{ available: boolean }>(
    `/v1/registrar/domains/${encodeURIComponent(domain)}/availability`,
  );
}

async function getDomainPrice(domain: string, years?: number) {
  const params = new URLSearchParams();
  if (years) params.set("years", String(years));

  return vercelRequest<VercelRegistrarPrice>(
    `/v1/registrar/domains/${encodeURIComponent(domain)}/price${params.toString() ? `?${params.toString()}` : ""}`,
  );
}

async function buyDomain(
  domain: string,
  options: {
    years: number;
    autoRenew: boolean;
    expectedPrice: number;
    contactInformation: VercelContactInformation;
  },
) {
  return vercelRequest<VercelRegistrarPurchaseResult>(
    `/v1/registrar/domains/${encodeURIComponent(domain)}/buy`,
    {
      method: "POST",
      body: JSON.stringify(options),
    },
  );
}

// Renew a domain registered on this Vercel account (https://vercel.com/docs/rest-api/domains-registrar/renew-a-domain).
async function renewDomain(
  domain: string,
  options: { years: number; expectedPrice: number; contactInformation?: VercelContactInformation },
) {
  return vercelRequest<VercelRegistrarPurchaseResult>(
    `/v1/registrar/domains/${encodeURIComponent(domain)}/renew`,
    {
      method: "POST",
      body: JSON.stringify(options),
    },
  );
}

// The auth code another registrar asks for to move the domain away
// (https://vercel.com/docs/rest-api/domains-registrar/get-the-auth-code-for-a-domain). 409 while transfer-locked.
async function getDomainAuthCode(domain: string) {
  return vercelRequest<{ authCode: string }>(`/v1/registrar/domains/${encodeURIComponent(domain)}/auth-code`);
}

// https://vercel.com/docs/rest-api/domains-registrar/update-auto-renew-for-a-domain (204, no body).
async function updateDomainAutoRenew(domain: string, autoRenew: boolean) {
  return vercelRequest<void>(`/v1/registrar/domains/${encodeURIComponent(domain)}/auto-renew`, {
    method: "PATCH",
    body: JSON.stringify({ autoRenew }),
  });
}

async function getDomainOrder(orderId: string) {
  return vercelRequest<VercelDomainOrder>(`/v1/registrar/orders/${encodeURIComponent(orderId)}`);
}

async function getContactInfoSchema(domain: string) {
  return vercelRequest<Record<string, unknown>>(
    `/v1/registrar/domains/${encodeURIComponent(domain)}/contact-info/schema`,
  );
}

export async function getDomainAvailabilityOnVercel(rawDomain: string) {
  const domain = normalizeDomain(rawDomain);
  if (!hasVercelDomainConfig()) {
    throw new Error("Vercel domain integration is not configured.");
  }
  return getDomainAvailability(domain);
}

export async function searchDomainsOnVercel(query: string) {
  const sanitized = query.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!sanitized) return [];

  if (!hasVercelDomainConfig()) {
    throw new Error("Vercel domain integration is not configured. Set VERCEL_TOKEN and VERCEL_PROJECT_ID_OR_NAME to search and buy domains.");
  }

  const results = await Promise.allSettled(
    DOMAIN_SUGGESTION_TLDS.map(async (ending) => {
      const domain = `${sanitized}.${ending}`;
      const availability = await getDomainAvailability(domain);

      let price: number | null = null;
      let renewalPrice: number | null = null;
      if (availability.available) {
        try {
          const pricing = await getDomainPrice(domain);
          price = pricing.purchasePrice;
          renewalPrice = pricing.renewalPrice;
        } catch {
          price = null;
        }
      }

      return {
        domain,
        ending,
        available: availability.available,
        price,
        renewalPrice,
        currency: "USD",
      } satisfies DomainSearchResult;
    }),
  );

  const domains = results
    .filter((result): result is PromiseFulfilledResult<DomainSearchResult> => result.status === "fulfilled")
    .map((result) => result.value);

  return domains;
}

export async function assignDomainOnVercel(rawDomain: string): Promise<VercelAssignedDomain> {
  const domain = normalizeDomain(rawDomain);

  let projectDomain: VercelProjectDomain;

  try {
    projectDomain = await addProjectDomain(domain);
  } catch (error) {
    if (error instanceof VercelApiError && (error.status === 400 || error.status === 409)) {
      projectDomain = await getProjectDomain(domain);
    } else {
      throw error;
    }
  }

  if (!projectDomain.verified && projectDomain.verification?.length) {
    try {
      projectDomain = await verifyProjectDomain(domain);
    } catch {
      // Leave verification instructions in place for the UI.
    }
  }

  let configuration: VercelDomainConfig | null = null;
  try {
    configuration = await getDomainConfig(domain);
  } catch {
    configuration = null;
  }

  return {
    domain,
    verified: projectDomain.verified,
    verification: projectDomain.verification ?? [],
    configuration,
  };
}

export async function getDomainContactSchemaOnVercel(rawDomain: string) {
  const domain = normalizeDomain(rawDomain);

  if (!hasVercelDomainConfig()) {
    return {};
  }

  return getContactInfoSchema(domain);
}

export async function getDomainPriceOnVercel(rawDomain: string, years?: number) {
  const domain = normalizeDomain(rawDomain);
  return getDomainPrice(domain, years);
}

export async function buyDomainOnVercel(
  rawDomain: string,
  options: {
    years: number;
    autoRenew: boolean;
    contactInformation: VercelContactInformation;
    /** Refuse when Vercel's price (USD) is above this. The price itself always comes from Vercel, never the client. */
    maxPrice?: number;
  },
) {
  const domain = normalizeDomain(rawDomain);

  if (!hasVercelDomainConfig()) {
    throw new Error("Vercel domain integration is not configured. Set VERCEL_TOKEN and VERCEL_PROJECT_ID_OR_NAME before buying domains.");
  }

  const pricing = await getDomainPrice(domain, options.years);
  if (options.maxPrice !== undefined && !(pricing.purchasePrice <= options.maxPrice)) {
    throw new Error("That domain costs more than we can buy for you here. Pick another name, or buy it yourself and connect it.");
  }

  return buyDomain(domain, {
    years: options.years,
    autoRenew: options.autoRenew,
    expectedPrice: pricing.purchasePrice,
    contactInformation: options.contactInformation,
  });
}

/**
 * Renews a domain on the platform's registrar account for `years`. Only call it after the seller's payment was
 * verified. Refuses when Vercel's renewal price (USD) is above maxPrice; the price always comes from Vercel.
 */
export async function renewDomainOnVercel(
  rawDomain: string,
  options: { years: number; maxPrice: number; contactInformation?: VercelContactInformation },
) {
  const domain = normalizeDomain(rawDomain);

  if (!hasVercelDomainConfig()) {
    throw new Error("Vercel domain integration is not configured. Set VERCEL_TOKEN and VERCEL_PROJECT_ID_OR_NAME before renewing domains.");
  }

  const pricing = await getDomainPrice(domain, options.years);
  if (!(pricing.renewalPrice <= options.maxPrice)) {
    throw new Error("The renewal price went up since you paid.");
  }

  return renewDomain(domain, {
    years: options.years,
    expectedPrice: pricing.renewalPrice,
    ...(options.contactInformation ? { contactInformation: options.contactInformation } : {}),
  });
}

/** The transfer (EPP) auth code for a domain registered on this account. Throws VercelApiError 409 while locked. */
export async function getDomainAuthCodeOnVercel(rawDomain: string) {
  const domain = normalizeDomain(rawDomain);
  if (!hasVercelDomainConfig()) {
    throw new Error("Vercel domain integration is not configured.");
  }
  return getDomainAuthCode(domain);
}

/** Switches Vercel's own auto-renew on or off (we keep it off: renewals are paid by the seller first). */
export async function setDomainAutoRenewOnVercel(rawDomain: string, autoRenew: boolean) {
  const domain = normalizeDomain(rawDomain);
  if (!hasVercelDomainConfig()) return;
  await updateDomainAutoRenew(domain, autoRenew);
}

export async function getDomainOrderOnVercel(orderId: string) {
  if (!hasVercelDomainConfig()) {
    throw new Error("Vercel domain integration is not configured.");
  }

  return getDomainOrder(orderId);
}

/** Takes a domain off the Vercel project (a seller removed or replaced it). A domain that isn't there is fine. */
export async function removeDomainFromVercel(rawDomain: string) {
  const domain = normalizeDomain(rawDomain);
  if (!domain || !hasVercelDomainConfig()) return false;
  const { project } = getVercelDomainConfig();
  try {
    await vercelRequest<unknown>(`/v9/projects/${encodeURIComponent(project!)}/domains/${encodeURIComponent(domain)}`, { method: "DELETE" });
    return true;
  } catch (error) {
    if (error instanceof VercelApiError && error.status === 404) return true;
    throw error;
  }
}
