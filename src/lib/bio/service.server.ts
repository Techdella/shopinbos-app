import "server-only";

import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { createPaymentLink, LINK_STORE_SELECT, paymentLinkUrl, type LinkStore } from "@/lib/payment-links/service.server";
import { linkPayBlock, readLinkItems } from "@/lib/payment-links/pure";
import { sellerWhatsapp } from "@/lib/ads";
import { ARRIVALS_COUNT, BioPageSchema, bioBlockLabel, bioIssueTarget, defaultBioBlocks, readBioBlocks, readBioTheme, socialUrl, SOCIAL_KEYS, SOCIAL_LABEL, whatsappChatUrl, type BioBlock, type BioPageInput, type BioProblemField, type BioTheme, type SocialKey } from "./pure";

// The store's link in bio page on the server: loading it for the editor and the public page, saving it (products
// and collections must be the store's own; "Buy now" blocks get a reusable payment link), and counting taps.
// Before the seller saves a page of their own, a live store's /links shows a starter page (defaultBioBlocks: top
// products and WhatsApp), so the link works the moment they copy it. Only an explicit "Page is live" off (or a
// store that isn't live) makes it 404.

/** The blocks a store's page shows before the seller saves one: its top published products and WhatsApp, if known. */
async function bioDefaultBlocks(storeId: string): Promise<BioBlock[]> {
  const [products, owner] = await Promise.all([
    db.storeProduct.findMany({ where: { storeId, status: "published" }, orderBy: [{ soldStock: "desc" }, { createdAt: "desc" }], take: 6, select: { id: true } }),
    db.store.findUnique({ where: { id: storeId }, select: { user: { select: { phone: true } } } }),
  ]);
  const whatsapp = await sellerWhatsapp(storeId, owner?.user?.phone ?? null).catch(() => null);
  return defaultBioBlocks({ productIds: products.map((product) => product.id), whatsapp: whatsapp ? `+${whatsapp}` : null });
}

export interface SellerBioPage {
  /** False until the seller saves: the page then shows the starter blocks (also what the editor opens with). */
  exists: boolean;
  published: boolean;
  title: string;
  bio: string;
  avatarUrl: string;
  theme: BioTheme;
  blocks: BioBlock[];
  views: number;
  clicks: Record<string, number>;
  url: string;
  /** The shop's own address and logo: "Add my shop website" and "Use my shop logo" in the editors. */
  storeUrl: string;
  storeLogoUrl: string;
}

/** The page for the editor, or a starting point when there isn't one yet. */
export async function loadSellerBio(store: { id: string; name: string; slug: string; customDomain: string | null; logoUrl?: string | null; description?: string | null }): Promise<SellerBioPage> {
  const page = await db.bioPage.findUnique({ where: { storeId: store.id }, include: { clicks: { select: { blockId: true, count: true } } } });
  return {
    exists: Boolean(page),
    published: page?.published ?? true,
    title: page?.title ?? store.name,
    bio: page?.bio ?? (store.description ?? "").slice(0, 300),
    avatarUrl: page?.avatarUrl ?? store.logoUrl ?? "",
    theme: readBioTheme(page?.theme),
    blocks: page ? readBioBlocks(page.blocks) : await bioDefaultBlocks(store.id),
    views: page?.views ?? 0,
    clicks: Object.fromEntries((page?.clicks ?? []).map((click) => [click.blockId, click.count])),
    url: buildStorefrontUrl(store, "/links"),
    storeUrl: buildStorefrontUrl(store),
    storeLogoUrl: store.logoUrl ?? "",
  };
}

/** A refusal, pointing at the block (and field) it is about when there is one, so the editor can mark it. */
export type SaveBioResult = { ok: true; page: SellerBioPage } | { ok: false; message: string; blockIndex?: number; field?: BioProblemField };

const BLOCK_WORDS: Record<string, string> = { product: "Product", collection: "Collection", link: "Custom link", socials: "Social icons", whatsapp: "WhatsApp button", signup: "Email sign-up", text: "Text", shop: "Shop now button", arrivals: "New arrivals", track: "Track my order" };

