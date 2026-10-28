import "server-only";

import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { korapayIdentityReady, korapayLivenessReady, verifyKorapayIdentity } from "@/lib/korapay";
import { verifyYouverifyIdentity } from "@/lib/youverify";
import { DAILY_ID_CHECKS, cleanDateOfBirth, cleanNamePart, digitsOf, idNumberHash, readLivenessReport, readPhotoDataUri } from "@/lib/kyc/identity";
import { kycSecret, refreshSupplierVerification, saveSupplierPhoto, setSupplierDocStatus, supplierIdChecksReady, updateSupplierIdentity } from "@/lib/kyc/supplier.server";
import { supplierOnboardingView } from "@/lib/kyc/supplier-onboarding.server";
import { UploadRejectedError } from "@/lib/supabase/storage.server";
import { SUPPLIER_ID_TYPES, readSupplierIdentity, supplierSelfieDecision, type SupplierIdType } from "@shared/supplier-onboarding";
import { normalizeVerificationDocs } from "@shared/verification-docs";

// The supplier's ID photo and selfie steps, shared by the signed-in routes (/api/supplier/kyc/*) and the phone link
// (/api/handoff/[token], "Do it on your phone"): the same checks, limits and saving either way.

// "Quick selfie video" (supplier onboarding). With a NIN slip, the NIN is looked up with the name and date of birth
// typed, and Korapay matches the selfie against the NIN's photo: a confident match approves the selfie and the ID
// (the supplier is listed to shops), a mismatch rejects the selfie, anything in between goes to the team. Where the
// browser or phone ran Korapay's liveness check, its reference is kept; with liveness switched on, a selfie without
// a passed check waits for the team. Any other ID, or no ID check set up: the team compares the ID photo and the
// selfie. Only the NIN's last 4 digits and a keyed hash are kept.
export async function supplierSelfieStep(userId: string, body: Record<string, unknown> | null) {
  const selfie = readPhotoDataUri(body?.selfie, "selfie");
  if (!selfie.ok) return apiError("BAD_REQUEST", selfie.error);
  const liveness = readLivenessReport(body?.liveness);
  if (liveness && !liveness.passed) return apiError("BAD_REQUEST", "The face check didn't pass. Try again in good light, with your face in the circle.");

  const supplier = await db.supplier.findUnique({ where: { userId: userId }, select: { id: true, identityChecks: true, verificationDocuments: true } });
  if (!supplier) return apiError("NOT_FOUND", "Supplier profile not found", 404);
  const identity = readSupplierIdentity(supplier.identityChecks);
  const idDoc = normalizeVerificationDocs(supplier.verificationDocuments).find((doc) => doc.type === "identity");
  if (!identity.idType || !idDoc) return apiError("BAD_REQUEST", "Snap a photo of your ID first.");

  const checkedAt = new Date().toISOString();
  const livenessCheck = liveness ? { provider: "korapay", reference: liveness.reference, passed: true, checkedAt } : undefined;
  const keepSelfie = async (outcome: Parameters<typeof saveSupplierPhoto>[3]) => {
    try {
      await saveSupplierPhoto(supplier.id, "selfie", selfie, outcome);
      return null;
    } catch (error) {
      if (error instanceof UploadRejectedError) return apiError("BAD_REQUEST", "That selfie isn't a photo we can read. Take it again.");
      console.error("[supplier-kyc selfie] upload failed", error);
      return apiError("INTERNAL_ERROR", "We couldn't save your selfie. Please try again.", 500);
    }
  };
  const done = async () => {
    await refreshSupplierVerification(supplier.id);
    return ok(await supplierOnboardingView(userId));
  };

  // Not a NIN slip: the team compares the ID photo with the selfie.
  if (identity.idType !== "nin_slip") {
    const failed = await keepSelfie({ status: "pending", liveness: livenessCheck });
    return failed ?? done();
  }

  const nin = digitsOf(body?.nin, 11);
  const firstName = cleanNamePart(body?.firstName);
  const lastName = cleanNamePart(body?.lastName);
  const dateOfBirth = cleanDateOfBirth(body?.dateOfBirth);
  if (!nin) return apiError("BAD_REQUEST", "Enter the 11-digit NIN on your slip.");
  if (!firstName || !lastName) return apiError("BAD_REQUEST", "Type your first and last name as they are on your NIN.");
  if (!dateOfBirth) return apiError("BAD_REQUEST", "Enter your date of birth.");
  const secret = kycSecret();
  if (!secret) return apiError("UNAVAILABLE", "We can't check IDs right now. Try again later.", 503);
  const hash = idNumberHash(secret, "supplier-nin", nin);
  const taken = await db.supplier.findFirst({ where: { id: { not: supplier.id }, identityChecks: { path: ["nin", "hash"], equals: hash } }, select: { id: true } });
  if (taken) return apiError("CONFLICT", "This NIN is already used on another supplier account. Talk to the Shopinbos team in Help.", 409);
  const fullName = `${firstName} ${lastName}`;

  if (!supplierIdChecksReady()) {
    const failed = await keepSelfie({ status: "pending", liveness: livenessCheck });
    if (failed) return failed;
    await updateSupplierIdentity(supplier.id, (current) => ({ ...current, fullName, nin: { last4: nin.slice(-4), hash, status: "pending", checkedAt } }));
    return done();
  }
  if (!(await checkRateLimitShared(rateLimitKey("supplier-kyc:nin", supplier.id), { maxRequests: DAILY_ID_CHECKS, windowMs: 24 * 60 * 60_000, failClosed: true, sliding: false })).allowed) {
    return apiError("RATE_LIMITED", "You've used today's ID checks. Try again tomorrow.", 429);
  }

  const viaKorapay = korapayIdentityReady();
  const typed = { type: "nin" as const, id: nin, firstName, lastName, dateOfBirth };
  let result = viaKorapay ? await verifyKorapayIdentity({ ...typed, selfie: selfie.dataUri }) : await verifyYouverifyIdentity(typed);
  // Korapay refused the lookup with the selfie (facial matching not enabled, a photo it won't take…): check the NIN on
  // its own so the supplier isn't stuck; with no face match result the selfie goes to the team.
  let faceMatchRefused = false;
  if (viaKorapay && !result.ok && !result.notFound) {
    console.error("[supplier-kyc selfie] Korapay refused the NIN check with a selfie; retrying without it", result.message);
    const plain = await verifyKorapayIdentity(typed);
    if (plain.ok || plain.notFound) {
      result = plain;
      faceMatchRefused = true;
    }
  }
  if (!result.ok) {
    if (result.notFound) return apiError("BAD_REQUEST", "We couldn't find that NIN. Check the number and try again.");
    console.error("[supplier-kyc selfie] check unavailable", result.message);
    return apiError("UNAVAILABLE", "We couldn't check your NIN just now. Try again in a few minutes.", 503);
  }
  const { identity: record } = result;
  if (record.matches.firstName !== true || record.matches.lastName !== true || record.matches.dateOfBirth !== true) {
    return apiError("BAD_REQUEST", "Your name or date of birth doesn't match this NIN. Type them exactly as they are on your NIN slip.");
  }

  const face = viaKorapay && !faceMatchRefused ? record.selfie ?? null : null;
  let decision = supplierSelfieDecision(face);
  if (decision.status === "approved" && korapayLivenessReady() && !liveness) decision = { status: "pending" };
  const failed = await keepSelfie({
    status: decision.status,
    reason: decision.reason,
    liveness: livenessCheck,
    ...(face ? { faceMatch: { provider: "korapay", match: face.match, confidence: face.confidence, checkedAt } } : {}),
  });
  if (failed) return failed;

  const nameOnRecord = [record.firstName, record.middleName, record.lastName].filter(Boolean).join(" ");
  await updateSupplierIdentity(supplier.id, (current) => ({
    ...current,
    fullName,
    nin: {
      last4: nin.slice(-4),
      hash,
      status: "approved",
      checkedAt,
      provider: viaKorapay ? "korapay" : "youverify",
      ...(nameOnRecord ? { nameOnRecord } : {}),
      ...(record.reference ? { reference: record.reference } : {}),
    },
  }));
  // The NIN record is real and the face on the selfie is its owner's: the NIN slip photo stands too.
  if (decision.status === "approved") await setSupplierDocStatus(supplier.id, "identity", "approved");
  return done();
}

