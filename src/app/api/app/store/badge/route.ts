import { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { canHideShopinbosBadge, readHideShopinbosBadge } from "@/lib/store-badges";
import { mergeBrandSettings } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The "Built with Shopinbos" badge switch in the store editor. Every store shows the badge by default; a seller with
// time left on the Pro plan (the highest) may turn it off. Everyone else see the switch locked (canHide: false) and can't change it here.
// GET → { hidden, shown, canHide }   PATCH { hidden: boolean } → the same.

async function load(userId: string) {
  const [user, store] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { planCode: true, planStatus: true, planPaidUntil: true } }),
    db.store.findUnique({ where: { userId }, select: { id: true, brandSettings: true } }),
  ]);
  return { user, store };
}

function state(user: Parameters<typeof canHideShopinbosBadge>[0], brandSettings: unknown) {
  const canHide = canHideShopinbosBadge(user, new Date());
  const hidden = readHideShopinbosBadge(brandSettings);
  return { hidden, shown: !(canHide && hidden), canHide };
}

export const GET = withSeller(async (_req: NextRequest, { user: me }) => {
  const { user, store } = await load(me.id);
  if (!store) return apiError("NOT_FOUND", "Set up your store first.", 404);
  return ok(state(user, store.brandSettings));
});

const Body = z.object({ hidden: z.boolean() });

export const PATCH = withSeller(async (req: NextRequest, { user: me }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Say whether to show the badge.");
  const { user, store } = await load(me.id);
  if (!store) return apiError("NOT_FOUND", "Set up your store first.", 404);
  if (parsed.data.hidden && !canHideShopinbosBadge(user, new Date())) {
    return apiError("UPGRADE_REQUIRED", "Only the Pro plan can hide the Built with Shopinbos badge. Upgrade to Pro to turn it off.", 403);
  }
  const brandSettings = mergeBrandSettings(store.brandSettings, { hideShopinbosBadge: parsed.data.hidden }) as Prisma.InputJsonValue;
  await db.store.update({ where: { id: store.id }, data: { brandSettings } });
  return ok(state(user, brandSettings));
});
