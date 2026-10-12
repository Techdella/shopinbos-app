// Custom-domain ownership on the server: claim a domain (pending), verify it with the TXT record, remove it,
// and mark a domain bought through the app as verified. Only a verified domain is ever written to
// Store.customDomain, so only verified domains are served (src/lib/domains/lookup.ts).
import { db } from "@/lib/db/client";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { forgetCustomDomain } from "@/lib/domains/lookup";
import { getPlatformRootDomain } from "@/lib/domains/storefront";
import { assignDomainOnVercel, hasVercelDomainConfig, removeDomainFromVercel } from "@/lib/domains/vercel";
import {
  checkVerificationTxt,
  dnsRecordsFor,
  domainKey,
  isVerifyToken,
  newVerifyToken,
  parseDomainInput,
  routingTargets,
  type DomainSettingsState,
  type HostingStatus,
  type ServeAs,
  type TxtResolver,
  type VerifyCheck,
} from "@/lib/domains/verification";

export const DOMAIN_TAKEN_MESSAGE =
  "That domain is already connected to another Shopinbos store. If it's yours, contact support and we'll help you move it.";

/** Per store, per server instance. Enough for a seller retrying while DNS spreads; stops hammering resolvers. */
const VERIFY_LIMIT = { maxRequests: 10, windowMs: 10 * 60_000 };
const CLAIM_LIMIT = { maxRequests: 20, windowMs: 60 * 60_000 };

const storeDomainSelect = {
  id: true,
  customDomain: true,
  customDomainKey: true,
  customDomainVerifiedAt: true,
  pendingDomain: true,
  domainVerifyToken: true,
} as const;

type StoreDomainRow = {
  id: string;
  customDomain: string | null;
  customDomainKey: string | null;
  customDomainVerifiedAt: Date | null;
  pendingDomain: string | null;
  domainVerifyToken: string | null;
};

export class DomainError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.status = status;
  }
}

