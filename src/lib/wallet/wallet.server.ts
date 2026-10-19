import "server-only";
import { createHmac } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { getPriceBook } from "@/lib/pricing/price-book.server";
import { storeFeeConfig } from "@shared/platform-pricing";
import { korapayCheckoutReady, verifyKorapayIdentity, korapayIdentityReady } from "@/lib/korapay";
import { verifyYouverifyIdentity, youverifyReady } from "@/lib/youverify";
import { approveIdentityDocFromWallet } from "@/lib/kyb/identity-doc.server";
import { createPaystackSubaccount, listPaystackSettlements, updatePaystackSubaccount } from "@/lib/paystack";
import { resolveBankAccount, settlementBanks, syncPayoutBank, type ResolvedAccount } from "@/lib/payout-bank";
import { companyNamesMatch } from "@/lib/kyb/cac";
import { parseVerificationDocs } from "@/lib/verification-utils";
import { groupDropshipLines, type DropshipLink } from "@/lib/supplier-orders/pure";
import { applyDeductions, debtsToDeduct, holdPlannedDeductions, loadMoneyOwed, type MoneyOwedView } from "@/lib/money-owed/money-owed.server";
import {
  accountNameMatches,
  adultDateOfBirth,
  buildSplitPlan,
  cleanIdNumber,
  kycAttemptAllowed,
  lagosDay,
  maskAccountNumber,
  platformFeeKobo,
  readSplitPlan,
  type KycIdType,
  type PaymentSplitPlan,
  type PlatformFee,
  type SplitGateway,
  type WalletRole,
} from "./rules";

// Shopinbos Wallet, server side. A business links the bank Paystack should settle to and gets a Paystack subaccount
// (an account in another name waits for the team). Sellers need no ID check; a supplier's check is its business
// registration (CAC or BN, src/lib/kyb); only a delivery partner still verifies the owner's BVN or NIN here. From then on every store payment is split at
// checkout and Paystack settles each share straight to that bank (rules.ts). Shopinbos never holds or pays out
// anyone's money; the wallet page shows what was split to the business and Paystack's settlements to its bank.

export type WalletResult = { ok: true; message?: string } | { ok: false; error: string };

type WalletRow = NonNullable<Awaited<ReturnType<typeof findWallet>>>;

function findWallet(userId: string) {
  return db.wallet.findUnique({ where: { userId } });
}

/** The user's wallet, created (empty) the first time they open it. */
export async function ensureWallet(user: { id: string; role: WalletRole }) {
  const existing = await findWallet(user.id);
  if (existing) return existing;
  return db.wallet.upsert({ where: { userId: user.id }, create: { userId: user.id, role: user.role }, update: {} });
}

/** A keyed hash of the ID number, so the team can spot one BVN on many wallets without storing the number. */
function idHash(type: KycIdType, id: string) {
  const key = process.env.WALLET_KYC_SECRET?.trim() || process.env.JWT_SECRET?.trim() || "shopinbos-wallet";
  return createHmac("sha256", key).update(`${type}:${id}`).digest("hex");
}

// ─── KYC ──────────────────────────────────────────────────────────────────────

export interface KycInput {
  idType: KycIdType;
  idNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  consent: boolean;
}

/** ID checks run through Korapay Identity when it is set up, else Youverify (the same result shape). */
export function identityChecksReady() {
  return korapayIdentityReady() || youverifyReady();
}

async function verifyIdentity(input: { type: "bvn" | "nin"; id: string; firstName: string; lastName: string; dateOfBirth: string }) {
  if (!korapayIdentityReady()) return verifyYouverifyIdentity(input);
  const result = await verifyKorapayIdentity(input);
  // Korapay refused for a reason that's ours (Identity not enabled, no balance, down): Youverify, when it's set up.
  if (!result.ok && !result.notFound && youverifyReady()) return verifyYouverifyIdentity(input);
  return result;
}

/**
 * Checks the owner's BVN or NIN (Korapay, else Youverify) against the name and date of birth they typed. The ID must exist and
 * all three must match. Up to KYC_DAILY_ATTEMPTS failed checks a day (each lookup is paid for).
 */
