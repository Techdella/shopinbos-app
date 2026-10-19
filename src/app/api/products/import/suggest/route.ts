import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError } from "@/lib/api/response";
import type { AuthUser } from "@/lib/auth/types";
import { aiConfigured } from "@/lib/ai/client";
import { meterAi } from "@/lib/ai/usage";
import { urlShapeProblem } from "@/lib/security/ssrf";
import { categoryNamesFor } from "@/lib/products/categories.server";
import { contentCallCount, suggestProductContent } from "@/lib/products/content-ai.server";
import { CONTENT_BATCH, CONTENT_FIELDS, ruleBasedContent, toEnhancement } from "@shared/product-content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

// POST /api/products/import/suggest — "Let Peggy check and fill in", step two, one small batch at a time (the import
// screen sends the file's products in batches and shows progress). Body: { products: [{ name, description,
// category, price, tags, specifications, imageUrl }] (at most CONTENT_BATCH), usePhotos }. Reply: { suggestions
// (one per product, in order), source: "ai" | "rules", limited }. Nothing is saved; the seller accepts or edits
// each suggestion before importing. Without AI, or past the day's AI allowance, the rule-based fill answers.

const Body = z
  .object({
    products: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(200),
            description: z.string().max(5000).nullable().optional(),
            category: z.string().max(100).nullable().optional(),
            price: z.number().min(0).max(1_000_000_000).nullable().optional(),
            tags: z.array(z.string().max(60)).max(30).optional(),
            specifications: z.array(z.object({ name: z.string().max(100), value: z.string().max(500) })).max(40).optional(),
            imageUrl: z.string().max(2000).nullable().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(CONTENT_BATCH),
    usePhotos: z.boolean().optional(),
  })
  .strict();

export const POST = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Send the products to check.");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  // Photos go to the AI only when they are public https links.
  const items = parsed.data.products.map((item) => ({
    ...item,
    imageUrl: item.imageUrl && /^https:\/\//.test(item.imageUrl) && !urlShapeProblem(item.imageUrl, { httpsOnly: true }) ? item.imageUrl : null,
  }));
  const usePhotos = parsed.data.usePhotos !== false;

  const rules = () => items.map((item) => toEnhancement(ruleBasedContent(item, CONTENT_FIELDS)));
  if (!aiConfigured()) return ok({ suggestions: rules(), source: "rules", limited: false });
  if (await meterAi(user.id, "text", contentCallCount(items, usePhotos))) return ok({ suggestions: rules(), source: "rules", limited: true });

  const categories = await categoryNamesFor(store.id);
  const result = await suggestProductContent(items, { storeName: store.name, fields: CONTENT_FIELDS, categories, usePhotos });
  return ok({ suggestions: result.suggestions.map(toEnhancement), source: result.source, limited: false });
});
