// Shopinbos Wallet rules: KYC input checks, matching a bank account's name to the verified person, and the Paystack
// split each paid order is settled with. Pure (no imports) so tests/wallet.test.mjs can load it directly.
//
// Shopinbos never holds anyone's money. A store payment is split by the gateway at checkout: the seller's share goes
// to the seller's Paystack subaccount (or Korapay split account), each dropship supplier's cost to the supplier's,
// and the gateway settles every share straight to that business's own bank. Shopinbos's own share is its fee on the
// sale (Admin › Pricing, shared/platform-pricing.ts; none when no fee is set).

export const WALLET_ROLES = ["seller", "supplier", "logistics_partner"] as const;
export type WalletRole = (typeof WALLET_ROLES)[number];

export function isWalletRole(role: unknown): role is WalletRole {
  return typeof role === "string" && (WALLET_ROLES as readonly string[]).includes(role);
}

/** Failed ID checks allowed per day (each one costs a Korapay lookup). */
export const KYC_DAILY_ATTEMPTS = 5;

export type KycIdType = "bvn" | "nin";

/** An 11-digit BVN or NIN with spaces and dashes taken out, or null. */
export function cleanIdNumber(value: unknown) {
  const digits = typeof value === "string" ? value.replace(/[\s-]/g, "") : "";
  return /^\d{11}$/.test(digits) ? digits : null;
}

/** YYYY-MM-DD, a real date, and the owner is at least 18 on `today`. */
export function adultDateOfBirth(value: unknown, today = new Date()) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month! - 1 || date.getUTCDate() !== day) return false;
  const eighteen = new Date(Date.UTC(year! + 18, month! - 1, day!));
  return eighteen.getTime() <= today.getTime() && year! >= 1900;
}

