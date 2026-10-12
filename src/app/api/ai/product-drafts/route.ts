import { NextRequest, NextResponse } from "next/server";
import type { ResponseInputContent } from "openai/resources/responses/responses";
import type { ContentBlockParam } from "@anthropic-ai/sdk/resources/messages";
import { withSeller } from "@/lib/auth/middleware";
import { getAnthropicClient, getOpenAIClient, PEGGY_CLAUDE_MODEL, REX_OPENAI_MODEL } from "@/lib/ai/client";
import { uploadFileServer } from "@/lib/supabase/storage.server";
import { db } from "@/lib/db/client";
import { meterAi } from "@/lib/ai/usage";
import { parseOnboardingMemory } from "@/lib/onboarding-memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// "Snap photos" in seller onboarding: the seller adds product photos, Rex names and prices each one.
// Returns drafts only; the client creates products after the seller has checked them.

const MAX_FILES = 6;
const MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface ProductDraft {
  imageUrl: string;
  name: string;
  /** Naira, whole number. Null when Rex could not suggest one. */
  price: number | null;
  description: string;
  /** Short detail line, e.g. "sizes S to XL". */
  detail: string;
  /** "check" when the seller should confirm the price before going live. */
  confidence: "ok" | "check";
}

type RawDraft = { name?: unknown; price?: unknown; description?: unknown; detail?: unknown; confidence?: unknown };

function nameFromFile(fileName: string) {
  const base = fileName.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return /^(img|image|photo|dsc|pxl|screenshot)\b/i.test(base) || base.length < 2 ? "New product" : base.slice(0, 80);
}

function parseDrafts(raw: string): RawDraft[] {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]) as { products?: unknown };
    return Array.isArray(parsed.products) ? (parsed.products as RawDraft[]) : [];
  } catch {
    return [];
  }
}

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const form = await req.formData().catch(() => null);
  const files = (form?.getAll("files") ?? []).filter((item): item is File => item instanceof File);
  if (!files.length) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Add at least one product photo." } }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: `Add up to ${MAX_FILES} photos at a time.` } }, { status: 400 });
  }
  for (const file of files) {
    if (!IMAGE_TYPES.has(file.type)) {
      return NextResponse.json({ error: { code: "BAD_REQUEST", message: `${file.name} isn't a JPG, PNG or WebP photo.` } }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: { code: "BAD_REQUEST", message: `${file.name} is larger than 10 MB.` } }, { status: 400 });
    }
  }

  // One AI request per photo read; over the limit, nothing is uploaded.
  const limited = await meterAi(user.id, "text", files.length);
  if (limited) return limited;

  const store = await db.store.findUnique({ where: { userId: user.id }, select: { brandSettings: true, city: true } });
  const settings = store?.brandSettings && typeof store.brandSettings === "object" && !Array.isArray(store.brandSettings)
    ? (store.brandSettings as Record<string, unknown>)
    : {};
  const memory = parseOnboardingMemory(settings.onboardingMemory);

  const payloads = await Promise.all(files.map(async (file) => ({ file, base64: Buffer.from(await file.arrayBuffer()).toString("base64") })));

  let uploads: Array<{ publicUrl: string }>;
  try {
    uploads = await Promise.all(files.map((file) => uploadFileServer("products", file)));
  } catch (error) {
    console.error("Product photo upload failed", error);
    return NextResponse.json({ error: { code: "UPLOAD_FAILED", message: "We couldn't save those photos. Try again." } }, { status: 500 });
  }

  const instructions = `You are Rex, Shopinbos' store builder for Nigerian sellers. You get ${files.length} product photo(s), in order.
For each photo, write one product listing a Nigerian online shop could publish today.
Seller context: ${JSON.stringify({ businessDescription: memory?.businessDescription ?? "", category: memory?.category ?? "", city: store?.city ?? "Lagos" })}
Return JSON only: {"products":[{"name":string (2-6 words, no brand you cannot see),"price":integer naira retail price for Lagos or null,"detail":string (under 40 chars, e.g. "sizes S to XL" or a colour),"description":string (2 short sentences, plain English),"confidence":"ok"|"check"}]} with exactly ${files.length} items in photo order.
Use "check" when the price is a rough guess or the item is unclear. Never invent materials or claims you cannot see.`;

  let raw = "";
  try {
    const openai = getOpenAIClient();
    if (openai) {
      const content: ResponseInputContent[] = [{ type: "input_text", text: instructions }];
      for (const item of payloads) content.push({ type: "input_image", detail: "low", image_url: `data:${item.file.type};base64,${item.base64}` });
      const response = await openai.responses.create({ model: REX_OPENAI_MODEL, input: [{ role: "user", content }] }, { timeout: 45_000, maxRetries: 1 });
      raw = response.output_text ?? "";
    } else {
      const anthropic = getAnthropicClient();
      if (anthropic) {
        const content: ContentBlockParam[] = [{ type: "text", text: instructions }];
        for (const item of payloads) {
          content.push({ type: "image", source: { type: "base64", media_type: item.file.type as "image/jpeg" | "image/png" | "image/webp", data: item.base64 } });
        }
        // Claude thinks before answering, so the first block may be thinking: read every text block, with room.
        const response = await anthropic.messages.create(
          { model: PEGGY_CLAUDE_MODEL, max_tokens: 8000, output_config: { effort: "low" }, messages: [{ role: "user", content }] },
          { timeout: 45_000, maxRetries: 1 },
        );
        raw = response.content.map((block) => (block.type === "text" ? block.text : "")).join("");
      }
    }
  } catch (error) {
    // Photos are saved; the seller can still name and price them by hand.
    console.error("Rex product drafting failed", error);
  }

  const drafted = parseDrafts(raw);
  const drafts: ProductDraft[] = files.map((file, index) => {
    const item = drafted[index] ?? {};
    const price = Number(item.price);
    const hasPrice = Number.isFinite(price) && price > 0;
    return {
      imageUrl: uploads[index].publicUrl,
      name: typeof item.name === "string" && item.name.trim() ? item.name.trim().slice(0, 120) : nameFromFile(file.name),
      price: hasPrice ? Math.round(price) : null,
      description: typeof item.description === "string" ? item.description.trim().slice(0, 1000) : "",
      detail: typeof item.detail === "string" ? item.detail.trim().slice(0, 60) : "",
      confidence: !hasPrice || item.confidence === "check" ? "check" : "ok",
    };
  });

  return NextResponse.json({ data: { drafts, drafted: drafted.length > 0 } });
});
