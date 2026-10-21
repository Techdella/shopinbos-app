"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { PartnerConnectionError, connectPartner, disconnectPartner, preferPartner } from "@/lib/suppliers/partners.server";

// Supplier › Delivery partners (src/lib/suppliers/partners.server.ts).

async function supplierActor() {
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await db.supplier.findUnique({ where: { userId: user.id }, select: { id: true, userId: true } });
  if (!supplier) redirect("/supplier/onboarding");
  return supplier;
}

async function run(work: () => Promise<unknown>) {
  try {
    await work();
  } catch (error) {
    if (error instanceof PartnerConnectionError) redirect(`/supplier/delivery-partners?error=${encodeURIComponent(error.message)}`);
    throw error;
  }
  revalidatePath("/supplier/delivery-partners");
  redirect("/supplier/delivery-partners?saved=1");
}

export async function connectPartnerAction(formData: FormData) {
  const supplier = await supplierActor();
  await run(() => connectPartner(supplier, String(formData.get("partnerId") ?? "")));
}

export async function disconnectPartnerAction(formData: FormData) {
  const supplier = await supplierActor();
  await run(() => disconnectPartner(supplier.id, String(formData.get("partnerId") ?? "")));
}

export async function preferPartnerAction(formData: FormData) {
  const supplier = await supplierActor();
  await run(() => preferPartner(supplier.id, String(formData.get("partnerId") ?? "")));
}
