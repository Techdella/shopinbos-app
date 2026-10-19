import "server-only";

import { db } from "@/lib/db/client";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { parseVerificationDocs } from "@/lib/verification-utils";
import type { AuthUser } from "@/lib/auth/types";
import { korapayIdentityPost, korapayIdentityReady } from "@/lib/korapay";
import { youverifyPost, youverifyReady } from "@/lib/youverify";
import type { RegistryCheck, VerificationDoc } from "@shared/verification-docs";
import { DOC_TYPE_LABELS, docHasFile } from "@shared/verification-docs";
import {
  CAC_DAILY_ATTEMPTS,
  cacOutcomeMessage,
  evaluateCac,
  isCacCompanyType,
  parseCacNumber,
  parseDojahCac,
  parseKorapayCac,
  parseYouverifyCac,
  prefixedCacNumber,
  recentAttempts,
  type CacCompanyType,
  type CacOutcome,
  type CacRecord,
} from "./cac";

// Instant CAC check for suppliers and delivery partners (see ./cac.ts for the rules). Korapay Identity when
// KORAPAY_SECRET_KEY is set (src/lib/korapay.ts), else Youverify (YOUVERIFY_SECRET_KEY, src/lib/youverify.ts), else
// Dojah (DOJAH_APP_ID + DOJAH_SECRET_KEY; DOJAH_ENV=sandbox uses Dojah's test registry). Without any the check is off
// and the page keeps asking for the certificate.

const LOOKUP_TIMEOUT_MS = 15_000;

function dojahReady() {
  return Boolean(process.env.DOJAH_APP_ID?.trim() && process.env.DOJAH_SECRET_KEY?.trim());
}

export function cacCheckEnabled() {
  return korapayIdentityReady() || youverifyReady() || dojahReady();
}

const cacProvider = () => (korapayIdentityReady() ? "korapay" : youverifyReady() ? "youverify" : "dojah");

function dojahBaseUrl() {
  return process.env.DOJAH_ENV?.trim().toLowerCase() === "sandbox" ? "https://sandbox.dojah.io" : "https://api.dojah.io";
}

type LookupResult = { ok: true; record: CacRecord | null } | { ok: false; reason: "unavailable" | "busy" };

/** Korapay's CAC lookup (POST /identities/ng/cac): the registry profile with address and key personnel. */
async function lookupKorapayCac(rcNumber: string, companyType: CacCompanyType): Promise<LookupResult> {
  const id = prefixedCacNumber(rcNumber, companyType);
  try {
    const { status, json } = await korapayIdentityPost("/identities/ng/cac", { id, registration_type: id.replace(/\d+$/, ""), verification_consent: true }, LOOKUP_TIMEOUT_MS);
    if (status === 404) return { ok: true, record: null };
    if (status === 429) return { ok: false, reason: "busy" };
    const reply = json as { status?: unknown; message?: unknown } | null;
    if (status === 400 || status === 422) {
      // A refused number is "no record"; a refused key, consent or balance is ours to fix (the person gets the upload route).
      const message = typeof reply?.message === "string" ? reply.message : "";
      return /not found|no record|invalid (rc|bn|cac|registration|id)|does not exist/i.test(message) ? { ok: true, record: null } : { ok: false, reason: "unavailable" };
    }
    if (status < 200 || status >= 300 || reply?.status !== true) return { ok: false, reason: "unavailable" };
    return { ok: true, record: parseKorapayCac(json) };
  } catch (error) {
    console.error("[kyb/cac] Korapay lookup error", error instanceof Error ? error.message : error);
    return { ok: false, reason: "unavailable" };
  }
}

