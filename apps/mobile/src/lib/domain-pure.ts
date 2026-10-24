// Web address (app/domain.tsx), the parts that need no network (tests/mobile-shop-web.test.mjs runs them). The shapes
// are the web's (src/lib/domains/verification.ts DomainSettingsState, VerifyCheck).

export type ServeAs = "apex" | "www";

export interface DnsRecord {
  purpose: "verify" | "route";
  type: "TXT" | "CNAME" | "A";
  name: string;
  /** What most registrars want in the "Host" box (the part before the domain). */
  label: string;
  value: string;
  required: boolean;
  note: string;
}

export interface DomainState {
  live: { domain: string; verifiedAt: string | null; records: DnsRecord[] } | null;
  pending: { domain: string; servedAs: ServeAs; records: DnsRecord[] } | null;
  hostingConfigured: boolean;
}

export type VerifyCheck = { ok: true } | { ok: false; code: "no_record" | "mismatch" | "timeout" | "dns_error"; message: string };

/** The records to add, required ones first (the optional twin last). */
export function recordsToAdd(records: readonly DnsRecord[]): DnsRecord[] {
  return [...records].sort((a, b) => Number(b.required) - Number(a.required));
}

/** Which plain line a check gets (m_domain "check.*"). */
export function checkKey(check: VerifyCheck | null): "check.ok" | "check.mismatch" | "check.later" | "check.notYet" | null {
  if (!check) return null;
  if (check.ok) return "check.ok";
  if (check.code === "mismatch") return "check.mismatch";
  if (check.code === "timeout" || check.code === "dns_error") return "check.later";
  return "check.notYet";
}

/** A claim refusal in plain words (m_domain "err.*"); null keeps the server's own message. */
export function claimErrorKey(code: string | undefined, message: string): "err.platform" | "err.invalid" | "err.taken" | "err.rateLimited" | null {
  if (code === "invalid_domain") return /platform|Shopinbos/i.test(message) ? "err.platform" : "err.invalid";
  if (code === "domain_taken") return "err.taken";
  if (code === "rate_limited") return "err.rateLimited";
  return null;
}
