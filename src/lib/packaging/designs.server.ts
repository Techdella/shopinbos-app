import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { uploadFileServer } from "@/lib/supabase/storage.server";
import { cleanDesign, type PackDesign } from "@shared/packaging";

// Saved designs on Labels and print (/home/labels): packaging from the designer or Rex, and Print studio setups
// (labels, tags, stickers) from the studio or Rex. Everything is scoped to the seller's store.

export type DesignKind = "packaging" | "label";

export interface DesignSummary {
  id: string;
  kind: DesignKind;
  format: string | null;
  title: string;
  previewUrl: string | null;
  source: string;
  href: string;
  updatedAt: string;
}

export function designHref(row: { id: string; kind: string; data: unknown }) {
  if (row.kind === "packaging") return `/home/labels/packaging?design=${row.id}`;
  const href = (row.data as { href?: unknown } | null)?.href;
  return typeof href === "string" && href.startsWith("/home/labels/studio") ? href : "/home/labels/studio";
}

export async function listDesigns(storeId: string, take = 60): Promise<DesignSummary[]> {
  const rows = await db.printDesign.findMany({ where: { storeId }, orderBy: { updatedAt: "desc" }, take });
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind === "packaging" ? "packaging" : "label",
    format: row.format,
    title: row.title,
    previewUrl: row.previewUrl,
    source: row.source,
    href: designHref(row),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function loadPackagingDesign(storeId: string, id: string) {
  const row = await db.printDesign.findFirst({ where: { id, storeId, kind: "packaging" } });
  return row ? { id: row.id, title: row.title, design: cleanDesign(row.data), previewUrl: row.previewUrl, source: row.source } : null;
}

export async function savePackagingDesign(input: { storeId: string; userId: string; id?: string | null; title: string; design: PackDesign; source?: "studio" | "rex" }) {
  const design = cleanDesign(input.design);
  const data = {
    title: input.title.trim().slice(0, 80) || "Packaging design",
    format: design.format,
    productId: design.productId,
    data: design as unknown as Prisma.InputJsonValue,
  };
  if (input.id) {
    const existing = await db.printDesign.findFirst({ where: { id: input.id, storeId: input.storeId }, select: { id: true } });
    if (existing) return db.printDesign.update({ where: { id: existing.id }, data });
  }
  return db.printDesign.create({ data: { ...data, kind: "packaging", storeId: input.storeId, userId: input.userId, source: input.source ?? "studio" } });
}

/** A Print studio setup (Rex's make_print_labels, or the studio's Save): the link that reopens it. */
export async function saveLabelDesign(input: { storeId: string; userId: string; title: string; kind: string; href: string; productId?: string | null; source?: "studio" | "rex" }) {
  return db.printDesign.create({
    data: {
      storeId: input.storeId,
      userId: input.userId,
      kind: "label",
      format: input.kind,
      title: input.title.trim().slice(0, 80) || "Labels",
      productId: input.productId ?? null,
      data: { href: input.href },
      source: input.source ?? "studio",
    },
  });
}

/** Stores the designer's thumbnail (a PNG from the browser) and points the design at it. */
export async function saveDesignPreview(storeId: string, id: string, file: File) {
  const row = await db.printDesign.findFirst({ where: { id, storeId }, select: { id: true } });
  if (!row) return null;
  if (file.type !== "image/png" && file.type !== "image/jpeg" && file.type !== "image/webp") throw new Error("Previews are PNG, JPG or WebP pictures.");
  if (file.size > 3 * 1024 * 1024) throw new Error("That preview is too large.");
  const stored = await uploadFileServer("brand", file, `designs/${storeId}/${id}-${Date.now()}.${file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg"}`);
  return db.printDesign.update({ where: { id: row.id }, data: { previewUrl: stored.publicUrl } });
}

export async function deleteDesign(storeId: string, id: string) {
  const result = await db.printDesign.deleteMany({ where: { id, storeId } });
  return result.count > 0;
}
