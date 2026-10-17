import { z } from "zod";
import { db } from "@/lib/db/client";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, created, ok } from "@/lib/api/response";
import { getSellerAds } from "@/lib/ads";
import { firstJsonObject, generateText } from "@/lib/ai/text";
import { AD_PLATFORMS, AD_PLATFORM_KEYS, adCode, fallbackAdCopy } from "@shared/ads";
import { naira } from "@shared/onboarding";
import { isOwnImageUrl } from "@/lib/ai/images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CreateSchema = z.object({
  productId: z.string().min(1, "Pick a product to advertise").max(64),
  platform: z.enum(AD_PLATFORM_KEYS),
  destination: z.enum(["whatsapp", "store"]),
  dailyBudget: z.number().min(500, "The smallest budget is ₦500 a day").max(1_000_000),
  days: z.number().int().min(1).max(30),
  /** A picture from Rex or the media library (our own storage only); else the product's main photo. */
  imageUrl: z.string().max(2000).refine(isOwnImageUrl, "Use a picture saved in your shop").optional(),
});

export const GET = withSeller(async (_req, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  return ok(await getSellerAds(store.id));
});

// Peggy writes the ad for a product; it's saved as a draft with its own tracking link.
export const POST = withSeller(async (req, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check the ad details");
  const input = parsed.data;

  const product = await db.storeProduct.findFirst({
    where: { id: input.productId, storeId: store.id },
    select: { id: true, name: true, retailPrice: true, description: true, images: true },
  });
  if (!product) return apiError("NOT_FOUND", "That product isn't in your store", 404);

  const price = naira(product.retailPrice);
  const platform = AD_PLATFORMS.find((item) => item.key === input.platform)!;
  const fallback = fallbackAdCopy(product.name, price, input.destination);
  const raw = await generateText(
    [
      `Write a ${platform.label} ad for ${store.name}, a small Nigerian online shop.`,
      `Product: ${product.name}, ${price}.${product.description ? ` Details: ${product.description.slice(0, 400)}` : ""}`,
      input.destination === "whatsapp"
        ? "The ad's button opens a WhatsApp chat with the shop, so end by inviting people to send a WhatsApp message."
        : "The ad's button opens the product page, so end by inviting people to tap to order.",
      'Return JSON only: {"headline": "max 8 words", "primaryText": "2-3 short sentences, under 45 words, warm Nigerian English, mention the price once"}.',
      "No emojis, no hashtags, no claims that aren't in the details (materials, discounts, delivery times).",
    ].join("\n"),
  );
  const copy = firstJsonObject(raw);
  const headline = typeof copy?.headline === "string" && copy.headline.trim() ? copy.headline.trim().slice(0, 80) : fallback.headline;
  const primaryText = typeof copy?.primaryText === "string" && copy.primaryText.trim() ? copy.primaryText.trim().slice(0, 500) : fallback.primaryText;

  // Codes are global (they're in /r/ad/<code>); retry on the rare clash.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = adCode();
    const exists = await db.adCampaign.findUnique({ where: { code }, select: { id: true } });
    if (exists) continue;
    const ad = await db.adCampaign.create({
      data: {
        storeId: store.id,
        storeProductId: product.id,
        code,
        platform: input.platform,
        destination: input.destination,
        headline,
        primaryText,
        imageUrl: input.imageUrl ?? product.images[0] ?? null,
        dailyBudget: input.dailyBudget,
        days: input.days,
      },
    });
    return created({ ...ad, drafted: Boolean(raw) });
  }
  return apiError("INTERNAL_ERROR", "Couldn't create the ad. Try again.", 500);
});
