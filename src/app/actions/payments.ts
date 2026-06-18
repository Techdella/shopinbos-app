"use server";

import { db } from "@/lib/db/client";
import { revalidatePath } from "next/cache";
import { getCurrentAppUser } from "@/lib/server-auth";
import type { Prisma } from "@prisma/client";

const PAYSTACK_BANK_CODES: Record<string, string> = {
  "Access Bank": "044",
  "Citibank Nigeria": "023",
  "Ecobank Nigeria": "050",
  "Fidelity Bank": "070",
  "First Bank of Nigeria": "011",
  "First City Monument Bank (FCMB)": "214",
  "Guaranty Trust Bank (GTBank)": "058",
  "Heritage Bank": "030",
  "Keystone Bank": "082",
  "Moniepoint MFB": "50515",
  Opay: "999992",
  "Polaris Bank": "076",
  "Providus Bank": "101",
  "Stanbic IBTC Bank": "221",
  "Standard Chartered Bank": "068",
  "Sterling Bank": "232",
  "Union Bank of Nigeria": "032",
  "United Bank for Africa (UBA)": "033",
  "Unity Bank": "215",
  "Wema Bank": "035",
  "Zenith Bank": "057",
};

function maskAccountNumber(accountNumber: string) {
  return `******${accountNumber.slice(-4)}`;
}

function getPaystackSecret() {
  const secret = process.env.PAYSTACK_SECRET_KEY ?? "";
  return secret && !secret.includes("your-") && !secret.includes("your_") ? secret : null;
}

async function createPaystackTransferRecipient(input: {
  bankName: string;
  bankCode?: string;
  accountNumber: string;
  accountName: string;
}) {
  const secret = getPaystackSecret();
  if (!secret) {
    return {
      status: "unconfigured",
      recipientCode: null,
      recipientId: null,
      providerResponse: { message: "Paystack secret key is not configured." },
    };
  }

  if (!input.bankCode) {
    return {
      status: "failed",
      recipientCode: null,
      recipientId: null,
      providerResponse: { message: `No Paystack bank code is configured for ${input.bankName}.` },
    };
  }

  const response = await fetch("https://api.paystack.co/transferrecipient", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "nuban",
      name: input.accountName,
      account_number: input.accountNumber,
      bank_code: input.bankCode,
      currency: "NGN",
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.status) {
    return {
      status: "failed",
      recipientCode: null,
      recipientId: null,
      providerResponse: data,
    };
  }

  return {
    status: "verified",
    recipientCode: data.data?.recipient_code ?? null,
    recipientId: data.data?.id ? String(data.data.id) : null,
    providerResponse: data,
  };
}

export async function verifyPaystackPayment(reference: string): Promise<{
  success: boolean;
  data?: { amount: number; status: string; customer?: { email: string } };
  error?: string;
}> {
  const secret = process.env.PAYSTACK_SECRET_KEY ?? "";
  if (!secret || secret.includes("your_")) {
    if (reference.startsWith("test-paystack-")) {
      return {
        success: true,
        data: {
          amount: 500000,
          status: "success",
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
    return { success: true, data: json.data };
  } catch {
    return { success: false, error: "Failed to verify payment with Paystack" };
  }
}

export async function updateOrderPayment(
  orderId: string,
  reference: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const order = await db.retailOrder.findUnique({
      where: { id: orderId },
      select: { id: true, total: true, buyerEmail: true },
    });
    if (!order) {
      return { success: false, error: "Order not found" };
    }

    const verification = await verifyPaystackPayment(reference);
    if (!verification.success || verification.data?.status !== "success") {
      return { success: false, error: verification.error ?? "Payment could not be verified" };
    }

    const paidAmount = verification.data.amount / 100;
    if (Math.round(paidAmount) < Math.round(Number(order.total))) {
      return { success: false, error: "Verified payment amount is less than the order total" };
    }
    const paidEmail = verification.data.customer?.email?.toLowerCase();
    if (paidEmail && paidEmail !== order.buyerEmail.toLowerCase()) {
      return { success: false, error: "Payment customer does not match this order" };
    }

    await db.retailOrder.update({
      where: { id: orderId },
      data: {
        paystackRef: reference,
        paystackStatus: "success",
        status: "paid",
      },
    });
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
      const store = await db.store.findUnique({ where: { userId: user.id } });
      if (!store) return { success: false, error: "Store not found" };
      const brandSettings = typeof store.brandSettings === "object" && store.brandSettings ? (store.brandSettings as any) : {};
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
      brandSettings.payoutBank = {
        bankName,
        accountNumberMask: maskAccountNumber(cleanAccountNumber),
        accountName: accountName.trim(),
        paystackRecipientCode: recipient.recipientCode,
        paystackRecipientId: recipient.recipientId,
        verificationStatus: recipient.status,
        providerResponse: recipient.providerResponse,
      };
      await db.store.update({
        where: { id: store.id },
        data: { brandSettings: brandSettings as Prisma.InputJsonValue },
      });
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

export async function upgradeUserToSupplierMax(reference: string): Promise<{ success: boolean; error?: string }> {
  try {
    const verification = await verifyPaystackPayment(reference);
    if (!verification.success) {
      return { success: false, error: verification.error };
    }

    const user = await getCurrentAppUser();
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    await db.user.update({
      where: { id: user.id },
      data: {
        aiCredits: 100,
      },
    });

    revalidatePath("/supplier/profile");
    revalidatePath("/supplier/dashboard");
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function upgradeUserToPro(reference: string): Promise<{ success: boolean; error?: string }> {
  return upgradeUserToSupplierMax(reference);
}

export async function upgradeSellerToGrowth(reference: string): Promise<{ success: boolean; error?: string }> {
  try {
    const verification = await verifyPaystackPayment(reference);
    if (!verification.success) {
      return { success: false, error: verification.error };
    }

    const user = await getCurrentAppUser();
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    await db.user.update({
      where: { id: user.id },
      data: { aiCredits: 50 },
    });

    revalidatePath("/home/settings");
    revalidatePath("/home");
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function upgradeSellerToMax(reference: string): Promise<{ success: boolean; error?: string }> {
  try {
    const verification = await verifyPaystackPayment(reference);
    if (!verification.success) {
      return { success: false, error: verification.error };
    }

    const user = await getCurrentAppUser();
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    await db.user.update({
      where: { id: user.id },
      data: { aiCredits: 200 },
    });

    revalidatePath("/home/settings");
    revalidatePath("/home");
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
