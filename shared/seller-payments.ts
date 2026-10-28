// A seller's money settings and money summary (web /home/payments and the phone app's Payments screen). Pure, so
// the page, the server actions, /api/app/payments and the tests all read and check them the same way.

import { DEFAULT_PAYMENT_METHODS, type PaymentMethodKey } from "./onboarding.ts";
import { readSavedPaymentMethods, TRANSFER_WINDOW_CHOICES } from "./checkout-payments.ts";

export const PAYMENT_METHOD_KEYS = Object.keys(DEFAULT_PAYMENT_METHODS) as PaymentMethodKey[];

/** What went wrong saving a money setting (the web shows payments "err.<code>"). */
export type PaymentsSettingsError = "keepOne" | "noStore" | "chooseTime" | "badges" | "codNeedsPlan";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Every method key as a plain on/off (anything missing is off). */
export function cleanPaymentMethods(input: unknown): Record<PaymentMethodKey, boolean> {
  const source = record(input);
  return Object.fromEntries(PAYMENT_METHOD_KEYS.map((key) => [key, Boolean(source[key])])) as Record<PaymentMethodKey, boolean>;
}

/** Why these choices can't be saved, or null. Customers must always have one way to pay. */
export function paymentMethodsProblem(methods: Record<PaymentMethodKey, boolean>): PaymentsSettingsError | null {
  return Object.values(methods).some(Boolean) ? null : "keepOne";
}

/**
 * The switches as checkout reads them (readSavedPaymentMethods): a store that never saved its choices offers card
 * payments only, and a choice that was never saved is off. Showing the onboarding defaults instead made "Pay on
 * delivery" look on while shoppers never saw it.
 */
export function readShopPaymentMethods(brandSettings: unknown): Record<PaymentMethodKey, boolean> {
  const saved = readSavedPaymentMethods(brandSettings);
  return Object.fromEntries(PAYMENT_METHOD_KEYS.map((key) => [key, saved ? saved[key] === true : key === "card"])) as Record<PaymentMethodKey, boolean>;
}

/** null (the Shopinbos default) or one of the listed hours. */
export function isTransferWindowChoice(hours: unknown): hours is number | null {
  return hours === null || (TRANSFER_WINDOW_CHOICES as readonly unknown[]).includes(hours);
}

export interface PayoutBankSummary {
  bankName: string;
  accountName: string;
  /** Last digits only; the full number never leaves the server. */
  accountEnding: string;
  /** verified | unconfigured | failed, or null for older saves. */
  status: string | null;
}

/** The payout bank from Store.brandSettings.payoutBank, without the full account number. */
export function readPayoutBankSummary(brandSettings: unknown): PayoutBankSummary | null {
  const bank = record(record(brandSettings).payoutBank);
  if (!bank.bankName) return null;
  const digits = String(bank.accountNumberMask ?? bank.accountNumber ?? "").replace(/\D/g, "");
  return {
    bankName: String(bank.bankName),
    accountName: String(bank.accountName ?? ""),
    accountEnding: digits.slice(-4),
    status: typeof bank.verificationStatus === "string" ? bank.verificationStatus : null,
  };
}

/** A Nigerian (NUBAN) account number: exactly 10 digits once spaces and dashes are gone. */
export function cleanAccountNumber(text: string): string | null {
  const digits = String(text ?? "").replace(/[\s-]/g, "");
  return /^\d{10}$/.test(digits) ? digits : null;
}

// ─── Money in ────────────────────────────────────────────────────────────────

/**
 * Whether each way to pay actually reaches customers, for the Money page. A switched-on method that can't work yet
 * says why, so a seller never thinks customers can pay by card when checkout can't offer it:
 *   live           customers see it at checkout (when it's on)
 *   needs_bank     no bank account yet: card, the second card checkout and bank transfer all need one
 *   bank_review    the team is checking a bank account that isn't in the owner's or business's name
 *   bank_failed    the payment processor refused the account
 *   paused         the team paused the wallet
 *   needs_team     the bank is fine; the team still has to connect it to the second card checkout
 *   unavailable    payments aren't switched on for Shopinbos yet (keys missing)
 *   needs_whatsapp no WhatsApp number on the store, so there's nowhere to finish the order
 *   hidden         not offered at all (the second card checkout is off for Shopinbos)
 */
export type PaymentMethodState = "live" | "needs_bank" | "bank_review" | "bank_failed" | "paused" | "needs_team" | "unavailable" | "needs_whatsapp" | "hidden";

