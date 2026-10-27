import "server-only";

import { createHmac } from "node:crypto";
import { db } from "@/lib/db/client";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { fetchKorapayFaceCheck, korapayFaceCheckReady, korapayIdentityReady, korapayPublicKey, verifyKorapayIdentity } from "@/lib/korapay";
import { safeKoraReference } from "@/lib/korapay-liveness";
import { verifyYouverifyIdentity, youverifyReady } from "@/lib/youverify";
import { parseVerificationDocs } from "@/lib/verification-utils";
import { cacOutcomeMessage, evaluateCac, isCacCompanyType, parseCacNumber } from "@/lib/kyb/cac";
import { cacCheckEnabled, lookupCacRecord } from "@/lib/kyb/verify-cac.server";
import type { AccountIdentity } from "./balance-rules";
import { isAdult } from "@/lib/auth/age";

// Whose name a wallet's own account number is in (src/lib/wallet/balance.server.ts ensureTopUpAccount):
//   1. the business name, once it's checked against CAC: the wallet's own check (any role), a supplier's or delivery
//      partner's approved CAC document, or a business name registered with CAC through Shopinbos;
//   2. else the owner's name from their NIN, checked here (Korapay Identity, else Youverify);
//   3. else, only while no ID check is set up at all, the name on the account.
// Without 1 or 2 (and with ID checks set up) no account number is made: the wallet page asks for one of them.

export type { AccountIdentity } from "./balance-rules";

const DAILY_NIN_CHECKS = 3;
const DAILY_CAC_CHECKS = 3;
const DAILY_FACE_CHECKS = 5;

export function identityChecksReady() {
  return korapayIdentityReady() || youverifyReady();
}

export class WalletIdentityError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/** The CAC-checked business name for this account, from wherever it was checked. */
async function checkedBusinessName(userId: string, role: string, walletName: string | null) {
  if (walletName) return walletName;
  if (role === "supplier" || role === "logistics_partner") {
    const entity = role === "supplier"
      ? await db.supplier.findUnique({ where: { userId }, select: { verificationDocuments: true } })
      : await db.logisticsPartner.findUnique({ where: { userId }, select: { verificationDocuments: true } });
    const cac = parseVerificationDocs(entity?.verificationDocuments).find((doc) => doc.type === "cac" && doc.status === "approved");
    if (cac?.registry?.verified && cac.registry.registeredName) return cac.registry.registeredName;
  }
  const registered = await db.businessRegistration.findFirst({ where: { userId, status: "approved" }, orderBy: { updatedAt: "desc" }, select: { proposedName: true } });
  return registered?.proposedName ?? null;
}

/** The name the account number should be in, or null when the owner has to verify one first. */
export async function walletAccountIdentity(userId: string): Promise<AccountIdentity | null> {
  const [user, wallet] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { name: true, role: true } }),
    db.wallet.findUnique({ where: { userId }, select: { verifiedBusinessName: true, kycStatus: true, kycFirstName: true, kycLastName: true } }),
  ]);
  if (!user) return null;
  const business = await checkedBusinessName(userId, user.role, wallet?.verifiedBusinessName ?? null).catch(() => null);
  if (business) return { kind: "business", name: business.trim().replace(/\s+/g, " ").toUpperCase() };
  if (wallet?.kycStatus === "verified" && wallet.kycFirstName && wallet.kycLastName) return { kind: "person", firstName: wallet.kycFirstName, lastName: wallet.kycLastName };
  if (identityChecksReady()) return null;
  const [first, ...rest] = (user.name || "Shopinbos Business").trim().split(/\s+/);
  return { kind: "account", firstName: first, lastName: rest.join(" ") || first };
}

function lagosDay() {
  return new Date(Date.now() + 60 * 60_000).toISOString().slice(0, 10);
}

/** A keyed hash of the ID number (never the number itself), to spot one NIN on several wallets. */
function idHash(nin: string) {
  return createHmac("sha256", process.env.JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "shopinbos-wallet").update(`nin:${nin}`).digest("hex");
}

