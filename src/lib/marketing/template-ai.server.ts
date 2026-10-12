import "server-only";

import { db } from "@/lib/db/client";
import { aiText, firstJsonObject } from "@/lib/ai/text";
import { naira } from "@shared/onboarding";
import { htmlFromBlocks, readBlocks, type EmailBlock } from "./blocks";
import { MARKETING_STORE_SELECT, storeUrl } from "./brand";
import { BLOCK_FORMAT, STARTER_GUIDE, fallbackDraft, groundBlocks, matchSeries, type ShopProduct } from "./template-ai";
import { TEMPLATE_LIBRARY, matchStarter } from "./template-library";
import { saveTemplate } from "./templates";
import { MarketingError } from "./segments";

// Peggy writing emails: the builder's "Ask Peggy" panel and the draft_email_template / improve_email_copy tools
// for Peggy and Rex. The model answers in blocks (so the result opens in the visual builder); products, prices
// and photos are tied back to the real catalogue. Without an AI key, the nearest starter is filled in with the
// shop's own products instead.

export interface EmailDraft {
  subject: string;
  preheader: string;
  blocks: EmailBlock[];
  note: string;
  /** False when this came from a starter because no AI provider answered. */
  ai: boolean;
}

/** Every Unsplash photo the starters use (images, heroes, column pictures), so Peggy can reuse one without inventing links. */
const LIBRARY_IMAGES = [
  ...new Map(
    TEMPLATE_LIBRARY.flatMap((tpl) =>
      (readBlocks(tpl.bodyHtml) ?? []).flatMap((block) => {
        if (block.type === "image") return [{ url: block.url, alt: block.alt }];
        if (block.type === "hero" && block.imageUrl) return [{ url: block.imageUrl, alt: block.alt }];
        if (block.type === "columns") return block.cells.flatMap((cell) => (cell.imageUrl ? [{ url: cell.imageUrl, alt: cell.alt ?? "" }] : []));
        return [];
      }),
    ).map((img) => [img.url, img] as const),
  ).values(),
];

