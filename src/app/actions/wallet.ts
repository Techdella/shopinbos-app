"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentAppUser } from "@/lib/server-auth";
import { currentAdminCan } from "@/lib/admin-team/service.server";
import { db } from "@/lib/db/client";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { isWalletRole } from "@/lib/wallet/rules";
import { approveWalletBank, checkWalletAccount, linkWalletBank, setWalletFrozen, setWalletKorapaySplitAccount, walletBankNames, type WalletResult } from "@/lib/wallet/wallet.server";

// Shopinbos Wallet actions for sellers, suppliers and delivery partners (their own wallet), and the team's
// review/pause actions. Money never moves here: these set up where Paystack settles each business's share.

const WALLET_PATHS = ["/home/wallet", "/supplier/wallet", "/logistics/wallet", "/admin/wallets"];

function refresh() {
  for (const path of WALLET_PATHS) revalidatePath(path);
}

function walletOwner(user: Awaited<ReturnType<typeof getCurrentAppUser>>) {
  return user && isWalletRole(user.role) ? { id: user.id, role: user.role } : null;
}

const BankSchema = z.object({ bankName: z.string().max(80), accountNumber: z.string().max(20) });

export async function linkWalletBankAction(input: z.infer<typeof BankSchema>): Promise<WalletResult> {
  const owner = walletOwner(await getCurrentAppUser());
  if (!owner) return { ok: false, error: "Sign in to your business account first." };
  const parsed = BankSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose your bank and enter your account number." };
  const result = await linkWalletBank(owner, parsed.data);
  refresh();
  return result;
}

/** The name on an account before it's saved (Paystack's lookup), limited so it can't be used to look up strangers' accounts in bulk. */
export async function checkWalletAccountAction(input: z.infer<typeof BankSchema>) {
  const user = await getCurrentAppUser();
  if (!walletOwner(user) || !user) return { status: "unavailable" as const };
  const parsed = BankSchema.safeParse(input);
  if (!parsed.success) return { status: "not_found" as const };
  if (!(await checkRateLimitShared(rateLimitKey("wallet-account-check", user.id), { maxRequests: 10, windowMs: 60_000 })).allowed) return { status: "unavailable" as const };
  return checkWalletAccount(parsed.data);
}

/** Every bank and fintech payments can settle to, for the "add your bank" pickers that open in a dialog. */
export async function walletBankNamesAction(): Promise<string[]> {
  if (!walletOwner(await getCurrentAppUser())) return [];
  return walletBankNames();
}

/** The bank the signed-in business already gets paid into (looked up and saved), or null. */
export async function myWalletBankAction(): Promise<{ bankName: string; accountName: string } | null> {
  const owner = walletOwner(await getCurrentAppUser());
  if (!owner) return null;
  const wallet = await db.wallet.findUnique({ where: { userId: owner.id }, select: { bankName: true, accountName: true } });
  return wallet?.bankName && wallet.accountName ? { bankName: wallet.bankName, accountName: wallet.accountName } : null;
}

export async function approveWalletBankAction(walletId: string): Promise<WalletResult> {
  if (!(await currentAdminCan("money"))) return { ok: false, error: "Only the Shopinbos team can do this." };
  const result = await approveWalletBank(walletId);
  refresh();
  return result;
}

export async function setWalletFrozenAction(walletId: string, frozen: boolean, reason?: string): Promise<WalletResult> {
  if (!(await currentAdminCan("money"))) return { ok: false, error: "Only the Shopinbos team can do this." };
  const result = await setWalletFrozen(walletId, frozen, reason);
  refresh();
  return result;
}

export async function setWalletKorapaySplitAccountAction(walletId: string, reference: string): Promise<WalletResult> {
  if (!(await currentAdminCan("money"))) return { ok: false, error: "Only the Shopinbos team can do this." };
  const result = await setWalletKorapaySplitAccount(walletId, reference.slice(0, 60));
  refresh();
  return result;
}
