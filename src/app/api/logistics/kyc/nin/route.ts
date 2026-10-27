import { apiError } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { korapayIdentityReady, verifyKorapayIdentity } from "@/lib/korapay";
import { verifyYouverifyIdentity } from "@/lib/youverify";
import { DAILY_ID_CHECKS, cleanDateOfBirth, cleanNamePart, digitsOf, idNumberHash } from "@/lib/logistics/partner-kyc";
import { idChecksReady, kycSecret, updateIdentityChecks } from "@/lib/logistics/partner-kyc.server";
import { readJson, stateResponse, withKycPartner } from "../_partner";

// Identity step: the partner's NIN, checked with their name and date of birth (Korapay Identity, else Youverify).
// Only the last 4 digits and a keyed hash are kept. With no ID check set up, the NIN waits for the team instead.
export const POST = withKycPartner(async (req, { partner }) => {
  const body = await readJson(req);
  const nin = digitsOf(body.nin, 11);
  const firstName = cleanNamePart(body.firstName);
  const lastName = cleanNamePart(body.lastName);
  const dateOfBirth = cleanDateOfBirth(body.dateOfBirth);
  if (!nin) return apiError("BAD_REQUEST", "Enter your 11-digit NIN.");
  if (!firstName || !lastName) return apiError("BAD_REQUEST", "Type your first and last name as they are on your NIN.");
  if (!dateOfBirth) return apiError("BAD_REQUEST", "Enter your date of birth.");
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
  if (!idChecksReady()) {
    await updateIdentityChecks(partner.id, (current) => ({ ...current, fullName, nin: { last4: nin.slice(-4), hash, status: "pending", checkedAt } }));
    return stateResponse(partner.id);
  }

  const typed = { type: "nin" as const, id: nin, firstName, lastName, dateOfBirth };
  const result = korapayIdentityReady() ? await verifyKorapayIdentity(typed) : await verifyYouverifyIdentity(typed);
  if (!result.ok) {
    if (result.notFound) return apiError("BAD_REQUEST", "We couldn't find that NIN. Check the number and try again.");
    console.error("[partner-kyc nin] check unavailable", result.message);
    return apiError("UNAVAILABLE", "We couldn't check your NIN just now. Try again in a few minutes.", 503);
  }
  const { identity } = result;
  if (identity.matches.firstName !== true || identity.matches.lastName !== true || identity.matches.dateOfBirth !== true) {
    return apiError("BAD_REQUEST", "Your name or date of birth doesn't match this NIN. Type them exactly as they are on your NIN slip.");
  }
  const nameOnRecord = [identity.firstName, identity.middleName, identity.lastName].filter(Boolean).join(" ");
  await updateIdentityChecks(partner.id, (current) => ({
    ...current,
    fullName,
    nin: {
      last4: nin.slice(-4),
      hash,
      status: "approved",
      checkedAt,
      provider: korapayIdentityReady() ? "korapay" : "youverify",
      ...(nameOnRecord ? { nameOnRecord } : {}),
      ...(identity.reference ? { reference: identity.reference } : {}),
    },
  }));
  return stateResponse(partner.id);
});