export async function shopFacts(storeId: string) {
  const store = await db.store.findUnique({ where: { id: storeId }, select: { ...MARKETING_STORE_SELECT, description: true, city: true } });
  if (!store) throw new MarketingError("Store not found");
  const rows = await db.storeProduct
    .findMany({ where: { storeId, status: "published" }, orderBy: [{ soldStock: "desc" }, { createdAt: "desc" }], take: 16, select: { id: true, name: true, retailPrice: true, images: true, currentStock: true } })
    .catch(() => []);
  const products: ShopProduct[] = rows
    .filter((p) => p.images?.[0] && /^https:\/\//i.test(p.images[0]))
    .map((p) => ({ id: p.id, name: p.name, price: naira(Number(p.retailPrice) || 0), imageUrl: p.images[0], url: storeUrl(store, `/product/${p.id}`) }));
  return { store, products, inStock: new Set(rows.filter((p) => p.currentStock > 0).map((p) => p.id)) };
}

/**
 * Writes or rewrites an email. `current` is what's in the builder now ("make it shorter" edits it); without
 * it Peggy starts fresh.
 */
export async function draftEmail(storeId: string, instruction: string, current?: { subject: string; preheader: string; blocks: EmailBlock[] } | null): Promise<EmailDraft> {
  const { store, products, inStock } = await shopFacts(storeId);
  const images = [...products.map((p) => p.imageUrl), ...LIBRARY_IMAGES.map((img) => img.url)];
  const series = matchSeries(instruction);
  const starter = (series && TEMPLATE_LIBRARY.find((tpl) => tpl.key === series.steps[0].template)) || matchStarter(instruction);
  const facts = [
    `Shop: ${store.name}${store.city ? ` in ${store.city}` : ""}. Link: ${storeUrl(store)}.`,
    store.description ? `About the shop: ${store.description.slice(0, 400)}` : "",
    products.length
      ? `Products you may feature (id | name | price | stock):\n${products.map((p) => `${p.id} | ${p.name} | ${p.price} | ${inStock.has(p.id) ? "in stock" : "out of stock"}`).join("\n")}`
      : "The shop has no published products with photos yet, so don't add a products block.",
    `Photos you may use (url | what it shows):\n${LIBRARY_IMAGES.map((img) => `${img.url} | ${img.alt}`).join("\n")}`,
    starter && !current ? `A starting point for this kind of email (adapt it, don't copy blindly): ${JSON.stringify(readBlocks(starter.bodyHtml))}` : "",
    series && !current ? `The seller asked for a series. Write the first email only (${series.steps[0].template.replace(/_/g, " ")}) and say in the note that the whole "${series.name}" can be created as an automation from the Templates page with "Use the whole series".` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = await aiText({
    fast: true,
    maxTokens: 6000,
    system:
      `You are Peggy, writing marketing emails for ${store.name}, a small online shop in Nigeria. Warm, clear Nigerian English, short paragraphs, one clear call to action. ` +
      "Never invent prices, stock, delivery times, discounts or policies; only use the facts given. No emojis in the body (one in the subject at most). Keep it short enough to read on a phone. " +
      "Pick a style family (theme block) that suits the email: luxe for VIP or premium, market for flash deals, editorial for stories and newsletters, playful for games and treats, receipt for orders.\n\n" +
      `${STARTER_GUIDE}\n\n` +
      BLOCK_FORMAT,
    prompt: `${facts}\n\n${current ? `The email as it is now:\n${JSON.stringify({ subject: current.subject, preheader: current.preheader, blocks: current.blocks })}\n\nChange it as the seller asks, keeping what they didn't ask to change.` : "Write a new email."}\nThe seller asks: ${instruction}`,
  }).catch(() => null);

  const json = firstJsonObject(result?.text ?? null);
  if (json) {
    const blocks = groundBlocks(json.blocks, { products, images });
    if (blocks.length) {
      const text = (value: unknown, fallback: string, max: number) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback);
      return {
        subject: text(json.subject, current?.subject || starter?.subject || store.name, 200),
        preheader: text(json.preheader, current?.preheader ?? "", 200),
        blocks,
        note: text(json.note, "Here's my draft. Check the details before you send it.", 300),
        ai: true,
      };
    }
  }

  const fallback = fallbackDraft(instruction, products, Boolean(current?.blocks.length));
  if (!fallback) throw new MarketingError("Peggy can't rewrite emails until an AI key is set up on the server. You can still pick a starter or edit the blocks yourself.");
  return {
    subject: fallback.subject,
    preheader: fallback.preheader,
    blocks: fallback.blocks,
    note: `Peggy's writing help isn't available right now, so this is the "${fallback.starter}" starter with your products. Edit the words and the discount code before sending.${series ? ` For all ${series.steps.length} emails at once, use "Use the whole series" on the ${series.name} in Templates.` : ""}`,
    ai: false,
  };
}

/** Saves a draft as a new template (Peggy's and Rex's tools). Nothing is sent. */
export async function saveDraftTemplate(storeId: string, draft: EmailDraft, name: string, category: string) {
  return saveTemplate(storeId, { name: name.slice(0, 120) || "New email", subject: draft.subject, preheader: draft.preheader, bodyHtml: htmlFromBlocks(draft.blocks), category });
}

/** Finds a saved template by id or name (newest first). */
export async function findTemplate(storeId: string, query: string) {
  return (
    (await db.emailTemplate.findFirst({ where: { id: query, storeId } })) ??
    (await db.emailTemplate.findFirst({ where: { storeId, name: { equals: query, mode: "insensitive" } }, orderBy: { updatedAt: "desc" } })) ??
    (await db.emailTemplate.findFirst({ where: { storeId, name: { contains: query, mode: "insensitive" } }, orderBy: { updatedAt: "desc" } }))
  );
}
