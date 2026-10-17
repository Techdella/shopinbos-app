import { NextRequest } from "next/server";
import Papa from "papaparse";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError } from "@/lib/api/response";
import type { AuthUser } from "@/lib/auth/types";
import { aiConfigured } from "@/lib/ai/client";
import { aiText, firstJsonObject } from "@/lib/ai/text";
import { meterAi } from "@/lib/ai/usage";
import { urlShapeProblem } from "@/lib/security/ssrf";
import { safeFetch } from "@/lib/security/safe-fetch.server";
import { parseImageMap } from "@/lib/products/import.server";
import {
  IMPORT_MAX_ROWS,
  analyseImport,
  columnMapFrom,
  importHeadersProblem,
  isColumnTarget,
  isImageUrl,
  suggestColumnMapping,
  type ColumnMap,
  type ColumnSuggestion,
  type ImportIssue,
} from "@shared/product-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/products/import/analyse — "Let Peggy check and fill in", step one. Form data: csv, imageMap (photos
// uploaded with it, as for the import), columnMap (the seller's column choices, optional). Nothing is saved.
// Reply: { columns, rows, issues, counts, aiColumns }: which product field each column feeds (known names, loose
// guesses, and, with AI, the meaning of the rest), each row as the import would read it, and what looks wrong
// (no price, SKUs used twice or already in the shop, photo links that don't load, …).

type Row = Record<string, string | undefined>;

const LINK_CHECKS = 25;
const LINK_TIMEOUT_MS = 4000;

function parseColumnMap(raw: FormDataEntryValue | null, headers: string[]): ColumnMap | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const parsed = z.record(z.string().max(200), z.string().max(40)).parse(JSON.parse(raw));
    const known = new Set(headers);
    return Object.fromEntries(Object.entries(parsed).filter(([header, target]) => known.has(header) && isColumnTarget(target))) as ColumnMap;
  } catch {
    return null;
  }
}

/** Asks the AI what the columns no rule understood are (one call). Only free fields are taken, and checked. */
async function aiColumnMeanings(userId: string, headers: string[], suggestions: ColumnSuggestion[], sample: Row[]): Promise<ColumnSuggestion[] | null> {
  const unknown = suggestions.filter((s) => s.how === "detail");
  if (!unknown.length || !aiConfigured()) return null;
  if (await meterAi(userId, "text")) return null;
  const taken = new Set(suggestions.filter((s) => s.how !== "detail" && s.target !== "images").map((s) => s.target));
  const examples = unknown.map((s) => `"${s.header}": ${sample.map((row) => JSON.stringify((row[s.header] ?? "").slice(0, 60))).join(", ")}`).join("\n");
  const result = await aiText({
    fast: true,
    system: "You map spreadsheet columns of a shop's product list to product fields. Return JSON only.",
    prompt: [
      `Fields: name, description, retailPrice (selling price), costPrice, compareAtPrice (old / was price), currency, stock (quantity), sku, barcode, status, availability, category, brand, tags, weight, images (photo links or file names), detail (a fact about the product such as colour, size, material), ignored (bookkeeping, not about the product).`,
      `Already used: ${[...taken].join(", ") || "none"}.`,
      `Columns with example values:\n${examples}`,
      'Return {"columns": {"<column>": "<field>"}} for every column above.',
    ].join("\n\n"),
  }).catch(() => null);
  const json = firstJsonObject(result?.text ?? null);
  const columns = json?.columns && typeof json.columns === "object" ? (json.columns as Record<string, unknown>) : null;
  if (!columns) return null;
  let changed = false;
  const out = suggestions.map((s) => {
    if (s.how !== "detail") return s;
    const target = columns[s.header];
    if (!isColumnTarget(target) || target === "detail") return s;
    if (target !== "images" && target !== "ignored" && taken.has(target)) return s;
    if (target !== "images" && target !== "ignored") taken.add(target);
    changed = true;
    return { ...s, target, how: "guessed" as const };
  });
  return changed ? out.filter((s) => headers.includes(s.header)) : null;
}

