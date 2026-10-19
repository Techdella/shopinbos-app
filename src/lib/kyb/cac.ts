// Instant business check against Nigeria's CAC registry: the pure parts. Reads what the business typed
// (name + BN/RC number), decides the company type, compares names, links the account holder to the record and
// turns the provider's answer into one result. No imports, so it is unit-tested in tests/kyb-cac.test.mjs.
//
// Providers: Korapay Identity when KORAPAY_SECRET_KEY is set (developers.korapay.com, October 2026):
//   POST https://api.korapay.com/merchant/api/v1/identities/ng/cac { id: "RC1234567", registration_type, verification_consent }
//   Header: Authorization: Bearer <secret key>. A test key runs the sandbox (RC00000011 is found, RC11111111 is not).
//   200 → { status: true, data: { name, registration_number, company_status, type_of_entity, address,
//          registration_date, key_personnel: [{ name, designation, status, is_corporate }] } }
// else Youverify when YOUVERIFY_SECRET_KEY is set (doc.youverify.co, October 2026):
//   POST {base}/v2/api/verifications/ng/advance-check-with-tax { registrationNumber: "RC1234567" | "BN…", isConsent }
//   Header: token (secret key). Base: https://api.youverify.co, sandbox https://api.sandbox.youverify.co
//   200 → { data: { status: "found", name, registrationNumber, companyStatus, typeOfEntity, address, keyPersonnel } }
//   404 no record · 402 no balance · 429 slow down
// else Dojah (checked against docs.dojah.io, October 2026):
//   GET {base}/api/v1/kyc/cac/advance?rc_number=…&company_type=…
//   Headers: AppId, Authorization (secret key, no "Bearer"). Base: https://api.dojah.io, sandbox https://sandbox.dojah.io
//   company_type: BUSINESS_NAME | COMPANY | INCORPORATED_TRUSTEES | LIMITED_PARTNERSHIP | LIMITED_LIABILITY_PARTNERSHIP
//   200 → { entity: { company_name, rc_number, status, address, type_of_company, date_of_registration,
//                     affiliates: [{ first_name, last_name, affiliate_type, … }] } }
//   400 bad input · 401 bad keys · 402 wallet empty · 404 no record · 429 slow down
//
// CAC data is public, so a matching name and number alone only proves the business exists. It counts as the
// CAC document only when the account holder is also listed on the record (director, proprietor, shareholder)
// and the company is active. Anything less is saved for the review team and the certificate upload stays.

export const CAC_COMPANY_TYPES = [
  "BUSINESS_NAME",
  "COMPANY",
  "INCORPORATED_TRUSTEES",
  "LIMITED_PARTNERSHIP",
  "LIMITED_LIABILITY_PARTNERSHIP",
] as const;
export type CacCompanyType = (typeof CAC_COMPANY_TYPES)[number];

export const CAC_COMPANY_TYPE_LABELS: Record<CacCompanyType, string> = {
  BUSINESS_NAME: "Business name (BN)",
  COMPANY: "Limited company (RC)",
  INCORPORATED_TRUSTEES: "Incorporated trustees (IT)",
  LIMITED_PARTNERSHIP: "Limited partnership (LP)",
  LIMITED_LIABILITY_PARTNERSHIP: "Limited liability partnership (LLP)",
};

/** Checks per account in a rolling day. Each lookup is paid for. */
export const CAC_DAILY_ATTEMPTS = 5;

export function isCacCompanyType(value: unknown): value is CacCompanyType {
  return typeof value === "string" && (CAC_COMPANY_TYPES as readonly string[]).includes(value);
}

/**
 * Reads "RC 1234567", "rc-1234567", "BN1234567", "IT 12345" or plain digits. The prefix suggests the company
 * type when none was picked. Returns null when there is no 4–10 digit number.
 */
export function parseCacNumber(raw: string): { number: string; impliedType: CacCompanyType | null } | null {
  const cleaned = String(raw ?? "").trim().toUpperCase().replace(/[\s./-]+/g, "");
  const match = /^(RC|BN|IT|LP|LLP)?(\d{4,10})$/.exec(cleaned);
  if (!match) return null;
  const prefix = match[1] ?? "";
  const impliedType: CacCompanyType | null =
    prefix === "BN" ? "BUSINESS_NAME"
      : prefix === "RC" ? "COMPANY"
      : prefix === "IT" ? "INCORPORATED_TRUSTEES"
      : prefix === "LLP" ? "LIMITED_LIABILITY_PARTNERSHIP"
      : prefix === "LP" ? "LIMITED_PARTNERSHIP"
      : null;
  return { number: match[2], impliedType };
}

