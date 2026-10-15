import "server-only";

import { changeStoreSlug, clearStaleShopNames, clearStaleShopNamesInStorePages } from "@/lib/store-address.server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { readBusinessAddress } from "@/lib/email/shell";
import { mergeBrandSettings } from "@/lib/workspace";
import { cleanBusinessAddress, type BusinessAddressKey, type ProfilePatch } from "@/lib/seller-settings-rules";

// A seller's shop basics, shared by the /home/settings server actions (web) and /api/app/settings/profile (phone app).

/**
 * Shop name, web address, description and city (web Settings › Store details). A missing or empty name, slug or
 * city keeps the current one; a missing description keeps it, an empty one clears it. Saves the store's details. The name never changes the web address; a different `slug` is an explicit address
 * change (changeStoreSlug: validated, rate-limited, the old address keeps redirecting). Returns false without a
 * store, or { error } when the new address can't be used (the other fields are still saved).
 */
export async function saveStoreDetails(userId: string, input: { name?: string; slug?: string; description?: string; city?: string }): Promise<false | { error?: string }> {
  const store = await db.store.findUnique({ where: { userId } });
  if (!store) return false;
  const name = input.name?.trim() || store.name;
  const renamedSettings = name !== store.name ? clearStaleShopNames(store.brandSettings, store.name) : null;
  await db.store.update({
    where: { id: store.id },
    data: {
      name,
      description: input.description === undefined ? store.description : input.description.trim(),
      city: (input.city?.trim() || store.city || "").trim(),
      brandSettings: mergeBrandSettings(renamedSettings ?? store.brandSettings, {}),
    },
  });
  if (name !== store.name) await clearStaleShopNamesInStorePages(store.id, store.name);
  if (input.slug?.trim() && input.slug.trim() !== store.slug) {
    const moved = await changeStoreSlug(store.id, input.slug);
    if (!moved.ok) return { error: moved.message };
  }
  return {};
}

/**
 * The store's business name and postal address (the footer of every email it sends). Fields left out keep their
 * saved value. Returns false without a store.
 */
export async function saveSellerBusinessAddress(userId: string, fields: Partial<Record<BusinessAddressKey, string>>) {
  const store = await db.store.findUnique({ where: { userId }, select: { id: true, brandSettings: true } });
  if (!store) return false;
  const current = store.brandSettings && typeof store.brandSettings === "object" && !Array.isArray(store.brandSettings) ? (store.brandSettings as Record<string, unknown>) : {};
  const businessAddress = cleanBusinessAddress({ ...readBusinessAddress(store.brandSettings), ...fields });
  await db.store.update({ where: { id: store.id }, data: { brandSettings: { ...current, businessAddress } as Prisma.InputJsonValue } });
  return true;
}

/** What the phone app's Settings screen shows. */
export async function sellerProfile(userId: string) {
  const [user, store] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { name: true, email: true, phone: true } }),
    db.store.findUnique({ where: { userId }, select: { name: true, slug: true, description: true, city: true, country: true, currency: true, logoUrl: true, brandSettings: true } }),
  ]);
  const address = readBusinessAddress(store?.brandSettings);
  return {
    me: { name: user?.name ?? "", email: user?.email ?? null, phone: user?.phone ?? "" },
    shop: store
      ? {
          name: store.name,
          slug: store.slug,
          description: store.description ?? "",
          city: store.city ?? "",
          state: address.state,
          phone: address.phone,
          country: store.country ?? "Nigeria",
          currency: store.currency ?? "NGN",
          logoUrl: store.logoUrl ?? null,
        }
      : null,
  };
}

/** Saves the Settings screen's changes; false when shop fields came for a seller with no store. */
export async function saveSellerProfile(userId: string, patch: ProfilePatch) {
  const { shop, me } = patch;
  if (shop && (shop.name !== undefined || shop.description !== undefined || shop.city !== undefined)) {
    if (!(await saveStoreDetails(userId, { name: shop.name, description: shop.description, city: shop.city }))) return false;
  }
  if (shop && (shop.state !== undefined || shop.phone !== undefined)) {
    const fields: Partial<Record<BusinessAddressKey, string>> = {};
    if (shop.state !== undefined) fields.state = shop.state;
    if (shop.phone !== undefined) fields.phone = shop.phone;
    if (!(await saveSellerBusinessAddress(userId, fields))) return false;
  }
  if (me && (me.name !== undefined || me.phone !== undefined)) {
    await db.user.update({ where: { id: userId }, data: { ...(me.name !== undefined ? { name: me.name } : {}), ...(me.phone !== undefined ? { phone: me.phone } : {}) } });
  }
  return true;
}
