import "server-only";
import type { ContentBlockParam } from "@anthropic-ai/sdk/resources/messages";
import type { ResponseInputContent } from "openai/resources/responses/responses";
import { db } from "@/lib/db/client";
import { aiConfigured, CLAUDE_FAST_MODEL, getAnthropicClient, getOpenAIClient, providerOrder, REX_OPENAI_MODEL } from "@/lib/ai/client";
import { meterAi } from "@/lib/ai/usage";
import { uploadFileServer, type StorageFolder } from "@/lib/supabase/storage.server";
import { BULK_PHOTO_MAX_SIDE, BULK_VISION_BATCH, nextAsk, summarize, type BulkEvent, type BulkRole } from "@shared/bulk-products";
import { appendEvents, newEventId, sessionItems, threadOf } from "./session.server";

// Peggy looking at the photos: server-side, BULK_VISION_BATCH products per call, each product's first photo at 512px
// ("low" detail), so 200 photos are 20 small calls. The client asks for the next batch while any are waiting, so the
// first drafts show up (and can be priced) while the rest are still being read. Never sets a price: the guessed
// range is a hint. With no AI configured, over the daily cap or out of credits, the items stay blank drafts.

const STALE_MS = 3 * 60_000;
const AI_SIDE = 512;
export const BULK_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
export const BULK_PHOTO_MAX_BYTES = 15 * 1024 * 1024;

type Sharp = (typeof import("sharp"))["default"];
async function loadSharp(): Promise<Sharp | null> {
  try {
    return (await import("sharp")).default;
  } catch {
    return null;
  }
}

/**
 * Stores one product photo: turned the right way up and resized to BULK_PHOTO_MAX_SIDE as a JPEG (phones send
 * full-size photos; the browser has already made them small). Falls back to the file as sent when it can't be read.
 */
export async function storeBulkPhoto(file: File, role: BulkRole) {
  const folder: StorageFolder = role === "supplier" ? "supplier-product-images" : "products";
  const sharp = await loadSharp();
  if (sharp) {
    try {
      const bytes = await sharp(Buffer.from(await file.arrayBuffer()))
        .rotate()
        .resize({ width: BULK_PHOTO_MAX_SIDE, height: BULK_PHOTO_MAX_SIDE, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();
      return await uploadFileServer(folder, new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }));
    } catch (error) {
      console.error("[bulk] resize failed; storing the photo as sent", error);
    }
  }
  return uploadFileServer(folder, file);
}

/** A 512px JPEG of a stored photo, as base64, for the vision call. */
async function smallPhoto(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    const sharp = await loadSharp();
    if (!sharp) return bytes.byteLength < 1_500_000 ? bytes.toString("base64") : null;
    const small = await sharp(bytes).rotate().resize({ width: AI_SIDE, height: AI_SIDE, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer();
    return small.toString("base64");
  } catch {
    return null;
  }
}

interface Drafted {
  i?: unknown;
  name?: unknown;
  description?: unknown;
  category?: unknown;
  priceLow?: unknown;
  priceHigh?: unknown;
  lookKey?: unknown;
  colour?: unknown;
}

export function readVisionJson(raw: string): Drafted[] {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]) as { products?: unknown };
    return Array.isArray(parsed.products) ? (parsed.products as Drafted[]) : [];
  } catch {
    return [];
  }
}

const text = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");
const naira = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n < 100_000_000 ? Math.round(n) * 100 : null;
};

async function categoryNames() {
  const rows = await db.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { name: true }, take: 60 }).catch(() => []);
  return rows.map((row) => row.name);
}

async function callVision(prompt: string, photos: string[]): Promise<string> {
  for (const provider of providerOrder()) {
    try {
      if (provider === "openai") {
        const openai = getOpenAIClient();
        if (!openai) continue;
        const content: ResponseInputContent[] = [{ type: "input_text", text: prompt }];
        for (const photo of photos) content.push({ type: "input_image", detail: "low", image_url: `data:image/jpeg;base64,${photo}` });
        const response = await openai.responses.create({ model: REX_OPENAI_MODEL, input: [{ role: "user", content }] }, { timeout: 50_000, maxRetries: 1 });
        return response.output_text ?? "";
      }
      const anthropic = getAnthropicClient();
      if (!anthropic) continue;
      const content: ContentBlockParam[] = [{ type: "text", text: prompt }];
      for (const photo of photos) content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: photo } });
      const response = await anthropic.messages.create({ model: CLAUDE_FAST_MODEL, max_tokens: 4000, messages: [{ role: "user", content }] }, { timeout: 50_000, maxRetries: 1 });
      return response.content.map((block) => (block.type === "text" ? block.text : "")).join("");
    } catch (error) {
      console.error(`[bulk] vision on ${provider} failed`, error);
    }
  }
  return "";
}

/**
 * Takes the next batch of waiting items (claimed with a token, so two calls never read the same photos), drafts them
 * and says how many are still waiting. Adds Peggy's first message after the first batch, and a summary once a big
 * session has all been read.
 */
