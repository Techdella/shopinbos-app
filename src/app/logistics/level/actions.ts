"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { applyToBeFeatured } from "@/lib/logistics/partner-reach.server";

/** "Apply to be featured" on /logistics/level (Top partners only; the team decides in the admin). */
export async function applyFeaturedAction() {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);
  const result = await applyToBeFeatured(partner.id);
  revalidatePath("/logistics/level");
  redirect(result.ok ? "/logistics/level?applied=1" : `/logistics/level?error=${encodeURIComponent(result.error)}`);
}