// Words that differ between how people write a name and how CAC stores it.
const NAME_NOISE = new Set([
  "LIMITED", "LTD", "PLC", "LLC", "LLP", "LP", "INC", "INCORPORATED", "CO", "COMPANY", "NIG", "NIGERIA",
  "THE", "AND", "OF", "ENT", "ENTERPRISE", "ENTERPRISES", "VENTURE", "VENTURES",
]);

/** Upper-case words of a business name without punctuation or legal suffixes ("Ade & Sons Ltd." → ADE SONS). */
export function companyNameTokens(name: string): string[] {
  return String(name ?? "")
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((word) => word && !NAME_NOISE.has(word));
}

/** Same business name once spacing, punctuation, word order and legal suffixes are ignored. */
export function companyNamesMatch(entered: string, registered: string): boolean {
  const a = companyNameTokens(entered);
  const b = companyNameTokens(registered);
  if (!a.length || !b.length) return false;
  const left = [...new Set(a)].sort().join(" ");
  const right = [...new Set(b)].sort().join(" ");
  return left === right;
}

function personTokens(name: string): Set<string> {
  return new Set(
    String(name ?? "")
      .toUpperCase()
      .replace(/[^A-Z\s'-]+/g, " ")
      .split(/[\s'-]+/)
      .filter((word) => word.length >= 2),
  );
}

export interface CacAffiliate {
  firstName: string;
  lastName: string;
  role: string;
  /** Registries that give one name line (Korapay's key_personnel, Youverify's keyPersonnel) instead of first and last names. */
  fullName?: string;
}

/** Roles on a CAC record that never make someone the business's owner. */
const NOT_OWNER_ROLES = /witness|secretary/i;

/** The account holder's name has the first and last name of someone on the CAC record, in any order. */
export function ownerListed(ownerName: string, affiliates: CacAffiliate[]): boolean {
  const owner = personTokens(ownerName);
  if (owner.size < 2) return false;
  return affiliates.some((person) => {
    if (person.role && NOT_OWNER_ROLES.test(person.role)) return false;
    if (person.fullName) {
      // One name line in no set order: the holder's first and last names must both be in it.
      const words = personTokens(person.fullName);
      const ownerWords = [...owner];
      return words.has(ownerWords[0]) && words.has(ownerWords[ownerWords.length - 1]);
    }
    const first = personTokens(person.firstName);
    const last = personTokens(person.lastName);
    if (!first.size || !last.size) return false;
    return [...first].some((word) => owner.has(word)) && [...last].every((word) => owner.has(word));
  });
}

export function registryStatusActive(status: string): boolean {
  return /^\s*active\s*$/i.test(String(status ?? ""));
}

export interface CacRecord {
  companyName: string;
  rcNumber: string;
  status: string;
  companyType: string;
  address?: string;
  registeredAt?: string;
  affiliates: CacAffiliate[];
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

/** Reads Dojah's `{ entity: {...} }` answer. Returns null when there is no usable record. */
export function parseDojahCac(body: unknown): CacRecord | null {
  const entity = (body as { entity?: unknown } | null)?.entity;
  if (!entity || typeof entity !== "object") return null;
  const e = entity as Record<string, unknown>;
  const companyName = str(e.company_name);
  if (!companyName) return null;
  const affiliates = Array.isArray(e.affiliates)
    ? e.affiliates
        .filter((a): a is Record<string, unknown> => Boolean(a) && typeof a === "object")
        .map((a) => ({ firstName: str(a.first_name), lastName: str(a.last_name), role: str(a.affiliate_type) }))
        .filter((a) => a.firstName || a.lastName)
    : [];
  return {
    companyName,
    rcNumber: str(e.rc_number) || str(e.business_number),
    status: str(e.status),
    companyType: str(e.type_of_company),
    ...(str(e.address) ? { address: str(e.address) } : {}),
    ...(str(e.date_of_registration) ? { registeredAt: str(e.date_of_registration) } : {}),
    affiliates,
  };
}

/** The number with its registry prefix (RC1234567, BN1234567…), the form Korapay and Youverify look up. */
export function prefixedCacNumber(number: string, companyType: CacCompanyType): string {
  const prefix = { BUSINESS_NAME: "BN", COMPANY: "RC", INCORPORATED_TRUSTEES: "IT", LIMITED_PARTNERSHIP: "LP", LIMITED_LIABILITY_PARTNERSHIP: "LLP" }[companyType];
  return `${prefix}${number}`;
}

function addressLine(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";
  const parts = ["addressLine", "street", "city", "lga", "state"].map((key) => str((value as Record<string, unknown>)[key])).filter(Boolean);
  return [...new Set(parts)].join(", ");
}

/**
 * Reads Youverify's TaxID and Business Verification answer (POST /v2/api/verifications/ng/advance-check-with-tax):
 * { success, data: { status: "found", name, registrationNumber, companyStatus, typeOfEntity, address,
 * registrationDate, keyPersonnel: [{ name, designation, status }] } }. Null when there is no usable record.
 */
export function parseYouverifyCac(body: unknown): CacRecord | null {
  const data = (body as { data?: unknown } | null)?.data;
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const companyName = str(d.name);
  if (!companyName || (str(d.status) && !/^found$/i.test(str(d.status)))) return null;
  const affiliates = Array.isArray(d.keyPersonnel)
    ? d.keyPersonnel
        .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === "object")
        // Former directors (status "INACTIVE", "RESIGNED"…) aren't the business's people any more.
        .filter((p) => !str(p.status) || /^active$/i.test(str(p.status)))
        .map((p) => ({ firstName: "", lastName: "", fullName: str(p.name), role: str(p.designation) }))
        .filter((p) => p.fullName)
    : [];
  const address = addressLine(d.address);
  const registeredAt = str(d.registrationDate).slice(0, 10);
  return {
    companyName,
    rcNumber: str(d.registrationNumber),
    status: str(d.companyStatus),
    companyType: str(d.typeOfEntity),
    ...(address ? { address } : {}),
    ...(registeredAt ? { registeredAt } : {}),
    affiliates,
  };
}

/**
 * Reads Korapay's CAC answer (POST /identities/ng/cac): { status: true, data: { name, registration_number,
 * company_status, type_of_entity, address, registration_date, key_personnel: [{ name, designation, status }] } }.
 * Null when there is no usable record.
 */
export function parseKorapayCac(body: unknown): CacRecord | null {
  const data = (body as { data?: unknown } | null)?.data;
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const companyName = str(d.name);
  if (!companyName) return null;
  const affiliates = Array.isArray(d.key_personnel)
    ? d.key_personnel
        .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === "object")
        // Former directors (status "INACTIVE", "RESIGNED"…) aren't the business's people any more.
        .filter((p) => !str(p.status) || /^active$/i.test(str(p.status)))
        .map((p) => ({ firstName: "", lastName: "", fullName: str(p.name), role: str(p.designation) }))
        .filter((p) => p.fullName)
    : [];
  const address = str(d.address) || str(d.branch_address) || str(d.head_office_address);
  const registeredAt = str(d.registration_date).slice(0, 10);
  return {
    companyName,
    rcNumber: str(d.registration_number) || str(d.id),
    status: str(d.company_status),
    companyType: str(d.type_of_entity),
    ...(address ? { address } : {}),
    ...(registeredAt ? { registeredAt } : {}),
    affiliates,
  };
}

export type CacOutcome =
  /** Name, owner and status all line up: counts as the CAC document. */
  | "verified"
  /** Business found and the name matches, but the account holder isn't on the record or it isn't active. */
  | "needs_review"
  /** A record exists under that number with a different name. */
  | "name_mismatch"
  /** No record for that number and type. */
  | "not_found";

export interface CacEvaluation {
  outcome: CacOutcome;
  nameMatched: boolean;
  ownerMatched: boolean;
  active: boolean;
}

export function evaluateCac(record: CacRecord | null, input: { enteredName: string; ownerName: string }): CacEvaluation {
  if (!record) return { outcome: "not_found", nameMatched: false, ownerMatched: false, active: false };
  const nameMatched = companyNamesMatch(input.enteredName, record.companyName);
  const ownerMatched = ownerListed(input.ownerName, record.affiliates);
  const active = registryStatusActive(record.status);
  const outcome: CacOutcome = !nameMatched ? "name_mismatch" : ownerMatched && active ? "verified" : "needs_review";
  return { outcome, nameMatched, ownerMatched, active };
}

/** What the person is told after a check. */
export function cacOutcomeMessage(evaluation: CacEvaluation, registeredName: string): string {
  switch (evaluation.outcome) {
    case "verified":
      return `Verified with CAC: ${registeredName}. You don't need to upload your certificate.`;
    case "needs_review":
      return !evaluation.active
        ? `We found ${registeredName}, but CAC doesn't list it as active. Upload your certificate and our team will check.`
        : `We found ${registeredName}, but couldn't match your name to its directors or proprietors. Upload your certificate and our team will check.`;
    case "name_mismatch":
      return "That number is registered under a different business name. Check the name and number on your certificate.";
    case "not_found":
      return "CAC has no record for that number and business type. Check both, or upload your certificate instead.";
  }
}

/** Timestamps from the last day, for the per-account limit. */
export function recentAttempts(attempts: unknown, now = Date.now()): string[] {
  if (!Array.isArray(attempts)) return [];
  return attempts.filter((t): t is string => typeof t === "string" && now - Date.parse(t) < 24 * 60 * 60 * 1000);
}
