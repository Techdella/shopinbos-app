"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";

// Admin › Settings: the name an admin goes by in the portal (top bar, team list, notes and replies they send).
export async function updateAdminName(formData: FormData) {
  const user = await requireRole(["admin"], "/admin/login");
  const name = String(formData.get("name") ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  if (name.length < 2) redirect("/admin/settings?error=Enter+your+name.");
  await db.user.update({ where: { id: user.id }, data: { name } });
  revalidatePath("/admin", "layout");
  redirect("/admin/settings?saved=name");
}
