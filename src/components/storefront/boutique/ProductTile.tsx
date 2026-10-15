"use client";

import Link from "next/link";
import type React from "react";
import { Icon } from "@/components/ui/Icon";
import { formatStoreMoney } from "@/lib/storefront/shopper-info";
import { lowStockLabel, productColours, type ShopperProduct } from "../shopper/catalog";
import type { BoutiqueLook } from "./look";

interface Props {
  product: ShopperProduct;
  look: BoutiqueLook;
  href?: string;
  onOpen?: () => void;
  wished: boolean;
  onToggleWishlist?: (productId: string) => void;
  /** Above-the-fold tiles load eagerly. */
  eager?: boolean;
  /** Stars and review count under the price (products with real reviews only). */
  showRating?: boolean;
  /** Shows an "Add to bag" button on the card; called with the product id. */
  onQuickAdd?: (productId: string) => void;
  /** Swaps to the product's second photo when a shopper points at the card. */
  hoverImage?: boolean;
  /** Large cards (shop page "Large cards"): bigger name and price. */
  size?: "regular" | "large";
}

/** Product card: photo (or a neutral placeholder), wishlist heart, name, price and real colour options. */
export function ProductTile({ product, look, href, onOpen, wished, onToggleWishlist, eager, showRating, onQuickAdd, hoverImage, size = "regular" }: Props) {
  const image = product.images[0];
  const second = hoverImage ? product.images.find((src, index) => index > 0 && src && src !== image) : undefined;
  const rating = showRating && product.avgRating && product.avgRating > 0 && product.reviewCount ? { average: product.avgRating, count: product.reviewCount } : null;
  const large = size === "large";
  const colours = productColours(product);
  const low = lowStockLabel(product);
  const compareAt = product.compareAtPrice && product.compareAtPrice > product.retailPrice ? product.compareAtPrice : null;
  const dark = look.dark;

  const media = (
    <span
      className="bq-media block"
      style={{
        aspectRatio: look.tileRatio,
        borderRadius: look.cardRadius,
        border: look.tileBorder,
      }}
    >
      {image ? (
        <img src={image} alt={product.name} width={480} height={600} loading={eager ? "eager" : "lazy"} decoding="async" />
      ) : (
        <span className="absolute inset-0 grid place-items-center" aria-hidden>
          <Icon name="image" size={28} color={dark ? "#3A3A3A" : "#C9CCCF"} />
        </span>
      )}
      {second ? <img src={second} alt="" width={480} height={600} loading="lazy" decoding="async" className="bq-tile-alt" aria-hidden /> : null}
      {low ? (
        <span className="absolute left-2.5 top-2.5 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: dark ? "#000" : "#fff", color: dark ? look.tokens.accent : "#B4441E" }}>
          {low}
        </span>
      ) : null}
    </span>
  );

  const body = (
    <>
      {media}
      <span className="mt-2.5 flex items-start justify-between gap-2">
        <span className={`min-w-0 leading-snug ${large ? "text-[16.5px] font-medium" : "text-[14px]"}`} style={{ color: look.tokens.ink, fontFamily: large ? look.headingFont : undefined }}>{product.name}</span>
        {colours.length ? (
          <span className="mt-1 flex shrink-0 gap-1" aria-label={`Colours: ${colours.map((c) => c.name).join(", ")}`}>
            {colours.map((colour) => (
              <span key={colour.name} className="block h-2.5 w-2.5 rounded-full" style={{ background: colour.hex, boxShadow: `0 0 0 1px ${look.tokens.border}` }} />
            ))}
          </span>
        ) : null}
      </span>
      <span className="mt-1 flex items-baseline gap-2">
        <span className={`${large ? "text-[16px]" : "text-[14.5px]"} font-semibold`} style={{ color: look.tokens.ink }}>{formatStoreMoney(product.retailPrice, product.currency)}</span>
        {compareAt ? (
          <span className="text-[12.5px] line-through" style={{ color: look.tokens.muted }}>
            <span className="sr-only">Was </span>
            {formatStoreMoney(compareAt, product.currency)}
          </span>
        ) : null}
      </span>
      {rating ? (
        <span className="mt-1 flex items-center gap-1.5 text-[12.5px]" style={{ color: look.tokens.muted }}>
          <span aria-hidden style={{ color: "#F2A93B", letterSpacing: 1 }}>{"★".repeat(Math.round(rating.average))}{"☆".repeat(5 - Math.round(rating.average))}</span>
          <span className="sr-only">Rated {rating.average.toFixed(1)} out of 5 from</span>
          {rating.average.toFixed(1)} ({rating.count})
        </span>
      ) : null}
    </>
  );

  const heart = onToggleWishlist ? (
    <button
      type="button"
      onClick={(event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        onToggleWishlist(product.id);
      }}
      aria-pressed={wished}
      aria-label={wished ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
      className="absolute right-2.5 top-2.5 grid h-9 w-9 place-items-center rounded-full shadow-sm"
      style={{ background: dark ? "#E9E6DF" : "#FFFFFF", color: wished ? look.heartActive : "#1A1A1A" }}
    >
      <Icon name="heart" size={16} fill={wished ? "currentColor" : "none"} />
    </button>
  ) : null;

  const quickAdd = onQuickAdd ? (
    <button
      type="button"
      onClick={(event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        onQuickAdd(product.id);
      }}
      className="bq-btn mt-2.5 w-full"
      style={{ minHeight: 40, fontSize: 13.5, background: look.tokens.ctaBg, color: look.tokens.ctaText, border: `1.5px solid ${look.tokens.ctaBg}` }}
      aria-label={`Add ${product.name} to bag`}
    >
      <Icon name="bag" size={15} aria-hidden /> Add to bag
    </button>
  ) : null;

  return (
    <article className={second ? "bq-tile relative" : "relative"}>
      {href ? (
        <Link href={href} className="block" prefetch={false}>
          {body}
        </Link>
      ) : (
        <button type="button" onClick={onOpen} className="block w-full cursor-pointer border-0 bg-transparent p-0 text-left">
          {body}
        </button>
      )}
      {heart}
      {quickAdd}
    </article>
  );
}
