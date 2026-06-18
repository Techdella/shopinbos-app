import { NextRequest } from "next/server";
import Papa from "papaparse";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError } from "@/lib/api/response";
import type { AuthUser } from "@/lib/auth/types";

type ProductImportRow = Record<string, string | undefined>;

function normalized(row: ProductImportRow) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key.trim().toLowerCase(), value?.trim() ?? ""]),
  ) as Record<string, string>;
}

export const POST = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const formData = await req.formData();
  const file = formData.get("csv") as File | null;
  if (!file) return apiError("BAD_REQUEST", "No CSV file provided");

  const text = await file.text();
  const parsed = Papa.parse<ProductImportRow>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim().toLowerCase(),
  });

  if (parsed.errors.length > 0) {
    return apiError("BAD_REQUEST", `CSV parse error: ${parsed.errors[0]?.message ?? "invalid CSV"}`);
  }

  const rows = parsed.data.map(normalized);
  if (rows.length === 0) return apiError("BAD_REQUEST", "CSV must have a header row and at least one data row");

  const first = rows[0] ?? {};
  if (!("name" in first) || !("retailprice" in first)) {
    return apiError("BAD_REQUEST", "CSV must have at least 'name' and 'retailPrice' columns");
  }

  let imported = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? {};
    const name = row.name;
    const retailPrice = parseFloat(row.retailprice ?? "");

    if (!name || isNaN(retailPrice)) {
      errors.push(`Row ${i + 2}: missing name or invalid retailPrice`);
      continue;
    }

    try {
      await db.storeProduct.create({
        data: {
          storeId: store.id,
          userId: user.id,
          name,
          description: row.description || null,
          retailPrice,
          costPrice: row.costprice ? parseFloat(row.costprice) || null : null,
          status: row.status || "draft",
          images: [],
          currency: "NGN",
        },
      });
      imported++;
    } catch (e: any) {
      errors.push(`Row ${i + 2}: ${e?.message ?? "error"}`);
    }
  }

  return ok({ imported, errors });
});
