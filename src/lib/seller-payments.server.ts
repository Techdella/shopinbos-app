import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { paystackSecretReady, readTransferAccount, readTransferWindowHours } from "@shared/checkout-payments";
import { korapayCheckoutReady } from "@/lib/korapay";
import type { PaymentMethodKey } from "@shared/onboarding";
import {
  cleanPaymentMethods,
  isTransferWindowChoice,
  PAID_STATUSES,
  paymentMethodStates,
  paymentMethodsProblem,
  readPayoutBankSummary,
  readShopPaymentMethods,
  summarizeMoney,
  WAITING_STATUSES,
  type PaymentsSettingsError,
} from "@shared/seller-payments";
import { unpaidTransferTtlHours } from "@/lib/commerce/stock-holds";
import { defaultPaymentBadges, hasChosenPaymentBadges, readPaymentBadges } from "@shared/payment-badges";
import { parsePaymentBadges } from "@/lib/store-badges";

// A seller's money settings, shared by the /home/payments server actions (web) and /api/app/payments (phone app).

const DAY = 86_400_000;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

async function storeSettings(userId: string) {
  const store = await db.store.findUnique({ where: { userId }, select: { id: true, brandSettings: true } });
  return store ? { id: store.id, settings: record(store.brandSettings) } : null;
}

/** Saves which ways customers can pay (the same setting onboarding writes), leaving delivery zones alone. */
export async function saveSellerPaymentMethods(userId: string, methods: Partial<Record<PaymentMethodKey, boolean>>): Promise<{ error?: PaymentsSettingsError }> {
  const clean = cleanPaymentMethods(methods);
  const problem = paymentMethodsProblem(clean);
  if (problem) return { error: problem };
  const store = await storeSettings(userId);
  if (!store) return { error: "noStore" };
  const paymentConfig = record(store.settings.paymentConfig);
  await db.store.update({
    where: { id: store.id },
    data: { brandSettings: { ...store.settings, paymentConfig: { ...paymentConfig, methods: clean } } as Prisma.InputJsonValue },
  });
  return {};
}

/**
 * How long buyers who chose bank transfer have to pay before the order lets its items go (hours), or null for the
 * Shopinbos default. Applies to orders placed from now on; each order keeps the deadline it was given.
 */
export async function saveSellerTransferWindow(userId: string, hours: number | null): Promise<{ error?: PaymentsSettingsError }> {
  if (!isTransferWindowChoice(hours)) return { error: "chooseTime" };
  const store = await storeSettings(userId);
  if (!store) return { error: "noStore" };
  const { transferWindowHours: _previous, ...rest } = record(store.settings.paymentConfig);
  void _previous;
  await db.store.update({
    where: { id: store.id },
    data: { brandSettings: { ...store.settings, paymentConfig: hours === null ? rest : { ...rest, transferWindowHours: hours } } as Prisma.InputJsonValue },
  });
  return {};
}

/**
 * Which payment logos the store shows shoppers (footer, checkout "We accept"). An empty list shows none; only the
 * known logos are kept (src/lib/store-badges.ts).
 */
export async function saveSellerPaymentBadges(userId: string, badges: unknown): Promise<{ error?: PaymentsSettingsError }> {
  const parsed = parsePaymentBadges(badges);
  if (!parsed.ok) return { error: "badges" };
  const store = await storeSettings(userId);
  if (!store) return { error: "noStore" };
  await db.store.update({
    where: { id: store.id },
    data: { brandSettings: { ...store.settings, paymentBadges: parsed.badges } as Prisma.InputJsonValue },
  });
  return {};
}

/** The logos shown now, whether the seller picked them, and what their payment methods would give. */
export function sellerPaymentBadges(brandSettings: unknown) {
  return {
    selected: readPaymentBadges(brandSettings),
    chosen: hasChosenPaymentBadges(brandSettings),
    defaults: defaultPaymentBadges(readShopPaymentMethods(brandSettings)),
  };
}

/** The default time to pay by transfer (env UNPAID_TRANSFER_TTL_HOURS, 24 hours). */
export function defaultTransferWindowHours() {
  return unpaidTransferTtlHours(process.env.UNPAID_TRANSFER_TTL_HOURS);
}

/** Settings plus money in: what the Money page shows. */
export async function sellerMoneyOverview(store: { id: string; brandSettings: unknown } | null, now = new Date()) {
  const since = new Date(now.getTime() - 30 * DAY);
  const [recent, waiting, latestPaid] = store
    ? await Promise.all([
        db.retailOrder.findMany({
          where: { storeId: store.id, createdAt: { gte: since } },
          select: { total: true, status: true, paymentMethod: true, createdAt: true },
          take: 5000,
        }),
        db.retailOrder.aggregate({ where: { storeId: store.id, status: { in: [...WAITING_STATUSES] } }, _sum: { total: true }, _count: true }),
        db.retailOrder.findMany({
          where: { storeId: store.id, status: { in: [...PAID_STATUSES] } },
          orderBy: { createdAt: "desc" },
          take: 8,
          select: { id: true, orderNumber: true, buyerName: true, total: true, paymentMethod: true, createdAt: true },
        }),
      ])
    : [[], null, []];
  return {
    summary: summarizeMoney(recent, now),
    waiting: { total: waiting?._sum.total ?? 0, count: waiting?._count ?? 0 },
    latestPaid,
    methods: readShopPaymentMethods(store?.brandSettings),
    transferWindow: { hours: readTransferWindowHours(store?.brandSettings), defaultHours: defaultTransferWindowHours() },
    bank: readPayoutBankSummary(store?.brandSettings),
    paymentBadges: sellerPaymentBadges(store?.brandSettings),
  };
}

/** Whether each way to pay reaches customers yet (shared/seller-payments.ts paymentMethodStates), for the Money page. */
export async function sellerPaymentStates(userId: string, store: { id: string; brandSettings: unknown } | null) {
  const [wallet, chat] = await Promise.all([
    db.wallet.findUnique({ where: { userId }, select: { accountNumber: true, subaccountStatus: true, status: true, korapaySplitAccount: true } }),
    store ? db.liveChatConfig.findUnique({ where: { storeId: store.id }, select: { whatsappNumber: true } }).catch(() => null) : null,
  ]);
  return paymentMethodStates({
    cardKeys: paystackSecretReady(process.env.PAYSTACK_SECRET_KEY),
    secondCheckout: korapayCheckoutReady(),
    wallet: wallet
      ? { hasBank: Boolean(wallet.accountNumber), settlement: wallet.subaccountStatus, frozen: wallet.status === "frozen", secondCheckoutAccount: Boolean(wallet.korapaySplitAccount) }
      : null,
    transferAccount: readTransferAccount(store?.brandSettings) !== null,
    whatsapp: Boolean(chat?.whatsappNumber?.replace(/\D/g, "")),
  });
}
