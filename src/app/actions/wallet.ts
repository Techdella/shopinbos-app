"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentAppUser } from "@/lib/server-auth";
import { isWalletRole } from "@/lib/wallet/rules";
import { approveWalletBank, linkWalletBank, setWalletFrozen, setWalletKorapaySplitAccount, verifyWalletIdentity, type WalletResult } from "@/lib/wallet/wallet.server";

// Shopinbos Wallet actions for sellers, suppliers and delivery partners (their own wallet), and the team's
// review/pause actions. Money never moves here: these set up where Paystack settles each business's share.

const WALLET_PATHS = ["/home/wallet", "/supplier/wallet", "/logistics/wallet", "/admin/wallets"];

function refresh() {
  for (const path of WALLET_PATHS) revalidatePath(path);
}

function walletOwner(user: Awaited<ReturnType<typeof getCurrentAppUser>>) {
  return user && isWalletRole(user.role) ? { id: user.id, role: user.role } : null;
}

const KycSchema = z.object({
  idType: z.enum(["bvn", "nin"]),
  idNumber: z.string().max(20),
  firstName: z.string().max(60),
  lastName: z.string().max(60),
  dateOfBirth: z.string().max(10),
  consent: z.boolean(),
});

export async function verifyWalletIdentityAction(input: z.infer<typeof KycSchema>): Promise<WalletResult> {
  const owner = walletOwner(await getCurrentAppUser());
  if (!owner) return { ok: false, error: "Sign in to your business account first." };
  const parsed = KycSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the details and try again." };
  const result = await verifyWalletIdentity(owner, parsed.data);
  refresh();
  return result;
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

export async function approveWalletBankAction(walletId: string): Promise<WalletResult> {
  if ((await getCurrentAppUser())?.role !== "admin") return { ok: false, error: "Only the Shopinbos team can do this." };
  const result = await approveWalletBank(walletId);
  refresh();
  return result;
}

export async function setWalletFrozenAction(walletId: string, frozen: boolean, reason?: string): Promise<WalletResult> {
  if ((await getCurrentAppUser())?.role !== "admin") return { ok: false, error: "Only the Shopinbos team can do this." };
  const result = await setWalletFrozen(walletId, frozen, reason);
  refresh();
  return result;
}

export async function setWalletKorapaySplitAccountAction(walletId: string, reference: string): Promise<WalletResult> {
  if ((await getCurrentAppUser())?.role !== "admin") return { ok: false, error: "Only the Shopinbos team can do this." };
  const result = await setWalletKorapaySplitAccount(walletId, reference.slice(0, 60));
  refresh();
  return result;
}
