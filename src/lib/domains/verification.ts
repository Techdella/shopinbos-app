// Custom-domain ownership: what a seller types → the host we serve, the ownership key, the DNS records they add,
// and the TXT check that proves they control the domain. No database or framework imports, so
// tests/domain-verification.test.mjs runs it directly; the server side is src/lib/domains/ownership.server.ts.
import { randomBytes } from "node:crypto";
import { Resolver } from "node:dns/promises";
import { PLATFORM_DOMAIN, hostsFromList, normalizeHost } from "../storefront/host-routing.ts";

/** The TXT record lives at `_shopinbos-verify.<domain>` and holds `shopinbos-verify=<token>`. */
export const VERIFY_LABEL = "_shopinbos-verify";
export const VERIFY_PREFIX = "shopinbos-verify=";

/** Vercel's documented routing targets. Override with DOMAIN_CNAME_TARGET / DOMAIN_A_RECORD if the project uses others. */
export const DEFAULT_CNAME_TARGET = "cname.vercel-dns.com";
export const DEFAULT_A_RECORD = "76.76.21.21";

/** Hosts that belong to the platform or its hosting: never a seller's domain. */
const PLATFORM_SUFFIXES = [PLATFORM_DOMAIN, "vercel.app", "vercel.sh", "vercel-dns.com", "now.sh", "localhost", "local", "internal", "test", "invalid", "example"];

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export type ServeAs = "apex" | "www";

export interface DomainInputConfig {
  /** NEXT_PUBLIC_ROOT_DOMAIN: its subdomains are store addresses, never custom domains. */
  rootDomain?: string | null;
  /** NEXT_PUBLIC_APP_URL, APP_URL, CSRF_TRUSTED_ORIGINS. */
  appHosts?: readonly (string | null | undefined)[];
}

export type ParsedDomain =
  | { ok: true; domain: string; host: string; servedAs: ServeAs }
  | { ok: false; code: "missing" | "invalid" | "ip" | "platform"; message: string };

/**
 * The ownership key for a host: lowercase, no scheme, path, port or trailing dot, and no leading "www."
 * ("https://WWW.Adas.ng:443/shop" → "adas.ng"). One store owns a key; it is served on the key and its www twin.
 */
