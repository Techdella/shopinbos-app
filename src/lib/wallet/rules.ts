// Shopinbos Wallet rules: KYC input checks, matching a bank account's name to the verified person, and the Paystack
// split each paid order is settled with. Pure (no imports) so tests/wallet.test.mjs can load it directly.
//
// Shopinbos never holds anyone's money. A store payment is split by the gateway at checkout: the seller's share goes
// to the seller's Paystack subaccount (or Korapay split account), each dropship supplier's cost to the supplier's,
// and the gateway settles every share straight to that business's own bank. Shopinbos's own share is zero.

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
  suppliers: Array<{ supplierId: string; subaccount: string; kobo: number }>;
  /** Suppliers without a wallet: their cost stays in the seller's share and the seller pays them. */
  sellerSettles: Array<{ supplierId: string; kobo: number }>;
}

/**
 * The split for a paid order. Suppliers with an active subaccount get exactly their cost; the seller gets the rest.
 * When the suppliers' costs come to more than the total (a product priced below cost), nobody is paid in the split
 * but the seller, and the seller settles the suppliers, so a split never asks Paystack for more than was paid.
 */
export function buildSplitPlan(input: { totalKobo: number; sellerSubaccount: string; suppliers: SupplierShareInput[]; gateway?: SplitGateway }): PaymentSplitPlan {
  const total = Math.max(0, Math.round(input.totalKobo));
  const gateway = input.gateway ?? "paystack";
  const owed = input.suppliers.filter((supplier) => supplier.costKobo > 0).map((supplier) => ({ ...supplier, costKobo: Math.round(supplier.costKobo) }));
  const direct = owed.filter((supplier) => supplier.subaccount);
  const directTotal = direct.reduce((sum, supplier) => sum + supplier.costKobo, 0);
  if (directTotal > total) {
    return { version: 1, gateway, totalKobo: total, sellerSubaccount: input.sellerSubaccount, sellerKobo: total, suppliers: [], sellerSettles: owed.map(({ supplierId, costKobo }) => ({ supplierId, kobo: costKobo })) };
  }
  return {
    version: 1,
    gateway,
    totalKobo: total,
    sellerSubaccount: input.sellerSubaccount,
    sellerKobo: total - directTotal,
    suppliers: direct.map((supplier) => ({ supplierId: supplier.supplierId, subaccount: supplier.subaccount!, kobo: supplier.costKobo })),
    sellerSettles: owed.filter((supplier) => !supplier.subaccount).map(({ supplierId, costKobo }) => ({ supplierId, kobo: costKobo })),
  };
}

/**
 * What goes into Paystack's transaction initialize so Shopinbos's own share is zero. One business: the seller's
 * subaccount with a zero flat charge for the main account, and the seller bears Paystack's fee. Several: a
 * dynamic flat split whose shares add up to the whole amount (so nothing is left for the main account), each
 * business bearing its share of the fee.
 */
export function paystackSplitParams(plan: PaymentSplitPlan): Record<string, unknown> {
  if (!plan.suppliers.length) {
    return { subaccount: plan.sellerSubaccount, transaction_charge: 0, bearer: "subaccount" };
  }
  return {
    split: {
      type: "flat",
      bearer_type: "all-proportional",
      currency: "NGN",
      subaccounts: [
        { subaccount: plan.sellerSubaccount, share: plan.sellerKobo },
        ...plan.suppliers.map((supplier) => ({ subaccount: supplier.subaccount, share: supplier.kobo })),
      ],
    },
  };
}

const naira = (kobo: number) => (Math.round(kobo) / 100).toFixed(2);

/**
 * What goes into Korapay's charge initialize (Split Payments, dynamic rule): flat naira amounts to each business's
 * Korapay split account, adding up to the whole amount, so nothing is left in the Shopinbos balance.
 */
export function korapaySplitParams(plan: PaymentSplitPlan): Record<string, unknown> {
  return {
    split_configuration: {
      split_type: "flat",
      split_accounts: [
        { value: naira(plan.sellerKobo), split_account_reference: plan.sellerSubaccount },
        ...plan.suppliers.map((supplier) => ({ value: naira(supplier.kobo), split_account_reference: supplier.subaccount })),
      ],
    },
  };
}

/** A split plan read back from RetailOrder.paymentSplit, or null when it isn't one. */
export function readSplitPlan(value: unknown): PaymentSplitPlan | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const plan = value as Partial<PaymentSplitPlan>;
  if (plan.version !== 1 || typeof plan.sellerSubaccount !== "string" || typeof plan.sellerKobo !== "number" || !Array.isArray(plan.suppliers)) return null;
  return { ...plan, sellerSettles: Array.isArray(plan.sellerSettles) ? plan.sellerSettles : [] } as PaymentSplitPlan;
}
