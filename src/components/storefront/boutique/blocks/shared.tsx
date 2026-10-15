"use client";

// What every ready-made block renderer receives from BoutiqueStorefront, and the small pieces they share
// (product card with rating and quick add, stars, links, the builder-only sample label, reduced motion).

import Link from "next/link";
import { useEffect, useState } from "react";
import type React from "react";
import { Icon } from "@/components/ui/Icon";
import type { TemplateSectionNode } from "@/lib/store-templates";
import type { SlideLink } from "@/lib/store-templates/section-content";
import { formatStoreMoney, type StorefrontShopperInfo } from "@/lib/storefront/shopper-info";
import { needsOptions, type ShopperProduct } from "../../shopper/catalog";
import type { BoutiqueLook } from "../look";
import { ProductTile } from "../ProductTile";
import { sectionCopyOf, str } from "./block-logic";
import { englishText, type EditorText } from "../../editor-text";

export interface BlockStore {
  name: string;
  slug: string;
  description?: string | null;
  logoUrl?: string | null;
  currency: string;
}

export interface BlockContext {
  section: TemplateSectionNode;
  copy: Record<string, unknown>;
  settings: Record<string, unknown>;
  items: Array<Record<string, unknown>>;
  look: BoutiqueLook;
  store: BlockStore;
  shopper: StorefrontShopperInfo;
  products: ShopperProduct[];
  /** The live store (not the builder canvas or a theme preview). */
  live: boolean;
  /** The builder canvas: samples and setup hints show here only. */
  editor: boolean;
  headingId: string;
  /** Page type being shown ("home", "products"…). */
  currentPage: string;
  go: (page: string) => void;
  openProduct: (productId: string) => void;
  /** Opens the shop filtered to one collection or category. */
  shopCollection: (collectionId: string) => void;
  shopCategory: (categorySlug: string) => void;
  productHref: (productId: string) => string | undefined;
  /** Adds one product to the bag the seller's way (drawer or bag page). Only on the live store. */
  addToCart?: (productId: string) => void;
  openCart?: () => void;
  wished: string[];
  toggleWish?: (productId: string) => void;
  visitorKey?: string;
  /** Builder-only hints in the seller's language: the builder's words on its canvas, the English everywhere else. */
  say: EditorText;
  /** Dashed box with a setup tip, shown in the builder only. */
  editorHint: (message: string) => React.ReactNode;
}

export type BlockRenderer = (props: { ctx: BlockContext }) => React.ReactNode;

