import "server-only";
import { db } from "@/lib/db/client";
import { notify } from "@/lib/notifications/notify.server";
import { VISIBLE_SUPPLIER } from "@/lib/marketplace/agreements.server";
import { setFollowing } from "./follow.server";

// "Notify me when they add products" on a supplier's products page (web /marketplace/suppliers/<slug>, the phone
// app's suppliers/[slug]). Asking follows the supplier (SupplierFollow, the same follow as on their public page), and
// the supplier hears that a named shop is waiting: in the app, by email and on WhatsApp (unless they switched
// WhatsApp off for orders). When one of their products goes live (the team approves it), every follower hears, at
// most once a day per supplier. Sellers stop with "Stop notifying me" (unfollow).

export class ProductRequestError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/** A supplier sellers can see, by slug or id. */
export async function visibleSupplier(ref: string) {
  return db.supplier.findFirst({
    where: { ...VISIBLE_SUPPLIER, OR: [{ slug: ref }, { id: ref }] },
    select: { id: true, userId: true, slug: true, displayName: true },
  });
}

/** Follows the supplier and tells them this shop wants their products (once per shop). Returns how many wait. */
export async function askForProducts(sellerUserId: string, supplierRef: string) {
  const [supplier, store] = await Promise.all([
    visibleSupplier(supplierRef),
    db.store.findUnique({ where: { userId: sellerUserId }, select: { name: true, slug: true, city: true } }),
  ]);
  if (!supplier) throw new ProductRequestError("We couldn't find that supplier.", 404);
  if (!store) throw new ProductRequestError("Set up your shop first.", 404);
  if (supplier.userId === sellerUserId) throw new ProductRequestError("That's you.");

  await setFollowing(supplier.id, sellerUserId, true);
  const [waiting, published] = await Promise.all([
    db.supplierFollow.count({ where: { supplierId: supplier.id } }).catch(() => 1),
    db.supplierProduct.count({ where: { supplierId: supplier.id, status: "published" } }).catch(() => 0),
  ]);
  const shop = store.name.trim() || "A shop";
  const others = waiting - 1;
  await notify({
    userId: supplier.userId,
    event: "supplier.products_wanted",
    type: "suppliers",
    title: `${shop} wants to sell your products`,
    description: [
      `${shop}${store.city ? ` in ${store.city}` : ""} asked to be told when you add ${published ? "new " : ""}products on Shopinbos.`,
      others > 0 ? `${others} other ${others === 1 ? "shop is" : "shops are"} waiting too.` : "",
      published ? "Add more so they have more to sell." : "Add your products so they can start selling them.",
    ].filter(Boolean).join(" "),
    link: "/supplier/products/bulk",
    actionLabel: "Add products",
    metadata: { sellerUserId, storeSlug: store.slug, waiting },
    // Once per shop: asking again doesn't message the supplier again.
    dedupeKey: `supplier.products_wanted:${supplier.id}:${sellerUserId}`,
    email: true,
    whatsapp: true,
  }).catch((error) => console.error("[product-requests] supplier alert failed", error));
  return { supplier, waiting };
}

export async function stopAsking(sellerUserId: string, supplierRef: string) {
  const supplier = await visibleSupplier(supplierRef);
  if (!supplier) throw new ProductRequestError("We couldn't find that supplier.", 404);
  await setFollowing(supplier.id, sellerUserId, false);
  return { supplier };
}

/** A supplier product went live: tells the shops following that supplier (once a day per supplier each). */
export async function notifyFollowersOfNewProduct(productId: string) {
  const product = await db.supplierProduct.findUnique({
    where: { id: productId },
    select: { id: true, name: true, images: true, supplier: { select: { id: true, slug: true, displayName: true } } },
  });
  if (!product) return 0;
  const followers = await db.supplierFollow.findMany({ where: { supplierId: product.supplier.id }, select: { userId: true }, take: 5_000 });
  const day = new Date().toISOString().slice(0, 10);
  const link = `/marketplace/suppliers/${product.supplier.slug}`;
  for (const follower of followers) {
    await notify({
      userId: follower.userId,
      event: "supplier.new_products",
      type: "suppliers",
      title: `${product.supplier.displayName} added products`,
      description: `${product.name.slice(0, 80)} is now on Shopinbos. Add it to your shop or ask for a price.`,
      link,
      actionLabel: "See their products",
      imageUrl: product.images[0] ?? null,
      dedupeKey: `supplier.new_products:${product.supplier.id}:${follower.userId}:${day}`,
      email: true,
    }).catch(() => null);
  }
  return followers.length;
}