/** "Block 2 (Custom link): Enter a full web address…" for a refusal about one block. */
function blockMessage(raw: unknown, index: number, message: string) {
  const blocks = raw && typeof raw === "object" ? (raw as { blocks?: unknown }).blocks : null;
  const block = Array.isArray(blocks) ? blocks[index] : null;
  const type = block && typeof block === "object" ? String((block as { type?: unknown }).type ?? "") : "";
  return `Block ${index + 1}${BLOCK_WORDS[type] ? ` (${BLOCK_WORDS[type]})` : ""}: ${message}`;
}

/** A reusable "Buy now" link for one product, kept when the block already has a working one for that product. */
async function buyNowCode(store: LinkStore, productId: string, current: string | undefined) {
  if (current) {
    const existing = await db.paymentLink.findFirst({ where: { storeId: store.id, code: current } });
    if (existing && !linkPayBlock(existing) && !existing.oneTime && readLinkItems(existing.items).some((item) => item.productId === productId)) return current;
  }
  const created = await createPaymentLink(store, { items: [{ productId, variantId: null, quantity: 1 }], title: null, note: null, customAmount: null, oneTime: false, expiry: "never", maxQuantity: 10, buyerName: null, buyerPhone: null, buyerEmail: null }, { createdBy: "bio" });
  return created.ok ? created.link.code : null;
}

/** Saves the page after checking every product and collection belongs to the store. */
export async function saveBioPage(storeId: string, raw: unknown): Promise<SaveBioResult> {
  const parsed = BioPageSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const target = issue ? bioIssueTarget(issue.path) : null;
    if (issue && target) return { ok: false, message: blockMessage(raw, target.index, issue.message), blockIndex: target.index, field: target.field };
    return { ok: false, message: issue?.message ?? "Check the page and try again." };
  }
  const input: BioPageInput = parsed.data;
  const store = await db.store.findUnique({ where: { id: storeId }, select: { ...LINK_STORE_SELECT, logoUrl: true, description: true } });
  if (!store) return { ok: false, message: "Store not found." };

  const productIds = input.blocks.flatMap((block) => (block.type === "product" ? [block.productId] : []));
  const collectionIds = input.blocks.flatMap((block) => (block.type === "collection" ? [block.collectionId] : []));
  const [products, collections] = await Promise.all([
    productIds.length ? db.storeProduct.findMany({ where: { storeId, id: { in: productIds }, status: "published" }, select: { id: true } }) : [],
    collectionIds.length ? db.collection.findMany({ where: { storeId, id: { in: collectionIds } }, select: { id: true } }) : [],
  ]);
  const ownProducts = new Set(products.map((product) => product.id));
  const ownCollections = new Set(collections.map((collection) => collection.id));
  const badProduct = input.blocks.findIndex((block) => block.type === "product" && !ownProducts.has(block.productId));
  if (badProduct >= 0) return { ok: false, message: blockMessage(raw, badProduct, "This product isn't published in your shop. Publish it or remove it from the page."), blockIndex: badProduct, field: "productId" };
  const badCollection = input.blocks.findIndex((block) => block.type === "collection" && !ownCollections.has(block.collectionId));
  if (badCollection >= 0) return { ok: false, message: blockMessage(raw, badCollection, "This collection isn't in your shop. Remove it from the page."), blockIndex: badCollection, field: "collectionId" };

  const blocks: BioBlock[] = [];
  for (const block of input.blocks) {
    if (block.type === "product") {
      if (block.action === "pay") {
        const code = await buyNowCode(store, block.productId, block.payCode);
        if (!code) return { ok: false, message: "Couldn't make the Buy now link. Try again." };
        blocks.push({ ...block, payCode: code });
      } else {
        const { payCode: _drop, ...rest } = block;
        void _drop;
        blocks.push(rest);
      }
    } else blocks.push(block);
  }

  const data = {
    published: input.published,
    title: input.title || null,
    bio: input.bio || null,
    avatarUrl: input.avatarUrl || null,
    theme: input.theme as unknown as Prisma.InputJsonValue,
    blocks: blocks as unknown as Prisma.InputJsonValue,
  };
  await db.bioPage.upsert({ where: { storeId }, create: { storeId, ...data }, update: data });
  return { ok: true, page: await loadSellerBio(store) };
}

