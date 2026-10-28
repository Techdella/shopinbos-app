import "server-only";
import { urlShapeProblem } from "@/lib/security/ssrf";
import { IMPORT_MAX_IMAGE_FILES, imageFileKey } from "@shared/product-import";

// Shared by the bulk product import (POST /api/products/import) and Peggy's check of the file before it
// (POST /api/products/import/analyse).

/** Photos uploaded with the CSV (through /api/upload), as { "file-name.jpg": "https://…" } → file key → url. */
export function parseImageMap(raw: FormDataEntryValue | null) {
  const map = new Map<string, string>();
  if (typeof raw !== "string" || !raw) return map;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return map;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return map;
  for (const [name, url] of Object.entries(parsed as Record<string, unknown>).slice(0, IMPORT_MAX_IMAGE_FILES)) {
    if (typeof url === "string" && !urlShapeProblem(url, { httpsOnly: true })) map.set(imageFileKey(name), url);
  }
  return map;
}

/**
 * Adds the photos this person uploaded with "Add many with Peggy" (their recent sessions) to the sheet's photo map, by
 * file name, so a row naming "IMG_2041.jpg" finds the photo already uploaded from the phone. Photos sent with the sheet
 * win over these.
 */
export async function withBulkPhotos(userId: string, map: Map<string, string>) {
  const { db } = await import("@/lib/db/client");
  const rows = await db.bulkProductItem
    .findMany({
      where: { session: { userId, updatedAt: { gt: new Date(Date.now() - 30 * 24 * 3600_000) } }, fileName: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 1000,
      select: { fileName: true, photos: true },
    })
    .catch(() => []);
  for (const row of rows) {
    const key = row.fileName ? imageFileKey(row.fileName) : "";
    if (key && row.photos[0] && !map.has(key)) map.set(key, row.photos[0]);
  }
  return map;
}