/** Checks up to LINK_CHECKS photo links really load (public addresses only). Returns the ones that don't. */
async function brokenLinks(urls: string[]): Promise<Set<string>> {
  const broken = new Set<string>();
  const list = [...new Set(urls)].slice(0, LINK_CHECKS);
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const url = list[next++]!;
      try {
        const res = await safeFetch(url, { method: "HEAD", signal: AbortSignal.timeout(LINK_TIMEOUT_MS) });
        await res.body?.cancel().catch(() => undefined);
        // 403 / 405: the host refuses checks like this but may still show the photo.
        if (res.status === 404 || res.status === 410 || res.status >= 500) broken.add(url);
        else if (res.ok && !/^image\//i.test(res.headers.get("content-type") ?? "image/") && !/octet-stream/i.test(res.headers.get("content-type") ?? "")) broken.add(url);
      } catch {
        broken.add(url);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(5, list.length) }, worker));
  return broken;
}

export const POST = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, currency: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const formData = await req.formData();
  const file = formData.get("csv");
  if (!(file instanceof File)) return apiError("BAD_REQUEST", "No CSV file provided");
  if (file.size > 10 * 1024 * 1024) return apiError("BAD_REQUEST", "The file is bigger than 10MB. Split it into smaller files.");
  const imageMap = parseImageMap(formData.get("imageMap"));

  const parsed = Papa.parse<Row>(await file.text(), { header: true, skipEmptyLines: "greedy", transformHeader: (header) => header.replace(/^﻿/, "").trim() });
  const headers = (parsed.meta.fields ?? []).filter(Boolean);
  const rows = parsed.data;
  if (!headers.length || !rows.length) return apiError("BAD_REQUEST", "CSV must have a header row and at least one data row");
  if (rows.length > IMPORT_MAX_ROWS) return apiError("BAD_REQUEST", `CSV has ${rows.length} rows; import at most ${IMPORT_MAX_ROWS} at a time`);

  const chosen = parseColumnMap(formData.get("columnMap"), headers);
  let columns = suggestColumnMapping(headers);
  let aiColumns = false;
  if (!chosen) {
    const ai = await aiColumnMeanings(user.id, headers, columns, rows.slice(0, 3));
    if (ai) {
      columns = ai;
      aiColumns = true;
    }
  } else {
    columns = columns.map((column) => (chosen[column.header] && chosen[column.header] !== column.target ? { ...column, target: chosen[column.header]!, how: "known" as const } : column));
  }
  const columnMap = chosen ?? columnMapFrom(columns);

  // A first read finds the file's SKUs, to look up which are already in the shop.
  const preview = analyseImport(rows, { currency: store.currency || "NGN", columnMap, uploaded: imageMap });
  const fileSkus = [...new Set(preview.rows.flatMap((row) => (row.sku ? [row.sku.trim()] : [])))];
  const existing = fileSkus.length
    ? await db.storeProduct.findMany({ where: { storeId: store.id, status: { not: "archived" }, sku: { in: fileSkus } }, select: { sku: true } })
    : [];
  const analysis = analyseImport(rows, {
    currency: store.currency || "NGN",
    columnMap,
    uploaded: imageMap,
    existingSkus: new Set(existing.flatMap((row) => (row.sku ? [row.sku.trim().toLowerCase()] : []))),
    linkProblem: (url) => urlShapeProblem(url, { httpsOnly: false }),
  });

  // Photo links that are well formed but don't load.
  const uploadedUrls = new Set(imageMap.values());
  const links = analysis.rows.flatMap((row) => row.images.filter((url) => isImageUrl(url) && !uploadedUrls.has(url)));
  const broken = await brokenLinks(links);
  const issues: ImportIssue[] = [...analysis.issues];
  if (broken.size) {
    for (const row of analysis.rows) {
      for (const url of row.images.filter((image) => broken.has(image))) issues.push({ row: row.row, kind: "broken_image_link", value: url.slice(0, 120) });
      row.images = row.images.filter((image) => !broken.has(image));
    }
  }
  issues.sort((a, b) => a.row - b.row);

  return ok({
    headers,
    columns,
    columnMap,
    aiColumns,
    headerProblem: importHeadersProblem(headers, columnMap),
    rows: analysis.rows,
    issues: issues.slice(0, 500),
    issueCount: issues.length,
    counts: analysis.counts,
    linksChecked: Math.min(new Set(links).size, LINK_CHECKS),
  });
});
