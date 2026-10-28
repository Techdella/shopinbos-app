import "server-only";

import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { appUrl } from "@/lib/marketing/brand";
import { kycPartnerFor, kycSecret, kycState } from "@/lib/logistics/partner-kyc.server";
import { idDocumentStep, ninStep, selfieStep } from "@/lib/logistics/kyc-steps.server";
import { supplierOnboardingView } from "@/lib/kyc/supplier-onboarding.server";
import { supplierIdStep, supplierSelfieStep } from "@/lib/kyc/supplier-steps.server";
import { handoffPath, readHandoff, signHandoff, type Handoff, type HandoffKind, type HandoffPurpose } from "@/lib/kyc/handoff";

// "Do it on your phone" (src/lib/kyc/handoff.ts has the token): makes the link for a signed-in partner or supplier,
// tells the phone page what to ask, and runs the step through the same functions as the signed-in routes
// (src/lib/logistics/kyc-steps.server.ts, src/lib/kyc/supplier-steps.server.ts), so every check and limit applies.

/** The phone link for this person's step. */
export function createHandoff(kind: HandoffKind, userId: string, purpose: HandoffPurpose) {
  const secret = kycSecret();
  if (!secret) return null;
  const { token, expiresAt } = signHandoff(secret, { kind, userId, purpose });
  return { url: `${appUrl()}${handoffPath(token)}`, expiresAt: new Date(expiresAt).toISOString() };
}

/** What the phone page needs: whose step it is and whether the NIN has to be typed with the selfie. */
export interface HandoffInfo {
  kind: HandoffKind;
  purpose: HandoffPurpose;
  expiresAt: string;
  firstName: string;
  lastName: string;
  /** The ID on file is a NIN slip whose NIN isn't checked yet: the selfie goes with the NIN, name and date of birth. */
  needsNin: boolean;
  /** For a selfie: an ID photo is on file (a supplier's selfie needs one first). */
  hasIdPhoto: boolean;
}

export type HandoffLookup = { ok: true; handoff: Handoff; info: HandoffInfo } | { ok: false; reason: "invalid" | "expired" | "unavailable" };

export async function lookupHandoff(token: unknown): Promise<HandoffLookup> {
  const secret = kycSecret();
  if (!secret) return { ok: false, reason: "unavailable" };
  const read = readHandoff(secret, token);
  if (!read.ok) return read;
  const { handoff } = read;
  const user = await db.user.findUnique({ where: { id: handoff.userId }, select: { name: true } });
  const [firstName = "", ...rest] = String(user?.name ?? "").trim().split(/\s+/);
  const base = { kind: handoff.kind, purpose: handoff.purpose, expiresAt: new Date(handoff.expiresAt).toISOString(), firstName, lastName: rest.join(" ") };
  if (handoff.kind === "logistics") {
    const partner = await kycPartnerFor(handoff.userId);
    const state = partner ? await kycState(partner.id) : null;
    if (!state) return { ok: false, reason: "invalid" };
    return {
      ok: true,
      handoff,
      info: { ...base, needsNin: state.identity.idDocument?.type === "nin_slip" && state.identity.nin?.status !== "approved", hasIdPhoto: state.docs.some((doc) => doc.type === "identity" && doc.filePath) },
    };
  }
  const view = await supplierOnboardingView(handoff.userId);
  if (!view) return { ok: false, reason: "invalid" };
  return { ok: true, handoff, info: { ...base, needsNin: view.idType === "nin_slip" && view.nin?.status !== "approved", hasIdPhoto: Boolean(view.idDocument) } };
}

/** Runs the phone's selfie or ID photo as the signed-in step would, answering only "done" (no account details). */
export async function submitHandoff(handoff: Handoff, body: Record<string, unknown>) {
  if (!(await checkRateLimitShared(rateLimitKey("kyc-handoff", handoff.userId), { maxRequests: 12, windowMs: 60 * 60_000 })).allowed) {
    return apiError("RATE_LIMITED", "Too many tries. Wait a few minutes, then try again.", 429);
  }
  let response;
  if (handoff.kind === "logistics") {
    const partner = await kycPartnerFor(handoff.userId);
    if (!partner) return apiError("NOT_FOUND", "This link doesn't work any more. Scan the code on your computer again.", 404);
    if (handoff.purpose === "id") response = await idDocumentStep(partner, body);
    else {
      const state = await kycState(partner.id);
      const byNin = state?.identity.idDocument?.type === "nin_slip" && state.identity.nin?.status !== "approved";
      response = byNin ? await ninStep(partner, body) : await selfieStep(partner, body);
    }
  } else {
    response = handoff.purpose === "id" ? await supplierIdStep(handoff.userId, body) : await supplierSelfieStep(handoff.userId, body);
  }
  if (!response.ok) return response;
  // A selfie Korapay found to be someone else's is "done" for the link, but not for the person: say so on the phone.
  if (handoff.purpose === "selfie") {
    const rejected = await selfieRejected(handoff);
    if (rejected !== null) return apiError("BAD_REQUEST", rejected || "That selfie didn't match your ID. Take it again in good light.");
  }
  return ok({ done: true });
}

/** The rejection reason when the selfie just sent was turned down, else null. */
async function selfieRejected(handoff: Handoff): Promise<string | null> {
  if (handoff.kind === "logistics") {
    const partner = await kycPartnerFor(handoff.userId);
    const state = partner ? await kycState(partner.id) : null;
    const doc = state?.docs.find((row) => row.type === "selfie");
    return doc?.status === "rejected" ? doc.rejectionReason ?? "" : null;
  }
  const view = await supplierOnboardingView(handoff.userId);
  return view?.selfie?.status === "rejected" ? view.selfie.reason ?? "" : null;
}
