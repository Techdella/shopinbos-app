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
