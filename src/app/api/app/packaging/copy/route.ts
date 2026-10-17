import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { meterAi } from "@/lib/ai/usage";
import { aiConfigured } from "@/lib/ai/client";
import { fallbackPackCopy, writePackCopy } from "@/lib/packaging/copy.server";
import { cleanContent, PRODUCT_TYPES } from "@shared/packaging";
import { naira } from "@shared/onboarding";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  productType: z.enum(PRODUCT_TYPES),
  name: z.string().trim().min(1).max(120),
  productId: z.string().max(64).nullable().optional(),
  brief: z.string().trim().max(500).nullable().optional(),
  current: z.unknown().optional(),
});

// "Write with Peggy" in the packaging designer: the words for the front and back of the pack.
export const POST = withSeller(async (req: NextRequest, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Name the product first.");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true } });
  if (!store) return apiError("NOT_FOUND", "Set up your store first.", 404);
  const product = parsed.data.productId ? await db.storeProduct.findFirst({ where: { id: parsed.data.productId, storeId: store.id }, select: { description: true, retailPrice: true } }) : null;
  const request = {
    storeName: store.name,
    productType: parsed.data.productType,
    name: parsed.data.name,
    description: product?.description ?? null,
    price: product ? naira(Number(product.retailPrice) || 0) : null,
    brief: parsed.data.brief ?? null,
    current: parsed.data.current ? cleanContent(parsed.data.current) : undefined,
  };
  if (!aiConfigured()) return ok({ content: fallbackPackCopy(request), ai: false });
  const limited = await meterAi(user.id, "text");
  if (limited) return limited;
  const content = await writePackCopy(request);
  return ok({ content: content ?? fallbackPackCopy(request), ai: Boolean(content) });
});