/** TaxID and Business Verification: the registry profile with address and key personnel, for RC, BN, IT, LP, LLP. */
async function lookupYouverifyCac(rcNumber: string, companyType: CacCompanyType): Promise<LookupResult> {
  try {
    const { status, json } = await youverifyPost("/v2/api/verifications/ng/advance-check-with-tax", { registrationNumber: prefixedCacNumber(rcNumber, companyType), isConsent: true }, LOOKUP_TIMEOUT_MS);
    if (status === 404) return { ok: true, record: null };
    if (status === 429) return { ok: false, reason: "busy" };
    if (status < 200 || status >= 300) {
      // 401 (keys) and 402 (balance) are ours to fix; the person just gets the upload route.
      console.error("[kyb/cac] Youverify lookup failed", status);
      return { ok: false, reason: "unavailable" };
    }
    const found = String(((json as { data?: { status?: unknown } } | null)?.data?.status ?? "")).toLowerCase();
    if (found === "pending") return { ok: false, reason: "busy" };
    return { ok: true, record: parseYouverifyCac(json) };
  } catch (error) {
    console.error("[kyb/cac] Youverify lookup error", error instanceof Error ? error.message : error);
    return { ok: false, reason: "unavailable" };
  }
}

async function lookupCac(rcNumber: string, companyType: CacCompanyType): Promise<LookupResult> {
  const url = new URL("/api/v1/kyc/cac/advance", dojahBaseUrl());
  url.searchParams.set("rc_number", rcNumber);
  url.searchParams.set("company_type", companyType);
  try {
    const res = await fetch(url, {
      headers: {
        AppId: process.env.DOJAH_APP_ID!.trim(),
        Authorization: process.env.DOJAH_SECRET_KEY!.trim(),
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.status === 404) return { ok: true, record: null };
    if (res.status === 429) return { ok: false, reason: "busy" };
    if (!res.ok) {
      // 401 (keys) and 402 (wallet empty) are ours to fix; the person just gets the upload route.
      console.error("[kyb/cac] lookup failed", res.status);
      return { ok: false, reason: "unavailable" };
    }
    return { ok: true, record: parseDojahCac(await res.json().catch(() => null)) };
  } catch (error) {
    console.error("[kyb/cac] lookup error", error instanceof Error ? error.message : error);
    return { ok: false, reason: "unavailable" };
  }
}

export type CacCheckResponse =
  | { ok: true; outcome: CacOutcome; message: string; registeredName?: string; doc?: VerificationDoc; attemptsLeft: number }
  | { ok: false; code: "DISABLED" | "INVALID" | "LIMIT" | "LOCKED" | "UNAVAILABLE" | "NOT_FOUND"; message: string; status: number };

export async function runCacCheck(
  role: "supplier" | "logistics_partner",
  user: AuthUser,
  input: { businessName?: unknown; number?: unknown; companyType?: unknown },
): Promise<CacCheckResponse> {
  if (!cacCheckEnabled()) {
    return { ok: false, code: "DISABLED", status: 503, message: "Instant CAC checks aren't switched on yet. Upload your certificate instead." };
  }

  const enteredName = typeof input.businessName === "string" ? input.businessName.trim().slice(0, 160) : "";
  const parsed = parseCacNumber(typeof input.number === "string" ? input.number : "");
  const companyType = isCacCompanyType(input.companyType) ? input.companyType : parsed?.impliedType ?? null;
  if (enteredName.length < 2) return { ok: false, code: "INVALID", status: 400, message: "Enter your business name exactly as it is on your CAC certificate." };
  if (!parsed) return { ok: false, code: "INVALID", status: 400, message: "Enter your BN or RC number, for example RC 1234567." };
  if (!companyType) return { ok: false, code: "INVALID", status: 400, message: "Pick your business type." };

  // Bursts across every server instance (shared, fails open); the daily limit below is stored on the profile.
  if (!(await checkRateLimitShared(rateLimitKey("kyb-cac", user.id), { maxRequests: 3, windowMs: 60_000 })).allowed) {
    return { ok: false, code: "LIMIT", status: 429, message: "Too many checks. Wait a minute and try again." };
  }

  const model = (role === "supplier" ? db.supplier : db.logisticsPartner) as any;
  const entity = await model.findUnique({ where: { userId: user.id } });
  if (!entity) return { ok: false, code: "NOT_FOUND", status: 404, message: "Profile not found." };

  const docs = parseVerificationDocs(entity.verificationDocuments);
  const current = docs.find((d) => d.type === "cac");
  if (current && ["submitted", "under_review", "approved"].includes(current.status)) {
    return { ok: false, code: "LOCKED", status: 409, message: "Your business registration is already verified or with the review team." };
  }

  const state = entity.onboardingState && typeof entity.onboardingState === "object" ? (entity.onboardingState as Record<string, unknown>) : {};
  const attempts = recentAttempts(state.cacChecks);
  if (attempts.length >= CAC_DAILY_ATTEMPTS) {
    return { ok: false, code: "LIMIT", status: 429, message: "You've used today's CAC checks. Upload your certificate, or try again tomorrow." };
  }
  const now = new Date().toISOString();
  await model.update({ where: { id: entity.id }, data: { onboardingState: { ...state, cacChecks: [...attempts, now] } } });
  const attemptsLeft = CAC_DAILY_ATTEMPTS - attempts.length - 1;

  const lookup = korapayIdentityReady()
    ? await lookupKorapayCac(parsed.number, companyType)
    : youverifyReady()
      ? await lookupYouverifyCac(parsed.number, companyType)
      : await lookupCac(parsed.number, companyType);
  if (!lookup.ok) {
    return {
      ok: false,
      code: "UNAVAILABLE",
      status: 503,
      message: lookup.reason === "busy" ? "The CAC check is busy. Try again in a minute." : "We couldn't reach the CAC registry. Upload your certificate instead, or try again later.",
    };
  }

  const record = lookup.record;
  // The owner's name from their verified ID (Shopinbos Wallet) beats the account name they typed at sign-up.
  const wallet = await db.wallet.findUnique({ where: { userId: user.id }, select: { kycStatus: true, kycFirstName: true, kycLastName: true } });
  const ownerName = wallet?.kycStatus === "verified" && wallet.kycFirstName && wallet.kycLastName ? `${wallet.kycFirstName} ${wallet.kycLastName}` : user.name ?? "";
  const evaluation = evaluateCac(record, { enteredName, ownerName });
  const message = cacOutcomeMessage(evaluation, record?.companyName ?? "");
  if (!record || evaluation.outcome === "name_mismatch") {
    return { ok: true, outcome: evaluation.outcome, message, attemptsLeft };
  }

  const registry: RegistryCheck = {
    source: "cac",
    provider: cacProvider(),
    rcNumber: record.rcNumber || parsed.number,
    companyType,
    enteredName,
    registeredName: record.companyName,
    registryStatus: record.status,
    nameMatched: evaluation.nameMatched,
    ownerMatched: evaluation.ownerMatched,
    verified: evaluation.outcome === "verified",
    ...(record.address ? { address: record.address } : {}),
    ...(record.registeredAt ? { registeredAt: record.registeredAt } : {}),
    checkedAt: now,
  };

  // Keep an uploaded certificate if there is one; the registry result sits alongside it for the review team.
  const withFile = current && docHasFile(current) ? current : null;
  const doc: VerificationDoc = withFile
    ? { ...withFile, registry, ...(registry.verified ? { status: "approved" as const } : {}), updatedAt: now }
    : {
        id: current?.id ?? `cac-${Date.now()}`,
        type: "cac",
        label: DOC_TYPE_LABELS.cac,
        fileName: "",
        filePath: "",
        fileSize: 0,
        mimeType: "",
        // A match without the owner or an active status still needs the certificate, so it stays a draft.
        status: registry.verified ? "approved" : "draft",
        uploadedAt: now,
        updatedAt: now,
        registry,
      };

  await model.update({
    where: { id: entity.id },
    data: { verificationDocuments: [...docs.filter((d) => d.type !== "cac"), doc] },
  });

  return { ok: true, outcome: evaluation.outcome, message, registeredName: record.companyName, doc, attemptsLeft };
}