// ─── Public page ──────────────────────────────────────────────────────────────

export type PublicBioBlock =
  | { id: string; type: "product"; name: string; price: number; image: string | null; href: string; featured: boolean; cta: string }
  | { id: string; type: "link"; label: string; href: string }
  | { id: string; type: "socials"; links: Array<{ key: SocialKey; label: string; href: string }> }
  | { id: string; type: "whatsapp"; label: string; href: string }
  | { id: string; type: "signup"; title: string; buttonLabel: string }
  | { id: string; type: "text"; text: string }
  /** "Shop now": the page's main button, to the store's home. */
  | { id: string; type: "shop"; label: string; href: string }
  /** "New arrivals": up to 4 of the newest published products, as a 2×2 grid. */
  | { id: string; type: "arrivals"; label: string; products: Array<{ id: string; name: string; price: number; image: string | null; href: string }> }
  /**
   * "Track my order": a lookup form (order number + email or phone, the store's orders/lookup API); `orderHref` is
   * the store's order page address without the id, which the lookup returns.
   */
  | { id: string; type: "track"; label: string; orderHref: string };

export interface PublicBioPage {
  title: string;
  bio: string;
  avatarUrl: string | null;
  theme: BioTheme;
  blocks: PublicBioBlock[];
  currency: string;
  /**
   * The store's logo, for when the photo is the logo (no photo of the page's own, or the same picture): drawn with
   * StoreLogo so dark themes get the dark-background version. Only brandSettings.logoVariants, nothing else.
   */
  storeLogo?: { logoUrl: string | null; logoVariants: unknown };
}

/** brandSettings.logoVariants alone (what StoreLogo reads), never the rest of the settings. */
export function bioLogoVariants(brandSettings: unknown): unknown {
  return brandSettings && typeof brandSettings === "object" && !Array.isArray(brandSettings) ? ((brandSettings as Record<string, unknown>).logoVariants ?? null) : null;
}

/**
 * The public page's data: only public product details (name, photo, price) of published products, and links built
 * here (never a URL from a product). Null only when the store isn't live or the seller turned the page off; a live
 * store with no saved page gets the starter page (name, logo, description, top products, WhatsApp).
 */
