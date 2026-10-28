import { apiError, ok } from "@/lib/api/response";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { resolveBankAccount, settlementBanks } from "@/lib/payout-bank";
import { namesMatch, readIdentityChecks } from "@shared/partner-tiers";
import { digitsOf } from "@/lib/logistics/partner-kyc";
import { updateIdentityChecks } from "@/lib/logistics/partner-kyc.server";
import { readJson, stateResponse, withKycPartner } from "../_partner";

// Bank step: a bank account whose name matches the name on the partner's NIN (never a BVN: partners aren't asked
// for one). Only the last 4 digits are kept. GET lists the banks for the picker.
export const GET = withKycPartner(async () => ok({ banks: Object.keys(await settlementBanks()).sort((a, b) => a.localeCompare(b)) }));

export const POST = withKycPartner(async (req, { partner }) => {
  const body = await readJson(req);
  const checks = readIdentityChecks(partner.identityChecks);
  if (!checks.nin) return apiError("BAD_REQUEST", "Add your NIN on the Identity step first.");
  const personName = checks.nin.nameOnRecord || checks.fullName || "";
  const checkedAt = new Date().toISOString();

  // Bank account only: partners are never asked for a BVN (the owner's rule).
  if (body.method === undefined || body.method === "bank") {
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

  return apiError("BAD_REQUEST", "Add a bank account in the same name as your NIN.");
});