/** Checks the owner's NIN with their name and date of birth; the account number is then made in the NIN's name. */
export async function verifyWalletNin(userId: string, input: { nin?: unknown; firstName?: unknown; lastName?: unknown; dateOfBirth?: unknown }) {
  if (!identityChecksReady()) throw new WalletIdentityError("NIN checks aren't switched on yet.", 503);
  const nin = String(input.nin ?? "").replace(/\D/g, "");
  const firstName = String(input.firstName ?? "").trim().slice(0, 60);
  const lastName = String(input.lastName ?? "").trim().slice(0, 60);
  const dateOfBirth = String(input.dateOfBirth ?? "").trim();
  if (nin.length !== 11) throw new WalletIdentityError("Enter your 11-digit NIN.");
  if (!firstName || !lastName) throw new WalletIdentityError("Enter your first and last name as they are on your NIN.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) throw new WalletIdentityError("Enter your date of birth.");
  if (!(await checkRateLimitShared(rateLimitKey("wallet-nin", userId), { maxRequests: 3, windowMs: 60_000 })).allowed) throw new WalletIdentityError("Too many checks. Wait a minute and try again.", 429);

  const wallet = await db.wallet.findUnique({ where: { userId }, select: { id: true, kycStatus: true, kycAttempts: true, kycAttemptDay: true } });
  if (!wallet) throw new WalletIdentityError("Open your wallet first.", 404);
  if (wallet.kycStatus === "verified") return { ok: true as const, message: "Your NIN is already verified." };
  const today = lagosDay();
  const attempts = wallet.kycAttemptDay === today ? wallet.kycAttempts : 0;
  if (attempts >= DAILY_NIN_CHECKS) throw new WalletIdentityError("You've used today's NIN checks. Try again tomorrow.", 429);

  const typed = { type: "nin" as const, id: nin, firstName, lastName, dateOfBirth };
  const result = korapayIdentityReady() ? await verifyKorapayIdentity(typed) : await verifyYouverifyIdentity(typed);
  const fail = async (message: string) => {
    await db.wallet.update({ where: { id: wallet.id }, data: { kycAttempts: attempts + 1, kycAttemptDay: today } });
    throw new WalletIdentityError(message);
  };
  if (!result.ok) {
    if (result.notFound) return fail("We couldn't find that NIN. Check the number and try again.");
    console.error("[wallet nin] check unavailable", result.message);
    throw new WalletIdentityError("We couldn't check your NIN just now. Try again in a few minutes.", 503);
  }
  const { identity } = result;
  if (identity.matches.firstName !== true || identity.matches.lastName !== true || identity.matches.dateOfBirth !== true) {
    return fail("Your name or date of birth doesn't match this NIN. Type them exactly as they are on your NIN slip.");
  }
  // Accounts are for adults (src/lib/auth/age.ts): the ID's own date of birth decides.
  if (!isAdult(identity.dateOfBirth ?? dateOfBirth)) {
    throw new WalletIdentityError("Shopinbos wallets are for people aged 18 or older, so we can't verify this NIN.", 403);
  }
  await db.wallet.update({
    where: { id: wallet.id },
    data: {
      kycStatus: "verified",
      kycIdType: "nin",
      kycIdLast4: nin.slice(-4),
      kycIdHash: idHash(nin),
      kycFirstName: identity.firstName ?? firstName,
      kycLastName: identity.lastName ?? lastName,
      kycMiddleName: identity.middleName,
      kycDateOfBirth: identity.dateOfBirth ?? dateOfBirth,
      kycReference: identity.reference,
      kycVerifiedAt: new Date(),
      kycAttempts: attempts,
      kycAttemptDay: today,
    },
  });
  return { ok: true as const, message: "NIN verified. Your account number is on its way." };
}

/** Checks the business name and BN/RC number with CAC; once it matches (with the owner on the record), it's the account name. */
export async function verifyWalletBusiness(user: { id: string; name: string | null }, input: { businessName?: unknown; number?: unknown; companyType?: unknown }) {
  if (!cacCheckEnabled()) throw new WalletIdentityError("Business checks aren't switched on yet.", 503);
  const enteredName = String(input.businessName ?? "").trim().slice(0, 160);
  const parsed = parseCacNumber(String(input.number ?? ""));
  const companyType = isCacCompanyType(input.companyType) ? input.companyType : parsed?.impliedType ?? null;
  if (enteredName.length < 2) throw new WalletIdentityError("Enter your business name exactly as it is on your CAC certificate.");
  if (!parsed) throw new WalletIdentityError("Enter your BN or RC number, for example BN 1234567.");
  if (!companyType) throw new WalletIdentityError("Pick your business type.");
  if (!(await checkRateLimitShared(rateLimitKey("wallet-cac", user.id), { maxRequests: DAILY_CAC_CHECKS, windowMs: 24 * 60 * 60_000 })).allowed) {
    throw new WalletIdentityError("You've used today's business checks. Try again tomorrow.", 429);
  }
  const wallet = await db.wallet.findUnique({ where: { userId: user.id }, select: { id: true, kycStatus: true, kycFirstName: true, kycLastName: true } });
  if (!wallet) throw new WalletIdentityError("Open your wallet first.", 404);

  const { lookup } = await lookupCacRecord(parsed.number, companyType);
  if (!lookup.ok) throw new WalletIdentityError(lookup.reason === "busy" ? "The CAC check is busy. Try again in a minute." : "We couldn't reach the CAC registry. Try again later.", 503);
  const ownerName = wallet.kycStatus === "verified" && wallet.kycFirstName && wallet.kycLastName ? `${wallet.kycFirstName} ${wallet.kycLastName}` : user.name ?? "";
  const evaluation = evaluateCac(lookup.record, { enteredName, ownerName });
  if (!lookup.record || evaluation.outcome !== "verified") {
    // The account name has to be the business's: it only goes on the account when the owner is on CAC's record.
    const message = evaluation.outcome === "needs_review" && evaluation.nameMatched && !evaluation.ownerMatched
      ? `We found ${lookup.record?.companyName}, but your name isn't on its CAC record. Verify your NIN first so we can match you to it, or use your NIN for the account instead.`
      : cacOutcomeMessage(evaluation, lookup.record?.companyName ?? "");
    throw new WalletIdentityError(message);
  }
  await db.wallet.update({
    where: { id: wallet.id },
    data: { verifiedBusinessName: lookup.record.companyName, verifiedBusinessNumber: lookup.record.rcNumber || parsed.number, verifiedBusinessAt: new Date() },
  });
  return { ok: true as const, message: `Verified with CAC: ${lookup.record.companyName}. Your account number in this name is on its way.` };
}

// ─── Face check (phone app) ─────────────────────────────────────────────────────
// After the NIN is verified, the phone runs Kora's liveness check with a face match against the NIN's photo
// (src/lib/korapay-liveness.ts). The NIN isn't stored, so the person types it again; it must be the one this wallet
// verified (same keyed hash). Biometric data is sensitive (NDPA s.30): it runs only after an explicit yes, Kora
// processes the images, and Shopinbos keeps only the outcome, Kora's reference and when consent was given.

export interface FaceCheckStart {
  publicKey: string;
  sandbox: boolean;
  user: { firstName: string; lastName: string; email?: string };
  idLookup: { idType: "ng_nin"; fields: { id: string }; verificationConsent: true; validation: { firstName: string; lastName: string; dateOfBirth?: string } };
}

/** Checks the NIN is the verified one and returns what Kora's SDK needs to start. */
export async function startFaceCheck(user: { id: string; email?: string | null }, input: { nin?: unknown; consent?: unknown }): Promise<FaceCheckStart> {
  const publicKey = korapayPublicKey();
  if (!publicKey || !korapayFaceCheckReady()) throw new WalletIdentityError("Face checks aren't switched on yet.", 503);
  if (input.consent !== true) throw new WalletIdentityError("Agree to the face check first: it uses your camera to match your face to your NIN photo.");
  const nin = String(input.nin ?? "").replace(/\D/g, "");
  if (nin.length !== 11) throw new WalletIdentityError("Enter your 11-digit NIN.");
  const wallet = await db.wallet.findUnique({ where: { userId: user.id }, select: { id: true, kycStatus: true, kycIdType: true, kycIdHash: true, kycFirstName: true, kycLastName: true, kycDateOfBirth: true, kycFaceStatus: true } });
  if (!wallet || wallet.kycStatus !== "verified" || wallet.kycIdType !== "nin") throw new WalletIdentityError("Verify your NIN first.", 409);
  if (wallet.kycFaceStatus === "passed") throw new WalletIdentityError("Your face check is already done.", 409);
  if (wallet.kycIdHash !== idHash(nin)) throw new WalletIdentityError("That isn't the NIN you verified. Use the same NIN.");
  if (!(await checkRateLimitShared(rateLimitKey("wallet-face", user.id), { maxRequests: DAILY_FACE_CHECKS, windowMs: 24 * 60 * 60_000 })).allowed) {
    throw new WalletIdentityError("You've used today's face checks. Try again tomorrow.", 429);
  }
  await db.wallet.update({ where: { id: wallet.id }, data: { kycFaceConsentAt: new Date() } });
  const firstName = wallet.kycFirstName ?? "";
  const lastName = wallet.kycLastName ?? "";
  return {
    publicKey,
    sandbox: publicKey.startsWith("pk_test_"),
    user: { firstName, lastName, ...(user.email ? { email: user.email } : {}) },
    idLookup: {
      idType: "ng_nin",
      fields: { id: nin },
      verificationConsent: true,
      validation: { firstName, lastName, ...(wallet.kycDateOfBirth ? { dateOfBirth: wallet.kycDateOfBirth } : {}) },
    },
  };
}

const FACE_MESSAGES = {
  passed: "Face check done: it's really you. Thanks!",
  failed: "Your face didn't match the photo on your NIN. Try again in good light, facing the camera, with nothing covering your face.",
  review: "Thanks! We're checking the result and will let you know.",
} as const;

/** Asks Kora how the phone's face check went (by its reference) and keeps the outcome on the wallet. */
export async function confirmFaceCheck(userId: string, input: { reference?: unknown }) {
  const reference = safeKoraReference(input.reference);
  if (!reference) throw new WalletIdentityError("The face check didn't finish. Try again.");
  const wallet = await db.wallet.findUnique({ where: { userId }, select: { id: true, kycStatus: true, kycIdHash: true, kycFaceConsentAt: true, kycFaceStatus: true } });
  if (!wallet || wallet.kycStatus !== "verified") throw new WalletIdentityError("Verify your NIN first.", 409);
  if (!wallet.kycFaceConsentAt) throw new WalletIdentityError("Start the face check from the app.", 409);
  if (wallet.kycFaceStatus === "passed") return { outcome: "passed" as const, message: FACE_MESSAGES.passed };
  // One check counts for one wallet only.
  const used = await db.wallet.findFirst({ where: { kycFaceReference: reference, NOT: { id: wallet.id } }, select: { id: true } });
  if (used) throw new WalletIdentityError("That face check belongs to another account.", 409);

  const result = await fetchKorapayFaceCheck(reference);
  // The face must have been matched to this wallet's own NIN, when Kora says which one it looked up.
  const outcome = result.outcome === "passed" && result.idNumber && result.idNumber.length === 11 && idHash(result.idNumber) !== wallet.kycIdHash ? "failed" : result.outcome;
  await db.wallet.update({ where: { id: wallet.id }, data: { kycFaceStatus: outcome, kycFaceReference: reference, kycFaceCheckedAt: new Date() } });
  if (outcome !== "passed") console.warn(`[wallet face] ${wallet.id} ${outcome}: ${result.detail}`);
  return { outcome, message: FACE_MESSAGES[outcome] };
}
