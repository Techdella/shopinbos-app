"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { confirmSellerPayIn, sellerConfirmsCash, startSellerPayIn } from "@/lib/logistics/seller-payins.server";

// Cash on delivery goes to the seller, never to Shopinbos: the delivery partner pays each seller (Paystack, split to
// the seller's own bank) or the seller confirms they received it (src/lib/logistics/seller-payins.server.ts).

async function actor() {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await db.logisticsPartner.findUnique({ where: { userId: user.id }, select: { id: true } });
  return partner ? { partnerId: partner.id, email: user.email ?? null } : null;
}

export async function startSellerPayInAction(sellerId: string) {
  const me = await actor();
  if (!me) return { ok: false as const, error: "Finish setting up your delivery business first." };
  return startSellerPayIn({ id: me.partnerId, email: me.email }, String(sellerId).slice(0, 40));
}

export async function confirmSellerPayInAction(reference: string) {
  const me = await actor();
  if (!me) return { ok: false as const, error: "Sign in again." };
  const result = await confirmSellerPayIn(String(reference).slice(0, 60), me.partnerId);
  revalidatePath("/logistics/cash");
  return result;
}

export async function confirmCashReceivedAction(partnerId: string) {
  const user = await requireRole(["seller"], "/login");
  const result = await sellerConfirmsCash(user.id, String(partnerId).slice(0, 40));
  revalidatePath("/home/wallet");
  return result;
}