export function domainKey(raw: string | null | undefined) {
  return normalizeHost(String(raw ?? "").split(/[?#]/)[0]).replace(/^www\./, "");
}

function isPlatformHost(host: string, config: DomainInputConfig) {
  const roots = new Set(PLATFORM_SUFFIXES);
  const root = normalizeHost(config.rootDomain ?? "").replace(/^www\./, "");
  if (root) roots.add(root);
  for (const appHost of hostsFromList(config.appHosts ?? [])) roots.add(appHost.replace(/^www\./, ""));
  for (const suffix of roots) {
    if (host === suffix || host.endsWith(`.${suffix}`)) return true;
  }
  return false;
}

/**
 * Parses what a seller typed. `serveAs` picks the address buyers see: the bare domain or its www form (typing
 * "www." chooses www unless serveAs says otherwise). Refuses IPs, platform and hosting domains, and non-names.
 */
export function parseDomainInput(raw: string | null | undefined, serveAs?: ServeAs | null, config: DomainInputConfig = {}): ParsedDomain {
  const input = String(raw ?? "").trim();
  if (!input) return { ok: false, code: "missing", message: "Enter the domain you own, like yourbrand.com." };
  const host = normalizeHost(input.split(/[?#]/)[0]);
  if (!host) return { ok: false, code: "invalid", message: "That doesn't look like a domain. Type it like yourbrand.com." };
  if (IPV4.test(host) || host.includes(":")) {
    return { ok: false, code: "ip", message: "Use a domain name, not an IP address." };
  }
  const domain = host.replace(/^www\./, "");
  const labels = domain.split(".");
  if (
    domain.length > 253 - 4 ||
    labels.length < 2 ||
    !labels.every((label) => LABEL.test(label)) ||
    !/[a-z]/.test(labels[labels.length - 1]!) ||
    /^\d+$/.test(labels[labels.length - 1]!)
  ) {
    return { ok: false, code: "invalid", message: "That doesn't look like a domain. Type it like yourbrand.com or shop.yourbrand.ng." };
  }
  if (isPlatformHost(domain, config)) {
    return { ok: false, code: "platform", message: "That address belongs to Shopinbos or its hosting. Your free store address already works; connect a domain you bought yourself." };
  }
  const servedAs: ServeAs = serveAs ?? (host.startsWith("www.") ? "www" : "apex");
  return { ok: true, domain, host: servedAs === "www" ? `www.${domain}` : domain, servedAs };
}

/** A fresh verification token: 32 random bytes, base64url (43 characters). */
export function newVerifyToken() {
  return randomBytes(32).toString("base64url");
}

export function isVerifyToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN.test(value);
}

export function verifyRecordName(domain: string) {
  return `${VERIFY_LABEL}.${domainKey(domain)}`;
}

export function verifyRecordValue(token: string) {
  return `${VERIFY_PREFIX}${token}`;
}

export interface DnsRecord {
  purpose: "verify" | "route";
  type: "TXT" | "CNAME" | "A";
  /** Full name; most registrars want only the part before the domain (shown as `label`). */
  name: string;
  label: string;
  value: string;
  required: boolean;
  note: string;
}

export interface RoutingTargets {
  cname?: string | null;
  a?: string | null;
}

export function routingTargets(env: Record<string, string | undefined> = {}): { cname: string; a: string } {
  return {
    cname: env.DOMAIN_CNAME_TARGET?.trim() || DEFAULT_CNAME_TARGET,
    a: env.DOMAIN_A_RECORD?.trim() || DEFAULT_A_RECORD,
  };
}

/** The records a seller adds for `host` (the address buyers see): the ownership TXT, then where to point it. */
export function dnsRecordsFor(host: string, token: string | null, targets: { cname: string; a: string }): DnsRecord[] {
  const domain = domainKey(host);
  const servedAs: ServeAs = normalizeHost(host).startsWith("www.") ? "www" : "apex";
  const records: DnsRecord[] = [];
  if (token) {
    records.push({
      purpose: "verify",
      type: "TXT",
      name: verifyRecordName(domain),
      label: VERIFY_LABEL,
      value: verifyRecordValue(token),
      required: true,
      note: "Proves you own the domain. You can delete it after it's verified.",
    });
  }
  records.push({
    purpose: "route",
    type: "A",
    name: domain,
    label: "@",
    value: targets.a,
    required: servedAs === "apex",
    note: servedAs === "apex"
      ? "Points your domain at your store. If it's a subdomain (like shop.yourbrand.com), use a CNAME to the address below instead."
      : "Optional: lets the bare domain open your store too.",
  });
  records.push({
    purpose: "route",
    type: "CNAME",
    name: `www.${domain}`,
    label: "www",
    value: targets.cname,
    required: servedAs === "www",
    note: servedAs === "www" ? "Points www at your store." : "Optional: lets www open your store too.",
  });
  return records;
}

// ─── TXT check ───────────────────────────────────────────────────────────────

export type TxtResolver = (name: string) => Promise<string[][]>;

export type TxtCheck =
  | { ok: true }
  | { ok: false; code: "no_record" | "mismatch" | "timeout" | "dns_error"; message: string; found?: string[] };

/** TXT strings as published: chunks joined, surrounding quotes and whitespace trimmed. */
export function txtValues(records: readonly (readonly string[])[]) {
  return records.map((chunks) => chunks.join("").trim().replace(/^"(.*)"$/, "$1").trim()).filter(Boolean);
}

/** True when one of the TXT values is exactly `shopinbos-verify=<token>` (the prefix is case-insensitive). */
export function txtMatches(values: readonly string[], token: string) {
  if (!isVerifyToken(token)) return false;
  return values.some((value) => {
    const trimmed = value.trim();
    return trimmed.slice(0, VERIFY_PREFIX.length).toLowerCase() === VERIFY_PREFIX && trimmed.slice(VERIFY_PREFIX.length).trim() === token;
  });
}

const DNS_TIMEOUT_MS = 6_000;

export const systemTxtResolver: TxtResolver = async (name) => {
  const resolver = new Resolver({ timeout: 2_500, tries: 2 });
  return resolver.resolveTxt(name);
};

function shorten(value: string) {
  return value.length > 80 ? `${value.slice(0, 77)}…` : value;
}

/** Looks up `_shopinbos-verify.<domain>` and says whether it holds this token, or exactly why not. */
export async function checkVerificationTxt(domain: string, token: string, resolve: TxtResolver = systemTxtResolver, timeoutMs = DNS_TIMEOUT_MS): Promise<TxtCheck> {
  const name = verifyRecordName(domain);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let records: string[][];
  try {
    records = await Promise.race([
      resolve(name),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error("timeout"), { code: "ETIMEOUT" })), timeoutMs);
      }),
    ]);
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "ENOTFOUND" || code === "ENODATA" || code === "NXDOMAIN") {
      return { ok: false, code: "no_record", message: `We couldn't find a TXT record at ${name} yet. Add it at your domain company, then try again. New records can take up to an hour to show.` };
    }
    if (code === "ETIMEOUT" || code === "ETIMEDOUT") {
      return { ok: false, code: "timeout", message: `Looking up ${name} timed out. Your domain's DNS didn't answer; try again in a few minutes.` };
    }
    return { ok: false, code: "dns_error", message: `Looking up ${name} failed (${code ?? "DNS error"}). Try again in a few minutes.` };
  } finally {
    if (timer) clearTimeout(timer);
  }

  const values = txtValues(records);
  if (txtMatches(values, token)) return { ok: true };
  if (!values.length) {
    return { ok: false, code: "no_record", message: `We couldn't find a TXT record at ${name} yet. Add it at your domain company, then try again. New records can take up to an hour to show.` };
  }
  return {
    ok: false,
    code: "mismatch",
    message: `We found ${values.length === 1 ? "a TXT record" : `${values.length} TXT records`} at ${name}, but not the value ${VERIFY_PREFIX}${token}. Check it was copied exactly (no extra spaces or quotes).`,
    found: values.slice(0, 3).map(shorten),
  };
}

// ─── What the settings UI shows (built by ownership.server.ts) ───────────────

export interface HostingRecord {
  type: string;
  domain: string;
  value: string;
  reason: string;
}

export interface HostingStatus {
  /** added: on the hosting project and serving; needs_records: hosting wants the records below too;
   *  failed: adding it failed (message says why); not_configured: no hosting API keys, support adds it. */
  status: "added" | "needs_records" | "failed" | "not_configured";
  message: string;
  records: HostingRecord[];
}

export interface DomainSettingsState {
  live: { domain: string; verifiedAt: string | null; records: DnsRecord[] } | null;
  pending: { domain: string; servedAs: ServeAs; records: DnsRecord[] } | null;
  /** Whether verified domains are added to the hosting project automatically (Vercel API keys set). */
  hostingConfigured: boolean;
}

export type VerifyCheck = TxtCheck & { hosting?: HostingStatus };