export async function verifyWalletIdentity(user: { id: string; role: WalletRole }, input: KycInput): Promise<WalletResult> {
  if (walletCheckKind(user.role) !== "id") return { ok: false, error: user.role === "supplier" ? "Suppliers don't need an ID check. Verify your business registration (CAC or BN) instead." : "Sellers don't need an ID check." };
  if (!input.consent) return { ok: false, error: "Tick the box to let us check your ID." };
  const id = cleanIdNumber(input.idNumber);
  if (!id) return { ok: false, error: `Enter your 11-digit ${input.idType === "bvn" ? "BVN" : "NIN"}.` };
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName || !lastName) return { ok: false, error: "Enter your first and last name as they are on your ID." };
  if (!adultDateOfBirth(input.dateOfBirth)) return { ok: false, error: "Enter your date of birth. You must be 18 or older." };
  if (!identityChecksReady()) return { ok: false, error: "ID checks aren't switched on yet. Try again later." };

  const wallet = await ensureWallet(user);
  if (wallet.kycStatus === "verified") return { ok: true, message: "Your ID is already verified." };
  const now = new Date();
  if (!kycAttemptAllowed(wallet, now)) return { ok: false, error: "Too many tries today. Check your details and try again tomorrow." };

  const result = await verifyIdentity({ type: input.idType, id, firstName, lastName, dateOfBirth: input.dateOfBirth });
  const failed = async (error: string) => {
    const today = lagosDay(now);
    await db.wallet.update({ where: { id: wallet.id }, data: { kycAttemptDay: today, kycAttempts: wallet.kycAttemptDay === today ? { increment: 1 } : 1 } });
    return { ok: false as const, error };
  };
  if (!result.ok) {
    if (result.notFound) return failed(`We couldn't find that ${input.idType === "bvn" ? "BVN" : "NIN"}. Check the number and try again.`);
    if ("pending" in result && result.pending) return { ok: false, error: "The ID registry is slow right now. Try again in a few minutes." };
    console.error(`[wallet] ID check for wallet ${wallet.id} failed: ${result.message}`);
    return { ok: false, error: "We couldn't check your ID just now. Try again in a few minutes." };
  }
  const { identity } = result;
  if (identity.matches.firstName === false || identity.matches.lastName === false) return failed("The name doesn't match the one on this ID. Type it exactly as it is on your ID.");
  if (identity.matches.dateOfBirth === false) return failed("The date of birth doesn't match this ID.");
  if (input.idType === "bvn" && identity.matches.firstName && identity.matches.lastName && identity.matches.dateOfBirth === null) {
    // The BVN record didn't include a date of birth to compare (not charged as a failed try): NIN always has one.
    return { ok: false, error: "We couldn't confirm your date of birth from your BVN. Verify with your NIN instead." };
  }
  if (identity.matches.firstName === null || identity.matches.lastName === null || identity.matches.dateOfBirth === null) {
    // The provider didn't say whether the details match: never treat that as a pass.
    console.error(`[wallet] ID check for wallet ${wallet.id} came back without a match result`);
    return { ok: false, error: "We couldn't confirm your details just now. Try again in a few minutes." };
  }

  await db.wallet.update({
    where: { id: wallet.id },
    data: {
      kycStatus: "verified",
      kycIdType: input.idType,
      kycIdLast4: id.slice(-4),
      kycIdHash: idHash(input.idType, id),
      kycFirstName: identity.firstName ?? firstName,
      kycLastName: identity.lastName ?? lastName,
      kycMiddleName: identity.middleName,
      kycDateOfBirth: input.dateOfBirth,
      kycReference: identity.reference,
      kycVerifiedAt: now,
      kycAttempts: 0,
    },
  });
  // A supplier's or delivery partner's ID document is this check: approve it so they don't upload a NIN slip.
  if (user.role !== "seller") await approveIdentityDocFromWallet(user.id, user.role, { idType: input.idType, idLast4: id.slice(-4), name: [identity.firstName ?? firstName, identity.lastName ?? lastName].join(" "), checkedAt: now.toISOString() });
  // A bank linked before KYC (or waiting) can now be checked against the verified name.
  const refreshed = await findWallet(user.id);
  if (refreshed?.bankCode && refreshed.accountNumber && refreshed.accountName && refreshed.subaccountStatus !== "active") {
    await openSubaccount(refreshed, (await accountIsTheirs(refreshed, refreshed.accountName)) ? "auto" : null);
  }
  return { ok: true, message: "Your ID is verified." };
}

