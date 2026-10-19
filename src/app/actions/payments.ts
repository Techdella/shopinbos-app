"use server";

import { grantPlanCredits } from "@/lib/ai/credits.server";
import { getPlanCatalog } from "@/lib/plans/catalog.server";
import { PLAN_TIERS, planVersion, type PlanTier } from "@shared/plan-catalog";
import { db } from "@/lib/db/client";
import { billingEmail } from "@/lib/auth/billing-email";
import { revalidatePath } from "next/cache";
import { getCurrentAppUser } from "@/lib/server-auth";
import { creditCampaignConversion } from "@/lib/campaigns/send";
import { notifyOrderCustomer } from "@/lib/notifications/customer-messages";
import { recoverExpiredOrderPayment } from "@/lib/commerce/order-expiry.server";
import { ensureSupplierOrdersSafely } from "@/lib/supplier-orders/service.server";
import { settlePaymentLinkForOrder } from "@/lib/payment-links/service.server";
import { recordOrderShares } from "@/lib/wallet/wallet.server";
import { refreshKorapayOrderPayment } from "@/lib/commerce/korapay-orders.server";
import { linkWalletBank } from "@/lib/wallet/wallet.server";

interface PaystackTransaction {
  amount: number;
  status: string;
  reference: string;
  currency?: string;
  customer?: { email: string };
  metadata?: { orderId?: string } | string | null;
  plan?: string | { plan_code?: string } | null;
  plan_object?: { plan_code?: string } | null;
}

// Upgrades are the plan tiers (shared/plan-catalog.ts). Any price the tier was sold at is accepted (Admin › Pricing ›
// Plans creates a new Paystack plan per price; a checkout opened before a change pays the older one), as long as
// Paystack charged at least that plan's amount.
type UpgradeKey = PlanTier;

