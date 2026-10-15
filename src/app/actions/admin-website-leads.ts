"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/server-auth";
import { updateWebsiteLead } from "@/lib/website-leads/service.server";

// Admin: mark a website lead as contacted, signed up or closed, and keep a short note.
export async function setWebsiteLeadStatus(formData: FormData) {
  await requireRole(["admin"], "/admin/login");
  const id = String(formData.get("id") ?? "").slice(0, 64);
  const status = String(formData.get("status") ?? "");
  const note = formData.has("note") ? String(formData.get("note") ?? "").trim() : undefined;
  if (!id) return;
  await updateWebsiteLead(id, { status: status || undefined, note });
  revalidatePath("/admin/leads");
}
