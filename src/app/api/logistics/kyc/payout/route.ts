import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { korapayIdentityReady, verifyKorapayIdentity } from "@/lib/korapay";
import { verifyYouverifyIdentity } from "@/lib/youverify";
import { resolveBankAccount, settlementBanks } from "@/lib/payout-bank";
import { namesMatch, readIdentityChecks } from "@shared/partner-tiers";
import { DAILY_ID_CHECKS, cleanDateOfBirth, cleanNamePart, digitsOf, idNumberHash } from "@/lib/logistics/partner-kyc";
import { idChecksReady, kycSecret, updateIdentityChecks } from "@/lib/logistics/partner-kyc.server";
import { readJson, stateResponse, withKycPartner } from "../_partner";

// Bank step: the partner's BVN (checked with their name and date of birth), or a bank account whose name matches
// the name on their NIN. Only the last 4 digits are kept. GET lists the banks for the picker.
export const GET = withKycPartner(async () => ok({ banks: Object.keys(await settlementBanks()).sort((a, b) => a.localeCompare(b)) }));

export const POST = withKycPartner(async (req, { partner }) => {
  const body = await readJson(req);
  const checks = readIdentityChecks(partner.identityChecks);
  if (!checks.nin) return apiError("BAD_REQUEST", "Add your NIN on the Identity step first.");
  const personName = checks.nin.nameOnRecord || checks.fullName || "";
  const checkedAt = new Date().toISOString();

  if (body.method === "bvn") {
    const bvn = digitsOf(body.bvn, 11);
    const firstName = cleanNamePart(body.firstName);
    const lastName = cleanNamePart(body.lastName);
    const dateOfBirth = cleanDateOfBirth(body.dateOfBirth);
    if (!bvn) return apiError("BAD_REQUEST", "Enter your 11-digit BVN.");
    if (!firstName || !lastName || !dateOfBirth) return apiError("BAD_REQUEST", "Type your name and date of birth as they are on your BVN.");
    if (!idChecksReady()) return apiError("UNAVAILABLE", "BVN checks aren't switched on yet. Use your bank account instead.", 503);
    const secret = kycSecret();
    if (!secret) return apiError("UNAVAILABLE", "We can't check IDs right now. Try again later.", 503);
    if (!(await checkRateLimitShared(rateLimitKey("partner-kyc:id", partner.id), { maxRequests: DAILY_ID_CHECKS, windowMs: 24 * 60 * 60_000, failClosed: true, sliding: false })).allowed) {
      return apiError("RATE_LIMITED", "You've used today's ID checks. Try again tomorrow.", 429);
    }
    const hash = idNumberHash(secret, "bvn", bvn);
    const taken = await db.logisticsPartner.findFirst({ where: { id: { not: partner.id }, identityChecks: { path: ["payout", "hash"], equals: hash } }, select: { id: true } });
    if (taken) return apiError("CONFLICT", "This BVN is already used on another delivery partner account. Talk to the Shopinbos team in Help.", 409);
    const typed = { type: "bvn" as const, id: bvn, firstName, lastName, dateOfBirth };
    const result = korapayIdentityReady() ? await verifyKorapayIdentity(typed) : await verifyYouverifyIdentity(typed);
    if (!result.ok) {
      if (result.notFound) return apiError("BAD_REQUEST", "We couldn't find that BVN. Check the number and try again.");
      console.error("[partner-kyc bvn] check unavailable", result.message);
      return apiError("UNAVAILABLE", "We couldn't check your BVN just now. Try again in a few minutes, or use your bank account.", 503);
    }
    const { matches, firstName: bvnFirst, middleName, lastName: bvnLast } = result.identity;
    const bvnName = [bvnFirst, middleName, bvnLast].filter(Boolean).join(" ");
    if (matches.firstName !== true || matches.lastName !== true || matches.dateOfBirth !== true || (personName && bvnName && !namesMatch(personName, bvnName))) {
      return apiError("BAD_REQUEST", "The name or date of birth on this BVN doesn't match your NIN.");
    }
    await updateIdentityChecks(partner.id, (current) => ({
      ...current,
      payout: { method: "bvn", last4: bvn.slice(-4), hash, status: "approved", nameMatched: true, checkedAt, ...(bvnName ? { accountName: bvnName } : {}) },
    }));
    return stateResponse(partner.id);
  }

  if (body.method === "bank") {
    const bankName = typeof body.bankName === "string" ? body.bankName.trim() : "";
    const accountNumber = digitsOf(body.accountNumber, 10);
    if (!bankName || !accountNumber) return apiError("BAD_REQUEST", "Choose your bank and enter your 10-digit account number.");
    if (!(await checkRateLimitShared(rateLimitKey("partner-kyc:bank", partner.id), { maxRequests: 10, windowMs: 60 * 60_000 })).allowed) {
      return apiError("RATE_LIMITED", "Too many tries. Wait an hour and try again.", 429);
    }
    const resolved = await resolveBankAccount(bankName, accountNumber);
    if (resolved.status === "not_found") return apiError("BAD_REQUEST", "We couldn't find that account at this bank. Check the number and the bank.");
    if (resolved.status !== "resolved") return apiError("UNAVAILABLE", "We couldn't check this account just now. Try again in a few minutes.", 503);
    if (!namesMatch(personName, resolved.accountName)) {
      return apiError("BAD_REQUEST", `This account is in the name ${resolved.accountName}, which doesn't match the name on your NIN. Use an account in your own name.`);
    }
    await updateIdentityChecks(partner.id, (current) => ({
      ...current,
      payout: { method: "bank", last4: accountNumber.slice(-4), status: "approved", bankName, accountName: resolved.accountName, nameMatched: true, checkedAt },
    }));
    return stateResponse(partner.id);
  }

  return apiError("BAD_REQUEST", "Choose BVN or bank account.");
});
