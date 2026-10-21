import "server-only";

import { cache } from "react";
import type { Metadata } from "next";
import { db } from "@/lib/db/client";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { formatStoreMoney } from "@/lib/storefront/shopper-info";
import { normalizeVariants, variantPrice } from "@shared/product-variants";
import { buyerSetsQuantity, isLinkCode, linkStatus, linkTitle, payInOneTap, readLinkDelivery, readLinkItems, type LinkDelivery, type PaymentLinkStatus } from "./pure";

// What the public pay page (/pay/<code>) may show: the link's products with their current public price, photos and
// options, the agreed amount, prefilled buyer details, and, once a one-time link is paid, a short order summary.
// Only public product data; never the seller's notes about the customer, costs or other orders.

export interface PublicLinkOption {
  id: string;
  name: string;
  price: number;
  imageUrl: string | null;
  available: boolean;
}

export interface PublicLinkItem {
  productId: string;
  name: string;
  images: string[];
  quantity: number;
  /** The fixed option's name, if the seller chose one. */
  variant: string | null;
  variantId: string | null;
  price: number;
  /** Options to pick from when the seller left the choice to the buyer. */
  options: PublicLinkOption[];
  available: boolean;
}

export interface PublicPayLink {
  id: string;
  code: string;
  title: string;
  note: string | null;
  status: PaymentLinkStatus;
  oneTime: boolean;
  items: PublicLinkItem[];
  customAmount: number | null;
  maxQuantity: number;
  buyerSetsQuantity: boolean;
  expiresAt: string | null;
  prefill: { name: string; phone: string; email: string };
  /** Delivery the seller saved (the customer's own address, and the fee or option), or null. */
  delivery: LinkDelivery | null;
  /** The one-tap page: address and delivery saved, nothing left to pick (payInOneTap). */
  oneTap: boolean;
  paidOrder: { id: string; orderNumber: string; total: number; currency: string; paymentMethod: string | null; items: Array<{ name: string; quantity: number; price: number }> } | null;
}

/** The pay page's data for a store slug and code, or null when there's no such link. Cached per request. */
export const loadPublicPayLink = cache(async (slug: string, code: string): Promise<PublicPayLink | null> => {
  if (!isLinkCode(code)) return null;
  const link = await db.paymentLink.findFirst({ where: { code, store: { slug } } });
  if (!link) return null;
  const saved = readLinkItems(link.items);
  const products = await db.storeProduct.findMany({
    where: { storeId: link.storeId, id: { in: saved.map((item) => item.productId) } },
    select: { id: true, name: true, images: true, retailPrice: true, variants: true, status: true },
  });
  const byId = new Map(products.map((product) => [product.id, product]));
  const items: PublicLinkItem[] = saved.map((item) => {
    const product = byId.get(item.productId);
    const base = Number(product?.retailPrice ?? item.price ?? 0) || 0;
    const variants = normalizeVariants(product?.variants).filter((variant) => variant.enabled);
    const fixed = item.variantId ? variants.find((variant) => variant.id === item.variantId) ?? null : null;
    return {
      productId: item.productId,
      name: product?.name ?? item.name ?? "Item",
      images: (fixed?.imageUrl ? [fixed.imageUrl] : []).concat(product?.images ?? []).slice(0, 6),
      quantity: item.quantity,
      variant: fixed?.name ?? null,
      variantId: fixed?.id ?? null,
      price: fixed ? variantPrice(fixed, base) : base,
      options: item.variantId ? [] : variants.map((variant) => ({ id: variant.id, name: variant.name, price: variantPrice(variant, base), imageUrl: variant.imageUrl, available: variant.stock === null || variant.stock > 0 })),
      available: Boolean(product && product.status === "published" && (!item.variantId || fixed)),
    };
  });

  const status = linkStatus(link);
  const delivery = readLinkDelivery(link);
  let paidOrder: PublicPayLink["paidOrder"] = null;
  if (status === "paid" && link.orderId) {
    const order = await db.retailOrder.findFirst({ where: { id: link.orderId, storeId: link.storeId }, select: { id: true, orderNumber: true, total: true, currency: true, paymentMethod: true, items: true } });
    if (order) {
      const lines = Array.isArray(order.items) ? (order.items as Array<{ name?: unknown; quantity?: unknown; price?: unknown }>) : [];
      paidOrder = {
        id: order.id,
        orderNumber: order.orderNumber,
        total: Number(order.total) || 0,
        currency: order.currency,
        paymentMethod: order.paymentMethod,
        items: lines.map((line) => ({ name: String(line.name ?? "Item"), quantity: Number(line.quantity ?? 1) || 1, price: Number(line.price ?? 0) || 0 })),
      };
    }
  }

  return {
    id: link.id,
    code: link.code,
    title: linkTitle({ title: link.title, items: items.map((item) => ({ name: item.variant ? `${item.name} · ${item.variant}` : item.name })) }),
    note: link.note,
    status,
    oneTime: link.oneTime,
    items,
    customAmount: link.customAmount,
    maxQuantity: link.maxQuantity,
    buyerSetsQuantity: buyerSetsQuantity({ items: saved, maxQuantity: link.maxQuantity, customAmount: link.customAmount }),
    expiresAt: link.expiresAt?.toISOString() ?? null,
    prefill: { name: link.buyerName ?? "", phone: link.buyerPhone ?? "", email: link.buyerEmail ?? "" },
    delivery,
    oneTap: payInOneTap({ delivery, items }),
    paidOrder,
  };
});

/** <head> for the pay page: product photo, title and price, so WhatsApp, Instagram and TikTok show a rich preview. */
export async function payLinkMetadata(slug: string, code: string): Promise<Metadata> {
  const [link, store] = await Promise.all([
    loadPublicPayLink(slug, code),
    db.store.findUnique({ where: { slug }, select: { name: true, slug: true, customDomain: true, currency: true, logoUrl: true } }),
  ]);
  if (!link || !store) return { title: "Payment link", robots: { index: false, follow: false } };
  const amount = link.customAmount ?? link.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const price = formatStoreMoney(amount, store.currency);
  const title = `${link.title} · ${price}`;
  const description = link.status === "active" ? `Pay ${store.name} securely for ${link.title}.` : `A payment link from ${store.name}.`;
  const image = link.items.find((item) => item.images[0])?.images[0] ?? store.logoUrl ?? undefined;
  const url = buildStorefrontUrl(store, `/pay/${link.code}`);
  return {
    title: { absolute: `${title} | ${store.name}` },
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, url, siteName: store.name, type: "website", ...(image ? { images: [{ url: image, alt: link.title }] } : {}) },
    twitter: { card: image ? "summary_large_image" : "summary", title, description, ...(image ? { images: [image] } : {}) },
  };
}