export const loadPublicBio = cache(async (slug: string): Promise<PublicBioPage | null> => {
  const store = await db.store.findUnique({ where: { slug }, select: { id: true, name: true, slug: true, customDomain: true, currency: true, logoUrl: true, description: true, brandSettings: true, status: true, bioPage: true } });
  if (!store || store.status !== "active") return null;
  if (store.bioPage && !store.bioPage.published) return null;
  const blocks = store.bioPage ? readBioBlocks(store.bioPage.blocks) : await bioDefaultBlocks(store.id);
  const productIds = blocks.flatMap((block) => (block.type === "product" ? [block.productId] : []));
  const collectionIds = blocks.flatMap((block) => (block.type === "collection" ? [block.collectionId] : []));
  const wantsArrivals = blocks.some((block) => block.type === "arrivals");
  const [products, collections, arrivals] = await Promise.all([
    productIds.length ? db.storeProduct.findMany({ where: { storeId: store.id, id: { in: productIds }, status: "published" }, select: { id: true, name: true, images: true, retailPrice: true } }) : [],
    collectionIds.length ? db.collection.findMany({ where: { storeId: store.id, id: { in: collectionIds } }, select: { id: true, name: true, slug: true } }) : [],
    // "New arrivals": the newest published products (only public details).
    wantsArrivals ? db.storeProduct.findMany({ where: { storeId: store.id, status: "published" }, orderBy: { createdAt: "desc" }, take: ARRIVALS_COUNT, select: { id: true, name: true, images: true, retailPrice: true } }) : [],
  ]);
  const productById = new Map(products.map((product) => [product.id, product]));
  const collectionById = new Map(collections.map((collection) => [collection.id, collection]));
  const out: PublicBioBlock[] = [];
  for (const block of blocks) {
    if (block.type === "product") {
      const product = productById.get(block.productId);
      if (!product) continue;
      const pay = block.action === "pay" && block.payCode;
      out.push({
        id: block.id,
        type: "product",
        name: block.label || product.name,
        price: Number(product.retailPrice) || 0,
        image: product.images[0] ?? null,
        href: pay ? paymentLinkUrl(store, block.payCode!) : buildStorefrontUrl(store, `/product/${product.id}`),
        featured: block.featured,
        cta: pay ? "Buy now" : "View",
      });
    } else if (block.type === "collection") {
      const collection = collectionById.get(block.collectionId);
      if (collection) out.push({ id: block.id, type: "link", label: block.label || collection.name, href: buildStorefrontUrl(store, `/collections/${collection.slug}`) });
    } else if (block.type === "link") {
      out.push({ id: block.id, type: "link", label: block.label, href: block.url });
    } else if (block.type === "socials") {
      const links = SOCIAL_KEYS.flatMap((key) => {
        const href = socialUrl(key, block.links[key]);
        return href ? [{ key, label: SOCIAL_LABEL[key], href }] : [];
      });
      if (links.length) out.push({ id: block.id, type: "socials", links });
    } else if (block.type === "whatsapp") {
      out.push({ id: block.id, type: "whatsapp", label: block.label || "Chat on WhatsApp", href: whatsappChatUrl(block.phone, block.message || `Hi ${store.name}!`) });
    } else if (block.type === "signup") {
      out.push({ id: block.id, type: "signup", title: block.title || "Get our news and offers", buttonLabel: block.buttonLabel || "Sign up" });
    } else if (block.type === "text") {
      out.push({ id: block.id, type: "text", text: block.text });
    } else if (block.type === "shop") {
      out.push({ id: block.id, type: "shop", label: bioBlockLabel(block), href: buildStorefrontUrl(store) });
    } else if (block.type === "arrivals") {
      if (arrivals.length) {
        out.push({
          id: block.id,
          type: "arrivals",
          label: bioBlockLabel(block),
          products: arrivals.map((product) => ({ id: product.id, name: product.name, price: Number(product.retailPrice) || 0, image: product.images[0] ?? null, href: buildStorefrontUrl(store, `/product/${product.id}`) })),
        });
      }
    } else if (block.type === "track") {
      out.push({ id: block.id, type: "track", label: bioBlockLabel(block), orderHref: buildStorefrontUrl(store, "/order") });
    }
  }
  return {
    title: store.bioPage?.title || store.name,
    bio: store.bioPage ? (store.bioPage.bio ?? "") : (store.description ?? "").slice(0, 300),
    avatarUrl: store.bioPage?.avatarUrl || store.logoUrl || null,
    theme: readBioTheme(store.bioPage?.theme),
    blocks: out,
    currency: store.currency,
    storeLogo: { logoUrl: store.logoUrl ?? null, logoVariants: bioLogoVariants(store.brandSettings) },
  };
});

/** Counts a view of the public page. Never throws. */
export async function recordBioView(slug: string) {
  await db.bioPage.updateMany({ where: { store: { slug } }, data: { views: { increment: 1 } } }).catch(() => null);
}

/** Counts a tap on one of the page's blocks (only blocks that are on the page). Never throws. */
export async function recordBioClick(slug: string, blockId: string) {
  try {
    const page = await db.bioPage.findFirst({ where: { store: { slug } }, select: { id: true, blocks: true } });
    if (!page || !readBioBlocks(page.blocks).some((block) => block.id === blockId)) return false;
    await db.bioPageClick.upsert({ where: { bioPageId_blockId: { bioPageId: page.id, blockId } }, create: { bioPageId: page.id, blockId, count: 1 }, update: { count: { increment: 1 } } });
    return true;
  } catch {
    return false;
  }
}

/** The shop's best sellers (then newest) that are published, for Peggy's starter page. */
export async function topProductIds(storeId: string, count: number) {
  const products = await db.storeProduct.findMany({ where: { storeId, status: "published" }, orderBy: [{ soldStock: "desc" }, { createdAt: "desc" }], take: Math.min(Math.max(count, 1), 12), select: { id: true, name: true, retailPrice: true } });
  return products;
}
