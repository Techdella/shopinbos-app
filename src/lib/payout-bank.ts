import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { resolveKorapayBankAccount } from "@/lib/korapay";

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
  "Kuda Microfinance Bank": "50211",
  "Moniepoint MFB": "50515",
  Opay: "999992",
  PalmPay: "999991",
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
    signal: AbortSignal.timeout(10_000),
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
    bankCode: PAYSTACK_BANK_CODES[bankName] ?? (await settlementBanks())[bankName],
    accountNumber: cleanAccountNumber,
    accountName: accountName.trim(),
  });
  // A refused or unreachable Paystack never replaces a transfer account that works (the full number buyers are shown
  // comes from a verified recipient).
  if (recipient.status !== "verified") return { success: false, error: "Paystack couldn't register this account for bank transfers" };
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

/**
 * Every Nigerian bank and fintech Paystack can settle to (GET /bank?country=nigeria), name → code, cached for a few
 * hours; the short list above when Paystack can't be reached. The Shopinbos Wallet's bank picker uses this.
 */
let bankListCache: { at: number; banks: Record<string, string> } | null = null;

export async function settlementBanks(): Promise<Record<string, string>> {
  if (bankListCache && Date.now() - bankListCache.at < 6 * 60 * 60_000) return bankListCache.banks;
  const secret = getPaystackSecret();
  if (!secret) return PAYSTACK_BANK_CODES;
  try {
    const response = await fetch("https://api.paystack.co/bank?country=nigeria&currency=NGN&perPage=500", {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await response.json().catch(() => null)) as { data?: Array<{ name?: unknown; code?: unknown; active?: unknown; is_deleted?: unknown }> } | null;
    const banks: Record<string, string> = {};
    for (const bank of data?.data ?? []) {
      if (typeof bank.name === "string" && typeof bank.code === "string" && bank.active !== false && bank.is_deleted !== true) banks[bank.name.trim()] = bank.code;
    }
    if (!response.ok || Object.keys(banks).length < 10) return PAYSTACK_BANK_CODES;
    // The names people already saved keep working.
    bankListCache = { at: Date.now(), banks: { ...PAYSTACK_BANK_CODES, ...banks } };
    return bankListCache.banks;
  } catch {
    return PAYSTACK_BANK_CODES;
  }
}

export type ResolvedAccount =
  | { status: "resolved"; accountName: string }
  /** Paystack doesn't know this number at this bank. */
  | { status: "not_found" }
  /** Neither Paystack nor Korapay could look it up just now. */
  | { status: "unavailable" };

/**
 * Looks up the name on a bank account (Paystack "Resolve Account Number"), so a seller can confirm it's theirs
 * before saving it as the payout bank. Saving still goes through linkSellerPayoutBank.
 */
export async function resolvePaystackAccount(bankName: string, accountNumber: string): Promise<ResolvedAccount> {
  const secret = getPaystackSecret();
  const bankCode = PAYSTACK_BANK_CODES[bankName] ?? (await settlementBanks())[bankName];
  const digits = accountNumber.replace(/\D/g, "");
  if (!secret || !bankCode || digits.length !== 10) return { status: "unavailable" };
  try {
    const response = await fetch(`https://api.paystack.co/bank/resolve?account_number=${digits}&bank_code=${encodeURIComponent(bankCode)}`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(10_000),
    });
    const data = await response.json().catch(() => null);
    const name = typeof data?.data?.account_name === "string" ? data.data.account_name.trim() : "";
    if (response.ok && data?.status && name) return { status: "resolved", accountName: name };
    // Paystack answers 422 (or 400) when the number doesn't exist at that bank.
    if (response.status === 422 || response.status === 400) return { status: "not_found" };
    return { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

/**
 * The name on a bank account for every "add your bank" form: Paystack's lookup, else Korapay's when Paystack isn't set
 * up or doesn't answer (Paystack's lookup has daily limits and outages). A number Paystack says doesn't exist is
 * final; Korapay is only asked when Paystack couldn't say.
 */
export async function resolveBankAccount(bankName: string, accountNumber: string): Promise<ResolvedAccount> {
  const digits = accountNumber.replace(/\D/g, "");
  if (digits.length !== 10) return { status: "not_found" };
  const paystack = await resolvePaystackAccount(bankName, digits);
  if (paystack.status !== "unavailable") return paystack;
  const bankCode = PAYSTACK_BANK_CODES[bankName] ?? (await settlementBanks())[bankName];
  if (!bankCode) return paystack;
  const korapay = await resolveKorapayBankAccount(bankCode, digits);
  if (!korapay) {
    console.error(`[payout-bank] couldn't look up an account at ${bankName}: Paystack and Korapay gave no answer`);
    return paystack;
  }
  return "accountName" in korapay ? { status: "resolved", accountName: korapay.accountName } : { status: "not_found" };
}

/**
 * Saves a looked-up bank account as the business's payout bank in every place its role keeps one, so choosing a bank
 * once (Wallet page, Money page, payouts page, launch setup, phone app) updates it everywhere:
 *   seller             the store's payout bank (shown to bank-transfer buyers, Money page)
 *   supplier           SupplierPayoutAccount (supplier payouts)
 *   logistics_partner  LogisticsPayoutAccount (partner earnings)
 * The wallet itself (card payments) is saved by linkWalletBank, which calls this. Never throws.
 */
export async function syncPayoutBank(user: { id: string; role: string }, bankName: string, accountNumber: string, accountName: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (user.role === "seller") return await linkSellerPayoutBank(user.id, bankName, accountNumber, accountName);
    const digits = accountNumber.replace(/\D/g, "");
    if (!bankName || digits.length !== 10 || !accountName.trim()) return { success: false, error: "Choose a bank and enter a 10 digit account number." };
    const bankCode = PAYSTACK_BANK_CODES[bankName] ?? (await settlementBanks())[bankName];
    const recipient = await createPaystackTransferRecipient({ bankName, bankCode, accountNumber: digits, accountName: accountName.trim() });
    // A refused or unreachable Paystack never replaces a payout bank that works.
    if (recipient.status !== "verified") return { success: false, error: "Paystack couldn't register this account for payouts" };
    const common = {
      bankName,
      accountNumberMask: maskAccountNumber(digits),
      accountName: accountName.trim(),
      verificationStatus: recipient.status,
      providerResponse: recipient.providerResponse as Prisma.InputJsonValue,
    };
    if (user.role === "supplier") {
      const supplier = await db.supplier.findUnique({ where: { userId: user.id }, select: { id: true } });
      if (!supplier) return { success: false, error: "Supplier not found" };
      const data = { ...common, bankCode, paystackRecipientCode: recipient.recipientCode, paystackRecipientId: recipient.recipientId };
      await db.supplierPayoutAccount.upsert({ where: { supplierId: supplier.id }, create: { supplierId: supplier.id, ...data }, update: data });
      return { success: true };
    }
    if (user.role === "logistics_partner") {
      const partner = await db.logisticsPartner.findUnique({ where: { userId: user.id }, select: { id: true } });
      if (!partner) return { success: false, error: "Logistics partner not found" };
      const data = { ...common, recipientCode: recipient.recipientCode, recipientId: recipient.recipientId };
      await db.logisticsPayoutAccount.upsert({ where: { logisticsPartnerId: partner.id }, create: { logisticsPartnerId: partner.id, ...data }, update: data });
      return { success: true };
    }
    return { success: false, error: "This account has no payout bank." };
  } catch (error) {
    console.error("[payout-bank] couldn't save the payout bank", error instanceof Error ? error.message : error);
    return { success: false, error: "Couldn't save the payout bank." };
  }
}
