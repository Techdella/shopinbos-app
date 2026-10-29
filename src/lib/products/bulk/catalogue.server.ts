import "server-only";
import type { ContentBlockParam } from "@anthropic-ai/sdk/resources/messages";
import type { ResponseInputContent } from "openai/resources/responses/responses";
import { db } from "@/lib/db/client";
import { aiConfigured, getAnthropicClient, getOpenAIClient, PEGGY_CLAUDE_MODEL, providerOrder, REX_OPENAI_MODEL } from "@/lib/ai/client";
import { meterAiCharged, refundAi } from "@/lib/ai/usage";
import { firstJsonObject } from "@/lib/ai/text";
import { uploadFileServer, type StorageFolder } from "@/lib/supabase/storage.server";
import { BULK_PHOTO_MAX_SIDE, CATALOGUE_MAX_PER_SCREENSHOT, cropRect, readCatalogueProducts, type BulkRole, type CatalogueProduct } from "@shared/bulk-products";
import { addPhotoItem, toItem } from "./session.server";

// "From my WhatsApp catalogue" (shared/bulk-products.ts): one screenshot of the person's catalogue → one product per
// item on it, with the name and price as the catalogue shows them and the photo cut out of the screenshot. The
// products land in the open "Add many with Peggy" list, ready to check and publish like any other.

const READ_SIDE = 1568;

type Sharp = (typeof import("sharp"))["default"];
async function loadSharp(): Promise<Sharp | null> {
  try {
    return (await import("sharp")).default;
  } catch {
    return null;
  }
}

async function categoryNames() {
  const rows = await db.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { name: true }, take: 60 }).catch(() => []);
  return rows.map((row) => row.name);
}

function prompt(role: BulkRole, categories: string[]) {
  return `This is a screenshot of a ${role === "supplier" ? "Nigerian wholesale supplier's" : "Nigerian seller's"} WhatsApp Business catalogue: either the list of products, or one product opened.
List every product you can see with its name readable. Return JSON only:
{"products":[{"name":string (exactly as written in the catalogue),"price":string (exactly as written, e.g. "₦12,500", or "" when none is shown),"description":string (the catalogue's description if shown, else "", under 300 characters),"category":string (one of: ${categories.slice(0, 40).join(", ") || "Fashion, Beauty, Food, Electronics, Home"}; else a short plural like "Bags"),"box":{"x":number,"y":number,"w":number,"h":number} (the product's photo only, as fractions 0 to 1 of the screenshot's width and height from the top-left; no text, buttons or borders)}]}
At most ${CATALOGUE_MAX_PER_SCREENSHOT} products, top to bottom. Skip products cut off so their name can't be read. Never invent names, prices or details that are not in the screenshot. If this is not a product catalogue, return {"products":[]}.`;
}

async function read(text: string, image: string): Promise<CatalogueProduct[]> {
  for (const provider of providerOrder()) {
    try {
      let raw = "";
      if (provider === "openai") {
        const openai = getOpenAIClient();
        if (!openai) continue;
        const content: ResponseInputContent[] = [{ type: "input_text", text }, { type: "input_image", detail: "high", image_url: `data:image/jpeg;base64,${image}` }];
        const response = await openai.responses.create({ model: REX_OPENAI_MODEL, input: [{ role: "user", content }] }, { timeout: 60_000, maxRetries: 1 });
        raw = response.output_text ?? "";
      } else {
        const anthropic = getAnthropicClient();
        if (!anthropic) continue;
        const content: ContentBlockParam[] = [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } }, { type: "text", text }];
        // Claude may think first: read every text block, with room.
        const response = await anthropic.messages.create({ model: PEGGY_CLAUDE_MODEL, max_tokens: 8000, output_config: { effort: "low" }, messages: [{ role: "user", content }] }, { timeout: 60_000, maxRetries: 1 });
        raw = response.content.map((block) => (block.type === "text" ? block.text : "")).join("");
      }
      const parsed = firstJsonObject(raw);
      if (parsed) return readCatalogueProducts(parsed);
    } catch (error) {
      console.error(`[bulk] catalogue screenshot via ${provider} failed`, error);
    }
  }
  return [];
}

export type CatalogueOutcome =
  | { kind: "added"; items: ReturnType<typeof toItem>[]; full: boolean }
  | { kind: "none" }
  | { kind: "noAi" }
  | { kind: "unreadable" }
  | { kind: "blocked"; response: Response };

/**
 * Reads one catalogue screenshot into the session. Retries are safe: items are keyed `${clientKey}:${n}`, so a
 * screenshot sent again returns the products it already made without reading (or charging) twice.
 */
export async function addCatalogueScreenshot(session: { id: string; userId: string }, role: BulkRole, file: File, clientKey: string): Promise<CatalogueOutcome> {
  const before = await db.bulkProductItem.findMany({ where: { sessionId: session.id, clientKey: { startsWith: `${clientKey}:` } }, orderBy: { number: "asc" } });
  if (before.length) return { kind: "added", items: before.map(toItem), full: false };
  if (!aiConfigured()) return { kind: "noAi" };
  const sharp = await loadSharp();
  if (!sharp) return { kind: "unreadable" };

  let original: Buffer;
  let small: Buffer;
  try {
    original = await sharp(Buffer.from(await file.arrayBuffer())).rotate().toBuffer();
    small = await sharp(original).resize({ width: READ_SIDE, height: READ_SIDE, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  } catch {
    return { kind: "unreadable" };
  }
  const { width = 0, height = 0 } = await sharp(original).metadata();
  if (!width || !height) return { kind: "unreadable" };

  // One AI use per screenshot, given back when nothing could be read off it.
  const { blocked, credits } = await meterAiCharged(session.userId, "text", 1, "bulk_description");
  if (blocked) return { kind: "blocked", response: blocked };
  const products = await read(prompt(role, await categoryNames()), small.toString("base64"));
  if (!products.length) {
    await refundAi(session.userId, "text", 1, credits);
    return { kind: "none" };
  }

  const folder: StorageFolder = role === "supplier" ? "supplier-product-images" : "products";
  const items: ReturnType<typeof toItem>[] = [];
  for (const [index, product] of products.entries()) {
    // The photo cut out of the screenshot; without a usable box, the whole screenshot (they can swap it later).
    const area = product.box ? cropRect(product.box, width, height) : { left: 0, top: 0, width, height };
    let url: string;
    try {
      const bytes = await sharp(original)
        .extract(area)
        .resize({ width: BULK_PHOTO_MAX_SIDE, height: BULK_PHOTO_MAX_SIDE, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85, mozjpeg: true })
        .toBuffer();
      url = (await uploadFileServer(folder, new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }))).publicUrl;
    } catch (error) {
      console.error("[bulk] catalogue photo failed", error);
      continue;
    }
    const added = await addPhotoItem(session.id, { clientKey: `${clientKey}:${index}`, fileName: null, url });
    if ("full" in added && added.full) return { kind: "added", items, full: true };
    if (!added.item) continue;
    // The catalogue's own name and price: nothing for Peggy to guess, so she doesn't read the photo again.
    const row = await db.bulkProductItem.update({
      where: { id: added.item.id },
      data: { name: product.name, description: product.description, category: product.category, priceKobo: product.priceKobo, aiState: "done", aiClaimedAt: null },
    });
    items.push(toItem(row));
  }
  await db.bulkProductSession.update({ where: { id: session.id }, data: { updatedAt: new Date() } });
  return { kind: "added", items, full: false };
}
