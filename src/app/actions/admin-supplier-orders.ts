"use server";

import { requireAdminSection } from "@/lib/admin-team/service.server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { assignPickupPartner } from "@/lib/supplier-orders/pickup.server";

// Admin: a supplier's time to accept new orders (overrides SUPPLIER_ACCEPT_HOURS_* for them), and booking a
// delivery company for supplier pickups nobody covered (/admin/supplier-pickups).

const Hours = z.union([z.literal(""), z.coerce.number().int().min(1).max(168)]);

export async function setSupplierAcceptHours(formData: FormData) {
  await requireAdminSection("partners");
  const supplierId = String(formData.get("supplierId") ?? "");
  const back = `/admin/suppliers/${encodeURIComponent(supplierId)}`;
  const dropship = Hours.safeParse(String(formData.get("acceptHoursDropship") ?? "").trim());
  const wholesale = Hours.safeParse(String(formData.get("acceptHoursWholesale") ?? "").trim());
  if (!supplierId || !dropship.success || !wholesale.success) redirect(`${back}?error=${encodeURIComponent("Hours must be a whole number from 1 to 168, or empty for the default.")}`);
  await db.supplier.update({
    where: { id: supplierId },
    data: { acceptHoursDropship: dropship.data === "" ? null : dropship.data, acceptHoursWholesale: wholesale.data === "" ? null : wholesale.data },
  });
  revalidatePath(back);
  redirect(`${back}?saved=1`);
}

/** Admin › Suppliers: show or hide a supplier in the marketplace. Their account, products and orders stay as they are. */
export async function setSupplierMarketplaceVisible(formData: FormData) {
  await requireAdminSection("partners");
  const supplierId = String(formData.get("supplierId") ?? "");
  const visible = String(formData.get("visible") ?? "") === "1";
  const asked = String(formData.get("redirectTo") ?? "");
  const back = asked.startsWith("/admin/suppliers") ? asked : `/admin/suppliers/${encodeURIComponent(supplierId)}`;
  if (!supplierId) redirect(back);
  await db.supplier.update({ where: { id: supplierId }, data: { marketplaceVisible: visible } });
  revalidatePath("/admin/suppliers");
  revalidatePath(`/admin/suppliers/${supplierId}`);
  revalidatePath("/marketplace", "layout");
  redirect(back);
}

export async function bookSupplierPickup(formData: FormData) {
  await requireAdminSection("partners");
  const pickupId = String(formData.get("pickupId") ?? "");
  const partnerId = String(formData.get("partnerId") ?? "");
  if (!pickupId || !partnerId) redirect(`/admin/supplier-pickups?error=${encodeURIComponent("Pick a delivery company.")}`);
  const result = await assignPickupPartner(pickupId, partnerId);
  revalidatePath("/admin/supplier-pickups");
  redirect(result.ok ? "/admin/supplier-pickups?saved=1" : `/admin/supplier-pickups?error=${encodeURIComponent(result.message)}`);
}
