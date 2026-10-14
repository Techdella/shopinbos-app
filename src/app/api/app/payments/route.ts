import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { TRANSFER_WINDOW_CHOICES } from "@shared/checkout-payments";
import type { PaymentsSettingsError } from "@shared/seller-payments";
import { saveSellerPaymentMethods, saveSellerTransferWindow, sellerMoneyOverview } from "@/lib/seller-payments.server";
import { SELLER_PAYOUT_BANKS } from "@/lib/payout-bank";
import { PaymentsPatchSchema } from "@/lib/seller-settings-rules";

export const dynamic = "force-dynamic";

// Payments and payouts for the phone app (web: /home/payments and its server actions; the same rules in
// src/lib/seller-payments.server.ts).
//   GET   → { data: { methods, transferWindow, bank, banks, money, latestPaid } }
//   PATCH { methods?: {transfer,card,cod,wa}, transferWindowHours?: number | null } → GET's data

const ERRORS: Record<PaymentsSettingsError, { code: string; message: string; status: number }> = {
  keepOne: { code: "KEEP_ONE", message: "Keep at least one way for customers to pay.", status: 400 },
  noStore: { code: "NOT_FOUND", message: "Store not found.", status: 404 },
  chooseTime: { code: "CHOOSE_TIME", message: "Choose one of the listed times.", status: 400 },
};

async function overview(userId: string) {
  const store = await db.store.findUnique({ where: { userId }, select: { id: true, currency: true, brandSettings: true } });
  const { summary, waiting, latestPaid, methods, transferWindow, bank } = await sellerMoneyOverview(store);
  return {
    hasStore: Boolean(store),
    currency: store?.currency ?? "NGN",
    methods,
    transferWindow: { ...transferWindow, choices: [...TRANSFER_WINDOW_CHOICES] },
    bank,
    banks: SELLER_PAYOUT_BANKS,
    money: {
      moneyIn: summary.moneyIn,
      online: summary.online,
      offline: summary.offline,
      refunded: summary.refunded,
      paidCount: summary.paidCount,
      waiting,
    },
    latestPaid: latestPaid.map((order) => ({ ...order, createdAt: order.createdAt.toISOString() })),
  };
}

export const GET = withSeller(async (_req, { user }) => ok(await overview(user.id)));

export const PATCH = withSeller(async (req: NextRequest, { user }) => {
  const parsed = PaymentsPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check your choices.");
  const { methods, transferWindowHours } = parsed.data;
  if (methods) {
    const result = await saveSellerPaymentMethods(user.id, methods);
    if (result.error) return apiError(ERRORS[result.error].code, ERRORS[result.error].message, ERRORS[result.error].status);
  }
  if (transferWindowHours !== undefined) {
    const result = await saveSellerTransferWindow(user.id, transferWindowHours);
    if (result.error) return apiError(ERRORS[result.error].code, ERRORS[result.error].message, ERRORS[result.error].status);
  }
  return ok(await overview(user.id));
});
