// A seller's money settings and money summary (web /home/payments and the phone app's Payments screen). Pure, so
// the page, the server actions, /api/app/payments and the tests all read and check them the same way.

import { DEFAULT_PAYMENT_METHODS, type PaymentMethodKey } from "./onboarding.ts";
import { readSavedPaymentMethods, TRANSFER_WINDOW_CHOICES } from "./checkout-payments.ts";

export const PAYMENT_METHOD_KEYS = Object.keys(DEFAULT_PAYMENT_METHODS) as PaymentMethodKey[];

/** What went wrong saving a money setting (the web shows payments "err.<code>"). */
export type PaymentsSettingsError = "keepOne" | "noStore" | "chooseTime" | "badges";

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

export const PAID_STATUSES = ["paid", "processing", "packed", "shipped", "delivered"] as const;
export const WAITING_STATUSES = ["pending", "awaiting_payment"] as const;
export const REFUNDED_STATUSES = ["refunded", "partially_refunded"] as const;
const DAY = 86_400_000;

/** Orders taken through Shopinbos checkout have no offline payment method (or "paystack"). */
export function isOnlinePayment(method: string | null | undefined) {
  return !method || method === "paystack" || method === "opay" || method === "korapay";
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
  const paid = orders.filter((order) => (PAID_STATUSES as readonly string[]).includes(order.status));
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
