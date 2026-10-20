import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { getPriceBook } from "@/lib/pricing/price-book.server";
import { storeFeeConfig, supplierCommissionPct } from "@shared/platform-pricing";
import { planKeyFor } from "@shared/plans";
import { korapayCheckoutReady } from "@/lib/korapay";
import { createPaystackSubaccount, listPaystackSettlements, updatePaystackSubaccount } from "@/lib/paystack";
import { resolveBankAccount, settlementBanks, syncPayoutBank, type ResolvedAccount } from "@/lib/payout-bank";
import { companyNamesMatch } from "@/lib/kyb/cac";
import { parseVerificationDocs } from "@/lib/verification-utils";
import { groupDropshipLines, type DropshipLink } from "@/lib/supplier-orders/pure";
import { applyDeductions, debtsToDeduct, holdPlannedDeductions, loadMoneyOwed, type MoneyOwedView } from "@/lib/money-owed/money-owed.server";
import {
  accountNameMatches,
  buildSplitPlan,
  maskAccountNumber,
  platformFeeKobo,
  readSplitPlan,
  supplierCommissionKobo,
  type PaymentSplitPlan,
  type PlatformFee,
  type SplitGateway,
  type WalletRole,
} from "./rules";

// Shopinbos Wallet, server side. A business links the bank Paystack should settle to and gets a Paystack subaccount
// (an account in another name waits for the team). Nobody is asked for an ID: sellers have no check, and a supplier's
// or delivery partner's is its business registration (CAC or BN, src/lib/kyb). The kyc fields of a wallet verified
// before are kept and still match an account in the owner's own name. From then on every store payment is split at
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

/** Sellers: nothing. Suppliers and delivery partners: their business registration (CAC or BN). */
export type WalletCheckKind = "none" | "business";

export function walletCheckKind(role: WalletRole): WalletCheckKind {
  return role === "seller" ? "none" : "business";
}

export type BusinessRegistrationStatus = "approved" | "pending" | "rejected" | "missing";

/**
 * Where a supplier's or delivery partner's CAC or BN registration stands: checked against the registry, or the
 * certificate reviewed by the team. A business the team verified counts as registered.
 */
export async function businessRegistrationStatus(userId: string, role: "supplier" | "logistics_partner"): Promise<BusinessRegistrationStatus> {
  const select = { verificationStatus: true, verificationDocuments: true } as const;
  const business = role === "supplier" ? await db.supplier.findUnique({ where: { userId }, select }) : await db.logisticsPartner.findUnique({ where: { userId }, select });
  if (!business) return "missing";
  const cac = parseVerificationDocs(business.verificationDocuments).find((doc) => doc.type === "cac");
  if (cac?.status === "approved" || business.verificationStatus === "verified") return "approved";
  if (cac?.status === "rejected") return "rejected";
  if (cac && ["uploaded", "submitted", "under_review"].includes(cac.status)) return "pending";
  return "missing";
}

