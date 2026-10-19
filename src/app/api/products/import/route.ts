import { NextRequest } from "next/server";
import Papa from "papaparse";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError } from "@/lib/api/response";
import type { AuthUser } from "@/lib/auth/types";
import { markCatalogDirty } from "@/lib/whatsapp-catalog/dirty";
import { urlShapeProblem } from "@/lib/security/ssrf";
import { findOrCreateCategory } from "@/lib/products/categories.server";
import { parseImageMap } from "@/lib/products/import.server";
import { IMPORT_MAX_ROWS, importHeadersProblem, isColumnTarget, mapImportRow, resolveImportImages, type ColumnMap } from "@shared/product-import";
import { ImportEnhancementsSchema, mergeEnhancement, type ImportEnhancement } from "@shared/product-content";
import { trackProductAdded } from "@/lib/platform-analytics/seller-events.server";

type ProductImportRow = Record<string, string | undefined>;

// POST /api/products/import — form data: csv, imageMap (photos uploaded with it), and after "Let Peggy check and
// fill in": columnMap (which product field each column feeds) and enhancements ({ "<row index>": the description,
// category, type, specs, tags, SEO, FAQs and care the seller accepted }). Without those two it imports exactly as
// before. Everything is saved in the signed-in seller's own store.

function parseColumnMap(raw: FormDataEntryValue | null): ColumnMap | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const parsed = z.record(z.string().max(200), z.string().max(40)).parse(JSON.parse(raw));
    return Object.fromEntries(Object.entries(parsed).filter(([, target]) => isColumnTarget(target))) as ColumnMap;
  } catch {
    return null;
  }
}

function parseEnhancements(raw: FormDataEntryValue | null): Record<string, ImportEnhancement> | { error: string } {
  if (typeof raw !== "string" || !raw) return {};
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { error: "Peggy's changes couldn't be read. Try again." };
  }
  const parsed = ImportEnhancementsSchema.safeParse(json);
  if (!parsed.success) return { error: `Peggy's changes are not valid: ${parsed.error.issues[0]?.message ?? "check them"}` };
  return parsed.data;
}

export const POST = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, currency: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const formData = await req.formData();
  const file = formData.get("csv") as File | null;
  if (!file) return apiError("BAD_REQUEST", "No CSV file provided");
  const imageMap = parseImageMap(formData.get("imageMap"));
  const columnMap = parseColumnMap(formData.get("columnMap"));
  const enhancements = parseEnhancements(formData.get("enhancements"));
  if ("error" in enhancements && typeof enhancements.error === "string") return apiError("BAD_REQUEST", enhancements.error);
  const accepted = enhancements as Record<string, ImportEnhancement>;

  const text = await file.text();
  const parsed = Papa.parse<ProductImportRow>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.replace(/^﻿/, "").trim(),
  });

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    return apiError("BAD_REQUEST", `CSV parse error: ${parsed.errors[0]?.message ?? "invalid CSV"}`);
  }

  const rows = parsed.data;
  if (rows.length === 0) return apiError("BAD_REQUEST", "CSV must have a header row and at least one data row");
  if (rows.length > IMPORT_MAX_ROWS) return apiError("BAD_REQUEST", `CSV has ${rows.length} rows; import at most ${IMPORT_MAX_ROWS} at a time`);
  const headerProblem = importHeadersProblem(parsed.meta.fields ?? [], columnMap);
  if (headerProblem) return apiError("BAD_REQUEST", headerProblem);

  let imported = 0;
  let withImages = 0;
  let enhanced = 0;
  const errors: string[] = [];
  // Checkout always charges in the store's currency, so products are priced in it too.
  const storeCurrency = store.currency || "NGN";
  const otherCurrencies = new Set<string>();
  const categories = new Map<string, string | null>();

  for (let i = 0; i < rows.length; i++) {
    const rowLabel = `Row ${i + 2}`;
    const mapped = mapImportRow(rows[i] ?? {}, storeCurrency, columnMap);
    if ("error" in mapped) {
      errors.push(`${rowLabel}: ${mapped.error}`);
      continue;
    }
    const product = mergeEnhancement(mapped, accepted[String(i)]);

    const photos = resolveImportImages(product, imageMap, (url) => urlShapeProblem(url, { httpsOnly: false }));
    for (const link of photos.badLinks) errors.push(`${rowLabel}: skipped photo link "${link.slice(0, 80)}"`);
    for (const name of photos.missingFiles) errors.push(`${rowLabel}: photo "${name.slice(0, 80)}" wasn't among the uploaded photos`);
    const images = photos.images;

    let categoryId: string | null = null;
    if (product.categoryName) {
      const category = await findOrCreateCategory(product.categoryName, categories).catch(() => null);
      categoryId = category?.id ?? null;
    }

    try {
      await db.storeProduct.create({
        data: {
          storeId: store.id,
          userId: user.id,
          name: product.name,
          description: product.description,
          retailPrice: product.retailPrice,
          costPrice: product.costPrice,
          compareAtPrice: product.compareAtPrice,
          currency: storeCurrency,
          currentStock: product.currentStock,
          trackStock: product.trackStock,
          sku: product.sku,
          barcode: product.barcode,
          weight: product.weight,
          status: product.status,
          visibility: product.status === "published" ? "storefront" : "hidden",
          tags: product.tags,
          specifications: product.specifications,
          images,
          ...(categoryId ? { categoryId } : {}),
          ...(product.extra as Partial<Prisma.StoreProductUncheckedCreateInput>),
        },
      });
      imported++;
      if (images.length) withImages++;
      if (accepted[String(i)]) enhanced++;
      if (product.currency !== storeCurrency) otherCurrencies.add(product.currency);
    } catch (e: any) {
      errors.push(`${rowLabel}: ${e?.message ?? "error"}`);
    }
  }

  const notices: string[] = [];
  if (otherCurrencies.size) {
    notices.push(`Prices in ${[...otherCurrencies].join(", ")} were imported as ${storeCurrency} amounts, the currency your store sells in. Check them before going live.`);
  }

  if (imported) await markCatalogDirty(store.id);
  if (imported) trackProductAdded({ userId: user.id, source: "csv_import", count: imported });
  return ok({ imported, withImages, enhanced, errors, notices });
});
