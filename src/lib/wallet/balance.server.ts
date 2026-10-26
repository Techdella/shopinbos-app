import "server-only";

import { randomUUID } from "node:crypto";
import { after } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { paystackSecretReady } from "@shared/checkout-payments";
import { initializePaystackTransaction, verifyPaystackTransaction } from "@/lib/paystack";
import { createPaystackTransferRecipient } from "@/lib/payout-bank";
import { readDedicatedAccount } from "@/lib/logistics/payin-rules";
import { dvaBank, dvaUnavailableMessage } from "@/lib/logistics/paystack-dva";
import { appBase, sendPlatformEmail } from "@/lib/email/compliance.server";
import { html } from "@/lib/email/shell";
import { sendShopinbosTemplate } from "@/lib/member-messaging/send.server";
import { identityChecksReady, walletAccountIdentity } from "./identity.server";
import { cacCheckEnabled } from "@/lib/kyb/verify-cac.server";
import { ensurePaystackModeSynced } from "@/lib/paystack-mode.server";
import { BALANCE_LIMITS, WALLET_REFERENCE, paystackNames, paystackPhone, validAmountNaira } from "./balance-rules";

// The prepaid wallet balance. Businesses top it up (card, or a bank transfer to their own top-up account number),
// spend it on Shopinbos services (AI credits), and withdraw what's left to their checked bank (Paystack transfer).
// Sales are never added here: they still settle straight to the bank through Paystack splits.
//
// Every change to balanceKobo happens in one database transaction with a WalletTransaction whose reference is
// unique, so a retried webhook or a double click can't count twice, and a CHECK constraint keeps it >= 0.
//
// Paystack setup: Transfers must be enabled and the "OTP for transfers" setting switched off (Settings →
// Preferences) for withdrawals to go out by API; top-up accounts need Dedicated Virtual Accounts
// (WALLET_TOPUP_ACCOUNTS=true, bank from PAYSTACK_DVA_BANK). Webhooks: charge.success, transfer.success,
// transfer.failed, transfer.reversed → /api/webhooks/paystack.

export class WalletBalanceError extends Error {}

const PAYSTACK_BASE = (process.env.VERCEL_ENV !== "production" && process.env.PAYSTACK_API_BASE_URL) || "https://api.paystack.co";
const secret = () => process.env.PAYSTACK_SECRET_KEY ?? "";

export function walletPaymentsReady() {
  return paystackSecretReady(secret());
}

/** Their own top-up account numbers (Paystack Dedicated Virtual Accounts) are on. */
export function topUpAccountsReady() {
  return walletPaymentsReady() && process.env.WALLET_TOPUP_ACCOUNTS?.trim().toLowerCase() === "true";
}