export function blockContextParts(section: TemplateSectionNode) {
  return { copy: sectionCopyOf(section), settings: section.settings ?? {}, items: section.items ?? [] };
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let media: MediaQueryList;
    try {
      media = window.matchMedia("(prefers-reduced-motion: reduce)");
    } catch {
      return;
    }
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

export function useMediaMatch(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    let media: MediaQueryList;
    try {
      media = window.matchMedia(query);
    } catch {
      return;
    }
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

/** "Sample · only you see this" on builder previews of blocks that are still empty. */
export function SampleLabel({ look, children, say = englishText }: { look: BoutiqueLook; children?: React.ReactNode; say?: EditorText }) {
  return (
    <p className="m-0 mb-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-semibold" style={{ background: `${look.tokens.accent}22`, color: look.tokens.ink }}>
      <Icon name="eye" size={12} /> {children ?? say("Sample. Only you see this until you add your own.")}
    </p>
  );
}

export function Stars({ rating, count, color = "#F2A93B", muted }: { rating: number; count?: number; color?: string; muted?: string }) {
  const full = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-1 text-[12.5px]">
      <span aria-hidden style={{ color, letterSpacing: 1 }}>{"★".repeat(full)}{"☆".repeat(Math.max(0, 5 - full))}</span>
      <span className="sr-only">{rating.toFixed(1)} out of 5</span>
      {typeof count === "number" ? <span style={{ color: muted }}>({count})</span> : null}
    </span>
  );
}

export function money(amount: number, currency: string) {
  return formatStoreMoney(amount, currency);
}

/** Quick add: straight into the bag, or the product page when a size or colour has to be chosen first. */
export function quickAdd(ctx: BlockContext, product: ShopperProduct) {
  if (needsOptions(product)) {
    const href = ctx.productHref(product.id);
    if (href) window.location.href = href;
    else ctx.openProduct(product.id);
    return;
  }
  ctx.addToCart?.(product.id);
}

/** A theme product tile with optional real-review stars and a quick add button underneath. */
export function BlockProductCard({ ctx, product, eager, rating = true, add = true }: { ctx: BlockContext; product: ShopperProduct; eager?: boolean; rating?: boolean; add?: boolean }) {
  const { look } = ctx;
  const t = look.tokens;
  const reviews = product.reviewCount ?? 0;
  return (
    <div className="flex min-w-0 flex-col">
      <ProductTile product={product} look={look} href={ctx.productHref(product.id)} onOpen={ctx.live ? undefined : () => ctx.openProduct(product.id)} wished={ctx.wished.includes(product.id)} onToggleWishlist={ctx.toggleWish} eager={eager} />
      {rating && reviews > 0 && product.avgRating ? <span className="mt-1"><Stars rating={product.avgRating} count={reviews} muted={t.muted} /></span> : null}
      {add ? (
        <button
          type="button"
          className="bq-btn mt-2.5 w-full"
          style={{ ...look.softButton, minHeight: 40, fontSize: 13.5 }}
          onClick={(event) => {
            event.stopPropagation();
            quickAdd(ctx, product);
          }}
          disabled={!ctx.live}
          aria-label={needsOptions(product) ? `Choose options for ${product.name}` : `Add ${product.name} to bag`}
        >
          <Icon name="bag" size={15} /> {needsOptions(product) ? "Choose options" : "Add to bag"}
        </button>
      ) : null}
    </div>
  );
}

/** Where an item's link goes: a product page, a store page or another website. */
export function linkProps(ctx: BlockContext, link: SlideLink | null): { href?: string; onClick?: () => void; external?: boolean } {
  if (!link || !link.value) return {};
  if (link.type === "product") {
    const href = ctx.productHref(link.value);
    return href ? { href } : { onClick: () => ctx.openProduct(link.value) };
  }
  if (link.type === "url") {
    if (!/^(https?:\/\/|\/)/i.test(link.value)) return {};
    return ctx.live ? { href: link.value, external: /^https?:/i.test(link.value) } : {};
  }
  return { onClick: () => ctx.go(link.value) };
}

/** Wraps children in a link, a button or nothing, depending on the item's link. */
export function ItemLink({ ctx, link, className, style, label, children }: { ctx: BlockContext; link: SlideLink | null; className?: string; style?: React.CSSProperties; label?: string; children: React.ReactNode }) {
  const target = linkProps(ctx, link);
  if (target.href) {
    return target.external
      ? <a href={target.href} target="_blank" rel="noopener noreferrer" className={className} style={style} aria-label={label}>{children}</a>
      : <Link href={target.href} prefetch={false} className={className} style={style} aria-label={label}>{children}</Link>;
  }
  if (target.onClick) return <button type="button" onClick={target.onClick} className={className} style={{ background: "none", border: 0, padding: 0, color: "inherit", cursor: "pointer", textAlign: "inherit", ...style }} aria-label={label}>{children}</button>;
  return <span className={className} style={style}>{children}</span>;
}

/** The SlideLink an item stores, or null. */
export function itemLink(item: Record<string, unknown>): SlideLink | null {
  const raw = item.link;
  if (!raw || typeof raw !== "object") return null;
  const link = raw as Record<string, unknown>;
  const type = link.type === "product" || link.type === "url" ? link.type : "page";
  const value = str(link.value);
  return value ? { type, value } : null;
}

/** Text paragraphs: blank lines start a new paragraph. */
export function Paragraphs({ text, className, style }: { text: string; className?: string; style?: React.CSSProperties }) {
  const parts = text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  return <>{parts.map((part, index) => <p key={index} className={className} style={style}>{part}</p>)}</>;
}

/** Overlay gradient strength for words over pictures. */
export function overlayColor(strength: string) {
  return strength === "light" ? "rgba(0,0,0,.18)" : strength === "strong" ? "rgba(0,0,0,.6)" : "rgba(0,0,0,.38)";
}

export function heightFor(value: string) {
  return value === "full" ? "min(92vh, 900px)" : value === "medium" ? "min(52vh, 460px)" : "min(72vh, 640px)";
}