export interface PaymentReadinessInput {
  /** Paystack keys are set for Shopinbos. */
  cardKeys: boolean;
  /** Korapay checkout with Split Payments is on for Shopinbos. */
  secondCheckout: boolean;
  /** The seller's wallet, or null before they've added a bank. */
  wallet: { hasBank: boolean; settlement: string; frozen: boolean; secondCheckoutAccount: boolean } | null;
  /** The bank-transfer account can be shown to buyers (full number known). */
  transferAccount: boolean;
  /** The store has a WhatsApp number. */
  whatsapp: boolean;
}

export function paymentMethodStates(input: PaymentReadinessInput): Record<PaymentMethodKey, PaymentMethodState> {
  const wallet = input.wallet;
  const walletState: PaymentMethodState = !wallet?.hasBank
    ? "needs_bank"
    : wallet.frozen
      ? "paused"
      : wallet.settlement === "active"
        ? "live"
        : wallet.settlement === "failed"
          ? "bank_failed"
          : "bank_review";
  const card: PaymentMethodState = walletState !== "live" ? walletState : input.cardKeys ? "live" : "unavailable";
  const second: PaymentMethodState = !input.secondCheckout ? "hidden" : walletState !== "live" ? walletState : wallet!.secondCheckoutAccount ? "live" : "needs_team";
  return {
    card,
    korapay: second,
    transfer: input.transferAccount ? "live" : "needs_bank",
    cod: "live",
    wa: input.whatsapp ? "live" : "needs_whatsapp",
  };
}

/** The order message for "Finish on WhatsApp" at checkout: the bag, so the seller can take it from there. */
export function whatsappOrderMessage(storeName: string, lines: Array<{ name: string; quantity: number; variant?: string }>, total: string): string {
  const items = lines.slice(0, 20).map((line) => `• ${line.quantity} × ${line.name}${line.variant ? ` (${line.variant})` : ""}`);
  return [`Hi ${storeName}, I'd like to order:`, ...items, `Total: ${total}`, "How can I pay?"].join("\n");
}

export const PAID_STATUSES = ["paid", "processing", "packed", "shipped", "delivered"] as const;
export const WAITING_STATUSES = ["pending", "awaiting_payment"] as const;
export const REFUNDED_STATUSES = ["refunded", "partially_refunded"] as const;
const DAY = 86_400_000;

/** Orders taken through Shopinbos checkout have no offline payment method (or "paystack"). */
export function isOnlinePayment(method: string | null | undefined) {
  return !method || method === "paystack" || method === "korapay";
}

