import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { chooseMetaAds, disconnectMetaAds, MetaAdsError, metaAdsChoices, metaAdsStatus } from "@/lib/ad-campaigns/meta.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function storeId(userId: string) {
  return (await db.store.findUnique({ where: { userId }, select: { id: true } }))?.id ?? null;
}

// The seller's Meta ads connection. GET: status (?choices=1 also lists the ad accounts and Pages to pick from);
// PATCH { accountId, pageId }: pick them; DELETE: disconnect.
export const GET = withSeller(async (req: NextRequest, { user }) => {
  const id = await storeId(user.id);
  if (!id) return apiError("NOT_FOUND", "Set up your store first.", 404);
  const status = await metaAdsStatus(id);
  if (req.nextUrl.searchParams.get("choices") && status.status !== "off") {
    try {
      return ok({ ...status, choices: await metaAdsChoices(id) });
    } catch (error) {
      return apiError("BAD_GATEWAY", error instanceof MetaAdsError ? error.message : "Couldn't load your ad accounts.", 502);
    }
  }
  return ok(status);
});

const ChooseSchema = z.object({ accountId: z.string().trim().min(3).max(60), pageId: z.string().trim().min(3).max(60) });

export const PATCH = withSeller(async (req: NextRequest, { user }) => {
  const id = await storeId(user.id);
  if (!id) return apiError("NOT_FOUND", "Set up your store first.", 404);
  const parsed = ChooseSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Pick an ad account and a Page.");
  try {
    await chooseMetaAds(id, parsed.data.accountId, parsed.data.pageId);
    return ok(await metaAdsStatus(id));
  } catch (error) {
    return apiError("BAD_REQUEST", error instanceof MetaAdsError ? error.message : "Couldn't save that. Try again.");
  }
});

export const DELETE = withSeller(async (_req: NextRequest, { user }) => {
  const id = await storeId(user.id);
  if (!id) return apiError("NOT_FOUND", "Set up your store first.", 404);
  await disconnectMetaAds(id);
  return ok({ disconnected: true });
});
