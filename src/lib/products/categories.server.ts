import "server-only";
import { db } from "@/lib/db/client";
import { categorySlug } from "@shared/product-bulk-edit";

// Shop categories by name, for Peggy and the bulk import: an existing category with the same name (any case) or
// slug is reused, otherwise one is made the same way the product form's "New category" does (POST
// /api/app/categories).

/** Category names worth offering the AI: the ones this store already uses first, then the common ones. */
export async function categoryNamesFor(storeId: string, take = 60): Promise<string[]> {
  const used = await db.storeProduct
    .findMany({ where: { storeId, categoryId: { not: null } }, select: { category: { select: { name: true } } }, distinct: ["categoryId"], take })
    .catch(() => [] as Array<{ category: { name: string } | null }>);
  const names = used.map((row) => row.category?.name).filter((name): name is string => Boolean(name));
  if (names.length < take) {
    const common = await db.category.findMany({ where: { parentId: null }, select: { name: true }, orderBy: { sortOrder: "asc" }, take: take - names.length }).catch(() => []);
    for (const row of common) if (!names.some((name) => name.toLowerCase() === row.name.toLowerCase())) names.push(row.name);
  }
  return names.slice(0, take);
}

/** The category called `name` (any case) or with its slug; null when there is none. Never creates one. */
export async function findCategoryByName(name: string): Promise<{ id: string; name: string } | null> {
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 60);
  const slug = categorySlug(clean);
  if (!slug) return null;
  return (
    (await db.category.findFirst({ where: { name: { equals: clean, mode: "insensitive" } }, select: { id: true, name: true } })) ??
    (await db.category.findUnique({ where: { slug }, select: { id: true, name: true } }))
  );
}

/** The id of the category called `name`, made when there is none. Null for a name with no letters or numbers. */
export async function findOrCreateCategory(name: string, cache?: Map<string, string | null>): Promise<{ id: string; name: string; created: boolean } | null> {
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 60);
  const base = categorySlug(clean);
  if (!base || clean.length < 2) return null;
  const key = clean.toLowerCase();
  if (cache?.has(key)) {
    const id = cache.get(key);
    return id ? { id, name: clean, created: false } : null;
  }
  const existing = await findCategoryByName(clean);
  if (existing) {
    cache?.set(key, existing.id);
    return { id: existing.id, name: existing.name, created: false };
  }
  let slug = base;
  for (let n = 2; await db.category.findUnique({ where: { slug }, select: { id: true } }); n++) slug = `${base}-${n}`;
  const created = await db.category.create({ data: { name: clean, slug }, select: { id: true, name: true } });
  cache?.set(key, created.id);
  return { id: created.id, name: created.name, created: true };
}
