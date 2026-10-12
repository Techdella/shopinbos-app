import "server-only";
import { db } from "@/lib/db/client";
import { paystackSecretReady } from "@shared/checkout-payments";
import { readDedicatedAccount } from "./payin-rules";

// Each delivery partner's own pay-in account: a Paystack Dedicated Virtual Account (a real bank account number in
// the partner company's name). Transfers into it arrive as charge.success with channel "dedicated_nuban" and are
// matched to the partner in payins.server.ts.
//
//   1. POST /customer           { email, first_name, last_name, phone }  → customer_code (Paystack returns the
//                                existing customer for an email it already knows)
//   2. POST /dedicated_account  { customer, preferred_bank }             → account_number, account_name, bank
//      Some businesses get the account later: dedicatedaccount.assign.success / .failed then completes it.
//
// Env: PAYSTACK_SECRET_KEY (required), PAYSTACK_DVA_BANK (bank slug; "test-bank" for test keys, e.g. "wema-bank" or
// "titan-paystack" live), PAYSTACK_DVA_ENABLED=false to switch the feature off (partners then see the manual form),
// PAYSTACK_BASE_URL for a local stub. Dedicated Virtual Accounts must be enabled on the Paystack business.
// Nothing here throws, and no Paystack message ever reaches a partner: the account just shows as "not ready".

const PAYSTACK_DEFAULT_BASE = "https://api.paystack.co";
/** Don't retry a business that told us DVA isn't available more than once a day. */
const UNAVAILABLE_RETRY_MS = 24 * 60 * 60 * 1000;
/** A failed attempt is retried after 10 minutes. */
const FAILED_RETRY_MS = 10 * 60 * 1000;

