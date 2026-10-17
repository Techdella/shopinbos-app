// Product categories (web /home/categories), pure parts so tests/mobile-email-categories.test.mjs can run them.
// Categories are shared by every shop; a shop's own list is the ones its products use, with how many products each
// has (GET /api/store/categories).

export interface CategoryLite {
  id: string;
  name: string;
}

export interface StoreCategory extends CategoryLite {
  slug: string;
  productCount: number;
}

/** The filter chips on the products tab: categories with products, biggest first, then A–Z. */
export function categoryChips<C extends { name: string; productCount: number }>(categories: C[]): C[] {
  return categories.filter((category) => category.productCount > 0).sort((a, b) => b.productCount - a.productCount || a.name.localeCompare(b.name));
}

/**
 * The choices in the product's category picker: the shop's own categories first (A–Z), then every other category
 * (A–Z), each once. A search keeps the names that contain it.
 */
export function categoryOptions(own: CategoryLite[], all: CategoryLite[], q = ""): Array<CategoryLite & { own: boolean }> {
  const seen = new Set<string>();
  const byName = (a: CategoryLite, b: CategoryLite) => a.name.localeCompare(b.name);
  const out: Array<CategoryLite & { own: boolean }> = [];
  const groups: Array<[CategoryLite[], boolean]> = [[[...own].sort(byName), true], [[...all].sort(byName), false]];
  for (const [list, isOwn] of groups) {
    for (const category of list) {
      if (seen.has(category.id)) continue;
      seen.add(category.id);
      out.push({ id: category.id, name: category.name, own: isOwn });
    }
  }
  const needle = q.trim().toLowerCase();
  return needle ? out.filter((category) => category.name.toLowerCase().includes(needle)) : out;
}

/** A new category's name: 2 to 60 characters with at least one letter or number (the server needs that too). */
export function cleanCategoryName(value: string): string | null {
  const name = value.trim().replace(/\s+/g, " ");
  return name.length >= 2 && name.length <= 60 && /[a-z0-9]/i.test(name) ? name : null;
}

/** A category that already has this name (any case), so the seller picks it instead of making a twin. */
export function sameNameCategory<C extends CategoryLite>(categories: C[], name: string): C | null {
  const wanted = name.trim().replace(/\s+/g, " ").toLowerCase();
  return categories.find((category) => category.name.trim().toLowerCase() === wanted) ?? null;
}