function inputConfig() {
  return {
    rootDomain: getPlatformRootDomain(),
    appHosts: [process.env.NEXT_PUBLIC_APP_URL, process.env.APP_URL, process.env.CSRF_TRUSTED_ORIGINS],
  };
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

export function domainSettingsState(store: StoreDomainRow): DomainSettingsState {
  const targets = routingTargets(process.env);
  const live = store.customDomain && store.customDomainVerifiedAt
    ? { domain: store.customDomain, verifiedAt: store.customDomainVerifiedAt.toISOString(), records: dnsRecordsFor(store.customDomain, null, targets) }
    : null;
  const pending = store.pendingDomain
    ? {
        domain: store.pendingDomain,
        servedAs: (store.pendingDomain.startsWith("www.") ? "www" : "apex") as ServeAs,
        records: dnsRecordsFor(store.pendingDomain, isVerifyToken(store.domainVerifyToken) ? store.domainVerifyToken : null, targets),
      }
    : null;
  return { live, pending, hostingConfigured: hasVercelDomainConfig() };
}

async function loadStore(userId: string): Promise<StoreDomainRow> {
  const store = await db.store.findUnique({ where: { userId }, select: storeDomainSelect });
  if (!store) throw new DomainError("store_not_found", "Create your store before adding a custom domain.", 404);
  // A pending domain without a token (moved there by the 2026-10-15 migration) gets one on first look.
  if (store.pendingDomain && !isVerifyToken(store.domainVerifyToken)) {
    return db.store.update({ where: { id: store.id }, data: { domainVerifyToken: newVerifyToken() }, select: storeDomainSelect });
  }
  return store;
}

async function takenByAnotherStore(key: string, storeId: string) {
  const owner = await db.store.findFirst({ where: { customDomainKey: key, NOT: { id: storeId } }, select: { id: true } });
  return Boolean(owner);
}

export async function getDomainSettings(userId: string) {
  return domainSettingsState(await loadStore(userId));
}

/**
 * Starts (or restarts) proving ownership of a domain. Nothing is served until it is verified; a domain another
 * store verified is refused. Switching between the bare and www address of the store's own verified domain
 * needs no new proof.
 */
export async function claimDomain(userId: string, rawDomain: string, serveAs?: ServeAs | null) {
  const store = await loadStore(userId);
  if (!(await checkRateLimitShared(rateLimitKey("domain-claim", store.id), CLAIM_LIMIT)).allowed) {
    throw new DomainError("rate_limited", "Too many domain changes. Wait a little, then try again.", 429);
  }
  const parsed = parseDomainInput(rawDomain, serveAs, inputConfig());
  if (!parsed.ok) throw new DomainError(`invalid_domain`, parsed.message, 400);

  if (await takenByAnotherStore(parsed.domain, store.id)) throw new DomainError("domain_taken", DOMAIN_TAKEN_MESSAGE, 409);

  if (store.customDomainKey === parsed.domain && store.customDomainVerifiedAt) {
    if (store.customDomain !== parsed.host) {
      const previous = store.customDomain;
      const updated = await db.store.update({
        where: { id: store.id },
        data: { customDomain: parsed.host, pendingDomain: null, domainVerifyToken: null },
        select: storeDomainSelect,
      });
      forgetCustomDomain(previous, parsed.host);
      return domainSettingsState(updated);
    }
    const updated = await db.store.update({ where: { id: store.id }, data: { pendingDomain: null, domainVerifyToken: null }, select: storeDomainSelect });
    return domainSettingsState(updated);
  }

  // Same domain as the pending one keeps its token, so records already added still count.
  const sameClaim = store.pendingDomain && domainKey(store.pendingDomain) === parsed.domain && isVerifyToken(store.domainVerifyToken);
  const updated = await db.store.update({
    where: { id: store.id },
    data: { pendingDomain: parsed.host, domainVerifyToken: sameClaim ? store.domainVerifyToken : newVerifyToken() },
    select: storeDomainSelect,
  });
  return domainSettingsState(updated);
}

async function addToHosting(host: string): Promise<HostingStatus> {
  if (!hasVercelDomainConfig()) {
    return {
      status: "not_configured",
      message: "Automatic hosting setup isn't switched on for this server, so we didn't add the domain to hosting. Shopinbos support adds it for you; your free address keeps working meanwhile.",
      records: [],
    };
  }
  try {
    const assigned = await assignDomainOnVercel(host);
    if (assigned.verified) {
      return { status: "added", message: "Added to hosting. The secure certificate is issued once your routing record points at us.", records: [] };
    }
    return {
      status: "needs_records",
      message: "Added to hosting, which also asks for the records below before it serves the domain.",
      records: assigned.verification.map(({ type, domain, value, reason }) => ({ type, domain, value, reason })),
    };
  } catch (error) {
    return {
      status: "failed",
      message: `Your domain is verified, but adding it to hosting failed: ${error instanceof Error ? error.message : "unknown error"}. Contact support if this persists.`,
      records: [],
    };
  }
}

/** Checks the TXT record for the pending domain and, when it matches, makes it the store's live domain. */
export async function verifyPendingDomain(userId: string, resolver?: TxtResolver): Promise<{ state: DomainSettingsState; check: VerifyCheck }> {
  const store = await loadStore(userId);
  if (!store.pendingDomain || !isVerifyToken(store.domainVerifyToken)) {
    throw new DomainError("nothing_pending", "Add a domain first, then verify it.", 400);
  }
  if (!(await checkRateLimitShared(rateLimitKey("domain-verify", store.id), VERIFY_LIMIT)).allowed) {
    throw new DomainError("rate_limited", "Too many checks in a short time. DNS changes take a while to spread; wait 10 minutes, then verify again.", 429);
  }
  const parsed = parseDomainInput(store.pendingDomain, null, inputConfig());
  if (!parsed.ok) throw new DomainError("invalid_domain", parsed.message, 400);
  if (await takenByAnotherStore(parsed.domain, store.id)) throw new DomainError("domain_taken", DOMAIN_TAKEN_MESSAGE, 409);

  const check = await checkVerificationTxt(parsed.domain, store.domainVerifyToken, resolver);
  if (!check.ok) return { state: domainSettingsState(store), check };

  const previous = store.customDomain;
  let updated: StoreDomainRow;
  try {
    updated = await db.store.update({
      where: { id: store.id },
      data: {
        customDomain: parsed.host,
        customDomainKey: parsed.domain,
        customDomainVerifiedAt: new Date(),
        pendingDomain: null,
        domainVerifyToken: null,
      },
      select: storeDomainSelect,
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new DomainError("domain_taken", DOMAIN_TAKEN_MESSAGE, 409);
    throw error;
  }
  forgetCustomDomain(previous, parsed.host);

  const hosting = await addToHosting(parsed.host);
  if (previous && domainKey(previous) !== parsed.domain && hasVercelDomainConfig()) {
    await removeDomainFromVercel(previous).catch((error) => console.error("[domains] could not remove old domain from hosting", error));
  }
  return { state: domainSettingsState(updated), check: { ok: true, hosting } };
}

/** "live" disconnects the served domain (it stops being served); "pending" drops an unfinished claim. */
export async function removeDomain(userId: string, which: "live" | "pending" | "all") {
  const store = await loadStore(userId);
  const dropLive = which !== "pending" && Boolean(store.customDomain || store.customDomainKey);
  const updated = await db.store.update({
    where: { id: store.id },
    data: {
      ...(which !== "live" ? { pendingDomain: null, domainVerifyToken: null } : {}),
      ...(dropLive ? { customDomain: null, customDomainKey: null, customDomainVerifiedAt: null } : {}),
    },
    select: storeDomainSelect,
  });
  if (dropLive && store.customDomain) {
    forgetCustomDomain(store.customDomain);
    if (hasVercelDomainConfig()) {
      await removeDomainFromVercel(store.customDomain).catch((error) => console.error("[domains] could not remove domain from hosting", error));
    }
  }
  return domainSettingsState(updated);
}

/**
 * A domain bought through the app's purchase flow: the platform registered it and controls its DNS, so it is
 * verified as soon as the order completes. Returns false (and changes nothing) if another store holds it.
 */
export async function markPurchasedDomainVerified(storeId: string, rawDomain: string) {
  const parsed = parseDomainInput(rawDomain, null, inputConfig());
  if (!parsed.ok) return false;
  if (await takenByAnotherStore(parsed.domain, storeId)) return false;
  const before = await db.store.findUnique({ where: { id: storeId }, select: { customDomain: true } });
  try {
    await db.store.update({
      where: { id: storeId },
      data: {
        customDomain: parsed.host,
        customDomainKey: parsed.domain,
        customDomainVerifiedAt: new Date(),
        pendingDomain: null,
        domainVerifyToken: null,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return false;
    throw error;
  }
  forgetCustomDomain(before?.customDomain, parsed.host);
  return true;
}