async function paystack(path: string, body: Record<string, unknown>, method: "POST" | "PUT" = "POST") {
  try {
    const response = await fetch(`${PAYSTACK_BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${secret()}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await response.json().catch(() => null)) as { status?: boolean; message?: string; data?: unknown } | null;
    if (!response.ok || !json?.status) return { ok: false as const, message: (json?.message ?? `HTTP ${response.status}`).slice(0, 300), status: response.status };
    return { ok: true as const, data: json.data };
  } catch (error) {
    return { ok: false as const, message: error instanceof Error ? error.message.slice(0, 300) : "network error", status: 0 };
  }
}

/**
 * Whether this account gets a prepaid wallet: sellers straight away; suppliers and delivery partners once Shopinbos
 * has verified their business (no balance or account number for an unverified partner). Admins never.
 */
export async function walletOpenFor(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, supplier: { select: { verificationStatus: true } }, logisticsPartner: { select: { verificationStatus: true } } },
  });
  if (!user || user.role === "admin") return false;
  if (user.role === "supplier") return user.supplier?.verificationStatus === "verified";
  if (user.role === "logistics_partner") return user.logisticsPartner?.verificationStatus === "verified";
  return true;
}

/** The business's wallet, made when it doesn't exist yet. */
export async function ensureWallet(userId: string) {
  const existing = await db.wallet.findUnique({ where: { userId } });
  if (existing) return existing;
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user || user.role === "admin") throw new WalletBalanceError("Only businesses have a wallet.");
  return db.wallet.upsert({ where: { userId }, create: { userId, role: user.role }, update: {} });
}

type Tx = Prisma.TransactionClient;

/** Adds money once per reference. Returns false when that reference was already counted. */
export async function creditWallet(walletId: string, input: { amountKobo: number; reference: string; kind: "topup" | "refund"; description: string }, client?: Tx): Promise<boolean> {
  if (!Number.isInteger(input.amountKobo) || input.amountKobo <= 0) return false;
  const run = async (tx: Tx) => {
    const created = await tx.walletTransaction.createMany({ data: [{ walletId, kind: input.kind, amountKobo: input.amountKobo, reference: input.reference, description: input.description }], skipDuplicates: true });
    if (!created.count) return false;
    await tx.wallet.update({ where: { id: walletId }, data: { balanceKobo: { increment: input.amountKobo } } });
    return true;
  };
  return client ? run(client) : db.$transaction(run);
}

/** Takes money out if the balance covers it. Throws WalletBalanceError when it doesn't. */
export async function debitWallet(walletId: string, input: { amountKobo: number; reference: string; kind: "spend" | "withdrawal"; description: string; status?: "done" | "pending" }, client: Tx) {
  const moved = await client.wallet.updateMany({ where: { id: walletId, status: "active", balanceKobo: { gte: input.amountKobo } }, data: { balanceKobo: { decrement: input.amountKobo } } });
  if (!moved.count) throw new WalletBalanceError("Your wallet balance isn't enough for that. Top up first.");
  await client.walletTransaction.create({ data: { walletId, kind: input.kind, amountKobo: -input.amountKobo, reference: input.reference, description: input.description, status: input.status ?? "done" } });
}

/** Pays for something on Shopinbos from the balance, inside the caller's transaction (e.g. AI credits). */
export async function spendFromWallet(userId: string, input: { amountKobo: number; reference: string; description: string }, tx: Tx) {
  const wallet = await tx.wallet.findUnique({ where: { userId }, select: { id: true } });
  if (!wallet) throw new WalletBalanceError("Top up your wallet first.");
  await debitWallet(wallet.id, { ...input, kind: "spend" }, tx);
}

// ─── Top-ups ──────────────────────────────────────────────────────────────────

/** Starts a card (or bank) top-up on Paystack's checkout; returns the page to send them to. */
export async function startCardTopUp(input: { userId: string; email: string | null; naira: number; origin: string; returnTo: string }) {
  if (!walletPaymentsReady()) throw new WalletBalanceError("Top-ups aren't switched on yet.");
  if (!(await walletOpenFor(input.userId))) throw new WalletBalanceError("Your wallet opens once your business is verified.");
  const problem = validAmountNaira(input.naira, BALANCE_LIMITS.topUpMin, BALANCE_LIMITS.topUpMax);
  if (problem) throw new WalletBalanceError(problem);
  const wallet = await ensureWallet(input.userId);
  const reference = `${WALLET_REFERENCE.topUp}${randomUUID()}`;
  const callback = new URL("/api/app/wallet/topup/callback", input.origin);
  callback.searchParams.set("returnTo", input.returnTo);
  const session = await initializePaystackTransaction({
    email: input.email || `wallet-${input.userId}@shopinbos.com`,
    amountKobo: Math.round(input.naira * 100),
    reference,
    callbackUrl: callback.toString(),
    metadata: { purpose: "wallet_topup", wallet_id: wallet.id, user_id: input.userId },
  });
  return { authorizationUrl: session.authorization_url, reference };
}

/** Counts a card top-up once Paystack confirms it (from the callback and the webhook; safe to run twice). */
export async function confirmCardTopUp(reference: string): Promise<"done" | "failed" | "pending"> {
  if (!reference.startsWith(WALLET_REFERENCE.topUp)) return "failed";
  const verified = await verifyPaystackTransaction(reference);
  if (verified.status !== "success") return verified.status === "failed" || verified.status === "abandoned" ? "failed" : "pending";
  const metadata = (verified.metadata ?? {}) as Record<string, unknown>;
  const walletId = typeof metadata.wallet_id === "string" ? metadata.wallet_id : null;
  if (verified.currency !== "NGN" || metadata.purpose !== "wallet_topup" || !walletId) return "failed";
  const wallet = await db.wallet.findUnique({ where: { id: walletId }, select: { id: true } });
  if (!wallet) return "failed";
  await creditWallet(wallet.id, { amountKobo: Number(verified.amount), reference, kind: "topup", description: "Top-up by card" });
  return "done";
}

/**
 * Their own top-up account (a bank account number only they pay into). Made at sign-in (provisionWallet) and again
 * on wallet page loads until it exists: returns at once when it does, backs off after failures.
 */
export async function ensureTopUpAccount(userId: string) {
  if (!topUpAccountsReady() || !(await walletOpenFor(userId))) return null;
  await ensurePaystackModeSynced();
  let wallet = await ensureWallet(userId);
  // The verified business name, else the NIN-verified owner (src/lib/wallet/identity.server.ts).
  const identity = await walletAccountIdentity(userId);
  let replacing = false;
  if (wallet.topUpStatus === "ready") {
    // A number not in the business's name gets a new one once the business is verified. The old customer stays
    // known, so a transfer to the old number still lands in this wallet.
    if (identity?.kind !== "business" || wallet.topUpNameKind === "business" || !wallet.topUpCustomerCode) return wallet;
    wallet = await db.wallet.update({
      where: { id: wallet.id },
      data: { topUpOldCustomerCodes: { push: wallet.topUpCustomerCode }, topUpCustomerCode: null, topUpAccountNumber: null, topUpAccountName: null, topUpBankName: null, topUpNameKind: null, topUpStatus: "none", topUpError: null },
    });
    replacing = true;
  }
  const age = Date.now() - wallet.updatedAt.getTime();
  if (!replacing && ((wallet.topUpStatus === "unavailable" && age < 86_400_000) || ((wallet.topUpStatus === "failed" || wallet.topUpStatus === "pending") && age < 600_000))) return wallet;
  if (!identity) return db.wallet.update({ where: { id: wallet.id }, data: { topUpStatus: "needs_identity", topUpError: null } });
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, phone: true, supplier: { select: { whatsappNumber: true } }, logisticsPartner: { select: { contactPhone: true, whatsappNumber: true } } },
  });
  if (!user) return wallet;
  // Paystack won't give a dedicated account to a customer without a phone number.
  const phone = paystackPhone(user.phone ?? user.supplier?.whatsappNumber ?? user.logisticsPartner?.contactPhone ?? user.logisticsPartner?.whatsappNumber);
  if (!phone) return db.wallet.update({ where: { id: wallet.id }, data: { topUpStatus: "needs_phone", topUpError: null } });
  const names = paystackNames(identity);
  let customerCode = wallet.topUpCustomerCode;
  if (customerCode) {
    // Made before Paystack had their phone or their verified name: bring both up to date first.
    const updated = await paystack(`/customer/${encodeURIComponent(customerCode)}`, { phone, ...names }, "PUT");
    if (!updated.ok) return markTopUpProblem(wallet.id, updated.message);
  } else {
    // Paystack keeps one customer per email: a replacement number needs its own customer, so its own address.
    const email = wallet.topUpOldCustomerCodes.length ? `wallet-${wallet.id}-${wallet.topUpOldCustomerCodes.length + 1}@shopinbos.com` : user.email || `wallet-${userId}@shopinbos.com`;
    const customer = await paystack("/customer", { email, ...names, phone, metadata: { shopinbos: "wallet", walletId: wallet.id } });
    if (!customer.ok) return markTopUpProblem(wallet.id, customer.message);
    customerCode = (customer.data as { customer_code?: string } | undefined)?.customer_code ?? null;
    if (!customerCode) return markTopUpProblem(wallet.id, "Paystack returned no customer code.");
    await db.wallet.update({ where: { id: wallet.id }, data: { topUpCustomerCode: customerCode, topUpStatus: "pending" } });
  }
  await db.wallet.update({ where: { id: wallet.id }, data: { topUpNameKind: identity.kind === "account" ? null : identity.kind } });
  const created = await paystack("/dedicated_account", { customer: customerCode, preferred_bank: dvaBank() });
  if (!created.ok) return markTopUpProblem(wallet.id, created.message);
  await saveTopUpAccount(wallet.id, readDedicatedAccount(created.data));
  return db.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
}

/**
 * Stores the account Paystack assigned. The call that turns the wallet "ready" (a conditional update, so only one
 * wins even when the API answer and the webhook arrive together) sends the "your wallet is ready" email, once.
 */
async function saveTopUpAccount(walletId: string, account: ReturnType<typeof readDedicatedAccount>) {
  const details = { topUpAccountNumber: account.accountNumber, topUpAccountName: account.accountName, topUpBankName: account.bankName, topUpError: null };
  if (!account.accountNumber) {
    await db.wallet.updateMany({ where: { id: walletId, topUpStatus: { not: "ready" } }, data: { ...details, topUpStatus: "pending" } });
    return;
  }
  const turnedReady = await db.wallet.updateMany({ where: { id: walletId, topUpStatus: { not: "ready" } }, data: { ...details, topUpStatus: "ready" } });
  if (!turnedReady.count) {
    await db.wallet.update({ where: { id: walletId }, data: details });
    return;
  }
  await sendWalletReadyEmail(walletId).catch((error) => console.error(`[wallet] ready email for ${walletId}`, error));
}

function walletPath(role: string) {
  return role === "supplier" ? "/supplier/wallet" : role === "logistics_partner" ? "/logistics/wallet" : "/home/wallet";
}

async function sendWalletReadyEmail(walletId: string) {
  const wallet = await db.wallet.findUnique({
    where: { id: walletId },
    select: {
      role: true,
      topUpAccountNumber: true,
      topUpAccountName: true,
      topUpBankName: true,
      user: { select: { id: true, email: true, name: true, role: true, phone: true, supplier: { select: { whatsappNumber: true } }, logisticsPartner: { select: { contactPhone: true, whatsappNumber: true } } } },
    },
  });
  const user = wallet?.user;
  if (!wallet?.topUpAccountNumber || !user || user.role === "admin") return;
  const first = (user.name ?? "").trim().split(/\s+/)[0];
  // WhatsApp too (Shopinbos's number, approved template), to the number they gave us.
  const phone = paystackPhone(user.phone ?? user.supplier?.whatsappNumber ?? user.logisticsPartner?.whatsappNumber ?? user.logisticsPartner?.contactPhone);
  await sendShopinbosTemplate("shopinbos_wallet_ready", phone, [first || "there", wallet.topUpAccountNumber, wallet.topUpBankName ?? "your bank", wallet.topUpAccountName ?? "your business"]).catch(() => false);
  if (!user.email) return;
  await sendPlatformEmail({
    to: user.email,
    user: { id: user.id, role: user.role },
    kind: "transactional",
    subject: "Your Shopinbos Wallet is ready",
    eyebrow: "Wallet",
    heading: "Your Shopinbos Wallet is ready",
    preheader: `Your own wallet account number: ${wallet.topUpAccountNumber}.`,
    bodyHtml: [
      html.p(first ? `Hi ${first}, your Shopinbos Wallet is set up.` : "Your Shopinbos Wallet is set up."),
      html.p("This account number is yours alone. Transfer to it from any bank app and the money lands in your wallet balance within a minute or two:"),
      html.code(wallet.topUpAccountNumber, `${wallet.topUpBankName ?? "Bank"} · ${wallet.topUpAccountName ?? ""}`),
      html.p("Use your balance for AI credits and other Shopinbos services, and withdraw what's left to your bank whenever you like. Card payments from your customers are still split at checkout and paid straight into your bank."),
    ].join(""),
    cta: { label: "Open your wallet", url: `${appBase()}${walletPath(wallet.role)}` },
    reason: "Your Shopinbos Wallet account number was just set up.",
  });
}

/**
 * Sets up wallets for businesses that haven't been back since wallets came in (hourly, with the lifecycle job), a
 * few at a time so Paystack isn't flooded. Each gets its "wallet is ready" email when its account number arrives.
 */
export async function provisionPendingWallets(limit = 40) {
  if (!topUpAccountsReady()) return { checked: 0 };
  const users = await db.user.findMany({
    where: {
      // Suppliers and delivery partners only once their business is verified (walletOpenFor).
      OR: [{ role: "seller" }, { role: "supplier", supplier: { verificationStatus: "verified" } }, { role: "logistics_partner", logisticsPartner: { verificationStatus: "verified" } }],
      AND: [{ OR: [{ wallet: null }, { wallet: { topUpStatus: { in: ["none", "pending", "failed", "needs_phone", "needs_identity"] } } }] }],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });
  for (const user of users) await provisionWallet(user.id);
  return { checked: users.length };
}

/**
 * Gives a business its wallet and, when switched on, its own account number. Run after every sign-in (in the
 * background, never blocking it); cheap once both exist. Admins have no wallet.
 */
export async function provisionWallet(userId: string) {
  try {
    if (!(await walletOpenFor(userId))) return;
    await ensureWallet(userId);
    await ensureTopUpAccount(userId);
  } catch (error) {
    console.error(`[wallet] could not set up the wallet of ${userId}`, error);
  }
}

const lastProvisioned = new Map<string, number>();

/**
 * provisionWallet for someone already signed in (portal pages call it on every load), at most every 10 minutes per
 * person on this server, in the background. Covers people whose session started before wallets came in.
 */
export function provisionWalletSoon(userId: string) {
  const now = Date.now();
  if (now - (lastProvisioned.get(userId) ?? 0) < 600_000) return;
  if (lastProvisioned.size > 5_000) lastProvisioned.clear();
  lastProvisioned.set(userId, now);
  try {
    after(() => provisionWallet(userId));
  } catch {
    // Outside a request (after() isn't available): the next page load or sign-in does it.
    lastProvisioned.delete(userId);
  }
}

async function markTopUpProblem(walletId: string, message: string) {
  console.warn(`[wallet top-up account] ${walletId}: ${message}`);
  return db.wallet.update({ where: { id: walletId }, data: { topUpStatus: dvaUnavailableMessage(message) ? "unavailable" : "failed", topUpError: message } });
}

/**
 * A transfer into someone's top-up account (charge.success, channel dedicated_nuban). True when it belonged to a
 * wallet (counted now or before); false when it's for something else (e.g. a delivery partner's old pay-in account).
 */
export async function handleWalletAccountCharge(data: unknown): Promise<boolean> {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const customer = (d.customer && typeof d.customer === "object" ? d.customer : {}) as Record<string, unknown>;
  const code = typeof customer.customer_code === "string" ? customer.customer_code : null;
  const reference = typeof d.reference === "string" ? d.reference : null;
  const kobo = Number(d.amount);
  if (!code || !reference) return false;
  // An older number (replaced when the business was verified) still pays into the same wallet.
  const wallet = await db.wallet.findFirst({ where: { OR: [{ topUpCustomerCode: code }, { topUpOldCustomerCodes: { has: code } }] }, select: { id: true } });
  if (!wallet) return false;
  if (d.status === "success" && Number.isInteger(kobo) && kobo > 0) {
    await creditWallet(wallet.id, { amountKobo: kobo, reference: `${WALLET_REFERENCE.transferIn}${reference}`, kind: "topup", description: "Top-up by bank transfer" });
  }
  return true;
}

/** dedicatedaccount.assign.success / .failed for a wallet's top-up account. True when it was one. */
export async function handleWalletAccountAssign(eventType: string, data: unknown): Promise<boolean> {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const customer = (d.customer && typeof d.customer === "object" ? d.customer : {}) as Record<string, unknown>;
  const code = typeof customer.customer_code === "string" ? customer.customer_code : null;
  if (!code) return false;
  const wallet = await db.wallet.findUnique({ where: { topUpCustomerCode: code }, select: { id: true } });
  if (!wallet) return false;
  if (eventType.endsWith(".success")) {
    await saveTopUpAccount(wallet.id, readDedicatedAccount(d.dedicated_account ?? d));
  } else {
    await db.wallet.update({ where: { id: wallet.id }, data: { topUpStatus: "failed", topUpError: "Paystack couldn't assign the account." } });
  }
  return true;
}

// ─── Withdrawals ──────────────────────────────────────────────────────────────

/** Sends part of the balance to their checked bank. The money leaves the balance now; a failed transfer puts it back. */
export async function withdrawToBank(userId: string, naira: number) {
  if (!walletPaymentsReady()) throw new WalletBalanceError("Withdrawals aren't switched on yet.");
  const problem = validAmountNaira(naira, BALANCE_LIMITS.withdrawMin, BALANCE_LIMITS.withdrawMax);
  if (problem) throw new WalletBalanceError(problem);
  const wallet = await ensureWallet(userId);
  if (wallet.status !== "active") throw new WalletBalanceError("Your wallet is paused. Message us to sort it out.");
  if (!wallet.accountNumber || !wallet.bankCode || !wallet.accountName || wallet.subaccountStatus !== "active") {
    throw new WalletBalanceError("Add and check your bank account first, so we know where to send it.");
  }
  let recipient = wallet.transferRecipient;
  if (!recipient) {
    const made = await createPaystackTransferRecipient({ bankName: wallet.bankName ?? "", bankCode: wallet.bankCode, accountNumber: wallet.accountNumber, accountName: wallet.accountName });
    if (!made.recipientCode) throw new WalletBalanceError("We couldn't set up your bank for withdrawals just now. Try again in a few minutes.");
    recipient = made.recipientCode;
    await db.wallet.update({ where: { id: wallet.id }, data: { transferRecipient: recipient } });
  }
  const amountKobo = Math.round(naira * 100);
  const reference = `${WALLET_REFERENCE.withdrawal}${randomUUID().replace(/-/g, "")}`;
  const description = `Withdrawal to ${wallet.bankName ?? "your bank"} ••${wallet.accountNumber.slice(-4)}`;
  await db.$transaction((tx) => debitWallet(wallet.id, { amountKobo, reference, kind: "withdrawal", description, status: "pending" }, tx));
  const sent = await paystack("/transfer", { source: "balance", amount: amountKobo, recipient, reference, reason: "Shopinbos wallet withdrawal", currency: "NGN" });
  if (!sent.ok) {
    await refundWithdrawal(reference, sent.message);
    throw new WalletBalanceError("The withdrawal didn't go through, so your balance is back. Try again later or message us.");
  }
  const status = String((sent.data as { status?: string } | undefined)?.status ?? "pending");
  if (status === "success") await finishWithdrawal(reference);
  return { reference, status: status === "success" ? "done" : "pending" };
}

async function finishWithdrawal(reference: string) {
  await db.walletTransaction.updateMany({ where: { reference, status: "pending" }, data: { status: "done", error: null } });
}

/** A withdrawal that failed or was reversed: the money goes back on the balance, once. */
async function refundWithdrawal(reference: string, reason: string) {
  await db.$transaction(async (tx) => {
    const row = await tx.walletTransaction.findUnique({ where: { reference } });
    if (!row || row.status !== "pending") return;
    await tx.walletTransaction.update({ where: { reference }, data: { status: "failed", error: reason.slice(0, 300) } });
    await creditWallet(row.walletId, { amountKobo: -row.amountKobo, reference: `${reference}-back`, kind: "refund", description: "Withdrawal didn't go through: money back" }, tx);
  });
}

/** transfer.success / transfer.failed / transfer.reversed for a wallet withdrawal. True when it was one. */
export async function handleWalletTransfer(eventType: string, data: unknown): Promise<boolean> {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const reference = typeof d.reference === "string" ? d.reference : "";
  if (!reference.startsWith(WALLET_REFERENCE.withdrawal)) return false;
  if (eventType === "transfer.success") await finishWithdrawal(reference);
  else await refundWithdrawal(reference, typeof d.reason === "string" && d.reason ? d.reason : eventType === "transfer.reversed" ? "The bank reversed it." : "The transfer failed.");
  return true;
}

// ─── For the wallet page ──────────────────────────────────────────────────────

export async function walletBalanceView(userId: string) {
  const wallet = await db.wallet.findUnique({
    where: { userId },
    select: { id: true, role: true, balanceKobo: true, status: true, accountNumber: true, bankName: true, subaccountStatus: true, topUpStatus: true, topUpAccountNumber: true, topUpAccountName: true, topUpBankName: true, topUpNameKind: true },
  });
  const [open, transactions, identity, registrationOpen] = await Promise.all([
    walletOpenFor(userId),
    wallet ? db.walletTransaction.findMany({ where: { walletId: wallet.id }, orderBy: { createdAt: "desc" }, take: 30 }) : Promise.resolve([]),
    walletAccountIdentity(userId).catch(() => null),
    (async () => (await import("@/lib/business-registration/service.server")).registrationEnabled(userId))().catch(() => false),
  ]);
  return {
    /** False for a supplier or delivery partner not verified yet: no top-ups or account number until then. */
    open,
    ready: walletPaymentsReady() && open,
    balanceNaira: (wallet?.balanceKobo ?? 0) / 100,
    canWithdraw: Boolean(wallet && wallet.status === "active" && wallet.accountNumber && wallet.subaccountStatus === "active"),
    bank: wallet?.accountNumber ? `${wallet.bankName ?? "Bank"} ••${wallet.accountNumber.slice(-4)}` : null,
    topUpAccount: open && wallet?.topUpStatus === "ready" && wallet.topUpAccountNumber ? { number: wallet.topUpAccountNumber, name: wallet.topUpAccountName ?? "", bank: wallet.topUpBankName ?? "" } : null,
    /** Where their own account number stands: "ready", "setting_up" (asked Paystack, or retrying), "needs_phone", "needs_identity" or "off". */
    topUpAccountStatus: open ? topUpAccountStatus(wallet?.topUpStatus, Boolean(wallet?.topUpAccountNumber)) : ("off" as const),
    /** Whose name the number is in: "business" (CAC-verified), "person" (NIN-verified) or null (the account's name). */
    accountNameKind: (wallet?.topUpNameKind as "business" | "person" | null | undefined) ?? null,
    /** The business name is verified with CAC (a number in a person's name is then being replaced). */
    businessVerified: identity?.kind === "business",
    /** Which checks can be done here: the business with CAC, the owner's NIN. */
    checks: { business: cacCheckEnabled(), nin: identityChecksReady() },
    /** Registering a business name with CAC through Shopinbos, when it's open to them. */
    registration: registrationOpen ? { href: walletRegistrationPage(wallet?.role) } : null,
    limits: BALANCE_LIMITS,
    transactions: transactions.map((t) => ({ id: t.id, kind: t.kind, naira: t.amountKobo / 100, status: t.status, description: t.description, error: t.error, at: t.createdAt.toISOString() })),
  };
}

function walletRegistrationPage(role: string | undefined) {
  return role === "supplier" ? "/supplier/register-business" : role === "logistics_partner" ? "/logistics/register-business" : "/home/register-business";
}

function topUpAccountStatus(status: string | undefined, hasNumber: boolean): "ready" | "setting_up" | "needs_phone" | "needs_identity" | "off" {
  if (!topUpAccountsReady()) return "off";
  if (status === "ready" && hasNumber) return "ready";
  if (status === "needs_phone" || status === "needs_identity") return status;
  // Paystack said Dedicated Virtual Accounts aren't on for the business: nothing the person can do.
  return status === "unavailable" ? "off" : "setting_up";
}

/** The wallet in a line (sidebar and home): balance and account number, without setting anything up. */
export async function walletSummary(userId: string) {
  if (!(await walletOpenFor(userId))) return null;
  const wallet = await db.wallet.findUnique({ where: { userId }, select: { role: true, balanceKobo: true, topUpStatus: true, topUpAccountNumber: true, topUpAccountName: true, topUpBankName: true } });
  if (!wallet) return null;
  return {
    balanceNaira: wallet.balanceKobo / 100,
    account: wallet.topUpStatus === "ready" && wallet.topUpAccountNumber ? { number: wallet.topUpAccountNumber, bank: wallet.topUpBankName ?? "", name: wallet.topUpAccountName ?? "" } : null,
    href: walletPath(wallet.role),
  };
}

export type WalletSummary = NonNullable<Awaited<ReturnType<typeof walletSummary>>>;

export type WalletBalanceView = Awaited<ReturnType<typeof walletBalanceView>>;
