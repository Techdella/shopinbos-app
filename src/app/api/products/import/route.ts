import { NextRequest } from "next/server";
import Papa from "papaparse";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError } from "@/lib/api/response";
import type { AuthUser } from "@/lib/auth/types";
import { markCatalogDirty } from "@/lib/whatsapp-catalog/dirty";
import { urlShapeProblem } from "@/lib/security/ssrf";
import {
  IMPORT_MAX_IMAGE_FILES,
  IMPORT_MAX_ROWS,
  imageFileKey,
  importHeadersProblem,
  isImageUrl,
  mapImportRow,
} from "@shared/product-import";

type ProductImportRow = Record<string, string | undefined>;

/** Photos uploaded with the CSV (through /api/upload), as { "file-name.jpg": "https://…" }. */
function parseImageMap(raw: FormDataEntryValue | null) {
  const map = new Map<string, string>();
  if (typeof raw !== "string" || !raw) return map;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return map;
  }
  if (!parsed || typeof parsed !== "object") return map;
  for (const [name, url] of Object.entries(parsed as Record<string, unknown>).slice(0, IMPORT_MAX_IMAGE_FILES)) {
    if (typeof url === "string" && !urlShapeProblem(url, { httpsOnly: true })) map.set(imageFileKey(name), url);
  }
  return map;
}

/** "Ankara Tote Bag" → "ankara-tote-bag", to match a photo named after the product. */
function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export const POST = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, currency: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const formData = await req.formData();
  const file = formData.get("csv") as File | null;
  if (!file) return apiError("BAD_REQUEST", "No CSV file provided");
  const imageMap = parseImageMap(formData.get("imageMap"));

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
  const headerProblem = importHeadersProblem(parsed.meta.fields ?? []);
  if (headerProblem) return apiError("BAD_REQUEST", headerProblem);

  // Photos not named in any row can still match a row by SKU or product name ("ankara-tote.jpg").
  const byStem = new Map<string, string>();
  for (const [name, url] of imageMap) byStem.set(slug(name.replace(/\.[a-z0-9]+$/, "")), url);

  let imported = 0;
  let withImages = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rowLabel = `Row ${i + 2}`;
    const product = mapImportRow(rows[i] ?? {}, store.currency || "NGN");
    if ("error" in product) {
      errors.push(`${rowLabel}: ${product.error}`);
      continue;
    }

    const images: string[] = [];
    for (const ref of product.imageRefs) {
      if (isImageUrl(ref)) {
        if (urlShapeProblem(ref, { httpsOnly: false })) errors.push(`${rowLabel}: skipped photo link "${ref.slice(0, 80)}"`);
        else images.push(ref);
        continue;
      }
      const uploaded = imageMap.get(imageFileKey(ref));
      if (uploaded) images.push(uploaded);
      else errors.push(`${rowLabel}: photo "${ref.slice(0, 80)}" wasn't among the uploaded photos`);
    }
    if (product.imageRefs.length === 0) {
      const match = (product.sku && byStem.get(slug(product.sku))) || byStem.get(slug(product.name));
      if (match) images.push(match);
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
          currency: product.currency,
          currentStock: product.currentStock,
          sku: product.sku,
          barcode: product.barcode,
          weight: product.weight,
          status: product.status,
          visibility: product.status === "published" ? "storefront" : "hidden",
          tags: product.tags,
          specifications: product.specifications,
          images,
        },
      });
      imported++;
      if (images.length) withImages++;
    } catch (e: any) {
      errors.push(`${rowLabel}: ${e?.message ?? "error"}`);
    }
  }

  if (imported) await markCatalogDirty(store.id);
  return ok({ imported, withImages, errors });
});