export async function draftNextBatch(session: { id: string; userId: string; role: string }) {
  const token = `working:${newEventId()}`;
  const stale = new Date(Date.now() - STALE_MS);
  const waiting = await db.bulkProductItem.findMany({
    where: { sessionId: session.id, removed: false, productId: null, OR: [{ aiState: "pending" }, { aiState: { startsWith: "working" }, aiClaimedAt: { lt: stale } }] },
    orderBy: { number: "asc" },
    take: BULK_VISION_BATCH,
    select: { id: true },
  });
  if (waiting.length) {
    await db.bulkProductItem.updateMany({
      where: { id: { in: waiting.map((row) => row.id) }, OR: [{ aiState: "pending" }, { aiState: { startsWith: "working" }, aiClaimedAt: { lt: stale } }] },
      data: { aiState: token, aiClaimedAt: new Date() },
    });
  }
  const batch = await db.bulkProductItem.findMany({ where: { sessionId: session.id, aiState: token }, orderBy: { number: "asc" } });
  let capped = false;
  let usedAi = false;

  if (batch.length) {
    const role: BulkRole = session.role === "supplier" ? "supplier" : "seller";
    // One AI use per photo; over the daily cap or out of credits, nothing is read and the drafts stay blank.
    const blocked = aiConfigured() ? await meterAi(session.userId, "text", batch.length, "bulk_description") : null;
    capped = Boolean(blocked);
    const drafted = new Map<string, Drafted>();
    if (aiConfigured() && !blocked) {
      const photos = await Promise.all(batch.map((row) => smallPhoto(row.photos[0] ?? "")));
      const readable = batch.map((row, index) => ({ row, photo: photos[index] })).filter((entry): entry is { row: typeof entry.row; photo: string } => Boolean(entry.photo));
      if (readable.length) {
        const categories = await categoryNames();
        const prompt = `You are Peggy, the shop assistant on Shopinbos, for ${role === "supplier" ? "a Nigerian wholesale supplier" : "a Nigerian online seller"}. You get ${readable.length} product photo(s), in order, one product each.
For each photo return what a shopper would call it. Return JSON only:
{"products":[{"i":number (1-based photo order),"name":string (2-5 words, e.g. "Black leather handbag"; no brand you cannot read),"description":string (one line under 110 characters, plain English, only what you can see),"category":string (one of: ${categories.slice(0, 40).join(", ") || "Fashion, Beauty, Food, Electronics, Home"}; else a short plural like "Bags"),"priceLow":integer naira or null,"priceHigh":integer naira or null (a typical ${role === "supplier" ? "wholesale" : "retail"} range in Lagos, a rough hint only),"lookKey":string (lowercase-hyphenated item kind WITHOUT colour, the same for photos of the same item, e.g. "leather-tote-bag"),"colour":string (main colour, one word, or "")}]}
Never invent materials, sizes or claims you cannot see.`;
        const raw = await callVision(prompt, readable.map((entry) => entry.photo));
        const list = readVisionJson(raw);
        usedAi = list.length > 0;
        list.forEach((entry, index) => {
          const position = Number(entry.i) >= 1 ? Number(entry.i) - 1 : index;
          const target = readable[position];
          if (target) drafted.set(target.row.id, entry);
        });
      }
    }
    await Promise.all(
      batch.map((row) => {
        const entry = drafted.get(row.id);
        if (!entry) return db.bulkProductItem.updateMany({ where: { id: row.id, aiState: token }, data: { aiState: "skipped", aiClaimedAt: null } });
        const low = naira(entry.priceLow);
        const high = naira(entry.priceHigh);
        return db.bulkProductItem.updateMany({
          where: { id: row.id, aiState: token },
          data: {
            aiState: "done",
            aiClaimedAt: null,
            // The person's own words win: Peggy only fills what is still empty.
            ...(row.name ? {} : { name: text(entry.name, 120) }),
            ...(row.description ? {} : { description: text(entry.description, 300) }),
            ...(row.category ? {} : { category: text(entry.category, 60) }),
            hintLowKobo: low && high ? Math.min(low, high) : low ?? high,
            hintHighKobo: low && high ? Math.max(low, high) : high ?? low,
            lookKey: text(entry.lookKey, 80).toLowerCase().replace(/[^a-z0-9-]+/g, "-") || null,
            colour: text(entry.colour, 30).toLowerCase() || null,
          },
        });
      }),
    );
  }

  const pending = await db.bulkProductItem.count({ where: { sessionId: session.id, removed: false, productId: null, OR: [{ aiState: "pending" }, { aiState: { startsWith: "working" } }] } });
  if (batch.length) {
    const fresh = await db.bulkProductSession.findUnique({ where: { id: session.id }, select: { thread: true } });
    const kinds = new Set(threadOf({ thread: fresh?.thread ?? [] }).map((event) => event.kind));
    const items = await sessionItems(session.id);
    const at = new Date().toISOString();
    const events: BulkEvent[] = [];
    if (capped && !kinds.has("capped")) events.push({ id: newEventId(), at, from: "peggy", kind: "capped" });
    if (!kinds.has("intro")) events.push({ id: newEventId(), at, from: "peggy", kind: "intro", numbers: batch.map((row) => row.number), ai: usedAi, summary: summarize(items), ask: nextAsk(items) });
    else if (!pending && items.length > BULK_VISION_BATCH && !kinds.has("allSeen")) events.push({ id: newEventId(), at, from: "peggy", kind: "allSeen", summary: summarize(items), ask: nextAsk(items) });
    await appendEvents(session.id, events);
  }
  return { drafted: batch.length, pending, capped };
}