async function fetchPaystackTransaction(reference: string): Promise<{ success: boolean; data?: PaystackTransaction; error?: string }> {
  const secret = process.env.PAYSTACK_SECRET_KEY ?? "";
  if (!secret || secret.includes("your_")) {
    // Local development only: accept fake references so checkout can be exercised without Paystack keys.
    if (process.env.NODE_ENV !== "production" && reference.startsWith("test-paystack-")) {
      return {
        success: true,
        data: {
          amount: 500000,
          status: "success",
          reference,
          customer: { email: "test-buyer@shopinbos.com" },
        },
      };
    }
    return { success: false, error: "Paystack not configured" };
  }

  try {
    const res = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${secret}` } },
    );
    const json = await res.json();
    if (!json.status) {
      return { success: false, error: json.message ?? "Paystack verification failed" };
    }
    return { success: true, data: json.data as PaystackTransaction };
  } catch {
    return { success: false, error: "Failed to verify payment with Paystack" };
  }
}

// Paystack returns metadata as an object, or as a JSON string when it was sent as one.
function metadataOrderId(metadata: PaystackTransaction["metadata"]): string | undefined {
  if (!metadata) return undefined;
  if (typeof metadata === "string") {
    try {
      return (JSON.parse(metadata) as { orderId?: string }).orderId;
    } catch {
      return undefined;
    }
  }
  return metadata.orderId;
}

// Public server action: only reports whether the payment succeeded, never the full transaction record.
export async function verifyPaystackPayment(reference: string): Promise<{
  success: boolean;
  data?: { status: string };
  error?: string;
}> {
  const result = await fetchPaystackTransaction(reference);
  return result.success ? { success: true, data: { status: result.data!.status } } : { success: false, error: result.error };
}

/**
 * Public: the storefront checkout asks this while Korapay's frame is open. It only re-checks the order with Korapay
 * (the charge reply is the proof, never the caller) and says whether it is paid.
 */
export async function checkKorapayPayment(orderId: string): Promise<{ paid: boolean }> {
  if (typeof orderId !== "string" || orderId.length > 40) return { paid: false };
  const outcome = await refreshKorapayOrderPayment(orderId);
  return { paid: outcome === "paid" || outcome === "already_paid" };
}

export async function updateOrderPayment(
  orderId: string,
  reference: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const order = await db.retailOrder.findUnique({
      where: { id: orderId },
      select: { id: true, total: true, currency: true, buyerEmail: true, status: true, paystackRef: true, expiredAt: true, paymentSplit: true },
    });
    if (!order) {
      return { success: false, error: "Order not found" };
    }
    // Expired unpaid orders can still be paid (the checks below run first); stock is taken again if it's there.
    const expired = order.status === "cancelled" && Boolean(order.expiredAt);
    if (order.status !== "pending" && order.status !== "awaiting_payment" && !expired) {
      return order.paystackRef === reference ? { success: true } : { success: false, error: "Order is not awaiting payment" };
    }

    // A split order is paid only by the transaction checkout started for it (reference = order id), which settles
    // to the businesses' own banks; any other transaction would land in Shopinbos's account.
    if (order.paymentSplit && reference !== orderId) {
      return { success: false, error: "Payment does not belong to this order" };
    }

    const verification = await fetchPaystackTransaction(reference);
    if (!verification.success || verification.data?.status !== "success") {
      return { success: false, error: verification.error ?? "Payment could not be verified" };
    }

    // A payment must belong to this order: redirect payments use the order id as reference,
    // inline payments carry the order id in metadata.
    const paidFor = metadataOrderId(verification.data.metadata) ?? verification.data.reference;
    if (paidFor !== orderId) {
      return { success: false, error: "Payment does not belong to this order" };
    }
    const reused = await db.retailOrder.findFirst({ where: { paystackRef: reference, id: { not: orderId } }, select: { id: true } });
    if (reused) {
      return { success: false, error: "Payment has already been applied to another order" };
    }

    const paidAmount = verification.data.amount / 100;
    if (Math.round(paidAmount) < Math.round(Number(order.total))) {
      return { success: false, error: "Verified payment amount is less than the order total" };
    }
    if (verification.data.currency && verification.data.currency.toUpperCase() !== order.currency.toUpperCase()) {
      return { success: false, error: "Payment currency does not match this order" };
    }
    const paidEmail = verification.data.customer?.email?.toLowerCase();
    if (paidEmail && paidEmail !== order.buyerEmail.toLowerCase()) {
      return { success: false, error: "Payment customer does not match this order" };
    }

    if (expired) {
      const outcome = await recoverExpiredOrderPayment(orderId, { reference });
      if (outcome === "reinstated") await creditCampaignConversion(orderId).catch(() => null);
      if (outcome === "reinstated") await settlePaymentLinkForOrder(orderId);
      revalidatePath("/home/orders");
      return outcome === "needs_refund"
        ? { success: false, error: "This order expired before the payment arrived and the items have sold out. The store will refund you." }
        : { success: true };
    }

    // Only a still-unpaid order moves (the webhook may have marked it paid a moment ago).
    const moved = await db.retailOrder.updateMany({
      where: { id: orderId, status: { in: ["pending", "awaiting_payment"] } },
      data: {
        paystackRef: reference,
        paystackStatus: "success",
        status: "paid",
      },
    });
    if (moved.count === 1) await creditCampaignConversion(orderId).catch(() => null);
    if (moved.count === 1) await notifyOrderCustomer(orderId, "payment_received"); // WhatsApp/SMS to the buyer, if switched on (sent once)
    // Dropship items go to their suppliers (idempotent: the webhook may do the same).
    await ensureSupplierOrdersSafely(orderId);
    await settlePaymentLinkForOrder(orderId);
    await recordOrderShares(orderId);
    revalidatePath("/home/orders");
    revalidatePath(`/s/*/order/${orderId}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

/**
 * "Add your bank" for sellers, suppliers and delivery partners. One save updates the bank everywhere: the wallet (card
 * payments) and the role's payout bank (linkWalletBank → syncPayoutBank), under the name the bank has for the account.
 * The typed account name is ignored (kept in the signature for older callers).
 */
export async function linkBankAccount(
  role: string,
  bankName: string,
  accountNumber: string,
  _accountName?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentAppUser();
    if (!user) return { success: false, error: "Not authenticated" };
    if (role !== "seller" && role !== "supplier" && role !== "logistics_partner") return { success: false, error: "Invalid role for bank account linking" };
    if (user.role !== role) return { success: false, error: "Sign in to this account first." };
    const wallet = await linkWalletBank({ id: user.id, role }, { bankName, accountNumber });
    if (!wallet.ok) return { success: false, error: wallet.error };
    for (const path of ["/home/wallet", "/home/payments", "/home/payouts", "/supplier/wallet", "/supplier/payouts", "/supplier/settings", "/logistics/wallet", "/logistics/payouts", "/logistics/earnings"]) revalidatePath(path);
    return { success: true };
  } catch (e) {
    console.error("[payments] linking a bank failed", e instanceof Error ? e.message : e);
    return { success: false, error: "Couldn't save this bank account. Try again." };
  }
}

async function applyPlanUpgrade(reference: string, upgrade: UpgradeKey, paths: string[]): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentAppUser();
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    const verification = await fetchPaystackTransaction(reference);
    const tx = verification.data;
    if (!verification.success || !tx || tx.status !== "success") {
      return { success: false, error: verification.error ?? "Payment could not be verified" };
    }

    const planCode = typeof tx.plan === "string" ? tx.plan : tx.plan?.plan_code ?? tx.plan_object?.plan_code;
    await getPlanCatalog();
    const version = planVersion(planCode);
    if (!version || version.tier !== upgrade || version.amountNgn === null) {
      return { success: false, error: "Payment is not for this plan" };
    }
    if (tx.amount / 100 < version.amountNgn) {
      return { success: false, error: "Payment amount is less than the plan price" };
    }
    if (tx.customer?.email?.toLowerCase() !== billingEmail(user)) {
      return { success: false, error: "Payment was made by a different account" };
    }

    // Each payment can be redeemed once; the receipt's primary key is the Paystack reference.
    try {
      await db.$transaction([
        db.paymentReceipt.create({
          data: { reference, userId: user.id, purpose: upgrade, amount: tx.amount / 100, provider: "paystack" },
        }),
        db.user.update({ where: { id: user.id }, data: { aiCredits: PLAN_TIERS[upgrade].marker } }),
      ]);
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") {
        return { success: false, error: "This payment has already been used" };
      }
      throw error;
    }

    // The plan's credits go into the same balance Rex and Peggy spend (once per payment reference).
    await grantPlanCredits(user.id, planCode, reference).catch((error) => console.error("[payments] plan credits not added", error));
    for (const path of [...paths, "/home/credits"]) revalidatePath(path);
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function upgradeUserToSupplierMax(reference: string): Promise<{ success: boolean; error?: string }> {
  return applyPlanUpgrade(reference, "supplier_max", ["/supplier/profile", "/supplier/dashboard"]);
}

export async function upgradeUserToPro(reference: string): Promise<{ success: boolean; error?: string }> {
  return upgradeUserToSupplierMax(reference);
}

export async function upgradeSellerToGrowth(reference: string): Promise<{ success: boolean; error?: string }> {
  return applyPlanUpgrade(reference, "seller_growth", ["/home/settings", "/home"]);
}

export async function upgradeSellerToMax(reference: string): Promise<{ success: boolean; error?: string }> {
  return applyPlanUpgrade(reference, "seller_pro", ["/home/settings", "/home"]);
}
