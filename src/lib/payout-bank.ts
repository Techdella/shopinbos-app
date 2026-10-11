import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";

// Paystack payout-bank helpers, shared by the payments server actions (web) and /api/app/payout-bank (mobile).

export const PAYSTACK_BANK_CODES: Record<string, string> = {
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

export function maskAccountNumber(accountNumber: string) {
  return `******${accountNumber.slice(-4)}`;
}

function getPaystackSecret() {
  const secret = process.env.PAYSTACK_SECRET_KEY ?? "";
  return secret && !secret.includes("your-") && !secret.includes("your_") ? secret : null;
}

export async function createPaystackTransferRecipient(input: {
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

export const SELLER_PAYOUT_BANKS = Object.keys(PAYSTACK_BANK_CODES);

/** Creates a Paystack transfer recipient and saves it as the seller's payout bank. */
export async function linkSellerPayoutBank(userId: string, bankName: string, accountNumber: string, accountName: string): Promise<{ success: boolean; error?: string }> {
  const store = await db.store.findUnique({ where: { userId } });
  if (!store) return { success: false, error: "Store not found" };
  const brandSettings = typeof store.brandSettings === "object" && store.brandSettings ? (store.brandSettings as Record<string, unknown>) : {};
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
  return { success: true };
}
