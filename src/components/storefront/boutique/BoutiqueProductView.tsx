"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type React from "react";
import { Icon } from "@/components/ui/Icon";
import { deliveryLines, formatStoreMoney, whatsappLink, type StorefrontShopperInfo } from "@/lib/storefront/shopper-info";
import { colourHex, matchVariant, readVariants, variantGroups, variantLabel, type ShopperProduct } from "../shopper/catalog";
import { SectionTitle } from "./BoutiqueChrome";
import type { BoutiqueLook } from "./look";
import { ProductTile } from "./ProductTile";

export interface ProductReviewEntry {
  id: string;
  buyerName: string;
  rating: number;
  title: string;
  body: string;
  sellerReply: string;
  createdAt: string;
}

export interface BoutiqueProductDetail extends ShopperProduct {
  sku?: string | null;
  longDescription?: string | null;
  specifications?: unknown;
  careInstructions?: string | null;
  shippingInfo?: string | null;
  returnPolicy?: string | null;
}

export interface AddToBagInput {
  name: string;
  price: number;
  image?: string;
  variant?: string;
  quantity: number;
  maxQuantity?: number;
}

interface Props {
  product: BoutiqueProductDetail;
  look: BoutiqueLook;
  shopper: StorefrontShopperInfo;
  storeName: string;
  currency: string;
  reviews: ProductReviewEntry[];
  avgRating: number;
  reviewCount: number;
  related: ShopperProduct[];
  relatedHref?: (productId: string) => string;
  onOpenRelated?: (productId: string) => void;
  wishlistIds: string[];
  onToggleWishlist?: (productId: string) => void;
  onAddToBag?: (input: AddToBagInput) => void;
  onBuyNow?: (input: AddToBagInput) => void;
  /** Breadcrumb trail; the last entry is the product. */
  crumbs: Array<{ label: string; onSelect?: () => void }>;
  /** Absolute page URL for Share and the WhatsApp message (live only). */
  shareUrl?: string;
  interactive: boolean;
}

function Stars({ rating, size = 14, color }: { rating: number; size?: number; color: string }) {
  const rounded = Math.round(rating);
  return (
    <span aria-hidden style={{ color, fontSize: size, letterSpacing: 1.5, lineHeight: 1 }}>
      {"★".repeat(rounded)}
      <span style={{ opacity: 0.3 }}>{"★".repeat(5 - rounded)}</span>
    </span>
  );
}

function readSpecs(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (entry && typeof entry === "object" ? (entry as { name?: unknown; value?: unknown }) : {}))
    .filter((entry) => typeof entry.name === "string" && typeof entry.value === "string" && entry.name.trim() && (entry.value as string).trim())
    .map((entry) => ({ name: String(entry.name), value: String(entry.value) }));
}

function Chip({ selected, disabled, onClick, children, look, label }: { selected: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode; look: BoutiqueLook; label?: string }) {
  const t = look.tokens;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={label}
      className="min-h-10 min-w-11 rounded-[8px] border px-3 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
      style={{
        borderColor: selected ? t.ink : t.border,
        background: selected ? t.ink : "transparent",
        color: selected ? (look.dark ? "#0A0A0A" : "#fff") : t.ink,
        textDecoration: disabled ? "line-through" : undefined,
      }}
    >
      {children}
    </button>
  );
}