/** The calendar day in Lagos (UTC+1, no daylight saving) as YYYY-MM-DD. */
export function lagosDayKey(date: Date) {
  return new Date(date.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

export interface MoneyOrder {
  total: number;
  status: string;
  paymentMethod: string | null;
  createdAt: Date;
  /** When known, "Paid" means the money is in (moneyIsIn); without it the status decides, as before. */
  paystackStatus?: string | null;
}

/**
 * The money is in (C9): a card or bank checkout the gateway confirmed, pay on delivery paid at the door (in the app
 * or marked paid by the seller), or an offline sale the seller recorded as paid. An order on its way isn't money in.
 */
export function moneyIsIn(order: MoneyOrder): boolean {
  if (!(PAID_STATUSES as readonly string[]).includes(order.status)) return false;
  if (order.paystackStatus === undefined) return true;
  if (order.paymentMethod === "pay_on_delivery") return order.paystackStatus === "success" || order.paystackStatus === "offline" || order.status === "paid";
  if (isOnlinePayment(order.paymentMethod)) return order.paystackStatus === "success";
  return true;
}

export interface MoneySummary {
  paidCount: number;
  online: number;
  offline: number;
  moneyIn: number;
  refunded: number;
  /** Money in per Lagos day, oldest first, ending today. */
  daily: { day: string; total: number }[];
  /** Paid totals by payment method (null = online checkout), biggest first. */
  byMethod: { method: string | null; total: number }[];
}

/** Sums the last 30 days of orders the way the Money page shows them. */
export function summarizeMoney(orders: MoneyOrder[], now: Date, days = 14): MoneySummary {
  const paid = orders.filter(moneyIsIn);
  const online = paid.filter((order) => isOnlinePayment(order.paymentMethod)).reduce((sum, order) => sum + order.total, 0);
  const offline = paid.filter((order) => !isOnlinePayment(order.paymentMethod)).reduce((sum, order) => sum + order.total, 0);
  const refunded = orders.filter((order) => (REFUNDED_STATUSES as readonly string[]).includes(order.status)).reduce((sum, order) => sum + order.total, 0);

  const keys = Array.from({ length: days }, (_, index) => lagosDayKey(new Date(now.getTime() - (days - 1 - index) * DAY)));
  const byDay = new Map(keys.map((key) => [key, 0]));
  for (const order of paid) {
    const key = lagosDayKey(order.createdAt);
    if (byDay.has(key)) byDay.set(key, (byDay.get(key) ?? 0) + order.total);
  }

  const methodTotals = new Map<string | null, number>();
  for (const order of paid) {
    const method = isOnlinePayment(order.paymentMethod) ? null : order.paymentMethod;
    methodTotals.set(method, (methodTotals.get(method) ?? 0) + order.total);
  }

  return {
    paidCount: paid.length,
    online,
    offline,
    moneyIn: online + offline,
    refunded,
    daily: keys.map((day) => ({ day, total: byDay.get(day) ?? 0 })),
    byMethod: [...methodTotals.entries()].map(([method, total]) => ({ method, total })).sort((a, b) => b.total - a.total),
  };
}

// ─── What the seller earns on one order (C10) ────────────────────────────────

/** A split as RetailOrder.paymentSplit / balanceSplit keep it (src/lib/wallet/rules.ts), only what's read here. */
export interface EarningsPlan {
  sellerKobo: number;
  suppliers: Array<{ kobo: number; commissionKobo?: number }>;
  delivery?: Array<{ kobo: number }>;
  platformKobo?: number;
  deductions?: Array<{ from: string; to: string | null; kobo: number }>;
}

export interface OrderEarnings {
  /** "split": from the checkout split (exact); "estimate": worked out from the order (no split). */
  basis: "split" | "estimate";
  customerPaidKobo: number;
  suppliersKobo: number;
  deliveryKobo: number;
  feeKobo: number;
  /** The seller's earnings on the order (what the split gave them, including any part taken for what they owe). */
  earnKobo: number;
  /** Of that, what went straight to money the seller owed. */
  toDebtsKobo: number;
  /** What problems on this order changed it by (refunds sent, money owed back to them): + or -. */
  faultsKobo: number;
  /** After the problems. */
  netKobo: number;
}

/**
 * The seller's margin on one order: from the split when there is one (the checkout part and, for pay on delivery or a
 * preorder, the later part), else an estimate (the total less the dropship suppliers' cost and partner fees).
 */
export function orderEarnings(input: { totalKobo: number; plans: Array<EarningsPlan | null>; supplierCostKobo?: number; partnerFeesKobo?: number; faultsKobo?: number }): OrderEarnings {
  const plans = input.plans.filter((plan): plan is EarningsPlan => Boolean(plan));
  const faults = Math.round(input.faultsKobo ?? 0);
  if (!plans.length) {
    const suppliers = Math.max(0, Math.round(input.supplierCostKobo ?? 0));
    const delivery = Math.max(0, Math.round(input.partnerFeesKobo ?? 0));
    const earn = Math.max(0, Math.round(input.totalKobo)) - suppliers - delivery;
    return { basis: "estimate", customerPaidKobo: Math.max(0, Math.round(input.totalKobo)), suppliersKobo: suppliers, deliveryKobo: delivery, feeKobo: 0, earnKobo: earn, toDebtsKobo: 0, faultsKobo: faults, netKobo: earn + faults };
  }
  let suppliers = 0;
  let delivery = 0;
  let fee = 0;
  let earn = 0;
  let toDebts = 0;
  let paid = 0;
  for (const plan of plans) {
    const deductions = plan.deductions ?? [];
    const commissions = plan.suppliers.reduce((sum, row) => sum + (row.commissionKobo ?? 0), 0);
    const supplierDebts = deductions.filter((row) => row.from !== "seller" && !row.from.startsWith("partner:")).reduce((sum, row) => sum + row.kobo, 0);
    const partnerDebts = deductions.filter((row) => row.from.startsWith("partner:")).reduce((sum, row) => sum + row.kobo, 0);
    const sellerDebts = deductions.filter((row) => row.from === "seller").reduce((sum, row) => sum + row.kobo, 0);
    const toShopinbos = deductions.filter((row) => row.to === null).reduce((sum, row) => sum + row.kobo, 0);
    const supplierKobo = plan.suppliers.reduce((sum, row) => sum + row.kobo + (row.commissionKobo ?? 0), 0) + supplierDebts;
    const deliveryKobo = (plan.delivery ?? []).reduce((sum, row) => sum + row.kobo, 0) + partnerDebts;
    const feeKobo = Math.max(0, (plan.platformKobo ?? 0) - commissions - toShopinbos);
    suppliers += supplierKobo;
    delivery += deliveryKobo;
    fee += feeKobo;
    earn += plan.sellerKobo + sellerDebts;
    toDebts += sellerDebts;
    paid += plan.sellerKobo + sellerDebts + supplierKobo + deliveryKobo + feeKobo;
  }
  return { basis: "split", customerPaidKobo: paid, suppliersKobo: suppliers, deliveryKobo: delivery, feeKobo: fee, earnKobo: earn, toDebtsKobo: toDebts, faultsKobo: faults, netKobo: earn + faults };
}
