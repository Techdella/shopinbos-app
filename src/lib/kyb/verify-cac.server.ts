import "server-only";

import { db } from "@/lib/db/client";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseVerificationDocs } from "@/lib/verification-utils";
import type { AuthUser } from "@/lib/auth/types";
import type { RegistryCheck, VerificationDoc } from "@shared/verification-docs";
import { DOC_TYPE_LABELS, docHasFile } from "@shared/verification-docs";
import {
  CAC_DAILY_ATTEMPTS,
  cacOutcomeMessage,
  evaluateCac,
  isCacCompanyType,
  parseCacNumber,
  parseDojahCac,
  recentAttempts,
  type CacCompanyType,
  type CacOutcome,
  type CacRecord,
} from "./cac";

// Instant CAC check for suppliers and delivery partners (see ./cac.ts for the rules). Needs DOJAH_APP_ID and
// DOJAH_SECRET_KEY; DOJAH_ENV=sandbox uses Dojah's test registry. Without keys the check is off and the page
// keeps asking for the certificate upload.

const LOOKUP_TIMEOUT_MS = 15_000;

export function cacCheckEnabled() {
  return Boolean(process.env.DOJAH_APP_ID?.trim() && process.env.DOJAH_SECRET_KEY?.trim());
}

function dojahBaseUrl() {
  return process.env.DOJAH_ENV?.trim().toLowerCase() === "sandbox" ? "https://sandbox.dojah.io" : "https://api.dojah.io";
}

type LookupResult = { ok: true; record: CacRecord | null } | { ok: false; reason: "unavailable" | "busy" };

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

  // Bursts within one server instance; the daily limit below is stored on the profile.
  if (!checkRateLimit(`kyb-cac:${user.id}`, { maxRequests: 3, windowMs: 60_000 }).allowed) {
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

  const lookup = await lookupCac(parsed.number, companyType);
  if (!lookup.ok) {
    return {
      ok: false,
      code: "UNAVAILABLE",
      status: 503,
      message: lookup.reason === "busy" ? "The CAC check is busy. Try again in a minute." : "We couldn't reach the CAC registry. Upload your certificate instead, or try again later.",
    };
  }

  const record = lookup.record;
  const evaluation = evaluateCac(record, { enteredName, ownerName: user.name ?? "" });
  const message = cacOutcomeMessage(evaluation, record?.companyName ?? "");
  if (!record || evaluation.outcome === "name_mismatch") {
    return { ok: true, outcome: evaluation.outcome, message, attemptsLeft };
  }

  const registry: RegistryCheck = {
    source: "cac",
    provider: "dojah",
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
