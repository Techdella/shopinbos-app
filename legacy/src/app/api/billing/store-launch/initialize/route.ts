import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { initializePaystackTransaction } from "@/lib/paystack";
import { assertStoreDraftPublishable, StorePublishError } from "@/lib/store-publishing";
import {
  ensureStoreLaunchPaymentsTable,
  installmentDueAt,
  STORE_LAUNCH_DEPOSIT_NGN,
  STORE_LAUNCH_TOTAL_NGN,
  type StoreLaunchPaymentOption,
} from "@/lib/store-launch-billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const body = (await req.json().catch(() => ({}))) as { option?: StoreLaunchPaymentOption; returnTo?: string };
  if (body.option !== "full" && body.option !== "installment") {
    return NextResponse.json({ error: { message: "Choose full payment or the installment option." } }, { status: 400 });
  }
  const store = await db.store.findUnique({
    where: { userId: user.id },
    select: { id: true, name: true, status: true, brandSettings: true },
  });
  if (!store) return NextResponse.json({ error: { message: "Store not found." } }, { status: 404 });
  const settings = store.brandSettings && typeof store.brandSettings === "object" && !Array.isArray(store.brandSettings)
    ? store.brandSettings as Record<string, unknown>
    : {};
  const launchBilling = settings.launchBilling && typeof settings.launchBilling === "object" && !Array.isArray(settings.launchBilling)
    ? settings.launchBilling as Record<string, unknown>
    : null;
  if (store.status === "active" || store.status === "published" || launchBilling?.status === "paid" || launchBilling?.status === "deposit_paid") {
    return NextResponse.json(
      { error: { message: "This store is already live. Any outstanding balance can be paid from Settings → Billing." } },
      { status: 409 },
    );
  }

  try {
    await assertStoreDraftPublishable({ storeId: store.id });
  } catch (error) {
    if (error instanceof StorePublishError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message, blockers: error.blockers } },
        { status: error.status },
      );
    }
    throw error;
  }

  await ensureStoreLaunchPaymentsTable();
  const reference = `store-launch-${crypto.randomUUID()}`;
  const amountDue = body.option === "full" ? STORE_LAUNCH_TOTAL_NGN : STORE_LAUNCH_DEPOSIT_NGN;
  const balanceDue = STORE_LAUNCH_TOTAL_NGN - amountDue;
  const dueAt = body.option === "installment" ? installmentDueAt() : null;
  const id = crypto.randomUUID();

  await db.$executeRawUnsafe(
    `INSERT INTO store_launch_payments
      (id, user_id, store_id, reference, payment_option, total_amount, amount_due, balance_due, due_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    id,
    user.id,
    store.id,
    reference,
    body.option,
    STORE_LAUNCH_TOTAL_NGN,
    amountDue,
    balanceDue,
    dueAt,
  );

  try {
    const returnTo = typeof body.returnTo === "string" && body.returnTo.startsWith("/") && !body.returnTo.startsWith("//")
      ? body.returnTo
      : "/onboarding/rex";
    const callbackUrl = new URL("/api/billing/store-launch/callback", req.nextUrl.origin);
    callbackUrl.searchParams.set("returnTo", returnTo);
    const payment = await initializePaystackTransaction({
      email: user.email,
      amountKobo: amountDue * 100,
      reference,
      callbackUrl: callbackUrl.toString(),
      metadata: {
        purpose: "store_launch",
        payment_option: body.option,
        store_id: store.id,
        store_name: store.name,
        user_id: user.id,
        balance_due: balanceDue,
      },
    });
    return NextResponse.json({
      data: {
        authorizationUrl: payment.authorization_url,
        reference,
        amountDue,
        totalAmount: STORE_LAUNCH_TOTAL_NGN,
        balanceDue,
        dueAt: dueAt?.toISOString() ?? null,
      },
    });
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