export function BoutiqueProductView(props: Props) {
  const { product, look, shopper, interactive } = props;
  const t = look.tokens;
  const variants = useMemo(() => readVariants(product.variants), [product.variants]);
  const groups = useMemo(() => variantGroups(variants), [variants]);
  const firstAvailable = variants.find((variant) => typeof variant.stock !== "number" || variant.stock > 0) ?? variants[0];
  const [colour, setColour] = useState<string | undefined>(firstAvailable?.color?.trim() || undefined);
  const [size, setSize] = useState<string | undefined>(firstAvailable?.size?.trim() || undefined);
  const [name, setName] = useState<string | undefined>(groups.names.length ? (firstAvailable?.name || firstAvailable?.sku)?.trim() : undefined);
  const [quantity, setQuantity] = useState(1);
  const [tab, setTab] = useState<"details" | "reviews" | "delivery">("details");
  const [index, setIndex] = useState(0);
  const [notice, setNotice] = useState("");
  const galleryRef = useRef<HTMLDivElement>(null);
  const tabsId = useId();

  const selected = variants.length ? matchVariant(variants, { colour, size, name }) : null;
  const stock = typeof selected?.stock === "number" ? selected.stock : null;
  const soldOut = (variants.length > 0 && !selected) || (stock !== null && stock <= 0);
  const price = selected?.price ?? product.retailPrice;
  const compareAt = product.compareAtPrice && product.compareAtPrice > price ? product.compareAtPrice : null;
  const variantImages = [selected?.imageUrl, ...(selected?.images ?? [])].filter((src): src is string => Boolean(src));
  const images = [...new Set([...variantImages, ...product.images])];
  const specs = readSpecs(product.specifications);
  const delivery = deliveryLines(shopper, props.currency);
  const wished = props.wishlistIds.includes(product.id);
  const maxQuantity = stock !== null ? Math.max(1, stock) : 99;

  useEffect(() => {
    setIndex(0);
    galleryRef.current?.scrollTo({ left: 0 });
  }, [selected?.imageUrl]);

  useEffect(() => {
    if (quantity > maxQuantity) setQuantity(maxQuantity);
  }, [maxQuantity, quantity]);

  const inStock = (variant: { stock?: number }) => typeof variant.stock !== "number" || variant.stock > 0;

  function chooseColour(value: string) {
    setColour(value);
    if (!matchVariant(variants, { colour: value, size, name })) {
      const next = variants.find((variant) => variant.color?.trim() === value && inStock(variant)) ?? variants.find((variant) => variant.color?.trim() === value);
      setSize(next?.size?.trim() || undefined);
    }
  }

  function chooseSize(value: string) {
    setSize(value);
    if (!matchVariant(variants, { colour, size: value, name })) {
      const next = variants.find((variant) => variant.size?.trim() === value && inStock(variant)) ?? variants.find((variant) => variant.size?.trim() === value);
      setColour(next?.color?.trim() || undefined);
    }
  }

  function goTo(next: number) {
    const count = Math.max(images.length, 1);
    const target = (next + count) % count;
    setIndex(target);
    const el = galleryRef.current;
    if (el) el.scrollTo({ left: target * el.clientWidth, behavior: "smooth" });
  }

  function onGalleryScroll() {
    const el = galleryRef.current;
    if (!el || !el.clientWidth) return;
    const next = Math.round(el.scrollLeft / el.clientWidth);
    if (next !== index) setIndex(next);
  }

  function item(): AddToBagInput {
    const label = selected ? variantLabel(selected) : undefined;
    return {
      name: label ? `${product.name} - ${label}` : product.name,
      price,
      image: variantImages[0] ?? product.images[0],
      variant: label,
      quantity,
      maxQuantity: stock ?? undefined,
    };
  }

  async function share() {
    if (!interactive || !props.shareUrl) return;
    const data = { title: product.name, text: `${product.name} at ${props.storeName}`, url: props.shareUrl };
    try {
      if (navigator.share) {
        await navigator.share(data);
        return;
      }
      await navigator.clipboard.writeText(props.shareUrl);
      setNotice("Link copied");
      window.setTimeout(() => setNotice(""), 2000);
    } catch {
      /* the shopper closed the share sheet */
    }
  }

  const chat = shopper.whatsappNumber
    ? whatsappLink(shopper.whatsappNumber, `Hi ${props.storeName}, I'm asking about ${product.name}${selected ? ` (${variantLabel(selected)})` : ""}${props.shareUrl ? `: ${props.shareUrl}` : ""}`)
    : null;

  const ratingLine = props.reviewCount > 0 ? (
    <button type="button" onClick={() => { setTab("reviews"); document.getElementById(`${tabsId}-panel`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }} className="inline-flex items-center gap-2 border-0 bg-transparent p-0 text-[13px]" style={{ color: t.muted, cursor: "pointer" }}>
      <Stars rating={props.avgRating} color="#F2A93B" />
      <span>
        {props.avgRating.toFixed(1)} · {props.reviewCount} {props.reviewCount === 1 ? "review" : "reviews"}
      </span>
    </button>
  ) : (
    <span className="text-[13px]" style={{ color: t.muted }}>No reviews yet</span>
  );

  const gallery = (
    <div className="bq-pdp-gallery">
      <div className="relative">
        <div ref={galleryRef} className="bq-gallery" onScroll={onGalleryScroll} aria-roledescription="carousel" aria-label={`${product.name} photos`} tabIndex={0}>
          {images.length ? (
            images.map((src, i) => (
              <div key={src} className="bq-media" role="group" aria-roledescription="slide" aria-label={`Photo ${i + 1} of ${images.length}`}>
                <img src={src} alt={i === 0 ? product.name : `${product.name}, photo ${i + 1}`} width={900} height={900} loading={i === 0 ? "eager" : "lazy"} fetchPriority={i === 0 ? "high" : undefined} decoding="async" />
              </div>
            ))
          ) : (
            <div className="bq-media grid place-items-center" aria-label="No photo yet">
              <Icon name="image" size={40} color={look.dark ? "#3A3A3A" : "#C9CCCF"} />
            </div>
          )}
        </div>
        {images.length > 1 ? (
          <span className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5 bq-only-narrow" aria-hidden>
            {images.map((src, i) => (
              <span key={src} className="block h-1.5 rounded-full transition-all" style={{ width: i === index ? 18 : 6, background: i === index ? "#fff" : "rgba(255,255,255,.6)" }} />
            ))}
          </span>
        ) : null}
      </div>
      {images.length > 1 ? (
        <div className="mt-3 flex items-center gap-2">
          <button type="button" onClick={() => goTo(index - 1)} className="bq-icon-btn shrink-0 border" style={{ borderColor: t.border, width: 32, height: 32 }} aria-label="Previous photo">
            <Icon name="arrowLeft" size={14} />
          </button>
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto">
            {images.map((src, i) => (
              <button key={src} type="button" onClick={() => goTo(i)} aria-label={`Show photo ${i + 1}`} aria-current={i === index ? "true" : undefined} className="bq-media h-16 w-20 shrink-0 cursor-pointer p-0" style={{ borderRadius: Math.min(look.cardRadius, 10), border: `2px solid ${i === index ? t.accent : "transparent"}` }}>
                <img src={src} alt="" width={80} height={64} loading="lazy" />
              </button>
            ))}
          </div>
          <button type="button" onClick={() => goTo(index + 1)} className="bq-icon-btn shrink-0 border" style={{ borderColor: t.border, width: 32, height: 32 }} aria-label="Next photo">
            <Icon name="chevRight" size={14} />
          </button>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="bq-wrap py-6">
      <nav aria-label="Breadcrumb" className="mb-4 text-[13px]" style={{ color: t.muted }}>
        <ol className="flex flex-wrap items-center gap-1">
          {props.crumbs.map((crumb, i) => {
            const last = i === props.crumbs.length - 1;
            return (
              <li key={`${crumb.label}-${i}`} className="flex items-center gap-1">
                {last || !crumb.onSelect ? (
                  <span aria-current={last ? "page" : undefined} style={{ color: last ? t.ink : undefined, fontWeight: last ? 600 : 400 }}>{crumb.label}</span>
                ) : (
                  <button type="button" onClick={crumb.onSelect} className="border-0 bg-transparent p-0 hover:underline" style={{ color: "inherit", cursor: "pointer" }}>{crumb.label}</button>
                )}
                {!last ? <span aria-hidden>/</span> : null}
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="bq-pdp">
        {gallery}
        <div>
          <h1 className="bq-h text-[28px] @3xl:text-[34px]" style={{ ...look.headingStyle, fontWeight: 600 }}>{product.name}</h1>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-baseline gap-2.5">
              <span className="text-[24px] font-bold">{formatStoreMoney(price, props.currency)}</span>
              {compareAt ? (
                <span className="text-[14px] line-through" style={{ color: t.muted }}>
                  <span className="sr-only">Was </span>
                  {formatStoreMoney(compareAt, props.currency)}
                </span>
              ) : null}
            </p>
            {ratingLine}
          </div>
          {product.description ? <p className="mt-4 text-[15px] leading-7" style={{ color: t.muted }}>{product.description}</p> : null}

          {groups.colours.length ? (
            <fieldset className="mt-5">
              <legend className="text-[14px]">Colour: <strong>{colour ?? "Choose"}</strong></legend>
              <div className="mt-2.5 flex flex-wrap gap-2.5">
                {groups.colours.map((value) => {
                  const hex = colourHex(value);
                  const on = colour === value;
                  const available = variants.some((variant) => variant.color?.trim() === value && (typeof variant.stock !== "number" || variant.stock > 0));
                  return hex ? (
                    <button key={value} type="button" onClick={() => chooseColour(value)} aria-pressed={on} aria-label={`${value}${available ? "" : ", sold out"}`} className="grid h-10 w-10 place-items-center rounded-full" style={{ boxShadow: on ? `0 0 0 2px ${t.paperBg}, 0 0 0 4px ${t.ink}` : `0 0 0 1px ${t.border}`, opacity: available ? 1 : 0.45, cursor: "pointer" }}>
                      <span className="block h-8 w-8 rounded-full" style={{ background: hex }} />
                    </button>
                  ) : (
                    <Chip key={value} selected={on} disabled={!available} onClick={() => chooseColour(value)} look={look}>{value}</Chip>
                  );
                })}
              </div>
            </fieldset>
          ) : null}

          {groups.sizes.length ? (
            <fieldset className="mt-5">
              <legend className="text-[14px]">Size: <strong>{size ?? "Choose"}</strong></legend>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {groups.sizes.map((value) => {
                  const available = variants.some((variant) => variant.size?.trim() === value && (!colour || variant.color?.trim() === colour) && inStock(variant));
                  return (
                    <Chip key={value} selected={size === value} disabled={!available} onClick={() => chooseSize(value)} look={look} label={available ? undefined : `${value}, sold out`}>{value}</Chip>
                  );
                })}
              </div>
            </fieldset>
          ) : null}

          {groups.names.length ? (
            <fieldset className="mt-5">
              <legend className="text-[14px]">Option: <strong>{name ?? "Choose"}</strong></legend>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {groups.names.map((value) => {
                  const variant = variants.find((entry) => (entry.name || entry.sku)?.trim() === value);
                  const available = typeof variant?.stock !== "number" || variant.stock > 0;
                  return <Chip key={value} selected={name === value} disabled={!available} onClick={() => setName(value)} look={look}>{value}</Chip>;
                })}
              </div>
            </fieldset>
          ) : null}

          {selected?.customFields?.some((field) => field.name && field.value) ? (
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]" style={{ color: t.muted }}>
              {selected.customFields.filter((field) => field.name && field.value).map((field) => (
                <div key={field.name} className="contents">
                  <dt>{field.name}</dt>
                  <dd className="m-0 font-semibold" style={{ color: t.ink }}>{field.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          <div className="mt-5 flex items-center gap-3">
            <span className="text-[14px]" id={`${tabsId}-qty`}>Quantity</span>
            <div className="inline-flex items-center rounded-full border" style={{ borderColor: t.border }} role="group" aria-labelledby={`${tabsId}-qty`}>
              <button type="button" className="bq-icon-btn" onClick={() => setQuantity((value) => Math.max(1, value - 1))} disabled={quantity <= 1} aria-label="One fewer">
                <Icon name="minus" size={14} />
              </button>
              <output className="w-8 text-center text-[15px] font-semibold" aria-live="polite">{quantity}</output>
              <button type="button" className="bq-icon-btn" onClick={() => setQuantity((value) => Math.min(maxQuantity, value + 1))} disabled={quantity >= maxQuantity} aria-label="One more">
                <Icon name="plus" size={14} />
              </button>
            </div>
            {stock !== null && stock > 0 && stock <= 5 ? <span className="text-[13px] font-semibold" style={{ color: "#C2410C" }}>Only {stock} left</span> : null}
          </div>

          <div className="mt-5 grid gap-2.5">
            <button type="button" className="bq-btn w-full" style={look.solidButton} disabled={soldOut || !interactive} onClick={() => props.onAddToBag?.(item())}>
              {soldOut ? "Sold out" : "+ Add to bag"}
            </button>
            <button type="button" className="bq-btn w-full" style={look.softButton} disabled={soldOut || !interactive} onClick={() => props.onBuyNow?.(item())}>
              Buy now
            </button>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 text-[14px] font-medium">
            {chat ? (
              <a href={interactive ? chat : undefined} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px]" aria-label={`Ask about ${product.name} on WhatsApp`}>
                <Icon name="whatsapp" size={17} /> Ask on WhatsApp
              </a>
            ) : <span aria-hidden />}
            <button type="button" onClick={() => props.onToggleWishlist?.(product.id)} disabled={!props.onToggleWishlist} aria-pressed={wished} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border-0 bg-transparent" style={{ color: t.ink, cursor: "pointer" }}>
              <Icon name="heart" size={17} fill={wished ? "currentColor" : "none"} /> {wished ? "Saved" : "Wishlist"}
            </button>
            <button type="button" onClick={share} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border-0 bg-transparent" style={{ color: t.ink, cursor: "pointer" }}>
              <Icon name="upload" size={17} /> {notice || "Share"}
            </button>
          </div>

          <div className="mt-4 grid gap-2 rounded-[12px] p-4 text-[13.5px]" style={{ background: look.raised }}>
            <div className="flex items-start gap-2.5">
              <Icon name="truck" size={18} className="mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="font-semibold">Delivery</div>
                {delivery.length ? (
                  <ul className="mt-1 grid gap-0.5" style={{ color: t.muted }}>
                    {delivery.map((line) => (
                      <li key={line.place}><span style={{ color: t.ink }}>{line.place}:</span> {line.detail}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1" style={{ color: t.muted }}>Delivery fee is worked out at checkout from your address.</p>
                )}
              </div>
            </div>
            {shopper.payOnDelivery ? (
              <div className="flex items-center gap-2.5 font-semibold">
                <Icon name="checkCircle" size={18} color={look.dark ? t.accent : "#16794A"} />
                <span>
                  Pay on delivery available
                  {shopper.payOnDeliveryLimit ? <span className="font-normal" style={{ color: t.muted }}> (orders up to {formatStoreMoney(shopper.payOnDeliveryLimit, props.currency)})</span> : null}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-10">
        <div role="tablist" aria-label="Product information" className="flex gap-6 overflow-x-auto border-b" style={{ borderColor: t.border }}>
          {([
            ["details", "Product details"],
            ["reviews", `Reviews${props.reviewCount ? ` (${props.reviewCount})` : ""}`],
            ["delivery", "Delivery and returns"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              id={`${tabsId}-${key}`}
              aria-selected={tab === key}
              aria-controls={`${tabsId}-panel`}
              tabIndex={tab === key ? 0 : -1}
              onClick={() => setTab(key)}
              onKeyDown={(event) => {
                const order = ["details", "reviews", "delivery"] as const;
                const at = order.indexOf(key);
                if (event.key === "ArrowRight") setTab(order[(at + 1) % 3]!);
                if (event.key === "ArrowLeft") setTab(order[(at + 2) % 3]!);
              }}
              className="shrink-0 border-0 bg-transparent px-0 pb-3 text-[15px]"
              style={{ color: tab === key ? t.ink : t.muted, fontWeight: tab === key ? 600 : 400, borderBottom: `2px solid ${tab === key ? t.ink : "transparent"}`, cursor: "pointer" }}
            >
              {label}
            </button>
          ))}
        </div>
        <div id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-${tab}`} className="py-6">
          {tab === "details" ? (
            <div className="bq-cols-2">
              <div>
                <h2 className="bq-h text-[24px]" style={look.headingStyle}>Product details</h2>
                {product.longDescription ? <p className="mt-3 whitespace-pre-line text-[14.5px] leading-7" style={{ color: t.muted }}>{product.longDescription}</p> : null}
                {!product.longDescription && !specs.length ? <p className="mt-3 text-[14.5px] leading-7" style={{ color: t.muted }}>{product.description || "The seller hasn't added more details yet. Ask on WhatsApp or through the contact page."}</p> : null}
                {product.careInstructions ? (
                  <p className="mt-3 text-[14px] leading-6" style={{ color: t.muted }}><strong style={{ color: t.ink }}>Care:</strong> {product.careInstructions}</p>
                ) : null}
                {product.sku ? <p className="mt-3 text-[12.5px]" style={{ color: t.muted }}>SKU {selected?.sku ?? product.sku}</p> : null}
              </div>
              {specs.length ? (
                <div className="rounded-[16px] p-5" style={{ background: look.raised }}>
                  <h3 className="text-[18px] font-semibold">Specifications</h3>
                  <dl className="mt-3 rounded-[10px] px-4" style={{ background: look.dark ? t.paperBg : "#fff" }}>
                    {specs.map((spec) => (
                      <div key={spec.name} className="flex justify-between gap-4 border-b py-2.5 text-[14px] last:border-b-0" style={{ borderColor: t.border }}>
                        <dt className="font-semibold">{spec.name}</dt>
                        <dd className="m-0 text-right" style={{ color: t.muted }}>{spec.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}
            </div>
          ) : null}
          {tab === "reviews" ? (
            props.reviews.length ? (
              <div className="bq-cols-2">
                <div>
                  <div className="text-[40px] font-semibold leading-none">{props.avgRating.toFixed(1)}</div>
                  <div className="mt-2"><Stars rating={props.avgRating} size={18} color="#F2A93B" /></div>
                  <p className="mt-2 text-[13.5px]" style={{ color: t.muted }}>From {props.reviewCount} {props.reviewCount === 1 ? "review" : "reviews"} by customers who ordered.</p>
                </div>
                <ul className="grid gap-3">
                  {props.reviews.map((review) => (
                    <li key={review.id} className="rounded-[14px] p-4" style={{ background: look.raised }}>
                      <div className="flex items-center justify-between gap-2">
                        <Stars rating={review.rating} color="#F2A93B" />
                        <span className="sr-only">{review.rating} out of 5</span>
                        <time className="text-[12px]" dateTime={review.createdAt} style={{ color: t.muted }}>{new Date(review.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" })}</time>
                      </div>
                      {review.title ? <p className="mt-2 text-[14px] font-semibold">{review.title}</p> : null}
                      {review.body ? <p className="mt-1 text-[14px] leading-6" style={{ color: t.muted }}>{review.body}</p> : null}
                      <p className="mt-2 text-[13px] font-semibold">{review.buyerName}</p>
                      {review.sellerReply ? <p className="mt-2 border-l-2 pl-3 text-[13px]" style={{ borderColor: t.accent, color: t.muted }}><strong style={{ color: t.ink }}>{props.storeName}:</strong> {review.sellerReply}</p> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-[14.5px]" style={{ color: t.muted }}>No reviews yet. Customers can review this after their order arrives.</p>
            )
          ) : null}
          {tab === "delivery" ? (
            <div className="bq-cols-2 text-[14.5px] leading-7" style={{ color: t.muted }}>
              <div>
                <h2 className="bq-h text-[22px]" style={{ ...look.headingStyle, color: t.ink }}>Delivery</h2>
                {product.shippingInfo ? <p className="mt-2 whitespace-pre-line">{product.shippingInfo}</p> : null}
                {delivery.length ? (
                  <ul className="mt-2">
                    {delivery.map((line) => <li key={line.place}><span style={{ color: t.ink }}>{line.place}:</span> {line.detail}</li>)}
                  </ul>
                ) : !product.shippingInfo ? <p className="mt-2">Your delivery fee is shown at checkout once you enter your address.</p> : null}
              </div>
              <div>
                <h2 className="bq-h text-[22px]" style={{ ...look.headingStyle, color: t.ink }}>Returns</h2>
                <p className="mt-2 whitespace-pre-line">{product.returnPolicy || `Ask ${props.storeName} about returns before you order${shopper.whatsappNumber ? " on WhatsApp" : ""}.`}</p>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {props.related.length ? (
        <section className="mt-6" aria-labelledby={`${tabsId}-explore`}>
          <SectionTitle look={look} id={`${tabsId}-explore`}>Explore</SectionTitle>
          <div className="bq-rail">
            {props.related.slice(0, 8).map((entry) => (
              <ProductTile
                key={entry.id}
                product={entry}
                look={look}
                href={props.relatedHref?.(entry.id)}
                onOpen={props.onOpenRelated ? () => props.onOpenRelated?.(entry.id) : undefined}
                wished={props.wishlistIds.includes(entry.id)}
                onToggleWishlist={props.onToggleWishlist}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
