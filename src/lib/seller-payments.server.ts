import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { readTransferWindowHours } from "@shared/checkout-payments";
import type { PaymentMethodKey } from "@shared/onboarding";
import {
  cleanPaymentMethods,
  isTransferWindowChoice,
  PAID_STATUSES,
  paymentMethodsProblem,
  readPayoutBankSummary,
  readShopPaymentMethods,
  summarizeMoney,
  WAITING_STATUSES,
  type PaymentsSettingsError,
} from "@shared/seller-payments";
import { unpaidTransferTtlHours } from "@/lib/commerce/stock-holds";

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
  };
}
