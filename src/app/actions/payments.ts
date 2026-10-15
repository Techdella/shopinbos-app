"use server";

import { grantPlanCredits } from "@/lib/ai/credits.server";
import { db } from "@/lib/db/client";
import { billingEmail } from "@/lib/auth/billing-email";
import { revalidatePath } from "next/cache";
import { getCurrentAppUser } from "@/lib/server-auth";
import type { Prisma } from "@prisma/client";
import { creditCampaignConversion } from "@/lib/campaigns/send";
import { notifyOrderCustomer } from "@/lib/notifications/customer-messages";
import { recoverExpiredOrderPayment } from "@/lib/commerce/order-expiry.server";
import { ensureSupplierOrdersSafely } from "@/lib/supplier-orders/service.server";
import { settlePaymentLinkForOrder } from "@/lib/payment-links/service.server";
import { createPaystackTransferRecipient, linkSellerPayoutBank, maskAccountNumber, PAYSTACK_BANK_CODES } from "@/lib/payout-bank";

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

// Paystack plan codes per upgrade, with the minimum amount (NGN) each must have charged.
const UPGRADE_PLANS = {
  seller_growth: { credits: 50, plans: { PLN_8ou289e71czicvm: 8000, PLN_q1k3ssxpx7rxxuz: 80000 } },
  seller_pro: { credits: 200, plans: { PLN_2gph11w3yd0250y: 18000, PLN_9gma70ofldhbj4r: 180000 } },
  supplier_max: { credits: 100, plans: { PLN_q78304vgj7p35o6: 25000 } },
} as const;
type UpgradeKey = keyof typeof UPGRADE_PLANS;

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

