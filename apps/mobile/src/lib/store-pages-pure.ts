// Pure helpers for Store pages on the phone (lib/store-pages.ts); unit-tested in tests/mobile-store-pages.test.mjs.

/** "New arrivals!" → "new-arrivals" (the server wants lowercase letters, numbers and dashes), with a short tail so it's unique. */
export function collectionSlug(name: string, random = Math.random) {
  const base = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "collection";
  return `${base}-${Math.floor(random() * 36 ** 4).toString(36).padStart(4, "0")}`;
}
