import "server-only";

import { db } from "@/lib/db/client";
import { readStoreLook, toHex6 } from "@/app/home/store/look";
import { parseBrandSettings } from "@/lib/workspace";
import { naira } from "@shared/onboarding";
import type { BrandContext } from "@shared/brand-context";

// The seller's brand for Rex and Peggy: Brand kit (logo, colours), onboarding answers (business, customers,
// feel) and the catalogue (categories, best sellers). Pure helpers live in shared/brand-context.ts.

function text(value: unknown, max = 400) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

export async function loadBrandContext(storeId: string): Promise<BrandContext | null> {
  const [store, products, productCount] = await Promise.all([
    db.store.findUnique({ where: { id: storeId }, select: { name: true, description: true, logoUrl: true, city: true, country: true, brandSettings: true, status: true } }),
    db.storeProduct
      .findMany({
        where: { storeId, status: { not: "archived" } },
        orderBy: [{ soldStock: "desc" }, { createdAt: "desc" }],
        take: 200,
        select: { id: true, name: true, retailPrice: true, images: true, soldStock: true, category: { select: { name: true } } },
      })
      .catch(() => []),
    db.storeProduct.count({ where: { storeId, status: { not: "archived" } } }).catch(() => 0),
  ]);
  if (!store) return null;

  const settings = parseBrandSettings(store.brandSettings);
  const memory = settings.onboardingMemory;
  const tokens = readStoreLook(store).tokens;

  const counts = new Map<string, number>();
  for (const product of products) {
    const name = product.category?.name?.trim();
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  return {
    storeName: store.name,
    business: text(memory?.businessDescription) ?? text(store.description),
    category: text(memory?.category, 80),
    location: [store.city, store.country].filter(Boolean).join(", ") || null,
    logoUrl: store.logoUrl || memory?.uploadedLogoUrl || memory?.logo?.url || null,
    colours: tokens
      ? {
          accent: toHex6(tokens.accent, "#FF6A2B"),
          ink: toHex6(tokens.ink, "#16141F"),
          paper: toHex6(tokens.paperBg, "#F6F5F9"),
          button: toHex6(tokens.ctaBg, toHex6(tokens.accent, "#FF6A2B")),
          hero: toHex6(tokens.heroBg, "#16141F"),
        }
      : null,
    paletteName: text(memory?.palette?.name, 60),
    headingStyle: tokens?.headingStyle ?? null,
    audience: text(memory?.customerProfile?.who, 240),
    vibe: text(memory?.customerProfile?.vibe, 240) ?? text(memory?.palette?.vibe, 160),
    categories: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, count]) => ({ name, products: count })),
    products: products.slice(0, 12).map((product) => ({
      id: product.id,
      name: product.name,
      price: naira(Number(product.retailPrice) || 0),
      category: product.category?.name ?? null,
      photo: product.images.find(Boolean) ?? null,
      sold: product.soldStock,
    })),
    productCount,
  };
}

/** loadBrandContext for the signed-in seller's store (null without one). */
export async function loadSellerBrandContext(userId: string) {
  const store = await db.store.findUnique({ where: { userId }, select: { id: true } });
  return store ? loadBrandContext(store.id) : null;
}