function paystackBase() {
  const base = process.env.PAYSTACK_BASE_URL?.trim();
  return (base && /^https?:\/\//.test(base) ? base : PAYSTACK_DEFAULT_BASE).replace(/\/+$/, "");
}

function secret() {
  return process.env.PAYSTACK_SECRET_KEY ?? "";
}

/** True when pay-in accounts can be used: Paystack keys are set and the feature isn't switched off. */
export function payInAccountsConfigured() {
  return paystackSecretReady(secret()) && process.env.PAYSTACK_DVA_ENABLED?.trim().toLowerCase() !== "false";
}

export function dvaBank() {
  const configured = process.env.PAYSTACK_DVA_BANK?.trim();
  if (configured) return configured;
  return secret().startsWith("sk_test_") ? "test-bank" : "wema-bank";
}

type PaystackJson = { status?: boolean; message?: string; data?: unknown };

async function paystack(path: string, body: Record<string, unknown>): Promise<{ ok: true; data: unknown } | { ok: false; message: string; status: number }> {
  try {
    const response = await fetch(`${paystackBase()}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret()}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await response.json().catch(() => null)) as PaystackJson | null;
    if (!response.ok || !json?.status) return { ok: false, message: (json?.message ?? `HTTP ${response.status}`).slice(0, 300), status: response.status };
    return { ok: true, data: json.data };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message.slice(0, 300) : "network error", status: 0 };
  }
}

/** Paystack says the business can't use dedicated accounts (not enabled / not available), as opposed to a blip. */
export function dvaUnavailableMessage(message: string) {
  return /not (?:yet )?(?:available|enabled|allowed)|feature|contact support|not supported|unavailable|not activated/i.test(message);
}

function splitName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "Shopinbos", last: "Partner" };
  if (parts.length === 1) return { first: parts[0], last: parts[0] };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

export type PayInAccountView =
  | { state: "ready"; accountNumber: string; accountName: string; bankName: string }
  | { state: "setting_up" }
  | { state: "manual" };

/** What the partner screens show: their account, "we're setting it up", or the manual form. */
export function payInAccountView(account: { status: string; accountNumber: string | null; accountName: string | null; bankName: string | null } | null): PayInAccountView {
  if (account?.status === "assigned" && account.accountNumber) {
    return { state: "ready", accountNumber: account.accountNumber, accountName: account.accountName ?? "", bankName: account.bankName ?? "" };
  }
  if (!payInAccountsConfigured()) return { state: "manual" };
  if (!account || account.status === "pending") return { state: "setting_up" };
  return { state: "manual" };
}

/**
 * Makes sure the partner has a pay-in account, creating the Paystack customer and dedicated account when needed.
 * Safe to call on every Money screen load: it returns at once when the account exists, and backs off after
 * failures. Returns the stored row (or null when pay-in accounts aren't configured).
 */
export async function ensurePayInAccount(partnerId: string) {
  if (!payInAccountsConfigured()) return null;
  const existing = await db.partnerPayInAccount.findUnique({ where: { logisticsPartnerId: partnerId } });
  if (existing?.status === "assigned" && existing.accountNumber) return existing;
  if (existing) {
    const age = Date.now() - existing.updatedAt.getTime();
    if (existing.status === "unavailable" && age < UNAVAILABLE_RETRY_MS) return existing;
    if (existing.status === "failed" && age < FAILED_RETRY_MS) return existing;
    // Waiting for dedicatedaccount.assign.*: ask again only after a while.
    if (existing.status === "pending" && existing.customerCode && age < FAILED_RETRY_MS) return existing;
  }

  const partner = await db.logisticsPartner.findUnique({
    where: { id: partnerId },
    select: { id: true, companyName: true, displayName: true, whatsappNumber: true, verificationStatus: true, user: { select: { name: true, email: true, phone: true } } },
  });
  // A bank account in the company's name only once we've checked the company (KYC).
  if (!partner || partner.verificationStatus !== "verified") return existing;
  if (!partner.user.email) {
    return db.partnerPayInAccount.upsert({
      where: { logisticsPartnerId: partnerId },
      create: { logisticsPartnerId: partnerId, status: "failed", lastError: "The owner has no email address." },
      update: { status: "failed", lastError: "The owner has no email address." },
    });
  }

  // Claim the row first so two screens loading at once don't both create accounts.
  const row = existing ?? (await db.partnerPayInAccount.upsert({ where: { logisticsPartnerId: partnerId }, create: { logisticsPartnerId: partnerId, status: "pending" }, update: {} }));

  let customerCode = row.customerCode;
  let customerId = row.customerId;
  if (!customerCode) {
    const name = splitName(partner.user.name || partner.companyName);
    const customer = await paystack("/customer", {
      email: partner.user.email,
      first_name: name.first,
      last_name: name.last,
      phone: partner.whatsappNumber ?? partner.user.phone ?? undefined,
      metadata: JSON.stringify({ shopinbos: "logistics_partner", logisticsPartnerId: partner.id, company: partner.companyName }),
    });
    if (!customer.ok) return markProblem(partnerId, customer.message);
    const data = customer.data as { customer_code?: string; id?: number | string } | undefined;
    customerCode = data?.customer_code ?? null;
    customerId = data?.id !== undefined ? String(data.id) : null;
    if (!customerCode) return markProblem(partnerId, "Paystack returned no customer code.");
    await db.partnerPayInAccount.update({ where: { logisticsPartnerId: partnerId }, data: { customerCode, customerId } });
  }

  const created = await paystack("/dedicated_account", { customer: customerCode, preferred_bank: dvaBank() });
  if (!created.ok) return markProblem(partnerId, created.message);
  const account = readDedicatedAccount(created.data);
  return db.partnerPayInAccount.update({
    where: { logisticsPartnerId: partnerId },
    data: {
      customerCode: account.customerCode ?? customerCode,
      customerId: account.customerId ?? customerId,
      providerAccountId: account.providerAccountId,
      accountNumber: account.accountNumber,
      accountName: account.accountName,
      bankName: account.bankName,
      bankSlug: account.bankSlug,
      status: account.accountNumber ? "assigned" : "pending",
      lastError: null,
    },
  });
}

async function markProblem(partnerId: string, message: string) {
  const status = dvaUnavailableMessage(message) ? "unavailable" : "failed";
  console.warn(`[pay-in account] partner ${partnerId}: ${status} (${message})`);
  return db.partnerPayInAccount.upsert({
    where: { logisticsPartnerId: partnerId },
    create: { logisticsPartnerId: partnerId, status, lastError: message },
    update: { status, lastError: message },
  });
}

/** ensurePayInAccount that never throws (screens call it before reading the account). */
export async function ensurePayInAccountSafely(partnerId: string) {
  try {
    return await ensurePayInAccount(partnerId);
  } catch (error) {
    console.error(`[pay-in account] partner ${partnerId} could not be set up`, error);
    return db.partnerPayInAccount.findUnique({ where: { logisticsPartnerId: partnerId } }).catch(() => null);
  }
}
