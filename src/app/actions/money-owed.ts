"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentAppUser } from "@/lib/server-auth";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { isWalletRole } from "@/lib/wallet/rules";
import { nairaToKobo } from "@/lib/money-owed/rules";
import {
  confirmDebtPayment,
  creditorCancels,
  creditorConfirmsPaid,
  decideClaim,
  giveMoreTime,
  raiseClaim,
  recordDebt,
  respondToClaim,
  startDebtPayment,
  waiveDebt,
  type MoneyResult,
} from "@/lib/money-owed/money-owed.server";

// Money owed between businesses (src/lib/money-owed): pay it in the app, confirm it was paid, raise and answer
// claims, and the team's decisions. Shopinbos never holds the money: payments are split to the creditor's bank.

const PATHS = ["/home/wallet", "/supplier/wallet", "/logistics/wallet", "/admin/money-owed"];

function refresh() {
  for (const path of PATHS) revalidatePath(path);
}

async function business() {
  const user = await getCurrentAppUser();
  return user && isWalletRole(user.role) ? user : null;
}

async function admin() {
  const user = await getCurrentAppUser();
  return user?.role === "admin" ? user : null;
}

const id = (value: unknown) => String(value ?? "").slice(0, 40);

export async function startDebtPaymentAction(debtId: string) {
  const user = await business();
  if (!user) return { ok: false as const, error: "Sign in again." };
  return startDebtPayment({ id: user.id, email: user.email ?? null }, id(debtId));
}

export async function confirmDebtPaymentAction(reference: string) {
  const user = await business();
  if (!user) return { ok: false as const, error: "Sign in again." };
  const result = await confirmDebtPayment(String(reference).slice(0, 60), user.id);
  refresh();
  return result;
}

export async function confirmDebtPaidAction(debtId: string): Promise<MoneyResult> {
  const user = await business();
  if (!user) return { ok: false, error: "Sign in again." };
  const result = await creditorConfirmsPaid(user, id(debtId));
  refresh();
  return result;
}

export async function cancelDebtAction(debtId: string): Promise<MoneyResult> {
  const user = await business();
  if (!user) return { ok: false, error: "Sign in again." };
  const result = await creditorCancels(user, id(debtId));
  refresh();
  return result;
}

const ClaimSchema = z.object({
  target: z.enum(["supplier_order", "wholesale_order", "booking"]),
  targetId: z.string().min(1).max(40),
  reason: z.string().max(40),
  amount: z.string().max(20),
  details: z.string().max(2000),
});

export async function raiseClaimAction(input: z.infer<typeof ClaimSchema>): Promise<MoneyResult> {
  const user = await getCurrentAppUser();
  if (user?.role !== "seller") return { ok: false, error: "Only the shop on the order can claim." };
  const parsed = ClaimSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Fill in every part of the claim." };
  if (!(await checkRateLimitShared(rateLimitKey("money-owed-claim", user.id), { maxRequests: 10, windowMs: 60 * 60_000 })).allowed) return { ok: false, error: "Too many claims at once. Try again later." };
  const result = await raiseClaim(user, { target: parsed.data.target, targetId: parsed.data.targetId, reason: parsed.data.reason, amountKobo: nairaToKobo(parsed.data.amount), details: parsed.data.details });
  refresh();
  return result;
}

export async function respondToClaimAction(debtId: string, accept: boolean, response: string): Promise<MoneyResult> {
  const user = await business();
  if (!user) return { ok: false, error: "Sign in again." };
  const result = await respondToClaim(user, id(debtId), accept === true, String(response ?? "").slice(0, 2000));
  refresh();
  return result;
}

// ─── The team ─────────────────────────────────────────────────────────────────

export async function decideClaimAction(debtId: string, uphold: boolean, amount: string, note: string): Promise<MoneyResult> {
  const user = await admin();
  if (!user) return { ok: false, error: "Only the Shopinbos team can do this." };
  const amountKobo = String(amount ?? "").trim() ? nairaToKobo(amount) : null;
  if (String(amount ?? "").trim() && amountKobo === null) return { ok: false, error: "Enter the amount in naira." };
  const result = await decideClaim(user, id(debtId), { uphold: uphold === true, amountKobo, note: String(note ?? "").slice(0, 2000) });
  refresh();
  return result;
}

export async function waiveDebtAction(debtId: string, note: string): Promise<MoneyResult> {
  const user = await admin();
  if (!user) return { ok: false, error: "Only the Shopinbos team can do this." };
  const result = await waiveDebt(user, id(debtId), String(note ?? "").slice(0, 2000));
  refresh();
  return result;
}

export async function giveMoreTimeAction(debtId: string, note: string): Promise<MoneyResult> {
  const user = await admin();
  if (!user) return { ok: false, error: "Only the Shopinbos team can do this." };
  const result = await giveMoreTime(user, id(debtId), String(note ?? "").slice(0, 2000));
  refresh();
  return result;
}

const RecordSchema = z.object({
  debtorEmail: z.string().max(200),
  creditorEmail: z.string().max(200),
  reason: z.string().max(40),
  amount: z.string().max(20),
  details: z.string().max(2000),
});

export async function recordDebtAction(input: z.infer<typeof RecordSchema>): Promise<MoneyResult> {
  const user = await admin();
  if (!user) return { ok: false, error: "Only the Shopinbos team can do this." };
  const parsed = RecordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Fill in every part." };
  const result = await recordDebt(user, { debtorEmail: parsed.data.debtorEmail, creditorEmail: parsed.data.creditorEmail || null, reason: parsed.data.reason, amountKobo: nairaToKobo(parsed.data.amount), details: parsed.data.details });
  refresh();
  return result;
}