/** Why the team can't approve this wallet's account (or add a Korapay split account) yet, or null when it can. */
async function walletCheckBlock(wallet: Pick<WalletRow, "userId" | "role">): Promise<string | null> {
  const role = wallet.role as WalletRole;
  if (role === "seller") return null;
  if ((await businessRegistrationStatus(wallet.userId, role)) !== "approved") {
    return `Approve this ${role === "supplier" ? "supplier" : "delivery partner"}'s business registration (CAC or BN) first.`;
  }
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
  const wallet = await db.wallet.findUnique({ where: { id: walletId }, select: { id: true, userId: true, role: true, subaccountStatus: true } });
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
/**
 * Shopinbos's fee on a seller's store sales: the rate for their plan (shared/plans.ts, Admin › Pricing), or none
 * when neither a rate nor a minimum is set.
 */
export async function platformFee(sellerUserId?: string, book?: Awaited<ReturnType<typeof getPriceBook>>): Promise<PlatformFee | null> {
  const prices = book ?? (await getPriceBook());
  const seller = sellerUserId ? await db.user.findUnique({ where: { id: sellerUserId }, select: { aiCredits: true } }) : null;
  const fee = storeFeeConfig(prices, planKeyFor("seller", seller?.aiCredits));
  return fee.rate > 0 || fee.minFee > 0 ? fee : null;
}

/** A supplier's commission on marketplace orders for their plan (percent). */
async function supplierCommission(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { aiCredits: true } });
  return supplierCommissionPct(await getPriceBook(), planKeyFor("supplier", user?.aiCredits));
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
        select: { id: true, retailPrice: true, supplierProduct: { select: { id: true, supplierId: true, wholesalePrice: true } } },
      })
    : [];
  const links = new Map<string, DropshipLink>();
  for (const product of products) {
    if (product.supplierProduct) links.set(product.id, { supplierId: product.supplierProduct.supplierId, supplierProductId: product.supplierProduct.id, unitCost: product.supplierProduct.wholesalePrice, image: null });
  }
  const { groups } = groupDropshipLines(items, links);
  const suppliers = groups.length
    ? await db.supplier.findMany({ where: { id: { in: groups.map((group) => group.supplierId) } }, select: { id: true, userId: true, user: { select: { aiCredits: true } } } })
    : [];
  const wallets = suppliers.length
    ? await db.wallet.findMany({ where: { userId: { in: suppliers.map((supplier) => supplier.userId) }, ...ready }, select: { userId: true, subaccountCode: true, korapaySplitAccount: true } })
    : [];
  const subaccountBySupplier = new Map(suppliers.map((supplier) => [supplier.id, accountOf(wallets.find((wallet) => wallet.userId === supplier.userId))]));
  const totalKobo = Math.round(totalNaira * 100);
  const book = await getPriceBook();
  const fee = await platformFee(store.userId, book);
  // Dropship lines pay the supplier's commission instead of the seller's fee (October 2026 pricing).
  const retailOf = new Map(products.map((product) => [product.id, product.retailPrice]));
  const dropshipKobo = (Array.isArray(items) ? items : []).reduce((sum: number, item) => {
    const line = item as { productId?: unknown; quantity?: unknown };
    const price = typeof line.productId === "string" ? retailOf.get(line.productId) : undefined;
    return price === undefined ? sum : sum + Math.round(price * 100) * Math.max(1, Math.floor(Number(line.quantity) || 1));
  }, 0);
  const commissionPctOf = new Map(suppliers.map((supplier) => [supplier.id, supplierCommissionPct(book, planKeyFor("supplier", supplier.user?.aiCredits))]));
  // Overdue money owed by the seller or a supplier paid in this split goes to whoever it's owed to (src/lib/money-owed).
  const debtors = new Map<string, string>([[store.userId, "seller"]]);
  for (const supplier of suppliers) if (subaccountBySupplier.get(supplier.id)) debtors.set(supplier.userId, supplier.id);
  const plan = buildSplitPlan({
    gateway,
    totalKobo,
    platformKobo: platformFeeKobo(Math.max(0, totalKobo - Math.round(Math.max(0, shippingNaira) * 100) - dropshipKobo), fee),
    sellerSubaccount: sellerAccount,
    suppliers: groups.map((group) => {
      const costKobo = Math.round(group.costTotal * 100);
      return { supplierId: group.supplierId, subaccount: subaccountBySupplier.get(group.supplierId) ?? null, costKobo, commissionKobo: supplierCommissionKobo(costKobo, commissionPctOf.get(group.supplierId) ?? 0) };
    }),
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
   * What this business is checked on (walletCheckKind): nothing, or its business registration (with where it
   * stands and where to do it). Older phone apps read only kyc.
   */
  check: { kind: "none" } | { kind: "business"; status: BusinessRegistrationStatus; href: string };
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
  /** Suppliers: Shopinbos's commission on marketplace orders for their plan (percent). */
  commissionPct: number | null;
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
  const check: WalletView["check"] =
    user.role === "seller"
      ? { kind: "none" }
      : {
          kind: "business",
          status: await businessRegistrationStatus(user.id, user.role).catch(() => "missing" as const),
          href: user.role === "supplier" ? "/supplier/verification" : "/logistics/verification",
        };
  return {
    check,
    // Nobody has an ID step now ("not_required"; an older phone app shows its "not switched on" note there).
    kyc: { status: "not_required", idType: null, idLast4: null, name: null, verifiedAt: null, checksReady: false },
    bank: wallet.bankName && wallet.accountName ? { bankName: wallet.bankName, accountName: wallet.accountName, accountEnding: maskAccountNumber(wallet.accountNumber) } : null,
    settlement: { status: wallet.subaccountStatus, error: wallet.subaccountError, frozen: wallet.status === "frozen", frozenReason: wallet.frozenReason, korapay: Boolean(wallet.korapaySplitAccount) && korapayCheckoutReady() },
    totals: { paidKobo: paid._sum.amountKobo ?? 0, last30Kobo: last30._sum.amountKobo ?? 0, refundedKobo: refunded._sum.amountKobo ?? 0 },
    entries: entries.map((entry) => ({ id: entry.id, kind: entry.kind, description: entry.description, amountKobo: entry.amountKobo, status: entry.status, createdAt: entry.createdAt.toISOString(), orderId: entry.orderId })),
    settlements: settlements.map((row) => ({ id: row.id, status: row.status, amountKobo: row.totalAmount, date: row.settlementDate })),
    sellerSettles: owed,
    toReturn,
    owed: moneyOwed,
    fee: user.role === "seller" ? await platformFee(user.id).catch(() => null) : null,
    commissionPct: user.role === "supplier" ? await supplierCommission(user.id).catch(() => null) : null,
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
