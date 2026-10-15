// Email channel types and constants the browser also needs (no node: imports, safe in client components).

export type EmailProvider = "platform" | "resend_domain" | "gmail";
export type DomainKind = "bought" | "custom" | "free";
export type EmailOption = "domain_auto" | "domain_dns" | "gmail" | "buy_domain";

export interface EmailRecommendation {
  kind: DomainKind;
  /** The store's own domain (www-less), when it has one. */
  domain: string | null;
  /** Shown first, marked "Recommended". */
  primary: EmailOption;
  /** Every option to show, in order (the primary first). */
  options: EmailOption[];
}

export const EMAIL_PREFIXES = ["hello", "sales", "orders", "support", "info", "shop"] as const;

export type DnsPurpose = "spf" | "dkim" | "dmarc" | "receiving" | "other";
export type DnsRecordStatus = "pending" | "verified" | "failed";

export interface EmailDnsRecord {
  purpose: DnsPurpose;
  type: "TXT" | "MX" | "CNAME";
  /** The host relative to the domain, as most registrars want it ("@" for the domain itself). */
  name: string;
  /** The full host name, for registrars that want it. */
  fqdn: string;
  value: string;
  priority: number | null;
  ttl: string;
  status: DnsRecordStatus;
}
