"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { FollowError, sendSupplierBroadcast, setFollowing } from "@/lib/suppliers/follow.server";

export async function toggleFollowSupplier(supplierId: string, follow: boolean): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole(["seller"], "/login");
  const supplier = await db.supplier.findUnique({ where: { id: String(supplierId) }, select: { id: true, slug: true } });
  if (!supplier) return { ok: false, error: "Supplier not found." };
  await setFollowing(supplier.id, user.id, Boolean(follow));
  revalidatePath(`/suppliers/${supplier.slug}`);
  return { ok: true };
}

export async function sendBroadcastAction(input: { title: string; body: string }): Promise<{ ok: boolean; error?: string; recipients?: number }> {
  const user = await requireRole(["supplier"], "/supplier/login");
  try {
    const broadcast = await sendSupplierBroadcast(user.id, { title: String(input?.title ?? ""), body: String(input?.body ?? "") });
    revalidatePath("/supplier/followers");
    return { ok: true, recipients: broadcast.recipients };
  } catch (error) {
    if (error instanceof FollowError) return { ok: false, error: error.message };
    throw error;
  }
}