// ─── Settlement bank and Paystack subaccount ──────────────────────────────────

/** The business name Paystack shows on the subaccount: the store, supplier or delivery company. */
async function businessName(wallet: Pick<WalletRow, "userId" | "role">) {
  const user = await db.user.findUnique({
    where: { id: wallet.userId },
    select: { name: true, email: true, phone: true, store: { select: { name: true } }, supplier: { select: { businessName: true } }, logisticsPartner: { select: { companyName: true } } },
  });
  const name = (wallet.role === "seller" ? user?.store?.name : wallet.role === "supplier" ? user?.supplier?.businessName : user?.logisticsPartner?.companyName) || user?.name || "Shopinbos business";
  return { name, email: user?.email ?? null, phone: user?.phone ?? null, ownerName: user?.name ?? name };
}

/**
 * Creates (or repoints) the Paystack subaccount for the wallet's bank. `nameCheck` "auto" or "approved" opens it;
 * null leaves the wallet waiting for the team ("review") because the account name isn't the verified person's.
 */
async function openSubaccount(wallet: WalletRow, nameCheck: "auto" | "approved" | null): Promise<WalletResult> {
  if (!nameCheck) {
    await db.wallet.update({ where: { id: wallet.id }, data: { nameCheck: "review", subaccountStatus: "review", subaccountError: null } });
    return { ok: true, message: "This account isn't in your name or your business's name, so our team will check it (usually within a day). We'll tell you when payments start going to it." };
  }
  const business = await businessName(wallet);
  try {
    const subaccount = wallet.subaccountCode
      ? await updatePaystackSubaccount(wallet.subaccountCode, { bankCode: wallet.bankCode!, accountNumber: wallet.accountNumber!, businessName: business.name, active: true })
      : await createPaystackSubaccount({ businessName: business.name, bankCode: wallet.bankCode!, accountNumber: wallet.accountNumber!, email: business.email, phone: business.phone, contactName: business.ownerName, walletId: wallet.id });
    await db.wallet.update({
      where: { id: wallet.id },
      data: { nameCheck, subaccountCode: subaccount?.code ?? wallet.subaccountCode, subaccountStatus: "active", subaccountError: null },
    });
    // One bank everywhere: once the account is live (in the owner's or business's name, or approved by the team), it
    // also becomes the role's payout bank (a seller's bank-transfer account, a supplier's or partner's payouts),
    // whichever screen it was chosen on. Never before: an account under review isn't paid out to or shown to buyers.
    const payout = await syncPayoutBank({ id: wallet.userId, role: wallet.role }, wallet.bankName ?? "", wallet.accountNumber!, wallet.accountName ?? "");
    if (!payout.success) {
      console.error(`[wallet] couldn't save the payout bank for wallet ${wallet.id}: ${payout.error}`);
      return { ok: false, error: `Card payments now go to this account, but we couldn't save it as your payout bank yet (${payout.error}). Save it again in a minute.` };
    }
    return { ok: true, message: "Done. Payments now go straight to this account." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Paystack didn't accept this account.";
    await db.wallet.update({ where: { id: wallet.id }, data: { nameCheck, subaccountStatus: "failed", subaccountError: message.slice(0, 300) } });
    return { ok: false, error: `Paystack couldn't set up this account: ${message}` };
  }
}

/**
 * Whose account this is: the name on the verified ID when there is one, else the owner's name on their account, or
 * the business's name (a company or "ventures" account). Every Nigerian bank account is BVN-linked, so paying the
 * named holder of an account in the owner's or business's name is paying them; anything else waits for the team.
 */
async function accountIsTheirs(wallet: WalletRow, accountName: string) {
  if (wallet.kycStatus === "verified" && accountNameMatches(accountName, { firstName: wallet.kycFirstName, lastName: wallet.kycLastName })) return true;
  const business = await businessName(wallet);
  const [first = "", ...rest] = business.ownerName.trim().split(/\s+/);
  const ownerMatches = wallet.kycStatus !== "verified" && rest.length > 0 && accountNameMatches(accountName, { firstName: first, lastName: rest.join(" ") });
  return ownerMatches || companyNamesMatch(business.name, accountName);
}

/** The bank picker's list: every bank and fintech Paystack settles to. */
export async function walletBankNames() {
  return Object.keys(await settlementBanks()).sort((a, b) => a.localeCompare(b));
}

/** Looks up the name on an account before it's saved, so the person sees whose account it is (Paystack's lookup, else Korapay's). */
export async function checkWalletAccount(input: { bankName: string; accountNumber: string }): Promise<ResolvedAccount> {
  const digits = input.accountNumber.replace(/\D/g, "");
  if (digits.length !== 10 || !(await settlementBanks())[input.bankName]) return { status: "not_found" };
  return resolveBankAccount(input.bankName, digits);
}

/**
 * Saves the bank Paystack settles to: the first thing a business sets up, no ID check needed first (like Shopify
 * Payments, getting paid comes first and verification follows). Paystack's lookup gives the account name; an account
 * in the owner's or business's name opens card payments straight away, any other waits for the team.
 */
export async function linkWalletBank(user: { id: string; role: WalletRole }, input: { bankName: string; accountNumber: string }): Promise<WalletResult> {
  const wallet = await ensureWallet(user);
  if (wallet.status === "frozen") return { ok: false, error: "Your wallet is paused. Contact support." };
  const bankCode = (await settlementBanks())[input.bankName];
  const accountNumber = input.accountNumber.replace(/\D/g, "");
  if (!bankCode) return { ok: false, error: "Choose your bank from the list." };
  if (accountNumber.length !== 10) return { ok: false, error: "Enter your 10-digit account number." };
  const resolved = await resolveBankAccount(input.bankName, accountNumber);
  if (resolved.status === "not_found") return { ok: false, error: "That account number doesn't exist at this bank." };
  if (resolved.status !== "resolved") return { ok: false, error: "We couldn't check this account just now. Try again in a few minutes." };

  const saved = await db.wallet.update({
    where: { id: wallet.id },
    data: { bankCode, bankName: input.bankName, accountNumber, accountName: resolved.accountName, nameCheck: null },
  });
  return openSubaccount(saved, (await accountIsTheirs(saved, resolved.accountName)) ? "auto" : null);
}

// ─── What each role is checked on ─────────────────────────────────────────────

/** Sellers: nothing. Suppliers: their business registration (CAC or BN). Delivery partners: the owner's BVN or NIN. */
export type WalletCheckKind = "none" | "business" | "id";

export function walletCheckKind(role: WalletRole): WalletCheckKind {
  return role === "seller" ? "none" : role === "supplier" ? "business" : "id";
}

export type BusinessRegistrationStatus = "approved" | "pending" | "rejected" | "missing";

/** Where a supplier's CAC or BN registration stands: checked against the registry, or the certificate reviewed by the team. */
export async function supplierRegistrationStatus(userId: string): Promise<BusinessRegistrationStatus> {
  const supplier = await db.supplier.findUnique({ where: { userId }, select: { verificationStatus: true, verificationDocuments: true } });
  if (!supplier) return "missing";
  const cac = parseVerificationDocs(supplier.verificationDocuments).find((doc) => doc.type === "cac");
  if (cac?.status === "approved" || supplier.verificationStatus === "verified") return "approved";
  if (cac?.status === "rejected") return "rejected";
  if (cac && ["uploaded", "submitted", "under_review"].includes(cac.status)) return "pending";
  return "missing";
}

/** Why the team can't approve this wallet's account (or add a Korapay split account) yet, or null when it can. */
async function walletCheckBlock(wallet: Pick<WalletRow, "userId" | "role" | "kycStatus">): Promise<string | null> {
  const kind = walletCheckKind(wallet.role as WalletRole);
  if (kind === "business" && (await supplierRegistrationStatus(wallet.userId)) !== "approved") return "Approve this supplier's business registration (CAC or BN) first.";
  if (kind === "id" && wallet.kycStatus !== "verified") return "This delivery partner's ID isn't verified yet.";
  return null;
}

// ─── Team actions ─────────────────────────────────────────────────────────────

/**
 * The team checked an account whose name isn't the owner's or the business's and lets payments go to it. A seller's
 * needs nothing else; a supplier's needs its approved business registration; a delivery partner's its verified ID.
 */
export async function approveWalletBank(walletId: string): Promise<WalletResult> {
  const wallet = await db.wallet.findUnique({ where: { id: walletId } });
  if (!wallet) return { ok: false, error: "Wallet not found." };
  if (!wallet.bankCode || !wallet.accountNumber) return { ok: false, error: "This wallet has no bank yet." };
  const blocked = await walletCheckBlock(wallet);
  if (blocked) return { ok: false, error: blocked };
  return openSubaccount(wallet, "approved");
}

/**
 * Records the business's Korapay Split Payments recipient (KPY-SPA-…), which the team adds in the Korapay dashboard
 * for the wallet's own bank account. Empty clears it (Korapay checkout stops splitting to this business).
 */
export async function setWalletKorapaySplitAccount(walletId: string, reference: string): Promise<WalletResult> {
  const value = reference.trim();
  if (value && !/^KPY-[A-Z]+-[A-Za-z0-9]+$/.test(value)) return { ok: false, error: "Paste the split account reference from the Korapay dashboard (it starts with KPY-)." };
  const wallet = await db.wallet.findUnique({ where: { id: walletId }, select: { id: true, userId: true, role: true, kycStatus: true, subaccountStatus: true } });
  if (!wallet) return { ok: false, error: "Wallet not found." };
  if (value) {
    const blocked = await walletCheckBlock(wallet);
    if (blocked) return { ok: false, error: blocked };
    if (wallet.subaccountStatus !== "active") return { ok: false, error: "Finish this wallet's bank check first, so Korapay pays the same checked account." };
  }
  try {
    await db.wallet.update({ where: { id: wallet.id }, data: { korapaySplitAccount: value || null } });
  } catch {
    return { ok: false, error: "That split account is already on another wallet." };
  }
  return { ok: true };
}

/** Pauses (or resumes) a wallet: Paystack stops settling to its subaccount and checkout stops splitting to it. */
export async function setWalletFrozen(walletId: string, frozen: boolean, reason?: string): Promise<WalletResult> {
  const wallet = await db.wallet.findUnique({ where: { id: walletId } });
  if (!wallet) return { ok: false, error: "Wallet not found." };
  if (wallet.subaccountCode) {
    try {
      await updatePaystackSubaccount(wallet.subaccountCode, { active: !frozen });
    } catch (error) {
      return { ok: false, error: `Paystack: ${error instanceof Error ? error.message : "could not update the subaccount"}` };
    }
  }
  await db.wallet.update({ where: { id: wallet.id }, data: frozen ? { status: "frozen", frozenReason: reason?.slice(0, 300) ?? null } : { status: "active", frozenReason: null } });
  return { ok: true };
}

// ─── Checkout: who gets paid ──────────────────────────────────────────────────

const activeWhere = { status: "active", subaccountStatus: "active", subaccountCode: { not: null } } satisfies Prisma.WalletWhereInput;

const korapayWhere = { ...activeWhere, korapaySplitAccount: { not: null } } satisfies Prisma.WalletWhereInput;

/** The seller can take card payments: their wallet settles to their own bank. */
export async function storeTakesCards(storeId: string) {
  const store = await db.store.findUnique({ where: { id: storeId }, select: { userId: true } });
  if (!store) return false;
  return (await db.wallet.count({ where: { userId: store.userId, ...activeWhere } })) > 0;
}

/** The seller can take Korapay payments: Split Payments is on and their wallet has a Korapay split account. */
export async function storeTakesKorapay(storeId: string) {
  if (!korapayCheckoutReady()) return false;
  const store = await db.store.findUnique({ where: { id: storeId }, select: { userId: true } });
  if (!store) return false;
  return (await db.wallet.count({ where: { userId: store.userId, ...korapayWhere } })) > 0;
}

/**
 * The split for an order about to be paid online: the seller's account on that gateway (Paystack subaccount or
 * Korapay split account), plus each dropship supplier with one for their wholesale cost. Null when the seller's
 * wallet can't take payments through that gateway.
 */
/** Shopinbos's fee on store sales (Admin › Pricing), or none when neither a rate nor a minimum is set. */
export async function platformFee(): Promise<PlatformFee | null> {
  const fee = storeFeeConfig(await getPriceBook());
  return fee.rate > 0 || fee.minFee > 0 ? fee : null;
}

export async function splitPlanForOrder(
  storeId: string,
  items: unknown,
  totalNaira: number,
  gateway: SplitGateway = "paystack",
  /** The order's delivery fee: Shopinbos's fee is on what the seller sells, not on delivery. */
  shippingNaira = 0,
  /** The order being paid: overdue money its businesses owe is taken from their shares and held for it. */
  orderId?: string,
): Promise<PaymentSplitPlan | null> {
  const store = await db.store.findUnique({ where: { id: storeId }, select: { userId: true } });
  if (!store) return null;
  const ready = gateway === "korapay" ? korapayWhere : activeWhere;
  const accountOf = (wallet: { subaccountCode: string | null; korapaySplitAccount: string | null } | undefined | null) => (gateway === "korapay" ? wallet?.korapaySplitAccount : wallet?.subaccountCode) ?? null;
  const seller = await db.wallet.findFirst({ where: { userId: store.userId, ...ready }, select: { subaccountCode: true, korapaySplitAccount: true } });
  const sellerAccount = accountOf(seller);
  if (!sellerAccount) return null;

  const productIds = [...new Set((Array.isArray(items) ? items : []).map((item) => (item as { productId?: unknown })?.productId).filter((id): id is string => typeof id === "string"))];
  const products = productIds.length
    ? await db.storeProduct.findMany({
        where: { storeId, id: { in: productIds }, fulfillmentType: "dropship", supplierProductId: { not: null } },
        select: { id: true, supplierProduct: { select: { id: true, supplierId: true, wholesalePrice: true } } },
      })
    : [];
  const links = new Map<string, DropshipLink>();
  for (const product of products) {
    if (product.supplierProduct) links.set(product.id, { supplierId: product.supplierProduct.supplierId, supplierProductId: product.supplierProduct.id, unitCost: product.supplierProduct.wholesalePrice, image: null });
  }
  const { groups } = groupDropshipLines(items, links);
  const suppliers = groups.length
    ? await db.supplier.findMany({ where: { id: { in: groups.map((group) => group.supplierId) } }, select: { id: true, userId: true } })
    : [];
  const wallets = suppliers.length
    ? await db.wallet.findMany({ where: { userId: { in: suppliers.map((supplier) => supplier.userId) }, ...ready }, select: { userId: true, subaccountCode: true, korapaySplitAccount: true } })
    : [];
  const subaccountBySupplier = new Map(suppliers.map((supplier) => [supplier.id, accountOf(wallets.find((wallet) => wallet.userId === supplier.userId))]));
  const totalKobo = Math.round(totalNaira * 100);
  const fee = await platformFee();
  // Overdue money owed by the seller or a supplier paid in this split goes to whoever it's owed to (src/lib/money-owed).
  const debtors = new Map<string, string>([[store.userId, "seller"]]);
  for (const supplier of suppliers) if (subaccountBySupplier.get(supplier.id)) debtors.set(supplier.userId, supplier.id);
  const plan = buildSplitPlan({
    gateway,
    totalKobo,
    platformKobo: platformFeeKobo(Math.max(0, totalKobo - Math.round(Math.max(0, shippingNaira) * 100)), fee),
    sellerSubaccount: sellerAccount,
    suppliers: groups.map((group) => ({ supplierId: group.supplierId, subaccount: subaccountBySupplier.get(group.supplierId) ?? null, costKobo: Math.round(group.costTotal * 100) })),
    debts: orderId ? await debtsToDeduct(debtors, gateway) : [],
  });
  if (orderId) await holdPlannedDeductions(orderId, plan.deductions ?? []);
  return plan;
}

/** Writes each business's share of a paid order to its statement, once (unique references). Never throws. */
export async function recordOrderShares(orderId: string) {
  try {
    const order = await db.retailOrder.findUnique({ where: { id: orderId }, select: { id: true, orderNumber: true, paymentSplit: true, paystackRef: true, store: { select: { userId: true } } } });
    const plan = readSplitPlan(order?.paymentSplit);
    if (!order || !plan) return;
    const seller = await db.wallet.findUnique({ where: { userId: order.store.userId }, select: { id: true } });
    const rows: Prisma.WalletEntryCreateManyInput[] = [];
    if (seller) rows.push({ walletId: seller.id, reference: `sale:${order.id}`, kind: "sale", amountKobo: plan.sellerKobo, description: `Order ${order.orderNumber}`, orderId: order.id, paystackReference: order.paystackRef ?? order.id });
    if (plan.suppliers.length) {
      const suppliers = await db.supplier.findMany({ where: { id: { in: plan.suppliers.map((share) => share.supplierId) } }, select: { id: true, userId: true } });
      const wallets = await db.wallet.findMany({ where: { userId: { in: suppliers.map((supplier) => supplier.userId) } }, select: { id: true, userId: true } });
      for (const share of plan.suppliers) {
        const userId = suppliers.find((supplier) => supplier.id === share.supplierId)?.userId;
        const wallet = wallets.find((row) => row.userId === userId);
        if (wallet) rows.push({ walletId: wallet.id, reference: `supplier:${order.id}:${share.supplierId}`, kind: "supplier_order", amountKobo: share.kobo, description: `Dropship order ${order.orderNumber}`, orderId: order.id, supplierId: share.supplierId, paystackReference: order.paystackRef ?? order.id });
      }
    }
    if (rows.length) await db.walletEntry.createMany({ data: rows, skipDuplicates: true });
    // What the split took from the shares for money owed is now paid (once per order and debt).
    if (plan.deductions?.length) await applyDeductions({ key: order.id, deductions: plan.deductions, label: `order ${order.orderNumber}`, paystackReference: order.paystackRef, retailOrderId: order.id });
  } catch (error) {
    console.error(`[wallet] could not record the shares of order ${orderId}`, error);
  }
}

// ─── The wallet page ──────────────────────────────────────────────────────────

export interface WalletView {
  /**
   * What this business is checked on (walletCheckKind): nothing, its business registration (with where it stands
   * and where to do it), or the owner's ID (the kyc block below). Older phone apps read only kyc.
   */
  check: { kind: "none" } | { kind: "business"; status: BusinessRegistrationStatus; href: string } | { kind: "id" };
  kyc: { status: string; idType: string | null; idLast4: string | null; name: string | null; verifiedAt: string | null; checksReady: boolean };
  bank: { bankName: string; accountName: string; accountEnding: string } | null;
  settlement: { status: string; error: string | null; frozen: boolean; frozenReason: string | null; korapay: boolean };
  /** Kobo. */
  totals: { paidKobo: number; last30Kobo: number; refundedKobo: number };
  entries: Array<{ id: string; kind: string; description: string; amountKobo: number; status: string; createdAt: string; orderId: string | null }>;
  settlements: Array<{ id: string; status: string; amountKobo: number; date: string | null }>;
  /** Supplier orders whose supplier has no wallet: the seller pays them. */
  sellerSettles: Array<{ orderId: string; orderNumber: string; amountKobo: number }>;
  /**
   * Dropship shares Paystack paid to a supplier who then declined, missed or cancelled the order, still not paid
   * back: for a seller, who owes them; for a supplier, which shops to pay back (the phone app shows these; the web
   * shows everything owed in `owed`).
   */
  toReturn: Array<{ orderId: string; orderNumber: string; otherParty: string; amountKobo: number }>;
  /** Money owed between this business and others (src/lib/money-owed), and the orders a seller can claim on. */
  owed: MoneyOwedView;
  /** Sellers: Shopinbos's fee on their store sales (null = none). Suppliers and delivery partners pay none. */
  fee: PlatformFee | null;
}

export async function loadWalletView(user: { id: string; role: WalletRole }): Promise<WalletView> {
  const wallet = await ensureWallet(user);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60_000);
  const [entries, paid, last30, refunded, settlements, owed] = await Promise.all([
    db.walletEntry.findMany({ where: { walletId: wallet.id }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.walletEntry.aggregate({ where: { walletId: wallet.id, status: "paid" }, _sum: { amountKobo: true } }),
    db.walletEntry.aggregate({ where: { walletId: wallet.id, status: "paid", createdAt: { gte: since } }, _sum: { amountKobo: true } }),
    db.walletEntry.aggregate({ where: { walletId: wallet.id, status: "refunded" }, _sum: { amountKobo: true } }),
    wallet.subaccountCode ? listPaystackSettlements(wallet.subaccountCode).catch(() => []) : Promise.resolve([]),
    user.role === "seller" ? sellerOwedSuppliers(user.id) : Promise.resolve([]),
  ]);
  const moneyOwed = await loadMoneyOwed(user).catch((error) => {
    console.error(`[wallet] could not load money owed for ${user.id}`, error);
    return { iOwe: [], owedToMe: [], claimable: [], pausedAt: null } satisfies MoneyOwedView;
  });
  const toReturn = await notSentStillOwed(user, moneyOwed);
  const name = [wallet.kycFirstName, wallet.kycMiddleName, wallet.kycLastName].filter(Boolean).join(" ") || null;
  const kind = walletCheckKind(user.role);
  const check: WalletView["check"] =
    kind === "business" ? { kind, status: await supplierRegistrationStatus(user.id).catch(() => "missing" as const), href: "/supplier/verification" } : { kind };
  return {
    check,
    // Sellers and suppliers have no ID step ("not_required"; an older phone app shows its "not switched on" note).
    kyc: kind !== "id" ? { status: "not_required", idType: null, idLast4: null, name: null, verifiedAt: null, checksReady: false } : { status: wallet.kycStatus, idType: wallet.kycIdType, idLast4: wallet.kycIdLast4, name, verifiedAt: wallet.kycVerifiedAt?.toISOString() ?? null, checksReady: identityChecksReady() },
    bank: wallet.bankName && wallet.accountName ? { bankName: wallet.bankName, accountName: wallet.accountName, accountEnding: maskAccountNumber(wallet.accountNumber) } : null,
    settlement: { status: wallet.subaccountStatus, error: wallet.subaccountError, frozen: wallet.status === "frozen", frozenReason: wallet.frozenReason, korapay: Boolean(wallet.korapaySplitAccount) && korapayCheckoutReady() },
    totals: { paidKobo: paid._sum.amountKobo ?? 0, last30Kobo: last30._sum.amountKobo ?? 0, refundedKobo: refunded._sum.amountKobo ?? 0 },
    entries: entries.map((entry) => ({ id: entry.id, kind: entry.kind, description: entry.description, amountKobo: entry.amountKobo, status: entry.status, createdAt: entry.createdAt.toISOString(), orderId: entry.orderId })),
    settlements: settlements.map((row) => ({ id: row.id, status: row.status, amountKobo: row.totalAmount, date: row.settlementDate })),
    sellerSettles: owed,
    toReturn,
    owed: moneyOwed,
    fee: user.role === "seller" ? await platformFee().catch(() => null) : null,
  };
}

/** Not-sent dropship shares still owed, in the shape the phone app reads (one row per order). */
async function notSentStillOwed(user: { id: string; role: WalletRole }, owed: MoneyOwedView): Promise<WalletView["toReturn"]> {
  if (user.role === "logistics_partner") return [];
  const rows = (user.role === "supplier" ? owed.iOwe : owed.owedToMe).filter((debt) => debt.reason === "not_sent" && debt.status === "open" && debt.remainingKobo > 0 && debt.orderId);
  if (!rows.length) return [];
  const orders = await db.retailOrder.findMany({ where: { id: { in: rows.map((row) => row.orderId!) } }, select: { id: true, orderNumber: true } }).catch(() => []);
  return rows.map((row) => ({ orderId: row.orderId!, orderNumber: orders.find((order) => order.id === row.orderId)?.orderNumber ?? "", otherParty: row.otherParty, amountKobo: row.remainingKobo }));
}

/** Recent card orders where a dropship supplier had no wallet, so their cost went to the seller to pass on. */
async function sellerOwedSuppliers(userId: string) {
  const orders = await db.retailOrder.findMany({
    where: { store: { userId }, paymentSplit: { not: Prisma.DbNull }, status: { in: ["paid", "processing", "packed", "shipped", "delivered"] } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, orderNumber: true, paymentSplit: true },
  }).catch(() => []);
  return orders.flatMap((order) => {
    const plan = readSplitPlan(order.paymentSplit);
    const amountKobo = plan?.sellerSettles.reduce((sum, row) => sum + row.kobo, 0) ?? 0;
    return amountKobo > 0 ? [{ orderId: order.id, orderNumber: order.orderNumber, amountKobo }] : [];
  }).slice(0, 20);
}
