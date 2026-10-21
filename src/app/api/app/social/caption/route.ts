import { z } from "zod";
import { db } from "@/lib/db/client";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { aiText } from "@/lib/ai/text";
import { meterAi } from "@/lib/ai/usage";
import { productLink } from "@/lib/social/server";
import { SHARE_CHANNELS, SHARE_CHANNEL_KEYS, captionRoom, fallbackCaption, fitCaption, taggedProductLink } from "@/lib/social/share";
import { naira } from "@shared/onboarding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const Body = z.object({
  /** Optional: without one, Peggy writes about the shop and the seller's angle (a brand post, a Rex design). */
  productId: z.string().min(1).max(64).nullable().optional(),
  channel: z.enum(SHARE_CHANNEL_KEYS),
  /** Optional angle from the seller ("new arrival", "only 3 left", "weekend sale"). */
  angle: z.string().trim().max(200).optional(),
});

const STYLE: Record<(typeof SHARE_CHANNEL_KEYS)[number], string> = {
  whatsapp: "a WhatsApp status or broadcast: 1-3 short lines and a clear call to tap the link to order. At most one emoji.",
  instagram: "an Instagram post caption: 2-4 short sentences, then 3-6 relevant hashtags on the last line. No links (Instagram doesn't make them tappable).",
  facebook: "a Facebook post: 2-3 short sentences that end by inviting people to order through the link.",
  x: "an X (Twitter) post: one or two punchy sentences, no hashtags unless one is truly useful.",
  tiktok: "a TikTok caption: one short hook line, then 3-5 hashtags. No links.",
};

// Peggy writes a caption for one product (or, without one, the seller's angle) and one app; the seller edits it
// before posting. Nothing is posted here.
export const POST = withSeller(async (req, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, customDomain: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Pick a product and an app");
  const { productId, channel, angle } = parsed.data;
  if (!productId) return brandCaption(user.id, store.name, channel, angle);

  const product = await db.storeProduct.findFirst({
    where: { id: productId, storeId: store.id },
    select: { id: true, name: true, description: true, retailPrice: true, compareAtPrice: true, currentStock: true },
  });
  if (!product) return apiError("NOT_FOUND", "That product isn't in your store", 404);

  const link = taggedProductLink(productLink(store, product.id), channel);
  const price = naira(product.retailPrice);
  const room = captionRoom(channel, link);

  const limited = await meterAi(user.id, "text");
  if (limited) return limited;

  const label = SHARE_CHANNELS.find((item) => item.key === channel)!.label;
  const facts = [
    `Product: ${product.name}`,
    `Price: ${price}${product.compareAtPrice && product.compareAtPrice > product.retailPrice ? ` (was ${naira(product.compareAtPrice)})` : ""}`,
    product.currentStock > 0 && product.currentStock <= 5 ? `Only ${product.currentStock} left` : null,
    product.description ? `Details: ${product.description.replace(/<[^>]*>/g, " ").slice(0, 600)}` : null,
    angle ? `Seller's angle: ${angle}` : null,
  ].filter(Boolean);
  const result = await aiText({
    fast: true,
    system: `You are Peggy, writing social posts for ${store.name}, a small online shop in Nigeria. Warm, confident Nigerian English. Never invent prices, discounts, materials, sizes or delivery times that aren't in the facts.`,
    prompt: `Write ${STYLE[channel]}\nKeep it under ${Math.max(60, room)} characters. Don't include the link; it is added after.\n${facts.join("\n")}\nReturn only the caption.`,
  });

  const caption = fitCaption(result?.text.replace(/^["“]|["”]$/g, "").trim() || fallbackCaption({ name: product.name, price, storeName: store.name }, channel), room);
  return ok({ caption, link, channel, label, ai: Boolean(result) });
});

/** A post that isn't about one product: the seller's angle ("we're open on Sunday", "new Ankara collection"). */
async function brandCaption(userId: string, storeName: string, channel: (typeof SHARE_CHANNEL_KEYS)[number], angle: string | undefined) {
  if (!angle) return apiError("BAD_REQUEST", "Pick a product or say what the post is about");
  const limit = SHARE_CHANNELS.find((item) => item.key === channel)!.limit;
  const limited = await meterAi(userId, "text");
  if (limited) return limited;
  const label = SHARE_CHANNELS.find((item) => item.key === channel)!.label;
  const result = await aiText({
    fast: true,
    system: `You are Peggy, writing social posts for ${storeName}, a small online shop in Nigeria. Warm, confident Nigerian English. Never invent prices, discounts, materials, sizes or delivery times the seller didn't give.`,
    prompt: `Write ${STYLE[channel]}\nKeep it under ${Math.min(limit, 600)} characters.\nWhat the post is about: ${angle}\nReturn only the caption.`,
  });
  const caption = fitCaption(result?.text.replace(/^["“]|["”]$/g, "").trim() || `${angle} — ${storeName}`, limit);
  return ok({ caption, link: null, channel, label, ai: Boolean(result) });
}