export async function updateOrderPayment(
  orderId: string,
  reference: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const order = await db.retailOrder.findUnique({
      where: { id: orderId },
      select: { id: true, total: true, currency: true, buyerEmail: true, status: true, paystackRef: true, expiredAt: true },
    });
    if (!order) {
      return { success: false, error: "Order not found" };
    }
    // Expired unpaid orders can still be paid (the checks below run first); stock is taken again if it's there.
    const expired = order.status === "cancelled" && Boolean(order.expiredAt);
    if (order.status !== "pending" && order.status !== "awaiting_payment" && !expired) {
      return order.paystackRef === reference ? { success: true } : { success: false, error: "Order is not awaiting payment" };
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
    revalidatePath("/home/orders");
    revalidatePath(`/s/*/order/${orderId}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function linkBankAccount(
  role: string,
  bankName: string,
  accountNumber: string,
  accountName: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentAppUser();
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    if (role === "seller") {
      const result = await linkSellerPayoutBank(user.id, bankName, accountNumber, accountName);
      if (!result.success) return result;
    } else if (role === "supplier") {
      return linkSupplierPaystackRecipient(bankName, accountNumber, accountName);
    } else if (role === "logistics_partner") {
      const partner = await db.logisticsPartner.findUnique({ where: { userId: user.id } });
      if (!partner) return { success: false, error: "Logistics partner not found" };
      const cleanAccountNumber = accountNumber.replace(/\D/g, "");
      if (!bankName || cleanAccountNumber.length !== 10 || !accountName.trim()) {
        return { success: false, error: "Choose a bank, enter a 10 digit account number, and add the account name." };
      }
      const recipient = await createPaystackTransferRecipient({
        bankName,
        bankCode: PAYSTACK_BANK_CODES[bankName],
        accountNumber: cleanAccountNumber,
        accountName: accountName.trim(),
      });
      await db.logisticsPayoutAccount.upsert({
        where: { logisticsPartnerId: partner.id },
        create: {
          logisticsPartnerId: partner.id,
          bankName,
          accountNumberMask: maskAccountNumber(cleanAccountNumber),
          accountName: accountName.trim(),
          recipientCode: recipient.recipientCode,
          recipientId: recipient.recipientId,
          verificationStatus: recipient.status,
          providerResponse: recipient.providerResponse as Prisma.InputJsonValue,
        },
        update: {
          bankName,
          accountNumberMask: maskAccountNumber(cleanAccountNumber),
          accountName: accountName.trim(),
          recipientCode: recipient.recipientCode,
          recipientId: recipient.recipientId,
          verificationStatus: recipient.status,
          providerResponse: recipient.providerResponse as Prisma.InputJsonValue,
        },
      });
    } else {
      return { success: false, error: "Invalid role for bank account linking" };
    }

    revalidatePath("/home/payments");
    revalidatePath("/supplier/payouts");
    revalidatePath("/logistics/payouts");
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function linkSupplierPaystackRecipient(
  bankName: string,
  accountNumber: string,
  accountName: string,
): Promise<{ success: boolean; error?: string; status?: string }> {
  try {
    const user = await getCurrentAppUser();
    if (!user || user.role !== "supplier") {
      return { success: false, error: "Not authenticated as a supplier" };
    }

    const supplier = await db.supplier.findUnique({ where: { userId: user.id } });
    if (!supplier) return { success: false, error: "Supplier not found" };

    const cleanAccountNumber = accountNumber.replace(/\D/g, "");
    if (!bankName || cleanAccountNumber.length !== 10 || !accountName.trim()) {
      return { success: false, error: "Choose a bank, enter a 10 digit account number, and add the account name." };
    }

    const bankCode = PAYSTACK_BANK_CODES[bankName];
    const recipient = await createPaystackTransferRecipient({
      bankName,
      bankCode,
      accountNumber: cleanAccountNumber,
      accountName: accountName.trim(),
    });

    await db.supplierPayoutAccount.upsert({
      where: { supplierId: supplier.id },
      create: {
        supplierId: supplier.id,
        bankName,
        bankCode,
        accountNumberMask: maskAccountNumber(cleanAccountNumber),
        accountName: accountName.trim(),
        paystackRecipientCode: recipient.recipientCode,
        paystackRecipientId: recipient.recipientId,
        verificationStatus: recipient.status,
        providerResponse: recipient.providerResponse as Prisma.InputJsonValue,
      },
      update: {
        bankName,
        bankCode,
        accountNumberMask: maskAccountNumber(cleanAccountNumber),
        accountName: accountName.trim(),
        paystackRecipientCode: recipient.recipientCode,
        paystackRecipientId: recipient.recipientId,
        verificationStatus: recipient.status,
        providerResponse: recipient.providerResponse as Prisma.InputJsonValue,
      },
    });

    revalidatePath("/supplier/payouts");
    revalidatePath("/supplier/settings");
    return { success: true, status: recipient.status };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ─── Flutterwave payout integration ───────────────────────────────────────────

function getFlutterwaveSecret() {
  const secret = process.env.FLUTTERWAVE_SECRET_KEY ?? "";
  return secret && !secret.includes("your-") && !secret.includes("your_") ? secret : null;
}

async function createFlutterwaveTransferRecipient(input: {
  bankName: string;
  accountNumber: string;
  accountName: string;
}) {
  const secret = getFlutterwaveSecret();
  if (!secret) {
    return {
      status: "unconfigured" as const,
      recipientCode: null,
      providerResponse: { message: "Flutterwave secret key is not configured." },
    };
  }

  const cleanAccountNumber = input.accountNumber.replace(/\D/g, "");

  const response = await fetch("https://api.flutterwave.com/v3/transfer-recipients", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "nuban",
      name: input.accountName,
      account_number: cleanAccountNumber,
      bank_code: input.bankName,
      currency: "NGN",
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.status !== "success") {
    return {
      status: "failed" as const,
      recipientCode: null,
      providerResponse: data,
    };
  }

  return {
    status: "verified" as const,
    recipientCode: data.data?.recipient_code ?? data.data?.id ?? null,
    providerResponse: data,
  };
}

export async function linkFlutterwaveBankAccount(
  bankName: string,
  accountNumber: string,
  accountName: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentAppUser();
    if (!user || user.role !== "supplier") {
      return { success: false, error: "Not authenticated as a supplier" };
    }

    const supplier = await db.supplier.findUnique({ where: { userId: user.id } });
    if (!supplier) return { success: false, error: "Supplier not found" };

    const cleanAccountNumber = accountNumber.replace(/\D/g, "");
    if (!bankName || cleanAccountNumber.length !== 10 || !accountName.trim()) {
      return { success: false, error: "Choose a bank, enter a 10 digit account number, and add the account name." };
    }

    const recipient = await createFlutterwaveTransferRecipient({
      bankName,
      accountNumber: cleanAccountNumber,
      accountName: accountName.trim(),
    });

    const provider = "flutterwave";
    await db.supplierPayoutAccount.upsert({
      where: { supplierId: supplier.id },
      create: {
        supplierId: supplier.id,
        bankName,
        accountNumberMask: maskAccountNumber(cleanAccountNumber),
        accountName: accountName.trim(),
        paystackRecipientCode: recipient.recipientCode,
        verificationStatus: recipient.status,
        providerResponse: { ...recipient.providerResponse, provider } as Prisma.InputJsonValue,
      },
      update: {
        bankName,
        accountNumberMask: maskAccountNumber(cleanAccountNumber),
        accountName: accountName.trim(),
        paystackRecipientCode: recipient.recipientCode,
        verificationStatus: recipient.status,
        providerResponse: { ...recipient.providerResponse, provider } as Prisma.InputJsonValue,
      },
    });

    revalidatePath("/supplier/payouts");
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
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
    const plans = UPGRADE_PLANS[upgrade].plans as Record<string, number>;
    const minimum = planCode ? plans[planCode] : undefined;
    if (minimum === undefined) {
      return { success: false, error: "Payment is not for this plan" };
    }
    if (tx.amount / 100 < minimum) {
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
        db.user.update({ where: { id: user.id }, data: { aiCredits: UPGRADE_PLANS[upgrade].credits } }),
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
