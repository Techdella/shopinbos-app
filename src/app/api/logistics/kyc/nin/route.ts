import { apiError } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { korapayIdentityReady, korapayLivenessReady, verifyKorapayIdentity } from "@/lib/korapay";
import { verifyYouverifyIdentity } from "@/lib/youverify";
import { DAILY_ID_CHECKS, cleanDateOfBirth, cleanNamePart, digitsOf, idNumberHash, readLivenessReport, readSelfieDataUri } from "@/lib/logistics/partner-kyc";
import { idChecksReady, kycSecret, saveSelfie, updateIdentityChecks } from "@/lib/logistics/partner-kyc.server";
import { refreshPartnerTier } from "@/lib/logistics/partner-tiers.server";
import { UploadRejectedError } from "@/lib/supabase/storage.server";
import { selfieDecision } from "@shared/partner-tiers";
import { readJson, stateResponse, withKycPartner } from "../_partner";

export const runtime = "nodejs";

// Identity step: the partner's NIN with their name and date of birth, and a selfie (Korapay Identity, else Youverify).
// Korapay also matches the selfie against the NIN's photo (facial matching): a confident match approves the selfie,
// a mismatch rejects it, anything in between goes to the team (shared/partner-tiers.ts selfieDecision). Where the
// browser ran Korapay's liveness check its reference is kept; with liveness switched on, a selfie sent without a
// passed check (an older phone app, say) waits for the team instead of passing on the match alone. Only the last 4
// digits and a keyed hash of the NIN are kept. With no ID check set up, both wait for the team.
export const POST = withKycPartner(async (req, { partner }) => {
  const body = await readJson(req);
  const nin = digitsOf(body.nin, 11);
  const firstName = cleanNamePart(body.firstName);
  const lastName = cleanNamePart(body.lastName);
  const dateOfBirth = cleanDateOfBirth(body.dateOfBirth);
  if (!nin) return apiError("BAD_REQUEST", "Enter your 11-digit NIN.");
  if (!firstName || !lastName) return apiError("BAD_REQUEST", "Type your first and last name as they are on your NIN.");
  if (!dateOfBirth) return apiError("BAD_REQUEST", "Enter your date of birth.");
  const selfie = readSelfieDataUri(body.selfie);
  if (!selfie.ok) return apiError("BAD_REQUEST", selfie.error);
  const liveness = readLivenessReport(body.liveness);
  if (liveness && !liveness.passed) return apiError("BAD_REQUEST", "The face check didn't pass. Try again in good light, with your face in the circle.");
  const secret = kycSecret();
  if (!secret) return apiError("UNAVAILABLE", "We can't check IDs right now. Try again later.", 503);

  const hash = idNumberHash(secret, "nin", nin);
  const taken = await db.logisticsPartner.findFirst({ where: { id: { not: partner.id }, identityChecks: { path: ["nin", "hash"], equals: hash } }, select: { id: true } });
  if (taken) return apiError("CONFLICT", "This NIN is already used on another delivery partner account. Talk to the Shopinbos team in Help.", 409);
  if (!(await checkRateLimitShared(rateLimitKey("partner-kyc:id", partner.id), { maxRequests: DAILY_ID_CHECKS, windowMs: 24 * 60 * 60_000, failClosed: true, sliding: false })).allowed) {
    return apiError("RATE_LIMITED", "You've used today's ID checks. Try again tomorrow.", 429);
  }

  const fullName = `${firstName} ${lastName}`;
  const checkedAt = new Date().toISOString();
  const livenessCheck = liveness ? { provider: "korapay", reference: liveness.reference, passed: true, checkedAt } : undefined;
  const keepSelfie = async (outcome: Parameters<typeof saveSelfie>[2]) => {
    try {
      await saveSelfie(partner.id, selfie, outcome);
      return null;
    } catch (error) {
      if (error instanceof UploadRejectedError) return apiError("BAD_REQUEST", "That selfie isn't a photo we can read. Take it again.");
      console.error("[partner-kyc nin] selfie upload failed", error);
      return apiError("INTERNAL_ERROR", "We couldn't save your selfie. Please try again.", 500);
    }
  };

  if (!idChecksReady()) {
    const failed = await keepSelfie({ status: "pending", liveness: livenessCheck });
    if (failed) return failed;
    await updateIdentityChecks(partner.id, (current) => ({ ...current, fullName, nin: { last4: nin.slice(-4), hash, status: "pending", checkedAt } }));
    await refreshPartnerTier(partner.id);
    return stateResponse(partner.id);
  }

  const viaKorapay = korapayIdentityReady();
  const typed = { type: "nin" as const, id: nin, firstName, lastName, dateOfBirth };
  let result = viaKorapay ? await verifyKorapayIdentity({ ...typed, selfie: selfie.dataUri }) : await verifyYouverifyIdentity(typed);
  // Korapay refused the lookup with the selfie (facial matching not enabled on the account, a photo it won't take…):
  // check the NIN on its own so the partner isn't stuck; with no face match result the selfie goes to the team.
  let faceMatchRefused = false;
  if (viaKorapay && !result.ok && !result.notFound) {
    console.error("[partner-kyc nin] Korapay refused the NIN check with a selfie; retrying without it", result.message);
    const plain = await verifyKorapayIdentity(typed);
    if (plain.ok || plain.notFound) {
      result = plain;
      faceMatchRefused = true;
    }
  }
  if (!result.ok) {
    if (result.notFound) return apiError("BAD_REQUEST", "We couldn't find that NIN. Check the number and try again.");
    console.error("[partner-kyc nin] check unavailable", result.message);
    return apiError("UNAVAILABLE", "We couldn't check your NIN just now. Try again in a few minutes.", 503);
  }
  const { identity } = result;
  if (identity.matches.firstName !== true || identity.matches.lastName !== true || identity.matches.dateOfBirth !== true) {
    return apiError("BAD_REQUEST", "Your name or date of birth doesn't match this NIN. Type them exactly as they are on your NIN slip.");
  }

  // Facial match: only Korapay compares the selfie; without a result the team looks at it.
  const face = viaKorapay && !faceMatchRefused ? identity.selfie ?? null : null;
  let decision = selfieDecision(face);
  if (decision.status === "approved" && korapayLivenessReady() && !liveness) decision = { status: "pending" };
  const failed = await keepSelfie({
    status: decision.status,
    reason: decision.reason,
    liveness: livenessCheck,
    ...(face ? { faceMatch: { provider: "korapay", match: face.match, confidence: face.confidence, checkedAt } } : {}),
  });
  if (failed) return failed;

  const nameOnRecord = [identity.firstName, identity.middleName, identity.lastName].filter(Boolean).join(" ");
  await updateIdentityChecks(partner.id, (current) => ({
    ...current,
    fullName,
    nin: {
      last4: nin.slice(-4),
      hash,
      status: "approved",
      checkedAt,
      provider: viaKorapay ? "korapay" : "youverify",
      ...(nameOnRecord ? { nameOnRecord } : {}),
      ...(identity.reference ? { reference: identity.reference } : {}),
    },
  }));
  await refreshPartnerTier(partner.id);
  return stateResponse(partner.id);
});