/** The calendar day in Lagos (UTC+1) as YYYY-MM-DD: KYC attempts are counted per day. */
export function lagosDay(date: Date) {
  return new Date(date.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Whether another ID check is allowed today, given the wallet's counter. */
export function kycAttemptAllowed(wallet: { kycAttempts: number; kycAttemptDay: string | null }, now = new Date()) {
  return wallet.kycAttemptDay !== lagosDay(now) || wallet.kycAttempts < KYC_DAILY_ATTEMPTS;
}

function nameWords(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1);
}

/**
 * Whether a bank account name belongs to the verified person: both their first and last names appear in it (any
 * order, case and punctuation ignored, so "OBI, ADAEZE C." matches Adaeze Obi). Company accounts won't match and go
 * to the team for review.
 */
export function accountNameMatches(accountName: string, person: { firstName: string | null; lastName: string | null }) {
  const words = new Set(nameWords(accountName));
  const first = nameWords(person.firstName);
  const last = nameWords(person.lastName);
  if (!first.length || !last.length) return false;
  return first.some((word) => words.has(word)) && last.some((word) => words.has(word));
}

/** "******6789" for showing an account number. */
export function maskAccountNumber(accountNumber: string | null | undefined) {
  const digits = (accountNumber ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? `******${digits.slice(-4)}` : "";
}

// ─── Splitting a payment ──────────────────────────────────────────────────────

export type SplitGateway = "paystack" | "korapay";

export interface SupplierShareInput {
  supplierId: string;
  /** The supplier's account on this gateway (Paystack subaccount / Korapay split account), or null if none. */
  subaccount: string | null;
  /** What the order owes this supplier for its dropship lines (wholesale cost × quantity), in kobo. */
  costKobo: number;
  /** Shopinbos's marketplace commission on those lines (shared/plans.ts, by the supplier's plan), in kobo. */
  commissionKobo?: number;
}

/** The supplier's commission on a marketplace order: `pct` of the wholesale value, never more than it. */
export function supplierCommissionKobo(costKobo: number, pct: number) {
  if (!(costKobo > 0) || !(pct > 0)) return 0;
  return Math.min(Math.round(costKobo), Math.round((costKobo * pct) / 100));
}

/** A delivery partner paid its delivery fee in the order's split (src/lib/delivery-market). */
export interface DeliveryShareInput {
  /** The parcel the fee is for: own | supplier:<supplierId>. */
  shipmentKey: string;
  partnerId: string;
  /** The partner's account on this gateway, or null if none (the fee then stays with the seller, who pays the partner). */
  subaccount: string | null;
  kobo: number;
}

/** Shopinbos's fee on store sales (Admin › Pricing): a percentage of what the seller sells, within min / max (naira; 0 = none). */
export interface PlatformFee {
  rate: number;
  minFee: number;
  maxFee: number;
}

/** Paystack won't settle a share smaller than this, so the fee always leaves the seller at least ₦100. */
export const MIN_SELLER_KOBO = 10_000;

/** The fee in kobo on `baseKobo` (the order less delivery): rate %, raised to minFee and capped at maxFee and the base. */
export function platformFeeKobo(baseKobo: number, fee: PlatformFee | null) {
  if (!fee || !(baseKobo > 0) || !(fee.rate > 0 || fee.minFee > 0)) return 0;
  let value = (baseKobo * Math.max(0, fee.rate)) / 100;
  if (fee.minFee > 0) value = Math.max(value, fee.minFee * 100);
  if (fee.maxFee > 0) value = Math.min(value, fee.maxFee * 100);
  return Math.round(Math.min(value, baseKobo));
}

export interface PaymentSplitPlan {
  version: 1;
  /** Which gateway splits it (older plans: Paystack). The account fields are that gateway's references. */
  gateway?: SplitGateway;
  totalKobo: number;
  sellerSubaccount: string;
  /** What the gateway settles to the seller: the total less the suppliers paid in the split. */
  sellerKobo: number;
  /** Suppliers the gateway pays directly in this split. */
  suppliers: Array<{ supplierId: string; subaccount: string; kobo: number; commissionKobo?: number }>;
  /** Suppliers without a wallet: their cost stays in the seller's share and the seller pays them. */
  sellerSettles: Array<{ supplierId: string; kobo: number }>;
  /**
   * Delivery partners paid their delivery fee straight from this payment (logistics marketplace; Shopinbos takes no
   * commission on it). A fee not here stays in the seller's share (older plans: none).
   */
  delivery?: Array<{ shipmentKey: string; partnerId: string; subaccount: string; kobo: number }>;
  /** Shopinbos's fee: what no business's share covers, so the gateway leaves it in Shopinbos's balance (older plans: 0). */
  platformKobo?: number;
  /**
   * Overdue money a business in this order owes (src/lib/money-owed), paid from its share: `from` is "seller" or
   * the supplier's id, `to` the account of the business owed (null: Shopinbos, so it stays in Shopinbos's balance
   * and is counted in platformKobo). The shares above are already what's left after these (older plans: none).
   */
  deductions?: SplitDeduction[];
}

export interface SplitDeduction {
  debtId: string;
  from: string;
  to: string | null;
  kobo: number;
}

/** An overdue debt a business in the order owes, oldest first: what of it can be taken from this order. */
export interface DebtToDeduct {
  debtId: string;
  /** "seller" or the supplier's id. */
  from: string;
  /** The account of the business owed on this gateway, or null for Shopinbos. */
  to: string | null;
  /** Still owed and not held by another checkout. */
  availableKobo: number;
}

/** At most this part of a business's share of one order goes to what it owes, so it still gets paid for the order. */
export const DEDUCTION_SHARE = 0.5;

/**
 * Takes overdue debts out of the shares (oldest first): at most DEDUCTION_SHARE of each business's share, never
 * leaving it less than MIN_SELLER_KOBO, and never a part smaller than MIN_SELLER_KOBO (Paystack won't settle it).
 */
function takeDebts(shares: Map<string, number>, debts: DebtToDeduct[]) {
  const start = new Map(shares);
  const taken = new Map<string, number>();
  const deductions: SplitDeduction[] = [];
  for (const debt of debts) {
    const current = shares.get(debt.from);
    if (current === undefined || !(debt.availableKobo > 0)) continue;
    const cap = Math.floor((start.get(debt.from) ?? 0) * DEDUCTION_SHARE) - (taken.get(debt.from) ?? 0);
    const kobo = Math.floor(Math.min(debt.availableKobo, cap, current - MIN_SELLER_KOBO));
    if (kobo < MIN_SELLER_KOBO) continue;
    shares.set(debt.from, current - kobo);
    taken.set(debt.from, (taken.get(debt.from) ?? 0) + kobo);
    deductions.push({ debtId: debt.debtId, from: debt.from, to: debt.to, kobo });
  }
  return deductions;
}

/**
 * The split for a paid order. Suppliers with an active subaccount get their cost less Shopinbos's commission;
 * Shopinbos keeps its fee (platformKobo, lowered so the seller keeps at least MIN_SELLER_KOBO) and the commissions;
 * the seller gets the rest. Suppliers without an account are paid by the seller, so no commission is taken there. When the
 * suppliers' costs come to more than the total (a product priced below cost), nobody is paid in the split but the
 * seller, there's no fee, and the seller settles the suppliers, so a split never asks Paystack for more than was paid.
 */
export function buildSplitPlan(input: { totalKobo: number; sellerSubaccount: string; suppliers: SupplierShareInput[]; gateway?: SplitGateway; platformKobo?: number; debts?: DebtToDeduct[]; delivery?: DeliveryShareInput[] }): PaymentSplitPlan {
  const gateway = input.gateway ?? "paystack";
  // Delivery fees go to their partners first (each at least what the gateway will settle); the rest is split as before.
  const delivery = (input.delivery ?? [])
    .filter((share): share is DeliveryShareInput & { subaccount: string } => !!share.subaccount && Math.round(share.kobo) >= MIN_SELLER_KOBO)
    .map((share) => ({ shipmentKey: share.shipmentKey, partnerId: share.partnerId, subaccount: share.subaccount, kobo: Math.round(share.kobo) }));
  const deliveryKobo = delivery.reduce((sum, share) => sum + share.kobo, 0);
  if (delivery.length && deliveryKobo + MIN_SELLER_KOBO <= Math.round(input.totalKobo)) {
    const rest = buildSplitPlan({ ...input, totalKobo: Math.round(input.totalKobo) - deliveryKobo, delivery: [] });
    return { ...rest, totalKobo: Math.max(0, Math.round(input.totalKobo)), delivery };
  }
  const total = Math.max(0, Math.round(input.totalKobo));
  const owed = input.suppliers.filter((supplier) => supplier.costKobo > 0).map((supplier) => ({ ...supplier, costKobo: Math.round(supplier.costKobo) }));
  const direct = owed.filter((supplier) => supplier.subaccount);
  const directTotal = direct.reduce((sum, supplier) => sum + supplier.costKobo, 0);
  if (directTotal > total) {
    return { version: 1, gateway, totalKobo: total, sellerSubaccount: input.sellerSubaccount, sellerKobo: total, suppliers: [], sellerSettles: owed.map(({ supplierId, costKobo }) => ({ supplierId, kobo: costKobo })) };
  }
  const available = total - directTotal;
  const feeKobo = Math.max(0, Math.min(Math.round(input.platformKobo ?? 0), available - MIN_SELLER_KOBO));
  const commission = new Map(direct.map((supplier) => [supplier.supplierId, Math.max(0, Math.min(supplier.costKobo, Math.round(supplier.commissionKobo ?? 0)))]));
  const commissions = [...commission.values()].reduce((sum, kobo) => sum + kobo, 0);
  const shares = new Map<string, number>([["seller", available - feeKobo], ...direct.map((supplier) => [supplier.supplierId, supplier.costKobo - commission.get(supplier.supplierId)!] as [string, number])]);
  const deductions = takeDebts(shares, input.debts ?? []);
  const toShopinbos = deductions.filter((deduction) => deduction.to === null).reduce((sum, deduction) => sum + deduction.kobo, 0) + commissions;
  return {
    version: 1,
    gateway,
    totalKobo: total,
    sellerSubaccount: input.sellerSubaccount,
    sellerKobo: shares.get("seller")!,
    platformKobo: feeKobo + toShopinbos,
    suppliers: direct.map((supplier) => ({ supplierId: supplier.supplierId, subaccount: supplier.subaccount!, kobo: shares.get(supplier.supplierId)!, ...(commission.get(supplier.supplierId) ? { commissionKobo: commission.get(supplier.supplierId)! } : {}) })),
    sellerSettles: owed.filter((supplier) => !supplier.subaccount).map(({ supplierId, costKobo }) => ({ supplierId, kobo: costKobo })),
    ...(deductions.length ? { deductions } : {}),
  };
}

/**
 * Every business account paid in the split with its share, one entry per account: a business owed money can also
 * be in the order (a shop paid back from its own supplier's share), and a gateway takes each account once.
 */
export function splitShares(plan: PaymentSplitPlan): Array<{ account: string; kobo: number }> {
  const shares = new Map<string, number>();
  const add = (account: string, kobo: number) => shares.set(account, (shares.get(account) ?? 0) + kobo);
  add(plan.sellerSubaccount, plan.sellerKobo);
  for (const supplier of plan.suppliers) add(supplier.subaccount, supplier.kobo);
  for (const share of plan.delivery ?? []) add(share.subaccount, share.kobo);
  for (const deduction of plan.deductions ?? []) if (deduction.to) add(deduction.to, deduction.kobo);
  return [...shares].map(([account, kobo]) => ({ account, kobo }));
}

/**
 * What goes into Paystack's transaction initialize so Shopinbos keeps only its fee. One business: the seller's
 * subaccount with the fee as the main account's flat charge, and the seller bears Paystack's fee. Several: a
 * dynamic flat split whose shares add up to the whole amount less the fee (that remainder stays with the main
 * account), each business bearing its share of Paystack's fee.
 */
export function paystackSplitParams(plan: PaymentSplitPlan): Record<string, unknown> {
  const shares = splitShares(plan);
  if (shares.length === 1) {
    return { subaccount: shares[0]!.account, transaction_charge: plan.platformKobo ?? 0, bearer: "subaccount" };
  }
  return {
    split: {
      type: "flat",
      bearer_type: "all-proportional",
      currency: "NGN",
      subaccounts: shares.map((share) => ({ subaccount: share.account, share: share.kobo })),
    },
  };
}

const naira = (kobo: number) => (Math.round(kobo) / 100).toFixed(2);

/**
 * What goes into Korapay's charge initialize (Split Payments, dynamic rule): flat naira amounts to each business's
 * Korapay split account, adding up to the whole amount less Shopinbos's fee, which is all that's left in the
 * Shopinbos balance.
 */
export function korapaySplitParams(plan: PaymentSplitPlan): Record<string, unknown> {
  return {
    split_configuration: {
      split_type: "flat",
      split_accounts: splitShares(plan).map((share) => ({ value: naira(share.kobo), split_account_reference: share.account })),
    },
  };
}

/** A split plan read back from RetailOrder.paymentSplit, or null when it isn't one. */
export function readSplitPlan(value: unknown): PaymentSplitPlan | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const plan = value as Partial<PaymentSplitPlan>;
  if (plan.version !== 1 || typeof plan.sellerSubaccount !== "string" || typeof plan.sellerKobo !== "number" || !Array.isArray(plan.suppliers)) return null;
  return { ...plan, sellerSettles: Array.isArray(plan.sellerSettles) ? plan.sellerSettles : [], deductions: Array.isArray(plan.deductions) ? plan.deductions : [] } as PaymentSplitPlan;
}
