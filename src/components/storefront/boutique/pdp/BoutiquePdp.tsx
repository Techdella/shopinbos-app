"use client";

import { useEffect, useId, useRef, useState } from "react";
import type React from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { deliveryLines, formatStoreMoney, whatsappLink } from "@/lib/storefront/shopper-info";
import { colourHex, type ShopperProduct } from "../../shopper/catalog";
import { useVariantPicker } from "../../shopper/useVariantPicker";
import { SectionTitle } from "../BoutiqueChrome";
import type { AddToBagInput, BoutiqueProductViewProps } from "../BoutiqueProductView";
import type { BoutiqueLook } from "../look";
import { ProductTile } from "../ProductTile";
import { PdpDetails } from "./PdpDetails";
import { PdpGallery } from "./PdpGallery";
import { PdpReviews, Stars } from "./PdpReviews";
import { PDP_CSS } from "./pdp-css";
import {
  productVideo,
  pushRecentlyViewed,
  recentlyViewedKey,
  savingsPercent,
  stockStatus,
  trustBadges,
  type PdpBuyBlock,
  type PdpPageBlock,
  type PdpSettings,
} from "./pdp-logic";

type Props = BoutiqueProductViewProps & { settings: PdpSettings };

function Chip({ selected, disabled, onClick, children, look, label }: { selected: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode; look: BoutiqueLook; label?: string }) {
  const t = look.tokens;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={label}
      className="min-h-11 min-w-12 border px-4 text-[13.5px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
      style={{
        borderRadius: Math.min(look.buttonRadius, 999),
        borderColor: selected ? t.ink : t.border,
        background: selected ? t.ink : "transparent",
        color: selected ? (look.dark ? "#0A0A0A" : "#fff") : t.ink,
        textDecoration: disabled ? "line-through" : undefined,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function readRecent(slug: string): string[] {
  try {
    const raw = window.localStorage.getItem(recentlyViewedKey(slug));
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

/** The 2026 themes' product page: gallery, buy box, trust badges, details, reviews and product rails, laid out per settings. */
export function BoutiquePdp(props: Props) {
  const { product, look, shopper, interactive, settings } = props;
  const t = look.tokens;
  const editor = !interactive;
  const uid = useId().replace(/:/g, "");
  const picker = useVariantPicker(product);
  const [quantity, setQuantity] = useState(1);
  const [notice, setNotice] = useState("");
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [showSticky, setShowSticky] = useState(false);
  const buttonsRef = useRef<HTMLDivElement>(null);

  const { selected, soldOut, price, compareAt } = picker;
  const variantStock = picker.stock;
  // A version without its own count uses the product's stock (or the supplier's for dropship).
  const status = stockStatus({
    soldOut,
    variantStock,
    supplierStock: product.supplierProduct?.stockQuantity ?? null,
    currentStock: product.currentStock ?? null,
    lowStockThreshold: product.lowStockThreshold ?? null,
  });
  const savings = savingsPercent(price, compareAt);
  const variantImages = [picker.image, ...(selected?.images ?? [])].filter((src): src is string => Boolean(src));
  const images = [...new Set([...variantImages, ...product.images])];
  const video = productVideo(product.videoUrl);
  const delivery = deliveryLines(shopper, props.currency);
  const badges = trustBadges(settings.trust, shopper, product, props.currency);
  const wished = props.wishlistIds.includes(product.id);
  const maxQuantity = variantStock !== null ? Math.max(1, variantStock) : 99;
  const related = props.related;
  const reviewsId = `${uid}-reviews`;
  const detailsId = `${uid}-details`;
  const showReviews = settings.sections.includes("reviews");

  useEffect(() => {
    if (quantity > maxQuantity) setQuantity(maxQuantity);
  }, [maxQuantity, quantity]);

  // Recently viewed: what this shopper opened before (this store only), then remember this product.
  useEffect(() => {
    if (!interactive || !props.reviewSlug) return;
    const before = readRecent(props.reviewSlug);
    setRecentIds(before.filter((id) => id !== product.id));
    try {
      window.localStorage.setItem(recentlyViewedKey(props.reviewSlug), JSON.stringify(pushRecentlyViewed(before, product.id)));
    } catch {
      /* private mode or storage full: nothing to remember */
    }
  }, [interactive, props.reviewSlug, product.id]);

  // Sticky bar on phones once the main buttons scroll out of view.
  useEffect(() => {
    const el = buttonsRef.current;
    if (!settings.stickyBar || !el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setShowSticky(Boolean(entry && !entry.isIntersecting && entry.boundingClientRect.top < 0)));
    observer.observe(el);
    return () => observer.disconnect();
  }, [settings.stickyBar]);

  function item(): AddToBagInput {
    const label = selected?.name;
    return {
      name: label ? `${product.name} · ${label}` : product.name,
      price,
      image: variantImages[0] ?? product.images[0],
      ...picker.line,
      quantity,
      maxQuantity: variantStock ?? undefined,
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

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const chat = shopper.whatsappNumber
    ? whatsappLink(shopper.whatsappNumber, `Hi ${props.storeName}, I'm asking about ${product.name}${selected ? ` (${selected.name})` : ""}${props.shareUrl ? `: ${props.shareUrl}` : ""}`)
    : null;
  const addLabel = soldOut ? "Sold out" : settings.labels.addToBag;

  const blocks: Record<PdpBuyBlock, () => React.ReactNode> = {
    price: () => (
      <div className="bq-pdp2-row gap-x-3 gap-y-1">
        <span className="text-[24px] font-bold tracking-[-0.01em]" aria-label={`Price ${formatStoreMoney(price, props.currency)}`}>{formatStoreMoney(price, props.currency)}</span>
        {compareAt ? (
          <span className="text-[15px] line-through" style={{ color: t.muted }}>
            <span className="sr-only">Was </span>
            {formatStoreMoney(compareAt, props.currency)}
          </span>
        ) : null}
        {savings ? (
          <span className="px-2.5 py-1 text-[12px] font-bold" style={{ background: t.accent, color: look.onAccent, borderRadius: Math.min(look.buttonRadius, 999) || 2 }}>Save {savings}%</span>
        ) : null}
      </div>
    ),
    rating: () =>
      props.reviewCount > 0 ? (
        <div className="bq-pdp2-row">
          <button type="button" onClick={() => showReviews && scrollTo(reviewsId)} disabled={!showReviews} className="inline-flex items-center gap-2 border-0 bg-transparent p-0 text-[13.5px]" style={{ color: t.muted, cursor: showReviews ? "pointer" : "default" }}>
            <Stars rating={props.avgRating} />
            <span className={showReviews ? "underline underline-offset-4" : undefined}>
              {props.avgRating.toFixed(1)} ({props.reviewCount} {props.reviewCount === 1 ? "review" : "reviews"})
            </span>
          </button>
        </div>
      ) : null,
    summary: () => (product.description?.trim() ? <p className="text-[15px] leading-7" style={{ color: t.muted }}>{product.description}</p> : null),
    variants: () => {
      if (!picker.options.length) return null;
      return (
        <div className="grid gap-5">
          {picker.options.map((option) => (
            <fieldset key={option.name}>
              <legend className="text-[14px]">{option.name}: <strong>{picker.selection[option.name] ?? "Choose"}</strong></legend>
              <div className={`bq-pdp2-row mt-2.5 ${option.colour ? "gap-2.5" : "gap-2"}`}>
                {option.values.map((value) => {
                  const on = picker.selection[option.name] === value;
                  const available = picker.available(option.name, value);
                  const hex = option.colour ? colourHex(value) : null;
                  return hex ? (
                    <button key={value} type="button" onClick={() => picker.pick(option.name, value)} aria-pressed={on} aria-label={`${value}${available ? "" : ", sold out"}`} title={value} className="relative grid h-11 w-11 place-items-center rounded-full border-0 bg-transparent p-0" style={{ boxShadow: on ? `0 0 0 2px ${t.paperBg}, 0 0 0 4px ${t.ink}` : `0 0 0 1px ${t.border}`, opacity: available ? 1 : 0.45, cursor: "pointer" }}>
                      <span className="block h-8 w-8 rounded-full" style={{ background: hex, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.08)" }} />
                      {!available ? <span aria-hidden className="absolute h-[2px] w-9 rotate-45" style={{ background: t.ink }} /> : null}
                    </button>
                  ) : (
                    <Chip key={value} selected={on} disabled={!available && !on} onClick={() => picker.pick(option.name, value)} look={look} label={available ? undefined : `${value}, sold out`}>{value}</Chip>
                  );
                })}
              </div>
            </fieldset>
          ))}
          {selected?.customFields?.some((field) => field.name && field.value) ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-left text-[13px]" style={{ color: t.muted }}>
              {selected.customFields.filter((field) => field.name && field.value).map((field) => (
                <div key={field.name} className="contents">
                  <dt>{field.name}</dt>
                  <dd className="m-0 font-semibold" style={{ color: t.ink }}>{field.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      );
    },
    stock: () =>
      status ? (
        <p className="bq-pdp2-row gap-2 text-[13.5px] font-semibold" role="status" style={{ color: status.tone === "low" ? "#C2410C" : status.tone === "out" ? t.muted : look.dark ? t.accent : "#16794A" }}>
          <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: "currentColor" }} />
          {status.text}
        </p>
      ) : null,
    quantity: () => (
      <div className="bq-pdp2-row gap-3">
        <span className="text-[14px]" id={`${uid}-qty`}>Quantity</span>
        <div className="inline-flex items-center rounded-full border" style={{ borderColor: t.border }} role="group" aria-labelledby={`${uid}-qty`}>
          <button type="button" className="bq-icon-btn" onClick={() => setQuantity((value) => Math.max(1, value - 1))} disabled={quantity <= 1} aria-label="One fewer">
            <Icon name="minus" size={14} />
          </button>
          <output className="w-8 text-center text-[15px] font-semibold" aria-live="polite">{quantity}</output>
          <button type="button" className="bq-icon-btn" onClick={() => setQuantity((value) => Math.min(maxQuantity, value + 1))} disabled={quantity >= maxQuantity} aria-label="One more">
            <Icon name="plus" size={14} />
          </button>
        </div>
      </div>
    ),
    buttons: () => (
      <div ref={buttonsRef} className="grid gap-2.5">
        <div className="flex gap-2.5">
          <button type="button" className="bq-btn min-h-[50px] flex-1" style={look.solidButton} disabled={soldOut || !interactive} onClick={() => props.onAddToBag?.(item())}>
            {soldOut ? null : <Icon name="bag" size={17} />} {addLabel}
          </button>
          {props.onToggleWishlist || editor ? (
            <button type="button" onClick={() => props.onToggleWishlist?.(product.id)} disabled={!props.onToggleWishlist} aria-pressed={wished} aria-label={wished ? "Remove from wishlist" : "Save to wishlist"} className="grid min-h-[50px] w-[52px] shrink-0 place-items-center border" style={{ borderColor: t.border, borderRadius: look.buttonRadius, background: "transparent", color: wished ? look.heartActive : t.ink, cursor: "pointer" }}>
              <Icon name="heart" size={19} fill={wished ? "currentColor" : "none"} />
            </button>
          ) : null}
        </div>
        {/* No separate Buy now when the main button already checks out (stores selling with one Buy now button). */}
        {props.onBuyNow || editor ? (
          <button type="button" className="bq-btn min-h-[50px] w-full" style={look.softButton} disabled={soldOut || !interactive} onClick={() => props.onBuyNow?.(item())}>
            {settings.labels.buyNow}
          </button>
        ) : null}
      </div>
    ),
    actions: () => (
      <div className="bq-pdp2-row gap-x-5 gap-y-2 text-[14px] font-medium">
        {chat ? (
          <a href={interactive ? chat : undefined} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2" aria-label={`Ask about ${product.name} on WhatsApp`}>
            <Icon name="whatsapp" size={17} /> Ask on WhatsApp
          </a>
        ) : null}
        <button type="button" onClick={share} className="inline-flex min-h-11 items-center gap-2 border-0 bg-transparent p-0" style={{ color: t.ink, cursor: "pointer" }}>
          <Icon name="upload" size={17} /> {notice || "Share"}
        </button>
      </div>
    ),
    trust: () =>
      badges.length ? (
        <ul className="bq-pdp2-trust text-left" aria-label="Why shop with us">
          {badges.map((badge) => {
            const content = (
              <>
                <Icon name={badge.icon as IconName} size={18} className="shrink-0" />
                <span className="min-w-0 text-[12.5px] font-semibold leading-4">{badge.title}</span>
              </>
            );
            return (
              <li key={badge.id}>
                {badge.id === "returns" && settings.sections.includes("details") ? (
                  <button type="button" onClick={() => scrollTo(detailsId)} className="flex min-h-12 w-full items-center gap-2.5 border-0 px-3 text-left" style={{ background: look.raised, color: t.ink, borderRadius: Math.min(look.cardRadius, 12), cursor: "pointer" }}>{content}</button>
                ) : (
                  <div className="flex min-h-12 items-center gap-2.5 px-3" style={{ background: look.raised, borderRadius: Math.min(look.cardRadius, 12) }}>{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : null,
    delivery: () => (
      <div className="grid gap-2 p-4 text-left text-[13.5px]" style={{ background: look.raised, borderRadius: Math.min(look.cardRadius, 12) }}>
        <div className="flex items-start gap-2.5">
          <Icon name="truck" size={18} className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="font-semibold">Delivery</div>
            {delivery.length ? (
              <ul className="mt-1 grid gap-0.5" style={{ color: t.muted }}>
                {delivery.map((line) => <li key={line.place}><span style={{ color: t.ink }}>{line.place}:</span> {line.detail}</li>)}
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
    ),
  };

  const rail = (id: string, title: string, list: ShopperProduct[]) => (
    <section key={id} aria-labelledby={`${uid}-${id}`}>
      <SectionTitle look={look} id={`${uid}-${id}`}>{title}</SectionTitle>
      <div className="bq-rail">
        {list.slice(0, 8).map((entry) => (
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
  );

  const hint = (key: string, message: string) => (
    <div key={key} className="rounded-[12px] border border-dashed px-4 py-5 text-center text-[13px]" style={{ borderColor: t.border, color: t.muted }}>{message}</div>
  );

  const pageBlocks: Record<PdpPageBlock, () => React.ReactNode> = {
    details: () => {
      const node = (
        <PdpDetails
          product={product}
          sku={selected?.sku ?? product.sku}
          look={look}
          style={settings.details}
          deliveryLines={delivery}
          storeName={props.storeName}
          hasWhatsapp={Boolean(shopper.whatsappNumber)}
          editor={editor}
        />
      );
      return (
        <section key="details" id={detailsId} aria-label="Product details" className="bq-pdp2-details scroll-mt-24">
          {node}
        </section>
      );
    },
    reviews: () => (
      <PdpReviews
        key="reviews"
        id={reviewsId}
        title={settings.labels.reviews}
        look={look}
        storeName={props.storeName}
        productId={product.id}
        productName={product.name}
        reviews={props.reviews}
        avgRating={props.avgRating}
        reviewCount={props.reviewCount}
        reviewSlug={props.reviewSlug}
        interactive={interactive}
      />
    ),
    related: () => (related.length ? rail("related", settings.labels.related, related) : editor ? hint("related", "Your other products show here once you add more.") : null),
    recent: () => {
      if (editor) return hint("recent", `${settings.labels.recent}: products this shopper opened before show here.`);
      const pool = [...(props.catalog ?? []), ...props.related];
      const list = recentIds.map((id) => pool.find((entry) => entry.id === id)).filter((entry): entry is ShopperProduct => Boolean(entry));
      return list.length ? rail("recent", settings.labels.recent, list) : null;
    },
  };

  const buyBox = (
    <div className="bq-pdp2-buy grid gap-5">
      <div>
        {product.category?.name ? (
          <p className="mb-2 text-[11.5px] uppercase tracking-[0.14em]" style={{ color: t.muted, fontFamily: look.eyebrowFont }}>{product.category.name}</p>
        ) : null}
        <h1 className="bq-h text-[28px] @3xl:text-[36px]" style={{ ...look.headingStyle, lineHeight: 1.12 }}>{product.name}</h1>
      </div>
      {settings.buyBox.map((id) => {
        const node = blocks[id]();
        return node ? <div key={id}>{node}</div> : null;
      })}
    </div>
  );

  return (
    <div className="bq-wrap bq-pdp2 py-6" data-layout={settings.layout} data-gallery={settings.gallery} style={{ ["--pdp-ratio" as string]: look.tileRatio.replace(/\s/g, "") }}>
      <style>{PDP_CSS}</style>
      {props.notice ? <div className="mb-4 rounded-[12px] border border-dashed px-4 py-2.5 text-center text-[12.5px]" style={{ borderColor: t.border, color: t.muted }}>{props.notice}</div> : null}
      {settings.breadcrumbs ? (
        <nav aria-label="Breadcrumb" className="mb-5 text-[13px]" style={{ color: t.muted }}>
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
      ) : null}

      <div className="bq-pdp2-main">
        <div className="bq-pdp2-media">
          <PdpGallery images={images} video={video} name={product.name} look={look} zoom={settings.zoom} interactive={interactive} resetKey={picker.image ?? undefined} stack={settings.layout === "gallery-stack"} />
        </div>
        <div className="bq-pdp2-info">{buyBox}</div>
      </div>

      <div className="mt-12 grid gap-14">
        {settings.sections.map((id) => pageBlocks[id]())}
      </div>

      {settings.stickyBar && settings.buyBox.includes("buttons") ? (
        <div
          className="bq-pdp2-sticky sticky z-30 -mx-4 mt-6 items-center gap-3 border-t px-4 py-2.5 transition-opacity"
          style={{ bottom: "calc(76px + env(safe-area-inset-bottom))", background: look.headerBg, borderColor: t.border, backdropFilter: "blur(8px)", opacity: showSticky || editor ? 1 : 0, pointerEvents: showSticky || editor ? undefined : "none" }}
          aria-hidden={!showSticky && !editor}
        >
          {images[0] ? <img src={images[0]} alt="" width={44} height={44} className="h-11 w-11 shrink-0 object-cover" style={{ borderRadius: Math.min(look.cardRadius, 8) }} /> : null}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-semibold">{product.name}</p>
            <p className="text-[13px]" style={{ color: t.muted }}>{formatStoreMoney(price, props.currency)}</p>
          </div>
          <button type="button" className="bq-btn shrink-0" style={look.solidButton} disabled={soldOut || !interactive} tabIndex={showSticky ? 0 : -1} onClick={() => props.onAddToBag?.(item())}>
            {addLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}
