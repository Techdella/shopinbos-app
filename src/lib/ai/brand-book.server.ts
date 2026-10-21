import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { aiText, firstJsonObject } from "@/lib/ai/text";
import { isOwnImageUrl } from "@/lib/ai/images";
import { loadBrandContext } from "@/lib/ai/brand-context.server";
import { brandContextForAi } from "@shared/brand-context";
import { BrandBookSchema, brandBookProblems, readBrandBook, tidyBrandBook, type BrandBook } from "@shared/brand-book";

// Rex writes the store's brand style book: colours (taken from the logo when there is one), type, voice, logo and
// photo rules. Saved in Store.brandSettings.styleBook; shown and printed at /home/brand-kit/book.

export class BrandBookError extends Error {}

const SHAPE = `{
  "paletteName": "2-4 word name for the palette",
  "tagline": "a short brand line, max 12 words",
  "mission": "1-2 sentences on what the business does for its customers",
  "colours": { "primary": "#RRGGBB main brand colour (buttons, links)", "secondary": "#RRGGBB deep colour for banners", "accent": "#RRGGBB highlight", "background": "#RRGGBB page background, light", "surface": "#RRGGBB cards, near the background", "text": "#RRGGBB body text, dark, readable on the background" },
  "colourNotes": ["3-4 short rules: which colour for what"],
  "typography": { "headings": "a Google font for headings", "body": "a Google font for body text", "style": "serif" or "grotesk", "note": "one line on how to use them" },
  "voice": { "summary": "how the brand sounds, 1-2 sentences", "traits": ["3-4 one-word traits"], "wordsWeUse": ["5-8 words or short phrases"], "wordsWeAvoid": ["4-8 words or phrases to avoid"], "sampleCaption": "an Instagram caption in this voice for one of their real products" },
  "logoRules": ["3-5 rules: clear space, minimum size, backgrounds, don'ts"],
  "photoStyle": ["3-5 rules for product and lifestyle photos"],
  "dos": ["3-5 short do's"],
  "donts": ["3-5 short don'ts"]
}`;

export async function draftBrandBook(storeId: string, direction?: string | null): Promise<BrandBook> {
  const [brand, store] = await Promise.all([
    loadBrandContext(storeId),
    db.store.findUnique({ where: { id: storeId }, select: { logoUrl: true } }),
  ]);
  if (!brand) throw new BrandBookError("The store couldn't be loaded.");
  const logo = store?.logoUrl && isOwnImageUrl(store.logoUrl) ? store.logoUrl : null;
  const system =
    "You are a brand designer for small businesses in Nigeria and across Africa. You write practical, specific brand style books that a seller and a local printer can follow. Plain Nigerian English. Colours must have strong contrast where text sits on them. Never invent awards, certifications or prices. Reply with one JSON object and nothing else.";
  const prompt = [
    `Write the brand style book for this business. Return JSON only, exactly this shape (every key is required; keep to the counts given):\n${SHAPE}`,
    `The business: ${JSON.stringify(brandContextForAi(brand))}`,
    logo ? "The attached image is their logo: take the primary and secondary colours from it and write logo rules that fit it." : "They have no logo yet: choose colours that suit what they sell and who buys.",
    direction ? `The owner asked for: ${direction.slice(0, 400)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  // One retry: the first reply is tidied (long lines, extra items, #abc colours); if parts are still missing
  // or wrong, Rex is told which ones and asked again.
  let problems: string[] = [];
  let lastReply = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await aiText({
      system,
      prompt:
        attempt === 0
          ? prompt
          : `${prompt}\n\nYour last answer was missing or got wrong: ${problems.join(", ")}. Here it is:\n${lastReply.slice(0, 6000)}\n\nReturn the complete JSON object again with every key filled in.`,
      images: logo ? [logo] : undefined,
      // Generous: Claude's thinking counts against it, and a cut-off reply is half a JSON object.
      maxTokens: 12000,
    });
    if (!result) {
      if (attempt === 0) throw new BrandBookError("Rex couldn't write the style book just now. Nothing changed; try again in a moment.");
      break;
    }
    lastReply = result.text;
    const tidied = tidyBrandBook(firstJsonObject(result.text));
    const parsed = BrandBookSchema.safeParse(tidied);
    if (parsed.success) return parsed.data;
    problems = brandBookProblems(tidied);
    console.error("[ai/brand-book] incomplete style book", { attempt, problems });
  }
  throw new BrandBookError("Rex's style book came back incomplete twice. Nothing changed; try again, or add a short direction.");
}

/** Saves the style book on the store (replacing the last one). */
export async function saveBrandBook(storeId: string, book: BrandBook) {
  const store = await db.store.findUnique({ where: { id: storeId }, select: { brandSettings: true } });
  const settings = store?.brandSettings && typeof store.brandSettings === "object" && !Array.isArray(store.brandSettings) ? (store.brandSettings as Record<string, unknown>) : {};
  const saved = { ...book, updatedAt: new Date().toISOString() };
  await db.store.update({ where: { id: storeId }, data: { brandSettings: { ...settings, styleBook: saved } as Prisma.InputJsonValue } });
  return saved;
}

export async function loadBrandBook(storeId: string) {
  const store = await db.store.findUnique({ where: { id: storeId }, select: { brandSettings: true } });
  const settings = store?.brandSettings && typeof store.brandSettings === "object" ? (store.brandSettings as Record<string, unknown>) : {};
  return readBrandBook(settings.styleBook);
}
