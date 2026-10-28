"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { applyToBeFeatured } from "@/lib/logistics/partner-levels.server";

/** "Apply to be featured" on the level page: Top partners (Tier 3) only; the team reviews it. */
export async function applyFeatured() {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);
  const result = await applyToBeFeatured(partner.id);
  redirect(result.ok ? "/logistics/level?featured=1" : `/logistics/level?error=${encodeURIComponent(result.error)}`);
}
