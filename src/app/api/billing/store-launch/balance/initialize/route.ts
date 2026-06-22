import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { initializePaystackTransaction } from "@/lib/paystack";
import { ensureStoreLaunchPaymentsTable, type StoreLaunchPaymentRow } from "@/lib/store-launch-billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true } });
  if (!store) return NextResponse.json({ error: { message: "Store not found." } }, { status: 404 });

  await ensureStoreLaunchPaymentsTable();
  const rows = await db.$queryRawUnsafe<StoreLaunchPaymentRow[]>(
    "SELECT * FROM store_launch_payments WHERE store_id = $1 AND payment_option = 'installment' AND status = 'paid' AND balance_due > 0 ORDER BY paid_at DESC LIMIT 1",
    store.id,
  );
  const installment = rows[0];
  if (!installment) {
    return NextResponse.json({ error: { message: "No outstanding store launch balance was found." } }, { status: 409 });
  }

  const reference = `store-launch-balance-${crypto.randomUUID()}`;
  await db.$executeRawUnsafe(
    `INSERT INTO store_launch_payments
      (id, user_id, store_id, reference, payment_option, total_amount, amount_due, balance_due)
     VALUES ($1,$2,$3,$4,'balance',$5,$6,$6)`,
    crypto.randomUUID(), user.id, store.id, reference, installment.total_amount, installment.balance_due,
  );

  try {
    const callbackUrl = new URL("/api/billing/store-launch/callback", req.nextUrl.origin);
    callbackUrl.searchParams.set("returnTo", "/home/settings?tab=Billing");
    const payment = await initializePaystackTransaction({
      email: user.email,
      amountKobo: installment.balance_due * 100,
      reference,
      callbackUrl: callbackUrl.toString(),
      metadata: {
        purpose: "store_launch_balance",
        payment_option: "balance",
        store_id: store.id,
        store_name: store.name,
        user_id: user.id,
        balance_due: installment.balance_due,
      },
    });
    return NextResponse.json({ data: { authorizationUrl: payment.authorization_url, reference } });
  } catch (error) {
    await db.$executeRawUnsafe(
      "UPDATE store_launch_payments SET status = 'initialization_failed', updated_at = NOW() WHERE reference = $1",
      reference,
    );
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : "Could not start Paystack checkout." } },
      { status: 502 },
    );
  }
});