// "Snap a photo of your ID" (supplier onboarding): which ID it is and the photo, kept as the private "identity"
// document for the team. A NIN slip is checked against the NIN record with the selfie on the next screen
// (/api/supplier/kyc/selfie); any other ID waits for the team. A new photo sends the selfie back to the team too.
export async function supplierIdStep(userId: string, body: Record<string, unknown> | null) {
  const idType = String(body?.idType ?? "");
  if (!(SUPPLIER_ID_TYPES as readonly string[]).includes(idType)) return apiError("BAD_REQUEST", "Pick the ID you're using.");
  const photo = readPhotoDataUri(body?.photo, "photo of your ID");
  if (!photo.ok) return apiError("BAD_REQUEST", photo.error);
  const supplier = await db.supplier.findUnique({ where: { userId: userId }, select: { id: true } });
  if (!supplier) return apiError("NOT_FOUND", "Supplier profile not found", 404);
  if (!(await checkRateLimitShared(rateLimitKey("supplier-kyc:id", supplier.id), { maxRequests: 10, windowMs: 60 * 60_000 })).allowed) {
    return apiError("RATE_LIMITED", "Too many photos. Try again in an hour.", 429);
  }
  try {
    await saveSupplierPhoto(supplier.id, "identity", photo, { status: "pending", idType: idType as SupplierIdType });
  } catch (error) {
    if (error instanceof UploadRejectedError) return apiError("BAD_REQUEST", "That photo isn't a picture we can read. Take it again.");
    console.error("[supplier-kyc id] upload failed", error);
    return apiError("INTERNAL_ERROR", "We couldn't save the photo. Please try again.", 500);
  }
  // A different ID means the earlier NIN result and selfie decision no longer stand for it.
  await updateSupplierIdentity(supplier.id, (current) => ({ ...current, idType: idType as SupplierIdType, ...(idType === "nin_slip" ? {} : { nin: undefined }) }));
  await setSupplierDocStatus(supplier.id, "selfie", "submitted", ["approved"]);
  return ok(await supplierOnboardingView(userId));
}
