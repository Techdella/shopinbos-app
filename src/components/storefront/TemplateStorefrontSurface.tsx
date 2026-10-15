"use client";

import { StoreFooterBadges, useStoreFooterBadges } from "@/components/storefront/shopper/StoreFooterBadges";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { rememberStoreVisitor } from "@/hooks/useStoreVisitor";
import type { StoreEditorSnapshot, TemplateBlockNode, TemplateSectionNode } from "@/lib/store-templates";
import { getTemplateManifest, isBoutiqueTheme } from "@/lib/store-templates";
import { normalizeImage } from "@/lib/store-templates/images";
import { normalizeChrome } from "@/lib/store-templates/chrome";
import { getThemeOverrides } from "@/lib/store-templates/themes";
import { readShopperInfo } from "@/lib/storefront/shopper-info";
import { getPublicStorefrontPath } from "@/lib/domains/storefront";
import { legalLinks, legalPagePath } from "@/lib/legal/pages";
import { BoutiqueStorefront } from "@/components/storefront/boutique/BoutiqueStorefront";
import { GameSection } from "@/components/storefront/gamification/GameSection";
import { isGameSectionKind } from "@/lib/gamification/logic";
import { HeroSlider, slideAlign } from "@/components/storefront/HeroSlider";
import { itemMediaUrl, readCountdownEnd, readHeroSlides, readOptionalProductLimit, readProductLimit, readSlideTiming, youTubeEmbedUrl, youTubeId, type HeroSlide } from "@/lib/store-templates/section-content";
import { findStorefrontPage } from "@shared/storefront-pages";
import type { BoutiqueProductDetail } from "@/components/storefront/boutique/BoutiqueProductView";
import { ClassicPdp } from "@/components/storefront/boutique/pdp/ClassicPdp";
import { classicLook } from "@/components/storefront/boutique/pdp/classic-look";
import { readClassicPdpSettings } from "@/components/storefront/boutique/pdp/classic-pdp";
import { samplePdpProduct } from "@/components/storefront/boutique/pdp/sample-product";
import { relatedProducts } from "@/components/storefront/shopper/catalog";

export interface SurfaceProduct {
  id: string;
  name: string;
  description?: string | null;
  images: string[];
  retailPrice: number;
  currency: string;
  category?: { id: string; name: string; slug: string } | null;
  avgRating?: number;
  reviewCount?: number;
  compareAtPrice?: number | null;
  variants?: unknown;
  supplierProduct?: { stockQuantity?: number | null } | null;
}

export interface SurfaceStore {
  id?: string;
  name: string;
  slug: string;
  description?: string | null;
  logoUrl?: string | null;
  city?: string | null;
  country?: string | null;
  currency: string;
  storeProducts: SurfaceProduct[];
  /** Delivery, payment, WhatsApp and review details from /api/public/store/[slug] (StorefrontShopperInfo). */
  shopper?: unknown;
  /** Public brand settings (legal page links for the footer). */
  brandSettings?: unknown;
}

interface RenderProduct {
  id: string;
  title: string;
  subtitle: string;
  priceLabel: string;
  imageUrl: string | undefined;
  color: string;
  purchasable: boolean;
  mappedStoreProductId: string | null;
  avgRating?: number;
  reviewCount?: number;
}

type CommerceButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "text" | "gradient" | "floating" | "sticky";
type CommerceButtonSize = "xs" | "sm" | "md" | "lg" | "xl";
type CommerceButtonShape = "square" | "rounded" | "pill" | "full";

interface TemplateStorefrontSurfaceProps {
  store: SurfaceStore;
  snapshot: StoreEditorSnapshot;
  storeBasePath?: string;
  mode?: "live" | "editor";
  device?: "desktop" | "mobile";
  selectedPage?: string;
  onSelectPage?: (page: string) => void;
  selectedSectionId?: string | null;
  onSelectSection?: (sectionId: string | null) => void;
  onInsertSectionBefore?: (sectionId: string | null) => void;
  onChangeSectionStyle?: (sectionId: string) => void;
  onDuplicateSection?: (sectionId: string) => void;
  onMoveSection?: (sectionId: string, direction: "up" | "down") => void;
  onToggleSectionVisibility?: (sectionId: string) => void;
  onDeleteSection?: (sectionId: string) => void;
  onSaveReusableSection?: (sectionId: string) => void;
  onUpdateSectionCopy?: (sectionId: string, key: string, value: string) => void;
  onUploadImage?: (file: File) => Promise<string | null>;
  onUpdateStoreLogo?: (url: string) => void;
  onUpdateSectionItem?: (sectionId: string, itemIndex: number, changes: Record<string, unknown>) => void;
  onUpdateImageBlock?: (sectionId: string, blockId: string, url: string) => void;
  cartCount?: number;
  onOpenCart?: () => void;
  onAddToCart?: (productId: string) => void;
  visitorKey?: string;
  wishlistProductIds?: string[];
  onToggleWishlist?: (productId: string) => void;
  /** ?q= from the storefront URL (search sheet on the 2026 themes). */
  initialQuery?: string;
}

function hexToRgb(hex: string) {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return "14 42 56";
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if ([r, g, b].some((value) => Number.isNaN(value))) return "14 42 56";
  return `${r} ${g} ${b}`;
}

function rgba(hex: string, alpha: number) {
  return `rgb(${hexToRgb(hex)} / ${alpha})`;
}

function blockPanelStyle(variant: unknown, theme: ReturnType<typeof themeFor>) {
  const value = String(variant ?? "plain");
  if (value === "soft" || value === "pill") {
    return { background: rgba(theme.accent, 0.08), borderColor: rgba(theme.accent, 0.18), borderRadius: 28 };
  }
  if (value === "feature" || value === "editorial") {
    return { background: theme.heroBg, borderColor: rgba(theme.accent, 0.2), borderRadius: 6, color: theme.heroText };
  }
  if (value === "outline" || value === "numbered") {
    return { background: "transparent", borderColor: theme.border, borderRadius: 6 };
  }
  if (value === "compact") {
    return { background: theme.cardBg, borderColor: theme.border, borderRadius: 14 };
  }
  return { background: theme.cardBg, borderColor: theme.border, borderRadius: theme.radius };
}

function formatMoney(currency: string, amount: number) {
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

function themeFor(snapshot: StoreEditorSnapshot) {
  const overrides = getThemeOverrides(snapshot.templateId);
  const templateStyle =
    snapshot.templateId === "metronic-shop-ui" || snapshot.layoutFamily === "marketplace-grid"
      ? "marketplace"
      : snapshot.layoutFamily === "electronics-grid"
        ? "electronics"
        : snapshot.layoutFamily === "home-living"
          ? "home"
          : snapshot.layoutFamily === "book-lifestyle"
            ? "books"
            : snapshot.layoutFamily === "pet-lifestyle"
              ? "pets"
      : snapshot.layoutFamily === "fashion-runway"
        ? "runway"
        : snapshot.layoutFamily === "editorial-boutique"
          ? "editorial"
          : snapshot.layoutFamily === "food-market"
            ? "food"
            : "minimal";

  return {
    ...snapshot.themeTokens,
    templateId: snapshot.templateId,
    templateStyle,
    headingFont:
      overrides?.headingFont ??
      (snapshot.themeTokens.headingStyle === "serif"
        ? "'Georgia', 'Times New Roman', serif"
        : "'Space Grotesk', system-ui, sans-serif"),
    bodyFont: overrides?.bodyFont ?? "'Space Grotesk', system-ui, sans-serif",
    radius:
      snapshot.themeTokens.radius === "soft"
        ? 30
        : snapshot.themeTokens.radius === "sharp"
          ? 8
          : 18,
  };
}

function normalizePageType(pageType: string) {
  if (pageType === "shop" || pageType === "menu") return "products";
  if (pageType === "gallery") return "categories";
  if (pageType === "news") return "blog";
  if (pageType === "services") return "about";
  if (["men", "women", "kids", "electronics", "fashion", "jewellery", "accessories", "sale"].includes(pageType)) return "categories";
  return pageType;
}

function pageLabel(pageType: string) {
  if (pageType === "home") return "Home";
  if (pageType === "faq") return "FAQ";
  if (pageType === "men") return "Men";
  if (pageType === "women") return "Women";
  if (pageType === "kids") return "Kids";
  if (pageType === "jewellery") return "Jewellery";
  if (pageType === "products") return "Shop";
  if (pageType === "shop") return "Shop";
  if (pageType === "menu") return "Menu";
  if (pageType === "news") return "News";
  return pageType.charAt(0).toUpperCase() + pageType.slice(1);
}

function PlaceholderImage({
  label,
  background,
  className,
}: {
  label?: string;
  background?: string;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        background: background ?? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 180,
      }}
    >
      <div style={{
        color: "rgba(255,255,255,0.7)",
        fontSize: 12,
        fontWeight: 600,
        textAlign: "center",
        padding: 12,
      }}>
        {label ?? "Click to replace image"}
      </div>
    </div>
  );
}

function renderImage(
  src: string | undefined,
  alt: string,
  color: string,
  className: string,
  label?: string,
) {
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        className={className}
        loading="lazy"
        onError={(e) => {
          const target = e.currentTarget;
          target.style.display = "none";
          const parent = target.parentElement;
          if (parent) {
            const fallback = document.createElement("div");
            fallback.className = className ?? "";
            fallback.style.background = `linear-gradient(145deg, ${color}, ${rgba(color, 0.74)})`;
            fallback.style.display = "flex";
            fallback.style.alignItems = "center";
            fallback.style.justifyContent = "center";
            fallback.style.minHeight = "180px";
            fallback.textContent = label ?? "Click to replace image";
            fallback.style.color = "rgba(255,255,255,0.7)";
            fallback.style.fontSize = "12px";
            fallback.style.fontWeight = "600";
            fallback.style.textAlign = "center";
            fallback.style.padding = "12px";
            parent.appendChild(fallback);
          }
        }}
      />
    );
  }
  return (
    <PlaceholderImage
      label={label}
      background={`linear-gradient(145deg, ${color}, ${rgba(color, 0.74)})`}
      className={className}
    />
  );
}

function isVideoSource(src?: string) {
  return Boolean(src && /\.(mp4|webm|ogg)(\?.*)?$/i.test(src));
}

function renderMedia(
  src: string | undefined,
  alt: string,
  color: string,
  className: string,
  label?: string,
) {
  if (src && youTubeId(src)) {
    const embed = youTubeEmbedUrl(src, { background: true });
    return (
      <span className={`relative block overflow-hidden ${className}`} aria-label={alt} role="img">
        <iframe src={embed ?? undefined} title={alt} tabIndex={-1} allow="autoplay; encrypted-media; picture-in-picture" className="pointer-events-none absolute left-1/2 top-1/2 h-[max(100%,56.25vw)] w-[max(100%,177.78vh)] min-h-full min-w-full -translate-x-1/2 -translate-y-1/2 border-0" />
      </span>
    );
  }
  if (isVideoSource(src)) {
    return (
      <video
        src={src}
        className={className}
        autoPlay
        muted
        loop
        playsInline
        aria-label={alt}
      />
    );
  }
  return renderImage(src, alt, color, className, label);
}

function renderImageBlock(
  block: TemplateBlockNode | undefined,
  className: string,
  fallbackLabel?: string,
  fallbackColor?: string,
) {
  const content = block?.content as Record<string, unknown> | undefined;
  const src = typeof content?.resolvedSrc === "string" && content.resolvedSrc
    ? content.resolvedSrc
    : typeof content?.originalSrc === "string" && content.originalSrc
      ? content.originalSrc
      : undefined;
  const alt = typeof content?.alt === "string" ? content.alt : fallbackLabel ?? "";
  const color = typeof content?.placeholder === "string" ? content.placeholder : fallbackColor ?? "#667eea";
  const original = typeof content?.originalSrc === "string" ? content.originalSrc : "";
  if (youTubeId(original)) return renderMedia(original, alt, color, className);
  if (isVideoSource(src)) {
    return (
      <video
        src={src}
        className={className}
        autoPlay
        muted
        loop
        playsInline
        aria-label={alt}
      />
    );
  }
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        className={className}
        loading="lazy"
        onError={(e) => {
          const target = e.currentTarget;
          target.style.display = "none";
          const parent = target.parentElement;
          if (parent) {
            const fallback = document.createElement("div");
            fallback.className = className ?? "";
            fallback.style.background = `linear-gradient(145deg, ${color}, ${rgba(color, 0.74)})`;
            fallback.style.display = "flex";
            fallback.style.alignItems = "center";
            fallback.style.justifyContent = "center";
            fallback.style.minHeight = "180px";
            fallback.textContent = fallbackLabel ?? "Click to replace image";
            fallback.style.color = "rgba(255,255,255,0.7)";
            fallback.style.fontSize = "12px";
            fallback.style.fontWeight = "600";
            fallback.style.textAlign = "center";
            fallback.style.padding = "12px";
            parent.appendChild(fallback);
          }
        }}
      />
    );
  }
  return (
    <PlaceholderImage
      label={fallbackLabel}
      background={`linear-gradient(145deg, ${color}, ${rgba(color, 0.74)})`}
      className={className}
    />
  );
}

function findImageBlock(section: TemplateSectionNode): TemplateBlockNode | undefined {
  return section.blocks?.find((b) => b.type === "image");
}

function cleanCustomerCopy(value: unknown, fallback: string) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return fallback;
  const lower = text.toLowerCase();
  const isBuilderCopy =
    lower.includes("shopinbos") ||
    lower.includes("modern commerce") ||
    lower.includes("store experience") ||
    lower.includes("synced operation") ||
    lower.includes("built to sell") ||
    lower.includes("workflow") ||
    lower.includes("connected to") ||
    lower.includes("real store data");

  return isBuilderCopy ? fallback : text;
}

function cleanStoryItem(item: Record<string, unknown>, index: number) {
  const defaults = [
    {
      title: "Curated with care",
      body: "Every product is selected for quality, fit, and everyday value.",
    },
    {
      title: "Fast delivery",
      body: "Clear delivery updates help customers know exactly what to expect.",
    },
    {
      title: "Easy support",
      body: "Questions, returns, and product help stay simple from first visit to checkout.",
    },
  ];
  const fallback = defaults[index % defaults.length]!;
  return {
    title: cleanCustomerCopy(item.title, fallback.title),
    body: cleanCustomerCopy(item.body, fallback.body),
  };
}

function resolveProductItems(items: Array<Record<string, unknown>> | undefined, store: SurfaceStore) {
  const sourceItems: Array<Record<string, unknown>> = (items && items.length > 0)
    ? items
    : store.storeProducts.length > 0
      ? store.storeProducts.slice(0, 8).map((product): Record<string, unknown> => ({ mappedStoreProductId: product.id }))
      : [
          { title: "Signature product", subtitle: "Template starter item", priceLabel: "NGN 12,000", color: "#2E7E78" },
          { title: "Customer favorite", subtitle: "Best-selling item", priceLabel: "NGN 18,500", color: "#C9973A" },
          { title: "New arrival", subtitle: "Freshly added", priceLabel: "NGN 24,000", color: "#4C6780" },
          { title: "Limited edit", subtitle: "Curated pick", priceLabel: "NGN 15,000", color: "#8A5A3A" },
        ];

  return sourceItems.map((item, index): RenderProduct => {
    const mappedId = typeof item.mappedStoreProductId === "string" ? item.mappedStoreProductId : null;
    const mapped = mappedId ? store.storeProducts.find((product) => product.id === mappedId) : null;

    if (mapped) {
      return {
        id: mapped.id,
        title: mapped.name,
        subtitle: mapped.description?.slice(0, 80) ?? String(item.subtitle ?? ""),
        priceLabel: formatMoney(mapped.currency, mapped.retailPrice),
        imageUrl: mapped.images[0] ?? (typeof item.imageUrl === "string" ? item.imageUrl : undefined),
        color: String(item.color ?? "#2E7E78"),
        purchasable: true,
        mappedStoreProductId: mapped.id,
        avgRating: (mapped as any).avgRating,
        reviewCount: (mapped as any).reviewCount,
      };
    }

    return {
      id: String(item.id ?? `demo-${index + 1}`),
      title: String(item.title ?? `Template product ${index + 1}`),
      subtitle: String(item.subtitle ?? "Demo item"),
      priceLabel: String(item.priceLabel ?? "NGN 0"),
      imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : undefined,
      color: String(item.color ?? "#2E7E78"),
      purchasable: false,
      mappedStoreProductId: null,
    };
  });
}



/** A real countdown to the end time the seller set (the old panel showed fixed sample numbers). Hidden once it ends. */
function PromoCountdown({ endsAt }: { endsAt: Date }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  if (now === null) return <div className="mt-7 h-[52px]" aria-hidden />;
  const left = Math.max(0, Math.floor((endsAt.getTime() - now) / 1000));
  if (!left) return null;
  const units: Array<[string, number]> = [["Days", Math.floor(left / 86400)], ["Hours", Math.floor((left % 86400) / 3600)], ["Min", Math.floor((left % 3600) / 60)], ["Sec", left % 60]];
  return (
    <div className="mt-7 flex gap-2" role="timer" aria-label={`Ends in ${units[0]![1]} days ${units[1]![1]} hours ${units[2]![1]} minutes`}>
      {units.map(([label, value]) => (
        <span key={label} className="grid min-w-[64px] place-items-center rounded-[12px] bg-white/10 px-3 py-2" aria-hidden>
          <span className="font-mono text-[20px] leading-none">{String(value).padStart(2, "0")}</span>
          <span className="mt-1 text-[10px] uppercase tracking-[0.12em] opacity-70">{label}</span>
        </span>
      ))}
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  body,
  headingFont,
  accent,
  ink,
  muted,
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  headingFont: string;
  accent: string;
  ink: string;
  muted: string;
}) {
  return (
    <div>
      {eyebrow ? (
        <div className="font-mono text-[11px] uppercase tracking-[0.16em]" style={{ color: accent }}>
          {eyebrow}
        </div>
      ) : null}
      <h2 className="mt-2 text-[32px] font-semibold tracking-[-0.04em]" style={{ color: ink, fontFamily: headingFont }}>
        {title}
      </h2>
      {body ? (
        <p className="mt-3 max-w-[64ch] text-[14px] leading-7" style={{ color: muted }}>
          {body}
        </p>
      ) : null}
    </div>
  );
}

function CommerceButton({
  onDark = false,
  label,
  theme,
  variant = "primary",
  size = "md",
  shape = "pill",
  icon,
  block = false,
  disabled = false,
  loading = false,
  title,
  onClick,
}: {
  label: React.ReactNode;
  theme: ReturnType<typeof themeFor>;
  variant?: CommerceButtonVariant | string;
  size?: CommerceButtonSize | string;
  shape?: CommerceButtonShape | string;
  icon?: "cart" | "heart" | "search" | "truck" | "whatsapp" | "mail" | "external" | "spark";
  block?: boolean;
  disabled?: boolean;
  loading?: boolean;
  /** Sits on a dark hero: outline, ghost and text buttons use the hero's light text colour. */
  onDark?: boolean;
  title?: string;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const sizeClass = size === "xs"
    ? "px-3 py-1.5 text-[11px]"
    : size === "sm"
      ? "px-4 py-2 text-[12px]"
      : size === "lg"
        ? "px-7 py-3.5 text-[14px]"
        : size === "xl"
          ? "px-8 py-4 text-[15px]"
          : "px-5 py-3 text-[13px]";
  const radiusClass = shape === "square" ? "rounded-none" : shape === "rounded" ? "rounded-[10px]" : shape === "full" || shape === "pill" ? "rounded-full" : "rounded-[6px]";
  const baseStyle: React.CSSProperties =
    variant === "secondary"
      ? { background: rgba(theme.accent, 0.12), color: theme.accent, borderColor: rgba(theme.accent, 0.18) }
      : variant === "outline"
        ? { background: "transparent", color: onDark ? theme.heroText : theme.ink, borderColor: onDark ? rgba(theme.heroText, 0.45) : theme.border }
        : variant === "ghost"
          ? { background: onDark ? rgba(theme.heroText, 0.12) : rgba(theme.heroBg, 0.06), color: onDark ? theme.heroText : theme.ink, borderColor: "transparent" }
          : variant === "text"
            ? { background: "transparent", color: onDark ? theme.heroText : theme.ink, borderColor: "transparent", paddingLeft: 0, paddingRight: 0 }
            : variant === "gradient"
              ? { background: `linear-gradient(135deg, ${theme.ctaBg}, ${theme.accent})`, color: theme.ctaText, borderColor: "transparent" }
              : variant === "floating"
                ? { background: theme.ctaBg, color: theme.ctaText, borderColor: "transparent", boxShadow: `0 18px 40px ${rgba(theme.heroBg, 0.2)}` }
              : { background: theme.ctaBg, color: theme.ctaText, borderColor: "transparent" };
  const iconName: IconName | null = icon === "external"
    ? "link"
    : icon === "spark"
      ? "sparkle"
      : icon === "mail"
        ? "mail"
        : icon === "whatsapp"
          ? "whatsapp"
          : icon === "cart"
            ? "cart"
            : icon === "heart"
              ? "heart"
              : icon === "search"
                ? "search"
                : icon === "truck"
                  ? "truck"
                  : null;
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled || loading}
      data-commerce-button={String(variant)}
      className={`${block ? "w-full " : ""}inline-flex items-center justify-center gap-2 border font-semibold transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-60 ${sizeClass} ${radiusClass}`}
      style={baseStyle}
    >
      {iconName ? <Icon name={iconName} size={15} color="currentColor" /> : null}
      <span>{loading ? "Please wait..." : label}</span>
    </button>
  );
}

function ProductCard({
  product,
  theme,
  onOpenProduct,
  onAddToCart,
  onToggleWishlist,
  wishlistProductIds = [],
  mode,
}: {
  product: RenderProduct;
  theme: ReturnType<typeof themeFor>;
  onOpenProduct?: () => void;
  onAddToCart?: (productId: string) => void;
  onToggleWishlist?: (productId: string) => void;
  wishlistProductIds?: string[];
  mode: "live" | "editor";
}) {
  const addHandler =
    mode === "live" && product.purchasable && onAddToCart
      ? () => onAddToCart(product.id)
      : undefined;
  const canAdd = Boolean(addHandler);
  const wished = wishlistProductIds.includes(product.id);
  const isPremium = theme.templateStyle === "editorial" || theme.templateStyle === "runway";

  return (
    <article
      onClick={onOpenProduct}
      className={isPremium ? "group bg-transparent" : "overflow-hidden border bg-white"}
      style={{
        borderColor: isPremium ? "transparent" : theme.border,
        borderRadius: isPremium ? 0 : theme.templateStyle === "marketplace" ? 6 : theme.radius,
        boxShadow: isPremium ? "none" : theme.templateStyle === "marketplace" ? "0 8px 22px rgba(18,36,52,.08)" : `0 16px 34px ${rgba(theme.heroBg, 0.08)}`,
        cursor: onOpenProduct ? "pointer" : "default",
      }}
    >
      <div className={`relative overflow-hidden ${isPremium ? "h-[340px] rounded-[6px] bg-[#F3EFE9]" : theme.templateStyle === "marketplace" ? "h-[210px]" : "h-[260px]"}`}>
        {renderImage(product.imageUrl, product.title, product.color, "h-full w-full object-cover transition-transform duration-500 group-hover:scale-105")}
        {mode === "live" && product.purchasable && onToggleWishlist ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleWishlist(product.id);
            }}
            className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white shadow-sm"
            aria-label={wished ? "Remove from wishlist" : "Save to wishlist"}
            style={{ color: wished ? theme.accent : theme.ink }}
          >
            <Icon name="heart" size={16} color="currentColor" />
          </button>
        ) : null}
        {isPremium ? (
          <div className="absolute inset-x-4 bottom-4 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                addHandler?.();
              }}
              disabled={!canAdd}
              className="w-full rounded-[4px] bg-black/90 px-4 py-3 text-[12px] font-bold uppercase tracking-[0.08em] text-white backdrop-blur disabled:cursor-default disabled:opacity-70"
            >
              Add to bag
            </button>
          </div>
        ) : null}
      </div>
      <div className={isPremium ? "px-0 py-4" : "px-5 py-4"}>
        <div className={isPremium ? "block" : "flex items-start justify-between gap-4"}>
          <div>
            {isPremium ? <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: theme.muted }}>{product.subtitle}</div> : null}
            <h3 className={isPremium ? "text-[14.5px] font-semibold leading-snug" : "text-[17px] font-semibold tracking-[-0.03em]"} style={{ color: theme.ink, fontFamily: isPremium ? theme.bodyFont : theme.headingFont }}>
              {product.title}
            </h3>
            {!isPremium ? <p className="mt-1.5 text-[13px] leading-6" style={{ color: theme.muted }}>
              {product.subtitle}
            </p> : null}
          </div>
          <div className={isPremium ? "mt-2 text-[18px] font-medium" : "shrink-0 text-[15px] font-semibold"} style={{ color: theme.ink, fontFamily: isPremium ? theme.headingFont : theme.bodyFont }}>
            {product.priceLabel}
          </div>
        </div>
        {product.avgRating && product.avgRating > 0 ? (
          <div className="mt-2 flex items-center gap-1.5">
            <span style={{ color: "#f59e0b", fontSize: 12, letterSpacing: 1 }}>
              {"★".repeat(Math.round(product.avgRating))}{"☆".repeat(5 - Math.round(product.avgRating))}
            </span>
            <span style={{ fontSize: 11, color: theme.muted }}>{product.avgRating.toFixed(1)} ({product.reviewCount ?? 0})</span>
          </div>
        ) : null}
        {!isPremium ? <div className="mt-3">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              addHandler?.();
            }}
            disabled={!canAdd}
            className="w-full rounded-full px-5 py-3 text-[13px] font-semibold disabled:cursor-default disabled:opacity-60"
            style={{ background: theme.ctaBg, color: theme.ctaText }}
          >
            Add to cart
          </button>
        </div> : null}
      </div>
    </article>
  );
}

/**
 * Renders a store snapshot. The 2026 themes (THEME_LIBRARY) have their own renderer; every other
 * template uses the classic section renderer below.
 */
export function TemplateStorefrontSurface(props: TemplateStorefrontSurfaceProps) {
  const [ownPage, setOwnPage] = useState(props.selectedPage ?? "home");
  // Every page shows the same announcement bar, header and footer (the home page's, for older saves that kept a
  // different copy per page). Same object back when the snapshot is already consistent.
  const snapshot = useMemo(() => normalizeChrome(props.snapshot), [props.snapshot]);
  const themeId = snapshot.templateId;
  if (!isBoutiqueTheme(themeId)) return <ClassicTemplateSurface {...props} snapshot={snapshot} />;
  return (
    <BoutiqueStorefront
      themeId={themeId}
      store={props.store}
      snapshot={snapshot}
      storeBasePath={props.storeBasePath}
      mode={props.mode ?? "live"}
      device={props.device ?? "desktop"}
      currentPage={props.selectedPage ?? ownPage}
      onNavigate={props.onSelectPage ?? setOwnPage}
      selectedSectionId={props.selectedSectionId}
      onSelectSection={props.onSelectSection}
      cartCount={props.cartCount ?? 0}
      onOpenCart={props.onOpenCart}
      onAddToCart={props.onAddToCart}
      visitorKey={props.visitorKey}
      wishlistProductIds={props.wishlistProductIds ?? []}
      onToggleWishlist={props.onToggleWishlist}
      initialQuery={props.initialQuery}
    />
  );
}

function ClassicTemplateSurface({
  store,
  snapshot,
  storeBasePath,
  mode = "live",
  device = "desktop",
  selectedPage,
  onSelectPage,
  selectedSectionId,
  onSelectSection,
  onInsertSectionBefore,
  onChangeSectionStyle,
  onDuplicateSection,
  onMoveSection,
  onToggleSectionVisibility,
  onDeleteSection,
  onSaveReusableSection,
  onUpdateSectionCopy,
  onUploadImage,
  onUpdateStoreLogo,
  onUpdateSectionItem,
  onUpdateImageBlock,
  cartCount = 0,
  onOpenCart,
  onAddToCart,
  visitorKey,
  wishlistProductIds = [],
  onToggleWishlist,
}: TemplateStorefrontSurfaceProps) {
  const theme = useMemo(() => themeFor(snapshot), [snapshot]);
  // The product page is the shared one (BoutiquePdp) in this template's colours, fonts and shape.
  const pdpLook = useMemo(() => classicLook(snapshot.templateId, snapshot.themeTokens), [snapshot.templateId, snapshot.themeTokens]);
  const shopperInfo = useMemo(() => readShopperInfo(store.shopper), [store.shopper]);
  const [internalPage, setInternalPage] = useState(selectedPage ?? "home");
  const [openFaq, setOpenFaq] = useState(0);
  const [hoveredSectionId, setHoveredSectionId] = useState<string | null>(null);
  const [formState, setFormState] = useState({ name: "", email: "", phone: "", message: "" });
  const [formStatus, setFormStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [productFilter, setProductFilter] = useState({ category: "all", sort: "newest", q: "" });
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);

  useEffect(() => {
    if (selectedPage) {
      setInternalPage(selectedPage);
    }
  }, [selectedPage]);

  const currentPage = selectedPage ?? internalPage;
  const policyLinks = mode === "live" ? legalLinks(store.brandSettings).map((link) => ({ key: link.key, label: link.title, href: getPublicStorefrontPath(storeBasePath ?? "", legalPagePath(link.key)) })) : [];
  const page = findStorefrontPage(snapshot.pages, currentPage) ?? snapshot.pages[0];
  const sections = page?.sections.filter((entry) => entry.visible !== false) ?? [];

  const announcement = sections.find((entry) => entry.kind === "announcement-bar");
  const header = sections.find((entry) => entry.kind === "header");
  const footer = [...sections].reverse().find((entry) => entry.kind === "footer");
  const contentSections = sections.filter((entry) => !["announcement-bar", "header", "footer"].includes(entry.kind));
  const stickyCtaSection = contentSections.find((entry) => entry.settings?.stickyMobileCta === true);

  const headerCopy = header?.blocks.find((entry) => entry.type === "copy")?.content ?? {};
  const logoMark = String(headerCopy.logoMark ?? store.name.slice(0, 2)).slice(0, 2).toUpperCase();
  const publishedPageTypes = new Set(snapshot.pages.map((entry) => entry.pageType));
  const productCategories = useMemo(() => {
    const map = new Map<string, { slug: string; name: string; imageUrl?: string; count: number; color: string }>();
    for (const [index, product] of store.storeProducts.entries()) {
      if (product.category?.slug && product.category?.name) {
        const existing = map.get(product.category.slug);
        map.set(product.category.slug, {
          slug: product.category.slug,
          name: product.category.name,
          imageUrl: existing?.imageUrl ?? product.images[0],
          count: (existing?.count ?? 0) + 1,
          color: existing?.color ?? ["#C9973A", "#2E7E78", "#7C5A45", "#4C6780", "#A8553A"][index % 5],
        });
      }
    }
    return [...map.values()];
  }, [store.storeProducts]);
  const visibleNavLink = (pageType: unknown) => {
    if (typeof pageType !== "string" || pageType === "product" || pageType === "product-detail") return false;
    if (mode !== "live") return true;
    const normalized = normalizePageType(pageType);
    if (normalized === "checkout") return false;
    if (normalized === "categories") return productCategories.length > 0;
    if (normalized === "wishlist") return header?.settings?.wishlist !== false;
    return normalized === "cart" || publishedPageTypes.has(normalized as typeof snapshot.pages[number]["pageType"]);
  };
  const navLinks = (Array.isArray(headerCopy.navLinks) ? (headerCopy.navLinks as string[]) : ["home", "products", "about", "blog", "faq", "contact"])
    .filter(visibleNavLink)
    .filter((item, index, array) => array.indexOf(item) === index);
  const utilityLinks = (Array.isArray(headerCopy.utilityLinks) ? (headerCopy.utilityLinks as string[]) : ["categories", "wishlist", "cart"])
    .filter(visibleNavLink)
    .filter((item, index, array) => array.indexOf(item) === index);
  const headerLayout = String(header?.settings?.layout ?? "standard");
  const categoryNavLayout = String(header?.settings?.categoryNavLayout ?? "simple");
  const headerFeatures = {
    search: header?.settings?.search !== false,
    wishlist: header?.settings?.wishlist !== false,
    cart: header?.settings?.cart !== false,
    announcement: header?.settings?.announcement !== false,
    whatsapp: header?.settings?.whatsapp === true,
    currency: header?.settings?.currency === true,
    language: header?.settings?.language === true,
  };

  const isEditor = mode === "editor";

  useEffect(() => {
    if (typeof window === "undefined" || currentPage !== "products") return;
    const params = new URLSearchParams(window.location.search);
    setProductFilter({
      category: params.get("category") || "all",
      sort: params.get("sort") || "newest",
      q: params.get("q") || "",
    });
  }, [currentPage]);

  function updateProductFilter(changes: Partial<typeof productFilter>) {
    const next = { ...productFilter, ...changes };
    setProductFilter(next);
    if (typeof window !== "undefined" && mode === "live") {
      const params = new URLSearchParams(window.location.search);
      if (next.category && next.category !== "all") params.set("category", next.category);
      else params.delete("category");
      if (next.sort && next.sort !== "newest") params.set("sort", next.sort);
      else params.delete("sort");
      if (next.q.trim()) params.set("q", next.q.trim());
      else params.delete("q");
      const query = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    }
  }

  function navigateCategory(item: Record<string, unknown>) {
    const slug = typeof item.slug === "string"
      ? item.slug
      : typeof item.categorySlug === "string"
        ? item.categorySlug
        : "";
    if (slug) updateProductFilter({ category: slug });
    navigate("products");
  }

  function categoryItemsFor(section: TemplateSectionNode) {
    const fallbackItems = section.items ?? [];
    if (!productCategories.length) return fallbackItems;
    return productCategories.map((category, index) => {
      const override = fallbackItems[index] ?? fallbackItems.find((item) => {
        const title = String(item.title ?? item.label ?? "").toLowerCase();
        const slug = String(item.slug ?? item.categorySlug ?? "").toLowerCase();
        return slug === category.slug.toLowerCase() || title === category.name.toLowerCase();
      }) ?? {};
      return {
        ...override,
        title: category.name,
        label: category.name,
        slug: category.slug,
        categorySlug: category.slug,
        subtitle: `${category.count} ${category.count === 1 ? "product" : "products"}`,
        imageUrl: typeof override.imageUrl === "string" && override.imageUrl ? override.imageUrl : category.imageUrl,
        originalSrc: typeof override.originalSrc === "string" && override.originalSrc ? override.originalSrc : category.imageUrl,
        resolvedSrc: typeof override.resolvedSrc === "string" && override.resolvedSrc ? override.resolvedSrc : category.imageUrl,
        color: typeof override.color === "string" && override.color ? override.color : category.color,
      };
    });
  }

  function filteredProducts(products: RenderProduct[]) {
    let next = products;
    if (currentPage === "products") {
      const q = productFilter.q.trim().toLowerCase();
      if (productFilter.category !== "all") {
        next = next.filter((product) => {
          const mapped = product.mappedStoreProductId ? store.storeProducts.find((entry) => entry.id === product.mappedStoreProductId) : null;
          return mapped?.category?.slug === productFilter.category;
        });
      }
      if (q) {
        next = next.filter((product) => `${product.title} ${product.subtitle}`.toLowerCase().includes(q));
      }
      next = [...next].sort((a, b) => {
        const priceA = Number(a.priceLabel.replace(/[^0-9.]/g, "")) || 0;
        const priceB = Number(b.priceLabel.replace(/[^0-9.]/g, "")) || 0;
        if (productFilter.sort === "price-low") return priceA - priceB;
        if (productFilter.sort === "price-high") return priceB - priceA;
        if (productFilter.sort === "name") return a.title.localeCompare(b.title);
        return 0;
      });
    }
    return next;
  }

  function sectionGuide(kind?: string) {
    const guides: Record<string, string> = {
      header: "Header controls logo, navigation, cart, wishlist, search, and category menu behavior.",
      "hero-split": "Use the hero to communicate the main offer and send shoppers to products quickly.",
      "featured-products": "Show best sellers, new arrivals, or hand-picked products from your catalog.",
      "category-list": "Help shoppers browse by department, collection, need, or product type.",
      "cart-summary": "Let shoppers review quantities, discounts, delivery estimates, and checkout actions.",
      "checkout-form": "Collect contact, delivery, payment preference, notes, and order summary details.",
      "wishlist-grid": "Let customers save products and return to them later.",
      faq: "Use FAQs to answer objections and reduce support requests before checkout.",
      testimonials: "Use reviews to build trust and show proof from real customers.",
      newsletter: "Capture emails for launches, offers, and customer retention.",
      footer: "Footer should include support, legal, payment, contact, and navigation links.",
    };
    return guides[kind ?? ""] ?? "Edit this section content, switch style, duplicate, hide, or reuse it later.";
  }

  function sectionWrap(sectionId: string, children: React.ReactNode, kind?: string) {
    if (!isEditor) return <>{children}</>;
    const isSelected = selectedSectionId === sectionId;
    const isHovered = hoveredSectionId === sectionId && !isSelected;
    return (
      <div
        onClick={(e) => { e.stopPropagation(); onSelectSection?.(sectionId); }}
        onMouseEnter={() => setHoveredSectionId(sectionId)}
        onMouseLeave={() => setHoveredSectionId(null)}
        style={{
          position: "relative",
          outline: isSelected ? `2.5px solid #0E9E85` : isHovered ? `2px dashed #9DA5B5` : "2px solid transparent",
          outlineOffset: -1,
          cursor: "pointer",
          transition: "outline .15s ease",
        }}
      >
        {isSelected || isHovered ? (
          <div style={{ position: "absolute", top: 8, left: 8, zIndex: 999, display: "flex", alignItems: "center", gap: 4, background: "#0F1F3D", color: "#fff", borderRadius: 6, padding: 4, boxShadow: "0 10px 30px rgba(15,31,61,.18)" }}>
            {/* Only the actions the host editor handles, so a missing handler never shows as a dead button. */}
            {([
              ["Edit", onSelectSection, () => onSelectSection?.(sectionId)],
              ["Change Style", onChangeSectionStyle, () => onChangeSectionStyle?.(sectionId)],
              ["Duplicate", onDuplicateSection, () => onDuplicateSection?.(sectionId)],
              ["Up", onMoveSection, () => onMoveSection?.(sectionId, "up")],
              ["Down", onMoveSection, () => onMoveSection?.(sectionId, "down")],
              ["Hide", onToggleSectionVisibility, () => onToggleSectionVisibility?.(sectionId)],
              ["Delete", onDeleteSection, () => onDeleteSection?.(sectionId)],
              ["Save", onSaveReusableSection, () => onSaveReusableSection?.(sectionId)],
            ] as const).filter(([, handler]) => Boolean(handler)).map(([label, , action]) => (
              <button
                key={String(label)}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  (action as () => void)();
                }}
                title={String(label) === "Save" ? "Save as reusable block" : String(label)}
                style={{ border: 0, background: String(label) === "Change Style" ? "#0D9488" : "transparent", color: "#fff", borderRadius: 4, padding: "4px 7px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}
              >
                {String(label)}
              </button>
            ))}
            <span title={sectionGuide(kind)} style={{ display: "grid", placeItems: "center", width: 22, height: 22, borderRadius: 999, background: "rgba(255,255,255,.12)", fontSize: 12, fontWeight: 800, cursor: "help" }}>?</span>
          </div>
        ) : null}
        {children}
      </div>
    );
  }

  function editableCopy(
    sectionId: string,
    key: string,
    value: unknown,
    fallback: string,
    className?: string,
    style?: React.CSSProperties,
    tag: "span" | "div" = "span",
  ) {
    const text = String(value ?? fallback);
    if (!isEditor || !onUpdateSectionCopy) {
      const Tag = tag;
      return <Tag className={className} style={style}>{text}</Tag>;
    }
    const Tag = tag;
    return (
      <Tag
        className={className}
        style={{ ...style, outline: selectedSectionId === sectionId ? `1px dashed ${rgba(theme.accent, 0.65)}` : undefined, outlineOffset: 3 }}
        contentEditable
        suppressContentEditableWarning
        onClick={(event) => {
          event.stopPropagation();
          onSelectSection?.(sectionId);
        }}
        onBlur={(event) => {
          const next = event.currentTarget.textContent?.trim() ?? "";
          if (next && next !== text) onUpdateSectionCopy(sectionId, key, next);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
      >
        {text}
      </Tag>
    );
  }

  function pickReplacementImage(
    sectionId: string,
    target: { itemIndex?: number; blockId?: string },
  ) {
    if (!isEditor || !onUploadImage) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,video/mp4,video/webm,video/ogg";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const url = await onUploadImage(file);
      if (!url) return;
      if (typeof target.itemIndex === "number") {
        onUpdateSectionItem?.(sectionId, target.itemIndex, { imageUrl: url, videoUrl: isVideoSource(url) ? url : undefined, originalSrc: url, resolvedSrc: url });
      } else if (target.blockId) {
        onUpdateImageBlock?.(sectionId, target.blockId, url);
      }
    };
    input.click();
  }

  function pickStoreLogo() {
    if (!isEditor || !onUploadImage || !onUpdateStoreLogo) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const url = await onUploadImage(file);
      if (url) onUpdateStoreLogo(url);
    };
    input.click();
  }

  function editableItemImage(
    sectionId: string,
    item: Record<string, unknown> | undefined,
    itemIndex: number,
    alt: string,
    color: string,
    className: string,
  ) {
    const src = typeof item?.videoUrl === "string" && item.videoUrl
      ? String(item.videoUrl)
      : typeof item?.imageUrl === "string"
        ? String(item.imageUrl)
        : undefined;
    const image = renderMedia(src, alt, color, className, "Click to replace media");
    if (!isEditor || !onUploadImage) return image;
    return (
      <span
        role="button"
        tabIndex={0}
        onClick={(event) => {
          event.stopPropagation();
          onSelectSection?.(sectionId);
          pickReplacementImage(sectionId, { itemIndex });
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            onSelectSection?.(sectionId);
            pickReplacementImage(sectionId, { itemIndex });
          }
        }}
        className="block h-full w-full cursor-pointer border-0 bg-transparent p-0 text-left"
        title="Click to replace image"
      >
        {image}
      </span>
    );
  }

  function insertHandle(sectionId: string | null, label: string) {
    if (!isEditor || !onInsertSectionBefore) return null;
    return (
      <div
        aria-label={label}
        style={{
          position: "relative",
          height: 0,
          zIndex: 5,
          cursor: "pointer",
          transition: "height .15s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.height = "24px"; }}
        onMouseLeave={(e) => { e.currentTarget.style.height = "0"; }}
      >
        <div style={{ position: "absolute", left: 18, right: 18, top: "50%", height: 1, background: theme.border, opacity: 0.6 }} />
        <button
          type="button"
          aria-label={label}
          title={label}
          onClick={(event) => {
            event.stopPropagation();
            onInsertSectionBefore(sectionId);
          }}
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%,-50%)",
            zIndex: 2,
            width: 24,
            height: 24,
            borderRadius: 999,
            border: "1px solid #0E9E85",
            background: "#FFFFFF",
            color: "#0E9E85",
            display: "grid",
            placeItems: "center",
            boxShadow: "0 2px 8px rgba(14,158,133,.28)",
            cursor: "pointer",
            opacity: 0,
            transition: "opacity .15s, transform .15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translate(-50%,-50%) scale(1.15)";
            e.currentTarget.style.boxShadow = "0 6px 20px rgba(14,158,133,.35)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translate(-50%,-50%) scale(1)";
            e.currentTarget.style.boxShadow = "0 2px 8px rgba(14,158,133,.28)";
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <style>{`
          [aria-label^="Add section"] { background: transparent; }
          [aria-label^="Add section"]:hover { background: rgba(14,158,133,0.06); }
          [aria-label^="Add section"]:hover button { opacity: 1 !important; }
        `}</style>
      </div>
    );
  }

  function navigate(pageType: string) {
    const normalizedPageType = normalizePageType(pageType);
    if (pageType === "categories" && categoryNavLayout === "drawer") {
      setCategoryDrawerOpen(true);
      return;
    }
    if (normalizedPageType === "cart") {
      onOpenCart?.();
      return;
    }
    if (onSelectPage) {
      onSelectPage(normalizedPageType);
      return;
    }
    setInternalPage(normalizedPageType);
  }

  function runCommerceAction(action: unknown, externalUrl?: unknown) {
    const nextAction = String(action ?? "products");
    if (nextAction === "cart") {
      onOpenCart?.();
      return;
    }
    if (nextAction === "checkout") {
      navigate("checkout");
      return;
    }
    if (nextAction === "wishlist") {
      navigate("wishlist");
      return;
    }
    if (nextAction === "whatsapp") {
      if (mode === "live") window.open(`https://wa.me/?text=${encodeURIComponent(`Hello, I want to order from ${store.name}`)}`, "_blank", "noopener,noreferrer");
      return;
    }
    if (nextAction === "email") {
      if (mode === "live") window.location.href = `mailto:?subject=${encodeURIComponent(`Order enquiry - ${store.name}`)}`;
      return;
    }
    if (nextAction === "external") {
      const url = typeof externalUrl === "string" && externalUrl.trim() ? externalUrl.trim() : storeBasePath;
      if (url && mode === "live") window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    if (nextAction === "rex") {
      if (mode === "editor") window.location.href = "/builder/rex";
      return;
    }
    navigate(nextAction);
  }

  /** On a live store a real product opens at its own address (/product/<id>), like boutique themes. */
  function openProductPage(productId: string) {
    if (mode === "live" && store.storeProducts.some((entry) => entry.id === productId)) {
      window.location.assign(getPublicStorefrontPath(storeBasePath ?? "", `/product/${encodeURIComponent(productId)}`));
      return;
    }
    setSelectedProductId(productId);
    navigate("product");
  }

  function openProduct(product: RenderProduct) {
    openProductPage(product.mappedStoreProductId ?? product.id);
  }

  async function submitStoreForm(type: "contact" | "newsletter") {
    if (mode !== "live" || !visitorKey || !formState.email.trim()) return;
    setFormStatus("sending");
    rememberStoreVisitor(store.slug, { email: formState.email.trim(), name: formState.name.trim() });
    try {
      const response = await fetch(`/api/public/store/${store.slug}/forms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitorKey,
          type,
          name: formState.name.trim() || undefined,
          email: formState.email.trim(),
          phone: formState.phone.trim() || undefined,
          message: type === "contact" ? formState.message.trim() : undefined,
          payload: { source: currentPage },
        }),
      });
      setFormStatus(response.ok ? "sent" : "error");
      if (response.ok && type === "contact") {
        setFormState({ name: "", email: "", phone: "", message: "" });
      }
    } catch {
      setFormStatus("error");
    }
  }

  function renderSection(kindSection: typeof contentSections[number]) {
    const copy = kindSection.blocks.find((entry) => entry.type === "copy")?.content ?? {};

    if (isGameSectionKind(kindSection.kind)) {
      return (
        <GameSection
          key={kindSection.id}
          kind={kindSection.kind}
          section={kindSection}
          store={{ slug: store.slug, currency: store.currency, brandSettings: store.brandSettings, shopper: store.shopper, storeProducts: store.storeProducts }}
          mode={mode === "live" ? "live" : "editor"}
          colors={{ ink: theme.ink, muted: theme.muted, border: theme.border, paper: theme.paperBg, card: theme.cardBg, cta: theme.ctaBg, ctaText: theme.ctaText, accent: theme.accent, heading: theme.headingFont, radius: theme.radius }}
        />
      );
    }

    if (kindSection.kind === "hero-split") {
      const heroLayout = String(kindSection.settings?.layout ?? "split-editorial");
      const isFullBleedSplit = heroLayout === "full-bleed-split" || heroLayout === "full-bleed" || heroLayout === "text-overlay";
      const isEditorialMosaic = heroLayout === "editorial-mosaic" || heroLayout === "carousel-cards";
      const isBeautySplit = heroLayout === "beauty-split";
      const heroIsLight = ["home", "books", "pets"].includes(theme.templateStyle);
      const heroBg = heroIsLight
        ? `linear-gradient(135deg, ${theme.paperBg}, ${rgba(theme.accent, 0.14)})`
        : theme.templateStyle === "marketplace" || theme.templateStyle === "electronics"
          ? `linear-gradient(145deg, ${theme.heroBg}, ${rgba(theme.heroBg, 0.82)})`
          : theme.headingStyle === "serif"
            ? `linear-gradient(90deg, ${theme.heroBg} 0%, ${theme.heroBg} 50%, ${theme.paperBg} 50%, ${theme.paperBg} 100%)`
            : `linear-gradient(145deg, ${theme.heroBg}, ${rgba(theme.heroBg, 0.88)})`;
      // The serif half-and-half background lines up with the two desktop columns; when they stack (phones and
      // tablets) the copy would sit half on the light side, so below lg the hero is the solid dark colour.
      const heroBgStacked = !heroIsLight && theme.headingStyle === "serif" ? theme.heroBg : heroBg;
      const heroBgStyle = { "--hero-bg-sm": heroBgStacked, "--hero-bg-lg": heroBg } as React.CSSProperties;
      const heroBgClass = "[background:var(--hero-bg-sm)] lg:[background:var(--hero-bg-lg)]";
      const heroTextColor = heroIsLight ? theme.ink : theme.heroText;
      const heroMutedColor = heroIsLight ? theme.muted : rgba(theme.heroText, 0.82);
      const primaryButtonVariant = String(kindSection.settings?.primaryButtonVariant ?? "primary");
      const secondaryButtonVariant = String(kindSection.settings?.secondaryButtonVariant ?? "outline");
      const primaryButtonAction = kindSection.settings?.primaryButtonAction ?? "products";
      const secondaryButtonAction = kindSection.settings?.secondaryButtonAction ?? "about";
      const primaryButtonShape = String(kindSection.settings?.buttonShape ?? "pill");
      const primaryButtonSize = String(kindSection.settings?.buttonSize ?? "lg");
      const heroItems = kindSection.items ?? [];
      const lead = heroItems[0];
      const leadMedia = typeof lead?.videoUrl === "string" && lead.videoUrl
        ? String(lead.videoUrl)
        : typeof lead?.imageUrl === "string"
          ? String(lead.imageUrl)
          : store.storeProducts[0]?.images[0];
      if (heroLayout === "slideshow") {
        const own = readHeroSlides(kindSection);
        const fallbackSlide: HeroSlide = {
          mediaUrl: leadMedia ?? "",
          mediaType: leadMedia ? (youTubeId(leadMedia) ? "youtube" : isVideoSource(leadMedia) ? "video" : "image") : "none",
          alt: "",
          heading: cleanCustomerCopy(copy.title, `Welcome to ${store.name}`),
          text: cleanCustomerCopy(copy.body, store.description ?? ""),
          buttonLabel: cleanCustomerCopy(copy.primaryCta, "Shop now"),
          link: { type: "page", value: String(primaryButtonAction) },
          textTone: leadMedia ? "light" : "dark",
          textPosition: "left",
        };
        const openLink = (link: HeroSlide["link"]) => {
          if (link.type === "product") {
            const product = store.storeProducts.find((entry) => entry.id === link.value);
            if (product) openProductPage(product.id);
            return;
          }
          if (link.type === "url") {
            runCommerceAction("external", link.value);
            return;
          }
          runCommerceAction(link.value || "products");
        };
        return (
          <HeroSlider
            key={kindSection.id}
            slides={own.length ? own : [fallbackSlide]}
            timing={readSlideTiming(kindSection.settings)}
            label={cleanCustomerCopy(copy.title, store.name)}
            emptyBackground={`linear-gradient(145deg, ${theme.heroBg}, ${rgba(theme.heroBg, 0.82)})`}
            height="min(82vh, 720px)"
            renderOverlay={(slide, index) => {
              const light = slide.textTone === "light" && slide.mediaType !== "none";
              const align = slideAlign(slide.textPosition);
              const ink = light ? "#FFFFFF" : slide.mediaType === "none" ? theme.heroText : theme.ink;
              const Heading = index === 0 ? "h1" : "h2";
              return (
                <>
                  <div className="absolute inset-0" style={{ background: slide.mediaType === "none" ? "transparent" : light ? "linear-gradient(to top, rgba(0,0,0,.62), rgba(0,0,0,.08) 65%)" : "linear-gradient(to top, rgba(255,255,255,.82), rgba(255,255,255,0) 65%)" }} />
                  <div className="absolute inset-x-0 bottom-0 mx-auto flex max-w-[1240px] flex-col px-6 pb-16 sm:px-10" style={{ alignItems: align.items, textAlign: align.text, color: ink }}>
                    {slide.heading ? <Heading className="max-w-[820px] text-[clamp(38px,6vw,84px)] font-semibold leading-[0.95] tracking-[-0.04em]" style={{ fontFamily: theme.headingFont }}>{slide.heading}</Heading> : null}
                    {slide.text ? <p className="mt-4 max-w-[560px] text-[16px] leading-7 opacity-90">{slide.text}</p> : null}
                    {slide.buttonLabel ? (
                      <div className="mt-7">
                        <CommerceButton label={slide.buttonLabel} theme={theme} variant={primaryButtonVariant} size={primaryButtonSize} shape={primaryButtonShape} onDark={light} onClick={() => openLink(slide.link)} />
                      </div>
                    ) : null}
                  </div>
                </>
              );
            }}
          />
        );
      }
      if (heroLayout === "video-background") {
        return (
          <section key={kindSection.id} className="relative min-h-[88vh] overflow-hidden px-5 py-16 sm:px-8" style={{ background: theme.heroBg }}>
            <div className="absolute inset-0">
              {renderMedia(leadMedia, String(copy.title ?? store.name), String(lead?.color ?? theme.heroBg), "h-full w-full object-cover opacity-80", "Click to replace hero video or image")}
              <div className="absolute inset-0" style={{ background: `linear-gradient(90deg, ${rgba(theme.heroBg, 0.82)}, ${rgba(theme.heroBg, 0.42)}, ${rgba(theme.heroBg, 0.78)})` }} />
            </div>
            <div className="relative z-10 mx-auto flex min-h-[70vh] max-w-[1240px] flex-col justify-center">
              <div className="font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: rgba(theme.heroText, 0.72) }}>{editableCopy(kindSection.id, "eyebrow", copy.eyebrow, store.name)}</div>
              <h1 className="mt-5 max-w-[860px] text-[clamp(52px,8vw,110px)] font-semibold leading-[0.9] tracking-[-0.05em]" style={{ color: theme.heroText, fontFamily: theme.headingFont }}>{editableCopy(kindSection.id, "title", copy.title, `Welcome to ${store.name}`)}</h1>
              <p className="mt-6 max-w-[560px] text-[17px] leading-8" style={{ color: rgba(theme.heroText, 0.78) }}>{editableCopy(kindSection.id, "body", copy.body, store.description ?? "Discover the store.")}</p>
              <div className="mt-9 flex flex-wrap gap-3">
                <CommerceButton label={editableCopy(kindSection.id, "primaryCta", copy.primaryCta, "Shop now")} theme={theme} variant={primaryButtonVariant} size={primaryButtonSize} shape={primaryButtonShape} icon="cart" onClick={() => runCommerceAction(primaryButtonAction, kindSection.settings?.primaryButtonUrl)} />
                <CommerceButton label={editableCopy(kindSection.id, "secondaryCta", copy.secondaryCta, "View categories")} theme={theme} variant={secondaryButtonVariant} size={primaryButtonSize} shape={primaryButtonShape} onDark onClick={() => runCommerceAction(secondaryButtonAction, kindSection.settings?.secondaryButtonUrl)} />
              </div>
            </div>
          </section>
        );
      }
      if (heroLayout === "video-split") {
        return (
          <section key={kindSection.id} className="grid min-h-[82vh] overflow-hidden lg:grid-cols-[0.92fr_1.08fr]" style={{ background: theme.paperBg }}>
            <div className="flex flex-col justify-center px-6 py-16 sm:px-10 lg:px-16">
              <div className="font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: theme.accent }}>{editableCopy(kindSection.id, "eyebrow", copy.eyebrow, store.name)}</div>
              <h1 className="mt-5 max-w-[660px] text-[clamp(42px,6vw,86px)] font-semibold leading-[0.95]" style={{ color: theme.ink, fontFamily: theme.headingFont }}>{editableCopy(kindSection.id, "title", copy.title, `Welcome to ${store.name}`)}</h1>
              <p className="mt-5 max-w-[520px] text-[16px] leading-8" style={{ color: theme.muted }}>{editableCopy(kindSection.id, "body", copy.body, store.description ?? "Discover the store.")}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <CommerceButton label={editableCopy(kindSection.id, "primaryCta", copy.primaryCta, "Shop now")} theme={theme} variant={primaryButtonVariant} size={primaryButtonSize} shape={primaryButtonShape} icon="cart" onClick={() => runCommerceAction(primaryButtonAction, kindSection.settings?.primaryButtonUrl)} />
                <CommerceButton label={editableCopy(kindSection.id, "secondaryCta", copy.secondaryCta, "Contact")} theme={theme} variant={secondaryButtonVariant} size={primaryButtonSize} shape={primaryButtonShape} onClick={() => runCommerceAction(secondaryButtonAction, kindSection.settings?.secondaryButtonUrl)} />
              </div>
            </div>
            <div className="relative min-h-[520px] p-5 lg:p-8">
              <div className="h-full overflow-hidden rounded-[32px] shadow-[0_28px_70px_rgba(0,0,0,0.14)]">
                {editableItemImage(kindSection.id, lead, 0, String(copy.title ?? store.name), String(lead?.color ?? theme.heroBg), "h-full min-h-[520px] w-full object-cover")}
              </div>
            </div>
          </section>
        );
      }
      if (heroLayout === "minimal-center") {
        return (
          <section key={kindSection.id} className="px-5 py-24 text-center sm:px-8" style={{ background: theme.paperBg }}>
            <div className="mx-auto max-w-[920px]">
              <div className="font-mono text-[11px] uppercase tracking-[0.2em]" style={{ color: theme.accent }}>{editableCopy(kindSection.id, "eyebrow", copy.eyebrow, store.name)}</div>
              <h1 className="mt-5 text-[clamp(46px,8vw,104px)] font-semibold leading-[0.94]" style={{ color: theme.ink, fontFamily: theme.headingFont }}>{editableCopy(kindSection.id, "title", copy.title, `Welcome to ${store.name}`)}</h1>
              <p className="mx-auto mt-6 max-w-[620px] text-[17px] leading-8" style={{ color: theme.muted }}>{editableCopy(kindSection.id, "body", copy.body, store.description ?? "Discover the store.")}</p>
              <div className="mt-9 flex justify-center gap-3">
                <CommerceButton label={editableCopy(kindSection.id, "primaryCta", copy.primaryCta, "Shop now")} theme={theme} variant={primaryButtonVariant} size={primaryButtonSize} shape={primaryButtonShape} icon="cart" onClick={() => runCommerceAction(primaryButtonAction, kindSection.settings?.primaryButtonUrl)} />
              </div>
            </div>
          </section>
        );
      }
      if (heroLayout === "category-portal") {
        const cats = categoryItemsFor(kindSection).slice(0, 4);
        return (
          <section key={kindSection.id} className={`px-5 py-14 sm:px-8 ${heroBgClass}`} style={heroBgStyle}>
            <div className="mx-auto grid max-w-[1320px] gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
              <div>
                <div className="font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: heroIsLight ? theme.accent : rgba(theme.heroText, 0.72) }}>{editableCopy(kindSection.id, "eyebrow", copy.eyebrow, store.name)}</div>
                <h1 className="mt-5 text-[clamp(44px,6.5vw,86px)] font-semibold leading-[0.95]" style={{ color: heroTextColor, fontFamily: theme.headingFont }}>{editableCopy(kindSection.id, "title", copy.title, `Welcome to ${store.name}`)}</h1>
                <p className="mt-5 max-w-[560px] text-[16px] leading-8" style={{ color: heroMutedColor }}>{editableCopy(kindSection.id, "body", copy.body, store.description ?? "Discover the store.")}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {cats.map((item, index) => (
                  <div key={`${kindSection.id}-hero-cat-${index}`} role="button" tabIndex={0} onClick={() => navigateCategory(item)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") navigateCategory(item); }} className="group overflow-hidden rounded-[24px] border bg-white" style={{ borderColor: rgba(theme.accent, 0.2) }}>
                    <div className="h-[210px]">{editableItemImage(kindSection.id, item, index, String(item.title ?? "Category"), String(item.color ?? theme.accent), "h-full w-full object-cover transition-transform duration-500 group-hover:scale-105")}</div>
                    <div className="p-4">
                      <div className="text-[18px] font-semibold" style={{ color: theme.ink }}>{String(item.title ?? "Category")}</div>
                      <div className="mt-1 text-[12px]" style={{ color: theme.muted }}>{String(item.subtitle ?? "Browse")}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        );
      }
      if (heroLayout === "product-spotlight") {
        const product = resolveProductItems(kindSection.items, store)[0];
        return (
          <section key={kindSection.id} className="px-5 py-14 sm:px-8" style={{ background: theme.paperBg }}>
            <div className="mx-auto grid max-w-[1240px] overflow-hidden rounded-[32px] border lg:grid-cols-[1.1fr_0.9fr]" style={{ borderColor: theme.border, background: theme.cardBg }}>
              <div className="min-h-[520px]">{renderMedia(product?.imageUrl, product?.title ?? store.name, product?.color ?? theme.accent, "h-full min-h-[520px] w-full object-cover")}</div>
              <div className="flex flex-col justify-center p-8 lg:p-12">
                <div className="font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: theme.accent }}>{editableCopy(kindSection.id, "eyebrow", copy.eyebrow, "Featured product")}</div>
                <h1 className="mt-5 text-[clamp(42px,6vw,78px)] font-semibold leading-[0.96]" style={{ color: theme.ink, fontFamily: theme.headingFont }}>{editableCopy(kindSection.id, "title", copy.title, product?.title ?? `Welcome to ${store.name}`)}</h1>
                <p className="mt-5 text-[16px] leading-8" style={{ color: theme.muted }}>{editableCopy(kindSection.id, "body", copy.body, product?.subtitle ?? store.description ?? "Discover the store.")}</p>
                <div className="mt-6 text-[24px] font-semibold" style={{ color: theme.ink }}>{product?.priceLabel ?? ""}</div>
                <div className="mt-8 flex flex-wrap gap-3">
                  <CommerceButton label={editableCopy(kindSection.id, "primaryCta", copy.primaryCta, "Add to cart")} theme={theme} variant={primaryButtonVariant} size={primaryButtonSize} shape={primaryButtonShape} icon="cart" onClick={() => product?.purchasable ? onAddToCart?.(product.mappedStoreProductId ?? product.id) : runCommerceAction(primaryButtonAction, kindSection.settings?.primaryButtonUrl)} />
                  <CommerceButton label={editableCopy(kindSection.id, "secondaryCta", copy.secondaryCta, "View products")} theme={theme} variant={secondaryButtonVariant} size={primaryButtonSize} shape={primaryButtonShape} onClick={() => runCommerceAction(secondaryButtonAction, kindSection.settings?.secondaryButtonUrl)} />
                </div>
              </div>
            </div>
          </section>
        );
      }
      if (isBeautySplit) {
        return (
          <section key={kindSection.id} className="grid min-h-[86vh] overflow-hidden lg:grid-cols-[55%_45%]" style={{ background: theme.heroBg }}>
            <div className="flex flex-col justify-center px-6 py-16 sm:px-10 lg:px-20">
              <div className="mb-7 inline-flex w-fit items-center gap-2 rounded-full border px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.06em]" style={{ borderColor: rgba(theme.accent, 0.28), background: rgba(theme.accent, 0.1), color: theme.accent }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: theme.accent }} />
                {editableCopy(kindSection.id, "eyebrow", copy.eyebrow, store.name)}
              </div>
              <h1 className="max-w-[680px] text-[clamp(46px,6.8vw,78px)] font-light leading-[1.08]" style={{ color: theme.ink, fontFamily: theme.headingFont }}>
                {editableCopy(kindSection.id, "title", copy.title, `Welcome to ${store.name}`)}
              </h1>
              <p className="mt-5 max-w-[460px] text-[16px] leading-8" style={{ color: theme.muted }}>
                {editableCopy(kindSection.id, "body", copy.body, store.description ?? "Discover the store.")}
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <CommerceButton label={editableCopy(kindSection.id, "primaryCta", copy.primaryCta, "Shop now")} theme={theme} variant={primaryButtonVariant} size={primaryButtonSize} shape={primaryButtonShape} icon="cart" onClick={() => runCommerceAction(primaryButtonAction, kindSection.settings?.primaryButtonUrl)} />
                <CommerceButton label={editableCopy(kindSection.id, "secondaryCta", copy.secondaryCta, "Learn more")} theme={theme} variant={secondaryButtonVariant} size={primaryButtonSize} shape={primaryButtonShape} onClick={() => runCommerceAction(secondaryButtonAction, kindSection.settings?.secondaryButtonUrl)} />
              </div>
              <div className="mt-9 flex flex-wrap gap-5 border-t pt-7 text-[12px] font-medium" style={{ borderColor: rgba(theme.accent, 0.24), color: theme.muted }}>
                <span>Botanical formulas</span>
                <span>All payment methods accepted</span>
                <span>Delivery updates</span>
              </div>
            </div>
            <div className="relative min-h-[560px] overflow-hidden">
              <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${rgba(theme.accent, 0.16)}, ${rgba(theme.heroBg, 0.86)})` }} />
              <div className="absolute inset-0">
                {editableItemImage(kindSection.id, lead, 0, String(lead?.title ?? copy.title ?? store.name), String(lead?.color ?? theme.accent), "h-full w-full object-cover")}
              </div>
              <div className="absolute bottom-8 left-0 w-[220px] rounded-[20px] bg-white px-5 py-4 shadow-[0_18px_48px_rgba(26,26,24,.16)] lg:-left-5">
                <div className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: theme.muted }}>Featured ritual</div>
                <div className="mt-1 text-[15px] font-semibold" style={{ color: theme.ink }}>{String(lead?.title ?? "Click to replace image")}</div>
                <div className="mt-2 text-[12px]" style={{ color: theme.accent }}>4.9 reviews</div>
              </div>
            </div>
          </section>
        );
      }
      if (isEditorialMosaic) {
        const heroItems = kindSection.items ?? [];
        const lead = heroItems[0];
        const support = heroItems.slice(1, 4);
        const heroImageBlock = findImageBlock(kindSection);
        return (
          <section key={kindSection.id} className="grid min-h-[720px] overflow-hidden lg:grid-cols-2" style={{ background: theme.paperBg }}>
            <div className="relative min-h-[560px] overflow-hidden">
              {heroImageBlock
                ? renderImageBlock(
                    heroImageBlock,
                    "absolute inset-0 h-full w-full object-cover",
                    String(copy.title ?? store.name),
                    String(lead?.color ?? theme.heroBg),
                  )
                : editableItemImage(
                    kindSection.id,
                    lead,
                    0,
                    String(copy.title ?? store.name),
                    String(lead?.color ?? theme.heroBg),
                    "absolute inset-0 h-full w-full object-cover",
                  )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 px-6 py-10 sm:px-10 lg:px-14">
                <div className="font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: theme.accent }}>
                  {editableCopy(kindSection.id, "eyebrow", copy.eyebrow, store.name)}
                </div>
                <h1 className="mt-4 max-w-[720px] text-[clamp(48px,7vw,92px)] font-light leading-[1.02] tracking-[-0.04em] text-white" style={{ fontFamily: theme.headingFont }}>
                  {editableCopy(kindSection.id, "title", copy.title, `Welcome to ${store.name}`)}
                </h1>
                <p className="mt-5 max-w-[440px] text-[14px] leading-7 text-white/75">
                  {editableCopy(kindSection.id, "body", copy.body, store.description ?? "Discover the store.")}
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <CommerceButton label={editableCopy(kindSection.id, "primaryCta", copy.primaryCta, "Shop now")} theme={theme} variant={primaryButtonVariant} size="lg" shape="rounded" icon="cart" onClick={() => runCommerceAction(primaryButtonAction, kindSection.settings?.primaryButtonUrl)} />
                  <CommerceButton label={editableCopy(kindSection.id, "secondaryCta", copy.secondaryCta, "Our story")} theme={theme} variant={secondaryButtonVariant} size="lg" shape="rounded" onClick={() => runCommerceAction(secondaryButtonAction, kindSection.settings?.secondaryButtonUrl)} />
                </div>
              </div>
            </div>
            {heroLayout === "carousel-cards" ? (
              // Collection cards in a row that scrolls sideways.
              <div className="flex min-h-[420px] snap-x snap-mandatory items-end gap-4 overflow-x-auto px-5 py-8 sm:px-8 lg:min-h-[560px]" style={{ background: theme.cardBg }} role="region" aria-label="Collections. Scroll sideways for more." tabIndex={0}>
                {(support.length ? support : [lead]).map((item, index) => (
                  <div key={`${kindSection.id}-card-${index}`} role="button" tabIndex={0} onClick={() => navigate("products")} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") navigate("products"); }} className="group relative h-[78%] min-h-[320px] w-[min(280px,75%)] shrink-0 snap-start overflow-hidden rounded-[22px] bg-white text-left shadow-[0_18px_48px_rgba(0,0,0,.12)]">
                    {editableItemImage(kindSection.id, item, index + 1, String(item?.title ?? "Collection"), String(item?.color ?? theme.accent), "absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105")}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
                    <div className="absolute inset-x-4 bottom-4 text-white">
                      <div className="text-[18px] font-semibold" style={{ fontFamily: theme.headingFont }}>{String(item?.title ?? "Collection")}</div>
                      {item?.subtitle ? <div className="mt-1 text-[12.5px] text-white/80">{String(item.subtitle)}</div> : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
            <div className="grid min-h-[560px] grid-rows-2">
              <div role="button" tabIndex={0} onClick={() => navigate("products")} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") navigate("products"); }} className="group relative overflow-hidden text-left">
                {editableItemImage(
                  kindSection.id,
                  support[0],
                  1,
                  String(support[0]?.title ?? "Featured collection"),
                  String(support[0]?.color ?? theme.accent),
                  "absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105",
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
                <span className="absolute bottom-5 left-5 rounded-[4px] bg-white px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: theme.ink }}>
                  {String(support[0]?.title ?? "New arrivals")}
                </span>
              </div>
              <div className="grid grid-cols-2">
                {support.slice(1, 3).map((item, index) => (
                  <div key={`${kindSection.id}-mosaic-${index}`} role="button" tabIndex={0} onClick={() => navigate("products")} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") navigate("products"); }} className="group relative overflow-hidden text-left">
                    {editableItemImage(
                      kindSection.id,
                      item,
                      index + 2,
                      String(item.title ?? "Collection"),
                      String(item.color ?? theme.accent),
                      "absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105",
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
                    <span className="absolute bottom-4 left-4 rounded-[4px] bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: theme.ink }}>
                      {String(item.title ?? "Collection")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            )}
          </section>
        );
      }
      const heroImageBlock = findImageBlock(kindSection);
      if (heroLayout === "text-overlay") {
        // The words sit over the main picture, full width.
        return (
          <section key={kindSection.id} className="relative min-h-[560px] overflow-hidden lg:min-h-[640px]" style={{ background: theme.heroBg }}>
            <div className="absolute inset-0">
              {heroImageBlock
                ? renderImageBlock(heroImageBlock, "h-full w-full object-cover", String(lead?.title ?? store.name), String(lead?.color ?? theme.heroBg))
                : editableItemImage(kindSection.id, lead, 0, String(lead?.title ?? store.name), String(lead?.color ?? theme.heroBg), "h-full w-full object-cover")}
            </div>
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/70 via-black/35 to-transparent" />
            <div className="relative mx-auto flex min-h-[560px] max-w-[1320px] flex-col justify-end px-5 py-14 sm:px-8 lg:min-h-[640px] lg:py-20">
              <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/75">
                {editableCopy(kindSection.id, "eyebrow", copy.eyebrow, store.name)}
              </div>
              <h1 className="mt-4 max-w-[820px] text-[clamp(44px,7vw,96px)] font-semibold leading-[0.95] tracking-[-0.05em] text-white" style={{ fontFamily: theme.headingFont }}>
                {editableCopy(kindSection.id, "title", copy.title, `Welcome to ${store.name}`)}
              </h1>
              <p className="mt-5 max-w-[56ch] text-[15px] leading-8 text-white/80 sm:text-[17px]">
                {editableCopy(kindSection.id, "body", copy.body, store.description ?? "Discover the store.")}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <CommerceButton label={editableCopy(kindSection.id, "primaryCta", copy.primaryCta, "Shop now")} theme={theme} variant={primaryButtonVariant} size={primaryButtonSize} shape={primaryButtonShape} icon="cart" onClick={() => runCommerceAction(primaryButtonAction, kindSection.settings?.primaryButtonUrl)} />
                <CommerceButton label={editableCopy(kindSection.id, "secondaryCta", copy.secondaryCta, "View story")} theme={theme} variant={secondaryButtonVariant} size={primaryButtonSize} shape={primaryButtonShape} onDark onClick={() => runCommerceAction(secondaryButtonAction, kindSection.settings?.secondaryButtonUrl)} />
              </div>
            </div>
          </section>
        );
      }
      return (
        <section
          key={kindSection.id}
          className={`${isFullBleedSplit ? "py-0" : "px-5 py-14 sm:px-8 lg:py-20"} ${heroBgClass}`}
          style={heroBgStyle}
        >
          <div className={isFullBleedSplit ? "grid min-h-[620px] lg:grid-cols-[1.03fr_0.97fr]" : "mx-auto grid max-w-[1240px] gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center"}>
            <div className={isFullBleedSplit ? "flex min-h-[540px] flex-col justify-center px-5 py-16 sm:px-10 lg:px-12 xl:px-16" : "max-w-[640px]"}>
              <div className="font-mono text-[11px] uppercase tracking-[0.16em]" style={{ color: heroIsLight ? theme.accent : rgba(theme.heroText, 0.72) }}>
                {editableCopy(kindSection.id, "eyebrow", copy.eyebrow, store.name)}
              </div>
              <h1 className={isFullBleedSplit ? "mt-4 max-w-[760px] text-[clamp(54px,7.5vw,112px)] font-semibold leading-[0.92] tracking-[-0.05em]" : "mt-4 text-[clamp(36px,6vw,72px)] font-semibold leading-[0.95] tracking-[-0.05em]"} style={{ color: heroTextColor, fontFamily: theme.headingFont }}>
                {editableCopy(kindSection.id, "title", copy.title, `Welcome to ${store.name}`)}
              </h1>
              <p className="mt-5 max-w-[60ch] text-[15px] leading-8 sm:text-[17px]" style={{ color: heroMutedColor }}>
                {editableCopy(kindSection.id, "body", copy.body, store.description ?? "Discover the store.")}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <CommerceButton label={editableCopy(kindSection.id, "primaryCta", copy.primaryCta, "Shop now")} theme={theme} variant={primaryButtonVariant} size={primaryButtonSize} shape={primaryButtonShape} icon="cart" onClick={() => runCommerceAction(primaryButtonAction, kindSection.settings?.primaryButtonUrl)} />
                <CommerceButton label={editableCopy(kindSection.id, "secondaryCta", copy.secondaryCta, "View story")} theme={theme} variant={secondaryButtonVariant} size={primaryButtonSize} shape={primaryButtonShape} onDark={!heroIsLight} onClick={() => runCommerceAction(secondaryButtonAction, kindSection.settings?.secondaryButtonUrl)} />
              </div>
            </div>
            <div className={isFullBleedSplit ? "grid gap-4 self-stretch p-5 sm:grid-cols-[1.2fr_0.8fr] sm:p-8 lg:p-10" : "grid gap-4 sm:grid-cols-[1.2fr_0.8fr]"}>
              <div className="overflow-hidden rounded-[32px] shadow-[0_28px_70px_rgba(0,0,0,0.12)]">
                {heroImageBlock
                  ? renderImageBlock(
                      heroImageBlock,
                      isFullBleedSplit ? "h-full min-h-[520px] w-full object-cover" : "h-[440px] w-full object-cover",
                      String(kindSection.items?.[0]?.title ?? store.name),
                      String(kindSection.items?.[0]?.color ?? theme.accent),
                    )
                  : editableItemImage(
                      kindSection.id,
                      kindSection.items?.[0],
                      0,
                      String(kindSection.items?.[0]?.title ?? store.name),
                      String(kindSection.items?.[0]?.color ?? theme.accent),
                      isFullBleedSplit ? "h-full min-h-[520px] w-full object-cover" : "h-[440px] w-full object-cover",
                    )}
              </div>
              <div className="grid gap-4">
                {(kindSection.items ?? []).slice(0, 2).map((item, index) => (
                  <div key={`${kindSection.id}-${index}`} className="overflow-hidden rounded-[26px] shadow-[0_14px_36px_rgba(0,0,0,0.08)]">
                    {editableItemImage(
                      kindSection.id,
                      item,
                      index,
                      String(item.title ?? "Template card"),
                      String(item.color ?? theme.heroBg),
                      isFullBleedSplit ? "h-[250px] w-full object-cover" : "h-[208px] w-full object-cover",
                    )}
                    <div className="px-4 py-3.5" style={{ background: theme.cardBg }}>
                      <div className="text-[14px] font-semibold" style={{ color: theme.ink }}>{String(item.title ?? "Product")}</div>
                      <div className="mt-0.5 text-[12px]" style={{ color: theme.muted }}>{String(item.subtitle ?? "")}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      );
    }

    if (kindSection.kind === "trust-strip") {
      const trustLayout = String(kindSection.settings?.layout ?? (kindSection.settings?.tone === "premium-retail" ? "icon-row" : "metric-cards"));
      if (trustLayout === "ingredients-strip") {
        const items = [...(kindSection.items ?? []), ...(kindSection.items ?? [])];
        return (
          <section key={kindSection.id} className="overflow-hidden px-6 py-4" style={{ background: theme.accent }}>
            <div className="flex min-w-max gap-12 whitespace-nowrap">
              {items.map((item, index) => (
                <div key={`${kindSection.id}-ingredient-${index}`} className="flex items-center gap-3 text-[13px] font-semibold" style={{ color: "rgba(255,255,255,.88)" }}>
                  <span className="h-1 w-1 rounded-full bg-white/45" />
                  <span>{String(item.label ?? "Ingredient")}</span>
                  <span className="font-normal text-white/60">{String(item.value ?? "")}</span>
                </div>
              ))}
            </div>
          </section>
        );
      }
      if (trustLayout === "compact-badges") {
        return (
          <section key={kindSection.id} className="px-5 py-4 sm:px-8" style={{ background: theme.paperBg }}>
            <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-center gap-2">
              {(kindSection.items ?? []).map((item, index) => (
                <div key={`${kindSection.id}-badge-${index}`} className="rounded-full border px-4 py-2 text-[11px] font-bold uppercase tracking-[0.1em]" style={{ ...blockPanelStyle(item.variant ?? "soft", theme), color: theme.ink }}>
                  {String(item.label ?? "Store benefit")}
                </div>
              ))}
            </div>
          </section>
        );
      }
      if (trustLayout === "icon-row" || kindSection.settings?.tone === "premium-retail") {
        return (
          <section key={kindSection.id} style={{ background: theme.heroBg }}>
            <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-center gap-x-14 gap-y-3 px-6 py-3.5">
              {(kindSection.items ?? []).map((item, index) => {
                const iconName = ["truck", "card", "package"].includes(String(item.icon)) ? String(item.icon) as "truck" | "card" | "package" : index === 0 ? "truck" : index === 1 ? "card" : "package";
                return (
                  <div key={`${kindSection.id}-${index}`} className="flex items-center gap-2.5 text-[12px] font-semibold tracking-[0.04em]" style={{ color: rgba(theme.heroText, 0.82) }}>
                    <Icon name={iconName} size={16} color={theme.accent} strokeWidth={1.8} />
                    <span>{String(item.label ?? "Store benefit")}</span>
                    <span className="hidden text-[11px] font-normal sm:inline" style={{ color: rgba(theme.heroText, 0.58) }}>{String(item.value ?? "")}</span>
                  </div>
                );
              })}
            </div>
          </section>
        );
      }
      return (
        <section key={kindSection.id} className="mx-auto max-w-[1240px] px-5 py-10 sm:px-8">
          <div className="grid gap-4 sm:grid-cols-3">
              {(kindSection.items ?? []).map((item, index) => (
              <div key={`${kindSection.id}-${index}`} className="border px-6 py-6 text-center" style={{ ...blockPanelStyle(item.variant ?? "soft", theme), borderColor: rgba(theme.accent, 0.12) }}>
                <div className="text-[28px] font-bold tracking-[-0.04em]" style={{ color: theme.ink }}>{String(item.value ?? "0")}</div>
                <div className="mt-1.5 text-[11px] uppercase tracking-[0.14em]" style={{ color: theme.muted }}>{String(item.label ?? "Metric")}</div>
              </div>
            ))}
          </div>
        </section>
      );
    }

    if (kindSection.kind === "category-grid" || kindSection.kind === "category-list" || kindSection.kind === "lookbook-grid") {
      const categoryItems = kindSection.kind === "lookbook-grid" ? (kindSection.items ?? []) : categoryItemsFor(kindSection);
      if (kindSection.settings?.layout === "icon-row") {
        return (
          <section key={kindSection.id} className="px-5 py-12 sm:px-8">
            <div className="mx-auto max-w-[1240px]">
              <SectionHeading eyebrow="Browse" title={String(copy.title ?? "Shop categories")} body={typeof copy.body === "string" ? copy.body : undefined} headingFont={theme.headingFont} accent={theme.accent} ink={theme.ink} muted={theme.muted} />
              <div className="mt-7 flex gap-3 overflow-x-auto pb-2">
                {categoryItems.map((item, index) => (
                  <button key={`${kindSection.id}-icon-${index}`} type="button" onClick={() => navigateCategory(item)} className="min-w-[150px] rounded-[20px] border bg-white px-4 py-5 text-center" style={{ borderColor: theme.border }}>
                    <span className="mx-auto grid h-12 w-12 place-items-center rounded-full text-[18px] font-bold" style={{ background: rgba(String(item.color ?? theme.accent), 0.12), color: String(item.color ?? theme.accent) }}>{String(item.title ?? "C").slice(0, 1)}</span>
                    <span className="mt-3 block text-[13px] font-semibold" style={{ color: theme.ink }}>{String(item.title ?? "Category")}</span>
                    <span className="mt-1 block text-[11px]" style={{ color: theme.muted }}>{String(item.subtitle ?? "Browse")}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        );
      }
      if (kindSection.settings?.layout === "sidebar") {
        return (
          <section key={kindSection.id} className="px-5 py-12 sm:px-8">
            <div className="mx-auto grid max-w-[1240px] gap-6 lg:grid-cols-[260px_1fr]">
              <aside className="rounded-[24px] border bg-white p-4" style={{ borderColor: theme.border }}>
                <div className="text-[12px] font-bold uppercase tracking-[0.12em]" style={{ color: theme.muted }}>Categories</div>
                <div className="mt-4 grid gap-2">
                  {categoryItems.map((item, index) => (
                    <button key={`${kindSection.id}-side-${index}`} type="button" onClick={() => navigateCategory(item)} className="rounded-[14px] px-3 py-2 text-left text-[13px] font-semibold" style={{ color: theme.ink, background: index === 0 ? rgba(theme.accent, 0.1) : "transparent" }}>{String(item.title ?? "Category")}</button>
                  ))}
                </div>
              </aside>
              <div>
                <SectionHeading eyebrow="Collections" title={String(copy.title ?? "Browse by category")} body={typeof copy.body === "string" ? copy.body : undefined} headingFont={theme.headingFont} accent={theme.accent} ink={theme.ink} muted={theme.muted} />
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  {categoryItems.slice(0, 4).map((item, index) => (
                    <div key={`${kindSection.id}-panel-${index}`} role="button" tabIndex={0} onClick={() => navigateCategory(item)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") navigateCategory(item); }} className="overflow-hidden rounded-[24px] border bg-white" style={{ borderColor: theme.border }}>
                      <div className="h-[160px]">{editableItemImage(kindSection.id, item, index, String(item.title ?? "Category"), String(item.color ?? theme.accent), "h-full w-full object-cover")}</div>
                      <div className="p-5">
                        <div className="text-[18px] font-semibold" style={{ color: theme.ink }}>{String(item.title ?? "Category")}</div>
                        <p className="mt-2 text-[13px]" style={{ color: theme.muted }}>{String(item.subtitle ?? "Collection")}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        );
      }
      if (kindSection.settings?.layout === "minimal-list") {
        return (
          <section key={kindSection.id} className="mx-auto max-w-[1120px] px-5 py-12 sm:px-8">
            <SectionHeading eyebrow="Browse" title={String(copy.title ?? "Shop categories")} body={typeof copy.body === "string" ? copy.body : undefined} headingFont={theme.headingFont} accent={theme.accent} ink={theme.ink} muted={theme.muted} />
            <div className="mt-8 border-y" style={{ borderColor: theme.border }}>
              {categoryItems.map((item, index) => (
                <button key={`${kindSection.id}-list-${index}`} type="button" onClick={() => navigateCategory(item)} className="grid w-full gap-4 border-b py-5 text-left last:border-b-0 sm:grid-cols-[80px_1fr_auto] sm:items-center" style={{ borderColor: theme.border }}>
                  <span className="grid h-16 w-16 place-items-center overflow-hidden rounded-full" style={{ background: rgba(String(item.color ?? theme.accent), 0.12), color: String(item.color ?? theme.accent) }}>
                    {editableItemImage(kindSection.id, item, index, String(item.title ?? "Category"), String(item.color ?? theme.accent), "h-full w-full object-cover")}
                  </span>
                  <span>
                    <span className="block text-[22px] font-semibold" style={{ color: theme.ink, fontFamily: theme.headingFont }}>{String(item.title ?? "Category")}</span>
                    <span className="mt-1 block text-[13px]" style={{ color: theme.muted }}>{String(item.subtitle ?? "Browse products")}</span>
                  </span>
                  <span className="text-[12px] font-bold uppercase tracking-[0.12em]" style={{ color: theme.accent }}>Shop</span>
                </button>
              ))}
            </div>
          </section>
        );
      }
      if (kindSection.settings?.layout === "circle-icons") {
        return (
          <section key={kindSection.id} className="px-5 py-12 sm:px-8">
            <div className="mx-auto max-w-[1240px]">
              <SectionHeading eyebrow="Browse" title={String(copy.title ?? "Shop by category")} body={typeof copy.body === "string" ? copy.body : undefined} headingFont={theme.headingFont} accent={theme.accent} ink={theme.ink} muted={theme.muted} />
              <div className="mt-8 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">
                {categoryItems.map((item, index) => (
                  <button key={`${kindSection.id}-circle-${index}`} type="button" onClick={() => navigateCategory(item)} className="group text-center">
                    <span className="mx-auto block h-28 w-28 overflow-hidden rounded-full border transition-transform group-hover:-translate-y-1" style={{ borderColor: theme.border }}>
                      {editableItemImage(kindSection.id, item, index, String(item.title ?? "Category"), String(item.color ?? theme.accent), "h-full w-full object-cover")}
                    </span>
                    <span className="mt-3 block text-[13px] font-semibold" style={{ color: theme.ink }}>{String(item.title ?? "Category")}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        );
      }
      if (kindSection.settings?.layout === "banner-grid") {
        return (
          <section key={kindSection.id} className="px-5 py-12 sm:px-8">
            <div className="mx-auto max-w-[1320px]">
              <SectionHeading eyebrow="Collections" title={String(copy.title ?? "Shop the edit")} body={typeof copy.body === "string" ? copy.body : undefined} headingFont={theme.headingFont} accent={theme.accent} ink={theme.ink} muted={theme.muted} />
              <div className="mt-8 grid gap-4 lg:grid-cols-2">
                {categoryItems.map((item, index) => (
                  <div key={`${kindSection.id}-banner-${index}`} role="button" tabIndex={0} onClick={() => navigateCategory(item)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") navigateCategory(item); }} className="group relative min-h-[260px] overflow-hidden rounded-[24px]" style={{ background: String(item.color ?? theme.accent) }}>
                    {editableItemImage(kindSection.id, item, index, String(item.title ?? "Category"), String(item.color ?? theme.accent), "absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105")}
                    <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/20 to-transparent" />
                    <div className="absolute bottom-6 left-6 right-6 text-white">
                      <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/70">{String(item.subtitle ?? "Collection")}</div>
                      <div className="mt-2 text-[34px] font-semibold leading-none" style={{ fontFamily: theme.headingFont }}>{String(item.title ?? "Category")}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        );
      }
      // The lookbook's "Editorial mosaic" uses the same mixed-height tiles; its pictures open the shop.
      const lookbookMosaic = kindSection.kind === "lookbook-grid" && kindSection.settings?.layout === "editorial-mosaic";
      if (kindSection.settings?.layout === "masonry" || lookbookMosaic) {
        const openTile = (item: Record<string, unknown>) => (lookbookMosaic ? navigate("products") : navigateCategory(item));
        return (
          <section key={kindSection.id} className="mx-auto max-w-[1320px] px-5 py-12 sm:px-8">
            <SectionHeading eyebrow={lookbookMosaic ? "Lookbook" : "Browse"} title={String(copy.title ?? (lookbookMosaic ? "The lookbook" : "Shop categories"))} body={typeof copy.body === "string" ? copy.body : undefined} headingFont={theme.headingFont} accent={theme.accent} ink={theme.ink} muted={theme.muted} />
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {categoryItems.map((item, index) => (
                <div key={`${kindSection.id}-masonry-${index}`} role="button" tabIndex={0} onClick={() => openTile(item)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") openTile(item); }} className="group overflow-hidden rounded-[24px] border bg-white" style={{ borderColor: theme.border }}>
                  <div className={index % 3 === 0 ? "h-[360px]" : "h-[230px]"}>
                    {editableItemImage(kindSection.id, item, index, String(item.title ?? "Category"), String(item.color ?? theme.accent), "h-full w-full object-cover transition-transform duration-500 group-hover:scale-105")}
                  </div>
                  <div className="p-5">
                    <div className="text-[22px] font-semibold" style={{ color: theme.ink, fontFamily: theme.headingFont }}>{String(item.title ?? "Category")}</div>
                    <div className="mt-1 text-[12px]" style={{ color: theme.muted }}>{String(item.subtitle ?? "Browse")}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      }
      if (kindSection.settings?.layout === "beauty-pills") {
        return (
          <section key={kindSection.id} className="mx-auto max-w-[1280px] px-6 py-20 sm:px-10">
            <div className="flex flex-wrap items-end justify-between gap-5">
              <SectionHeading
                eyebrow="Shop by need"
                title={String(copy.title ?? "Choose your ritual")}
                body={typeof copy.body === "string" ? copy.body : undefined}
                headingFont={theme.headingFont}
                accent={theme.accent}
                ink={theme.ink}
                muted={theme.muted}
              />
              <div className="flex flex-wrap gap-2">
                {categoryItems.slice(0, 5).map((item, index) => (
                  <button
                    key={`${kindSection.id}-pill-${index}`}
                    type="button"
                    onClick={() => navigateCategory(item)}
                    className="rounded-full border px-4 py-2 text-[12px] font-semibold"
                    style={{ borderColor: rgba(theme.accent, 0.26), color: theme.accent, background: rgba(theme.accent, 0.08) }}
                  >
                    {String(item.title ?? item.label ?? "Category")}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-9 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              {categoryItems.map((item, index) => (
                <div key={`${kindSection.id}-${index}`} role="button" tabIndex={0} onClick={() => navigateCategory(item)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") navigateCategory(item); }} className="group overflow-hidden rounded-[24px] border bg-white text-left transition-transform hover:-translate-y-1" style={{ borderColor: theme.border }}>
                  <div className="relative h-[260px] overflow-hidden">
                    {editableItemImage(kindSection.id, item, index, String(item.title ?? "Category"), String(item.color ?? theme.accent), "h-full w-full object-cover transition-transform duration-500 group-hover:scale-105")}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent p-5 text-white">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/72">{String(item.subtitle ?? "Skin ritual")}</div>
                      <div className="mt-1 text-[23px] font-light leading-none" style={{ fontFamily: theme.headingFont }}>{String(item.title ?? "Category")}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      }
      return (
        <section key={kindSection.id} className="mx-auto max-w-[1240px] px-5 py-12 sm:px-8">
          <SectionHeading
            eyebrow={kindSection.kind === "lookbook-grid" ? "Campaign moments" : "Browse the store"}
            title={String(copy.title ?? "Browse")}
            body={typeof copy.body === "string" ? copy.body : undefined}
            headingFont={theme.headingFont}
            accent={theme.accent}
            ink={theme.ink}
            muted={theme.muted}
          />
          <div className={`mt-6 grid gap-4 md:grid-cols-2 ${theme.templateStyle === "runway" || theme.templateStyle === "editorial" ? "xl:grid-cols-3" : "xl:grid-cols-4"}`}>
            {categoryItems.map((item, index) => (
              <div key={`${kindSection.id}-${index}`} role="button" tabIndex={0} onClick={() => kindSection.kind === "lookbook-grid" ? navigate("products") : navigateCategory(item)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { kindSection.kind === "lookbook-grid" ? navigate("products") : navigateCategory(item); } }} className="group overflow-hidden border bg-white text-left transition-transform hover:-translate-y-1" style={{ borderColor: theme.border, borderRadius: theme.templateStyle === "marketplace" ? 6 : theme.radius }}>
                <div className={`relative overflow-hidden ${theme.templateStyle === "marketplace" ? "h-[170px]" : theme.templateStyle === "runway" || theme.templateStyle === "editorial" ? "h-[300px]" : "h-[220px]"}`}>
                  {editableItemImage(kindSection.id, item, index, String(item.title ?? "Section tile"), String(item.color ?? theme.accent), "h-full w-full object-cover transition-transform duration-300 group-hover:scale-105")}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
                  <div className="absolute bottom-4 left-4 right-4 text-white">
                    <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/74">{String(item.subtitle ?? "Collection")}</div>
                    <div className={`${theme.templateStyle === "marketplace" ? "mt-1 text-[18px]" : "mt-1 text-[24px]"} font-semibold tracking-[-0.03em]`} style={{ fontFamily: theme.headingFont }}>{String(item.title ?? "Tile")}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      );
    }

    if (kindSection.kind === "featured-products") {
      // "How many products" always applies once the seller sets it; unset, the shop page shows every product.
      const products = filteredProducts(resolveProductItems(kindSection.items, store)).slice(0, readOptionalProductLimit(kindSection.settings) ?? (currentPage === "products" ? undefined : readProductLimit(kindSection.settings, 8)));
      const isPremiumProducts = kindSection.settings?.layout === "premium-product-cards";
      // "Products per row on computers" (2, 3 or 4); without a choice the template's own grid is kept.
      const columnClass = ({ "2": "xl:grid-cols-2", "3": "xl:grid-cols-3", "4": "xl:grid-cols-4" } as Record<string, string>)[String(kindSection.settings?.columns ?? "")];
      if (kindSection.settings?.layout === "editorial-rows") {
        return (
          <section key={kindSection.id} className="mx-auto max-w-[1240px] px-5 py-12 sm:px-8">
            <SectionHeading eyebrow="Featured" title={String(copy.title ?? "Featured collection")} body={typeof copy.body === "string" ? copy.body : undefined} headingFont={theme.headingFont} accent={theme.accent} ink={theme.ink} muted={theme.muted} />
            <div className="mt-8 grid gap-5">
              {products.slice(0, readOptionalProductLimit(kindSection.settings) ?? 5).map((product, index) => (
                <article key={product.id} className="grid overflow-hidden border bg-white md:grid-cols-[220px_1fr_auto]" style={{ borderColor: theme.border, borderRadius: theme.templateStyle === "marketplace" ? 6 : theme.radius }}>
                  <div role="button" tabIndex={0} onClick={() => openProduct(product)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") openProduct(product); }} className="h-[220px] cursor-pointer md:h-full">
                    {renderImage(product.imageUrl, product.title, product.color, "h-full w-full object-cover")}
                  </div>
                  <div className="flex flex-col justify-center p-5">
                    <div className="font-mono text-[11px] uppercase tracking-[0.16em]" style={{ color: theme.accent }}>0{index + 1} - {product.subtitle}</div>
                    <h3 className="mt-3 text-[28px] font-semibold leading-tight" style={{ color: theme.ink, fontFamily: theme.headingFont }}>{product.title}</h3>
                    <p className="mt-3 max-w-[560px] text-[14px] leading-7" style={{ color: theme.muted }}>{product.subtitle || "Featured product selected for this store."}</p>
                  </div>
                  <div className="flex flex-col justify-center gap-3 border-t p-5 md:min-w-[190px] md:border-l md:border-t-0" style={{ borderColor: theme.border }}>
                    <div className="text-[22px] font-semibold" style={{ color: theme.ink }}>{product.priceLabel}</div>
                    <button type="button" onClick={() => product.purchasable ? onAddToCart?.(product.mappedStoreProductId ?? product.id) : openProduct(product)} className="rounded-full px-5 py-3 text-[13px] font-semibold" style={{ background: theme.ctaBg, color: theme.ctaText }}>Add to cart</button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      }
      if (kindSection.settings?.layout === "beauty-rounded") {
        return (
          <section key={kindSection.id} className="mx-auto max-w-[1280px] px-6 py-20 sm:px-10">
            <SectionHeading
              eyebrow="Best sellers"
              title={String(copy.title ?? "Ritual favourites")}
              body={typeof copy.body === "string" ? copy.body : undefined}
              headingFont={theme.headingFont}
              accent={theme.accent}
              ink={theme.ink}
              muted={theme.muted}
            />
            <div className={`mt-9 grid gap-6 md:grid-cols-2 ${columnClass ?? "xl:grid-cols-4"}`}>
              {products.map((product, index) => {
                const originalItem = kindSection.items?.[index];
                return (
                  <article key={product.id} className="group overflow-hidden rounded-[24px] border bg-white" style={{ borderColor: theme.border }}>
                    <div role="button" tabIndex={0} onClick={() => openProduct(product)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") openProduct(product); }} className="block w-full text-left">
                      <div className="h-[282px] overflow-hidden bg-[#F5EDE8]">
                        {originalItem && (!product.mappedStoreProductId || !product.imageUrl)
                          ? editableItemImage(kindSection.id, originalItem, index, product.title, product.color, "h-full w-full object-cover transition-transform duration-500 group-hover:scale-105")
                          : renderImage(product.imageUrl, product.title, product.color, "h-full w-full object-cover transition-transform duration-500 group-hover:scale-105")}
                      </div>
                      <div className="p-5">
                        <div className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: theme.accent }}>{product.subtitle}</div>
                        <h3 className="mt-2 text-[18px] font-semibold" style={{ color: theme.ink }}>{product.title}</h3>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <span className="text-[17px] font-semibold" style={{ color: theme.ink }}>{product.priceLabel}</span>
                          <span className="rounded-full px-3 py-1.5 text-[11px] font-bold" style={{ background: rgba(theme.accent, 0.1), color: theme.accent }}>View</span>
                        </div>
                      </div>
                    </div>
                    <button type="button" onClick={() => product.purchasable ? onAddToCart?.(product.mappedStoreProductId ?? product.id) : openProduct(product)} className="mx-5 mb-5 w-[calc(100%-2.5rem)] rounded-[12px] px-4 py-3 text-[12px] font-bold uppercase tracking-[0.08em]" style={{ background: theme.ctaBg, color: theme.ctaText }}>
                      Add to bag
                    </button>
                  </article>
                );
              })}
              {products.length === 0 ? (
                <div className="rounded-[24px] border bg-white p-6 text-[14px]" style={{ borderColor: theme.border, color: theme.muted }}>
                  No products match the current filters.
                </div>
              ) : null}
            </div>
          </section>
        );
      }
      return (
        <section key={kindSection.id} className={isPremiumProducts ? "mx-auto max-w-[1320px] px-6 py-14 sm:px-8 lg:py-20" : "mx-auto max-w-[1240px] px-5 py-12 sm:px-8"}>
          <SectionHeading
            eyebrow="Featured"
            title={String(copy.title ?? "Featured collection")}
            body={typeof copy.body === "string" ? copy.body : undefined}
            headingFont={theme.headingFont}
            accent={theme.accent}
            ink={theme.ink}
            muted={theme.muted}
          />
          <div className={`mt-8 grid ${isPremiumProducts ? `gap-7 sm:grid-cols-2 ${columnClass ?? "xl:grid-cols-4"}` : `gap-5 md:grid-cols-2 ${columnClass ?? (theme.templateStyle === "marketplace" || theme.templateStyle === "electronics" ? "xl:grid-cols-4" : "xl:grid-cols-3")}`}`}>
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                theme={theme}
                onOpenProduct={() => openProduct(product)}
                onAddToCart={onAddToCart}
                onToggleWishlist={onToggleWishlist}
                wishlistProductIds={wishlistProductIds}
                mode={mode}
              />
            ))}
            {products.length === 0 ? (
              <div className="rounded-[24px] border bg-white p-6 text-[14px]" style={{ borderColor: theme.border, color: theme.muted }}>
                No products match the current filters.
              </div>
            ) : null}
          </div>
        </section>
      );
    }

    if (kindSection.kind === "filters-toolbar") {
      const filterLayout = String(kindSection.settings?.layout ?? "compact");
      if (filterLayout === "topbar" || filterLayout === "drawer") {
        return (
          <section key={kindSection.id} className="mx-auto max-w-[1320px] px-5 py-4 sm:px-8">
            <div className="flex flex-wrap items-center gap-3 border-b pb-4" style={{ borderColor: theme.border }}>
              <div className="mr-auto">
                <div className="text-[13px] font-bold uppercase tracking-[0.12em]" style={{ color: theme.accent }}>{filterLayout === "drawer" ? "Filter drawer" : "Shop controls"}</div>
                <div className="mt-1 text-[12px]" style={{ color: theme.muted }}>{filteredProducts(resolveProductItems([], store)).length || store.storeProducts.length} products available</div>
              </div>
              {filterLayout === "drawer" ? (
                <button type="button" className="rounded-full border px-4 py-2 text-[12px] font-bold" style={{ borderColor: theme.border, color: theme.ink }}>Open filters</button>
              ) : null}
              <input value={productFilter.q} onChange={(event) => updateProductFilter({ q: event.target.value })} placeholder="Search products" className="min-w-[180px] rounded-full border px-4 py-2 text-[12px] font-semibold outline-none" style={{ borderColor: theme.border, color: theme.ink, background: theme.paperBg }} />
              <select value={productFilter.category} onChange={(event) => updateProductFilter({ category: event.target.value })} className="rounded-full border px-4 py-2 text-[12px] font-semibold outline-none" style={{ borderColor: theme.border, color: theme.ink, background: theme.paperBg }}>
                <option value="all">All categories</option>
                {productCategories.map((category) => <option key={category.slug} value={category.slug}>{category.name}</option>)}
              </select>
              <select value={productFilter.sort} onChange={(event) => updateProductFilter({ sort: event.target.value })} className="rounded-full border px-4 py-2 text-[12px] font-semibold outline-none" style={{ borderColor: theme.border, color: theme.ink, background: theme.paperBg }}>
                <option value="newest">Newest</option>
                <option value="name">Name A-Z</option>
                <option value="price-low">Price low</option>
                <option value="price-high">Price high</option>
              </select>
            </div>
          </section>
        );
      }
      if (filterLayout === "sidebar") {
        return (
          <section key={kindSection.id} className="mx-auto max-w-[1240px] px-5 py-4 sm:px-8">
            <div className="grid gap-4 rounded-[28px] border bg-white p-4 lg:grid-cols-[260px_1fr]" style={{ borderColor: theme.border }}>
              <aside className="rounded-[22px] p-4" style={{ background: rgba(theme.accent, 0.08) }}>
                <div className="text-[14px] font-semibold" style={{ color: theme.ink }}>{String(copy.title ?? "Filter products")}</div>
                <div className="mt-3 grid gap-2">
                  {productCategories.slice(0, 6).map((category) => (
                    <button key={category.slug} type="button" onClick={() => updateProductFilter({ category: category.slug })} className="rounded-full px-3 py-2 text-left text-[12px] font-semibold" style={{ background: productFilter.category === category.slug ? theme.accent : "#fff", color: productFilter.category === category.slug ? theme.ctaText : theme.ink }}>{category.name}</button>
                  ))}
                </div>
              </aside>
              <div className="flex flex-wrap items-center gap-3">
                <input value={productFilter.q} onChange={(event) => updateProductFilter({ q: event.target.value })} placeholder="Search products" className="min-w-[220px] flex-1 rounded-full border px-4 py-2 text-[12px] font-semibold outline-none" style={{ borderColor: theme.border, color: theme.ink, background: theme.paperBg }} />
                <select value={productFilter.sort} onChange={(event) => updateProductFilter({ sort: event.target.value })} className="rounded-full border px-4 py-2 text-[12px] font-semibold outline-none" style={{ borderColor: theme.border, color: theme.ink, background: theme.paperBg }}>
                  <option value="newest">Newest first</option>
                  <option value="name">Name A-Z</option>
                  <option value="price-low">Price low</option>
                  <option value="price-high">Price high</option>
                </select>
              </div>
            </div>
          </section>
        );
      }
      if (filterLayout === "chips") {
        return (
          <section key={kindSection.id} className="mx-auto max-w-[1240px] px-5 py-4 sm:px-8">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => updateProductFilter({ category: "all" })} className="rounded-full border px-4 py-2 text-[12px] font-bold" style={{ borderColor: theme.border, background: productFilter.category === "all" ? theme.accent : theme.cardBg, color: productFilter.category === "all" ? theme.ctaText : theme.ink }}>All</button>
              {productCategories.map((category) => (
                <button key={category.slug} type="button" onClick={() => updateProductFilter({ category: category.slug })} className="rounded-full border px-4 py-2 text-[12px] font-bold" style={{ borderColor: theme.border, background: productFilter.category === category.slug ? theme.accent : theme.cardBg, color: productFilter.category === category.slug ? theme.ctaText : theme.ink }}>{category.name}</button>
              ))}
            </div>
          </section>
        );
      }
      return (
        <section key={kindSection.id} className="mx-auto max-w-[1240px] px-5 py-4 sm:px-8">
          <div className="flex flex-wrap items-center gap-3 rounded-[24px] border bg-white px-4 py-4" style={{ borderColor: theme.border }}>
            <div className="mr-auto">
              <div className="text-[14px] font-semibold" style={{ color: theme.ink }}>{String(copy.title ?? "Filter products")}</div>
              <div className="text-[12px]" style={{ color: theme.muted }}>{String(copy.body ?? "Refine the collection")}</div>
            </div>
            <input
              value={productFilter.q}
              onChange={(event) => updateProductFilter({ q: event.target.value })}
              placeholder="Search products"
              className="rounded-full border px-4 py-2 text-[12px] font-semibold outline-none"
              style={{ borderColor: theme.border, color: theme.ink, background: theme.paperBg }}
            />
            <select
              value={productFilter.category}
              onChange={(event) => updateProductFilter({ category: event.target.value })}
              className="rounded-full border px-4 py-2 text-[12px] font-semibold outline-none"
              style={{ borderColor: theme.border, color: theme.ink, background: theme.paperBg }}
            >
              <option value="all">All categories</option>
              {productCategories.map((category) => <option key={category.slug} value={category.slug}>{category.name}</option>)}
            </select>
            <select
              value={productFilter.sort}
              onChange={(event) => updateProductFilter({ sort: event.target.value })}
              className="rounded-full border px-4 py-2 text-[12px] font-semibold outline-none"
              style={{ borderColor: theme.border, color: theme.ink, background: theme.paperBg }}
            >
              <option value="newest">Newest first</option>
              <option value="name">Name A-Z</option>
              <option value="price-low">Price low</option>
              <option value="price-high">Price high</option>
            </select>
          </div>
        </section>
      );
    }

    if (kindSection.kind === "product-detail") {
      // The shared product page (same layouts and builder settings as the 2026 themes) in this template's look. The
      // builder shows a sample product until the store has one, so the product page can still be designed.
      const mapped = (selectedProductId ? store.storeProducts.find((product) => product.id === selectedProductId) : null) ?? store.storeProducts[0];
      const product: BoutiqueProductDetail | undefined = mapped ?? (isEditor ? samplePdpProduct(snapshot.templateId, store.currency) : undefined);
      if (!product) return null;
      const live = mode === "live" && Boolean(mapped);
      const pageSections = page?.sections ?? [];
      const relatedSection = pageSections.find((entry) => entry.kind === "featured-products" && entry.settings?.source === "related");
      const relatedTitle = String(relatedSection?.blocks.find((entry) => entry.type === "copy")?.content?.title ?? "").trim();
      const settings = readClassicPdpSettings(kindSection, { relatedFallback: relatedTitle });
      const addLine = () => onAddToCart?.(product.id);
      return (
        <ClassicPdp
          key={kindSection.id}
          product={product}
          look={pdpLook}
          settings={settings}
          shopper={shopperInfo}
          storeName={store.name}
          currency={store.currency}
          reviews={[]}
          avgRating={product.avgRating ?? 0}
          reviewCount={product.reviewCount ?? 0}
          related={relatedProducts(product, store.storeProducts)}
          onOpenRelated={openProductPage}
          catalog={store.storeProducts}
          wishlistIds={wishlistProductIds}
          onToggleWishlist={live ? onToggleWishlist : undefined}
          onAddToBag={live ? addLine : undefined}
          onBuyNow={live ? () => { addLine(); navigate("checkout"); } : undefined}
          reviewSlug={live ? store.slug : undefined}
          interactive={live}
          crumbs={[
            { label: "Home", onSelect: () => navigate("home") },
            { label: "Shop", onSelect: () => navigate("products") },
            ...(product.category ? [{ label: product.category.name, onSelect: () => navigateCategory({ slug: product.category!.slug }) }] : []),
            { label: product.name },
          ]}
          notice={mapped ? undefined : "Sample product. Your own products show here once you add them."}
        />
      );
    }

    if (kindSection.kind === "cart-summary" || kindSection.kind === "wishlist-grid") {
      const isCart = kindSection.kind === "cart-summary";
      const layout = String(kindSection.settings?.layout ?? (isCart ? "shopify" : "page"));
      const items = !isCart && wishlistProductIds.length > 0
        ? store.storeProducts
            .filter((product) => wishlistProductIds.includes(product.id))
            .map((product, index): RenderProduct => ({
              id: product.id,
              title: product.name,
              subtitle: product.description?.slice(0, 80) ?? "Saved product",
              priceLabel: formatMoney(product.currency, product.retailPrice),
              imageUrl: product.images[0],
              color: ["#2E7E78", "#C9973A", "#466378", "#8A5A3A"][index % 4],
              purchasable: true,
              mappedStoreProductId: product.id,
              avgRating: product.avgRating,
              reviewCount: product.reviewCount,
            }))
        : resolveProductItems(kindSection.items, store);
      if (!isCart && layout === "drawer") {
        return (
          <section key={kindSection.id} className="px-5 py-12 sm:px-8">
            <div className="mx-auto grid max-w-[1240px] gap-6 lg:grid-cols-[1fr_380px]">
              <div>
                <SectionHeading eyebrow="Wishlist" title={String(copy.title ?? "Saved for later")} body={String(copy.body ?? "Products you love, ready when you are.")} headingFont={theme.headingFont} accent={theme.accent} ink={theme.ink} muted={theme.muted} />
                <div className="mt-7 grid gap-4 md:grid-cols-2">
                  {items.map((product) => (
                    <ProductCard key={product.id} product={product} theme={theme} mode={mode} onOpenProduct={() => openProduct(product)} onAddToCart={onAddToCart} onToggleWishlist={onToggleWishlist} wishlistProductIds={wishlistProductIds} />
                  ))}
                </div>
              </div>
              <aside className="rounded-[28px] border bg-white p-5 lg:sticky lg:top-24 lg:h-fit" style={{ borderColor: theme.border }}>
                <div className="text-[17px] font-semibold" style={{ color: theme.ink }}>Wishlist drawer</div>
                <p className="mt-2 text-[13px] leading-6" style={{ color: theme.muted }}>A compact saved-products drawer can be opened from the header wishlist link.</p>
                <button type="button" onClick={() => navigate("products")} className="mt-5 w-full rounded-full px-5 py-3 text-[14px] font-semibold" style={{ background: theme.ctaBg, color: theme.ctaText }}>Continue shopping</button>
              </aside>
            </div>
          </section>
        );
      }
      if (layout === "floating") {
        return (
          <section key={kindSection.id} className="px-5 py-12 sm:px-8">
            <div className="mx-auto max-w-[1240px]">
              <SectionHeading eyebrow={isCart ? "Cart" : "Wishlist"} title={String(copy.title ?? (isCart ? "Floating cart" : "Floating wishlist"))} body={String(copy.body ?? "A compact floating summary stays visible while shoppers continue browsing.")} headingFont={theme.headingFont} accent={theme.accent} ink={theme.ink} muted={theme.muted} />
              <div className="mt-7 grid gap-4 md:grid-cols-3">
                {items.slice(0, 3).map((product) => (
                  <ProductCard key={product.id} product={product} theme={theme} mode={mode} onOpenProduct={() => openProduct(product)} onAddToCart={onAddToCart} onToggleWishlist={onToggleWishlist} wishlistProductIds={wishlistProductIds} />
                ))}
              </div>
              <div className="mt-8 max-w-[420px] rounded-[28px] border bg-white p-5 shadow-[0_24px_80px_rgba(14,42,56,.14)]" style={{ borderColor: theme.border }}>
                <div className="flex items-center justify-between"><strong style={{ color: theme.ink }}>{isCart ? "Mini cart" : "Saved items"}</strong><span style={{ color: theme.muted }}>{items.length} items</span></div>
                <button type="button" onClick={() => navigate(isCart ? "checkout" : "products")} className="mt-4 w-full rounded-full px-5 py-3 text-[14px] font-semibold" style={{ background: theme.ctaBg, color: theme.ctaText }}>{isCart ? "Checkout" : "Shop more"}</button>
              </div>
            </div>
          </section>
        );
      }
      return (
        <section key={kindSection.id} className="mx-auto max-w-[1240px] px-5 py-12 sm:px-8">
          <SectionHeading eyebrow={isCart ? "Cart" : "Wishlist"} title={String(copy.title ?? (isCart ? "Your cart" : "Saved for later"))} body={String(copy.body ?? "")} headingFont={theme.headingFont} accent={theme.accent} ink={theme.ink} muted={theme.muted} />
          {/* "Minimal": one slim column, the summary under the items. */}
          <div className={layout === "minimal" ? "mx-auto mt-6 grid max-w-[720px] gap-5" : "mt-6 grid gap-5 lg:grid-cols-[1fr_360px]"}>
            <div className="grid gap-3">
              {items.map((product) => (
                <div key={product.id} className="grid grid-cols-[96px_1fr_auto] gap-4 rounded-[24px] border bg-white p-3" style={{ borderColor: theme.border }}>
                  {renderImage(product.imageUrl, product.title, product.color, "h-24 w-24 rounded-[18px] object-cover")}
                  <div>
                    <div className="font-semibold" style={{ color: theme.ink }}>{product.title}</div>
                    <div className="mt-1 text-[13px]" style={{ color: theme.muted }}>{product.subtitle}</div>
                    {isCart ? <div className="mt-3 inline-flex rounded-full border px-3 py-1 text-[12px]" style={{ borderColor: theme.border }}>Qty 1</div> : null}
                  </div>
                  <div className="text-right font-semibold" style={{ color: theme.ink }}>{product.priceLabel}</div>
                </div>
              ))}
              {items.length === 0 ? (
                <div className="rounded-[24px] border bg-white p-6 text-[14px]" style={{ borderColor: theme.border, color: theme.muted }}>
                  Your wishlist is empty. Save products you love and they will appear here.
                </div>
              ) : null}
            </div>
            <div className="rounded-[28px] border bg-white p-5" style={{ borderColor: theme.border }}>
              <div className="text-[17px] font-semibold" style={{ color: theme.ink }}>{isCart ? "Order summary" : "Wishlist actions"}</div>
              <div className="mt-4 grid gap-3 text-[13px]" style={{ color: theme.muted }}>
                <div className="flex justify-between"><span>Subtotal</span><strong style={{ color: theme.ink }}>{items[0]?.priceLabel ?? "NGN 0"}</strong></div>
                <div className="flex justify-between"><span>Delivery</span><span>Calculated later</span></div>
                <div className="flex justify-between"><span>Discounts</span><span>At checkout</span></div>
              </div>
              <button type="button" onClick={() => navigate(isCart ? "checkout" : "products")} className="mt-5 w-full rounded-full px-5 py-3 text-[14px] font-semibold" style={{ background: theme.ctaBg, color: theme.ctaText }}>
                {isCart ? "Proceed to checkout" : "Continue shopping"}
              </button>
            </div>
          </div>
        </section>
      );
    }

    if (kindSection.kind === "blog-index") {
      const layout = String(kindSection.settings?.layout ?? "grid");
      const posts = kindSection.items ?? [];
      if (layout === "single-preview" || layout === "article-split") {
        const post = posts[0] ?? {};
        return (
          <section key={kindSection.id} className="px-5 py-14 sm:px-8">
            <article className="mx-auto grid max-w-[1180px] overflow-hidden border bg-white lg:grid-cols-[0.9fr_1.1fr]" style={{ borderColor: theme.border, borderRadius: layout === "article-split" ? 6 : 28 }}>
              <div className="min-h-[420px]">{editableItemImage(kindSection.id, post, 0, String(post.title ?? "Blog post"), String(post.color ?? theme.accent), "h-full min-h-[420px] w-full object-cover")}</div>
              <div className="flex flex-col justify-center p-8 lg:p-12">
                <div className="font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: theme.accent }}>{String(post.category ?? "Preview")} - {String(post.readTime ?? "4 min read")}</div>
                <h1 className="mt-4 text-[42px] font-semibold leading-tight tracking-[-0.04em]" style={{ color: theme.ink, fontFamily: theme.headingFont }}>{String(post.title ?? "Single blog post preview")}</h1>
                <p className="mt-5 text-[15px] leading-8" style={{ color: theme.muted }}>{String(post.excerpt ?? "Preview a complete article page before publishing your blog.")}</p>
                {layout === "article-split" ? (
                  <div className="mt-6 border-l-2 pl-4 text-[15px] leading-7" style={{ borderColor: theme.accent, color: theme.ink }}>
                    {String(post.pullQuote ?? "A helpful, readable article page builds trust before the customer buys.")}
                  </div>
                ) : null}
                <button type="button" className="mt-7 w-fit rounded-full border px-5 py-3 text-[13px] font-semibold" style={{ borderColor: theme.border, color: theme.ink }}>Read preview</button>
              </div>
            </article>
          </section>
        );
      }
      if (layout === "longform-editorial") {
        const post = posts[0] ?? {};
        return (
          <section key={kindSection.id} className="px-5 py-16 sm:px-8" style={{ background: theme.paperBg }}>
            <article className="mx-auto max-w-[920px]">
              <div className="text-center">
                <div className="font-mono text-[12px] uppercase tracking-[0.22em]" style={{ color: theme.accent }}>{String(post.category ?? "Journal")} - {String(post.readTime ?? "6 min read")}</div>
                <h1 className="mx-auto mt-5 max-w-[860px] text-[clamp(42px,7vw,86px)] font-semibold leading-[0.95]" style={{ color: theme.ink, fontFamily: theme.headingFont }}>{String(post.title ?? "Single article preview")}</h1>
                <p className="mx-auto mt-6 max-w-[640px] text-[17px] leading-8" style={{ color: theme.muted }}>{String(post.excerpt ?? "A complete longform article layout for guides, launches, lookbooks, and educational content.")}</p>
              </div>
              <div className="mt-10 h-[420px] overflow-hidden rounded-[6px]">{editableItemImage(kindSection.id, post, 0, String(post.title ?? "Blog post"), String(post.color ?? theme.accent), "h-full w-full object-cover")}</div>
              <div className="mx-auto mt-10 grid max-w-[760px] gap-6 text-[17px] leading-9" style={{ color: theme.ink }}>
                <p>{String(post.body ?? "Use this space for the full article body. Sellers can edit the headline, excerpt, image, category, read time, and supporting copy.")}</p>
                <blockquote className="border-l-2 pl-5 text-[24px] leading-8" style={{ borderColor: theme.accent, fontFamily: theme.headingFont }}>{String(post.pullQuote ?? "Good editorial content makes the storefront feel alive and trustworthy.")}</blockquote>
              </div>
            </article>
          </section>
        );
      }
      if (layout === "press-list") {
        return (
          <section key={kindSection.id} className="mx-auto max-w-[1120px] px-5 py-12 sm:px-8">
            <SectionHeading eyebrow="Journal" title={String(copy.title ?? "Latest notes")} body={String(copy.body ?? "Compact updates, guides, and product stories.")} headingFont={theme.headingFont} accent={theme.accent} ink={theme.ink} muted={theme.muted} />
            <div className="mt-8 border-y" style={{ borderColor: theme.border }}>
              {posts.map((item, index) => (
                <article key={`${kindSection.id}-press-${index}`} className="grid gap-4 border-b py-5 last:border-b-0 md:grid-cols-[140px_1fr_auto]" style={{ borderColor: theme.border }}>
                  <div className="font-mono text-[11px] uppercase tracking-[0.16em]" style={{ color: theme.accent }}>{String(item.category ?? "Story")}</div>
                  <div>
                    <h3 className="text-[22px] font-semibold" style={{ color: theme.ink, fontFamily: theme.headingFont }}>{String(item.title ?? `Post ${index + 1}`)}</h3>
                    <p className="mt-2 text-[14px] leading-6" style={{ color: theme.muted }}>{String(item.excerpt ?? "Write a short summary for this post.")}</p>
                  </div>
                  <div className="font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: theme.muted }}>{String(item.readTime ?? "3 min")}</div>
                </article>
              ))}
            </div>
          </section>
        );
      }
      if (layout === "resource-hub") {
        const [featured, ...rest] = posts;
        return (
          <section key={kindSection.id} className="px-5 py-14 sm:px-8" style={{ background: theme.paperBg }}>
            <div className="mx-auto grid max-w-[1320px] gap-6 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-[28px] border p-6" style={{ background: theme.heroBg, borderColor: rgba(theme.accent, 0.2), color: theme.heroText }}>
                <div className="font-mono text-[12px] uppercase tracking-[0.22em]" style={{ color: rgba(theme.heroText, 0.66) }}>Featured guide</div>
                <h2 className="mt-5 text-[clamp(34px,5vw,62px)] leading-[1.02]" style={{ fontFamily: theme.headingFont }}>{String(featured?.title ?? "Buying guide")}</h2>
                <p className="mt-5 text-[15px] leading-8" style={{ color: rgba(theme.heroText, 0.72) }}>{String(featured?.excerpt ?? "A practical guide for customers.")}</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {rest.slice(0, 4).map((item, index) => (
                  <article key={`${kindSection.id}-resource-${index}`} className="rounded-[22px] border bg-white p-5" style={{ borderColor: theme.border }}>
                    <div className="font-mono text-[11px] uppercase tracking-[0.16em]" style={{ color: theme.accent }}>{String(item.category ?? "Guide")}</div>
                    <h3 className="mt-3 text-[22px] font-semibold leading-tight" style={{ color: theme.ink, fontFamily: theme.headingFont }}>{String(item.title ?? "Resource")}</h3>
                    <p className="mt-3 text-[13px] leading-6" style={{ color: theme.muted }}>{String(item.excerpt ?? "Helpful resource summary.")}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>
        );
      }
      return (
        <section key={kindSection.id} className="mx-auto max-w-[1240px] px-5 py-12 sm:px-8">
          <SectionHeading
            eyebrow="Journal"
            title={String(copy.title ?? "Latest stories")}
            body={String(copy.body ?? "Guides, launch notes, and useful product education.")}
            headingFont={theme.headingFont}
            accent={theme.accent}
            ink={theme.ink}
            muted={theme.muted}
          />
          <div className={`mt-6 grid gap-5 ${layout === "magazine" ? "md:grid-cols-[1.4fr_0.8fr_0.8fr]" : layout === "minimal" ? "md:grid-cols-2" : layout === "lookbook-journal" ? "md:grid-cols-2 lg:grid-cols-4" : layout === "story-stack" ? "mx-auto max-w-[980px]" : "md:grid-cols-3"}`}>
            {(kindSection.items ?? []).map((item, index) => (
              <article key={`${kindSection.id}-${index}`} className={`overflow-hidden border bg-white ${layout === "story-stack" ? "md:grid md:grid-cols-[320px_1fr]" : ""}`} style={{ borderColor: theme.border, borderRadius: layout === "lookbook-journal" ? 6 : theme.radius }}>
                <div className={layout === "lookbook-journal" ? "h-72" : layout === "story-stack" ? "h-56 md:h-full md:min-h-[220px]" : "h-44"}>{editableItemImage(kindSection.id, item, index, String(item.title ?? "Post"), String(item.color ?? theme.accent), "h-full w-full object-cover")}</div>
                <div className="px-5 py-5">
                  <div className="font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: theme.accent }}>
                    {String(item.category ?? "Story")} - {String(item.readTime ?? "3 min read")}
                  </div>
                  <h3 className="mt-3 text-[22px] font-semibold leading-tight tracking-[-0.04em]" style={{ color: theme.ink, fontFamily: theme.headingFont }}>
                    {String(item.title ?? `Post ${index + 1}`)}
                  </h3>
                  <p className="mt-3 text-[13px] leading-6" style={{ color: theme.muted }}>
                    {String(item.excerpt ?? "Write a short summary for this post.")}
                  </p>
                  <button type="button" className="mt-5 rounded-full border px-4 py-2 text-[12px] font-semibold" style={{ borderColor: theme.border, color: theme.ink }}>
                    Read post
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      );
    }

    if (kindSection.kind === "checkout-form") {
      const layout = String(kindSection.settings?.layout ?? "single-page");
      const fields = ["Email address", "Full name", "Phone number", "Delivery address", "Order notes"];
      const steps = kindSection.items ?? [{ label: "Contact", value: "Email and phone" }, { label: "Delivery", value: "Address and shipping method" }, { label: "Payment", value: "Card, transfer, or mobile money" }];
      if (layout === "multi-step") {
        return (
          <section key={kindSection.id} className="mx-auto max-w-[1120px] px-5 py-12 sm:px-8">
            <SectionHeading eyebrow="Checkout" title={String(copy.title ?? "Step-by-step checkout")} body={String(copy.body ?? "Guide shoppers through contact, delivery, and payment.")} headingFont={theme.headingFont} accent={theme.accent} ink={theme.ink} muted={theme.muted} />
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {steps.map((item, index) => (
                <div key={`${kindSection.id}-step-${index}`} className="rounded-[24px] border bg-white p-5" style={{ borderColor: theme.border }}>
                  <div className="grid h-10 w-10 place-items-center rounded-full text-[14px] font-bold" style={{ background: rgba(theme.accent, 0.12), color: theme.accent }}>{index + 1}</div>
                  <div className="mt-4 font-semibold" style={{ color: theme.ink }}>{String(item.label ?? "Step")}</div>
                  <p className="mt-2 text-[13px] leading-6" style={{ color: theme.muted }}>{String(item.value ?? "Ready")}</p>
                </div>
              ))}
            </div>
            <button type="button" className="mt-7 rounded-full px-6 py-3 text-[14px] font-semibold" style={{ background: theme.ctaBg, color: theme.ctaText }}>Continue checkout</button>
          </section>
        );
      }
      if (layout === "minimal") {
        return (
          <section key={kindSection.id} className="mx-auto max-w-[760px] px-5 py-12 sm:px-8">
            <div className="rounded-[32px] border bg-white p-6" style={{ borderColor: theme.border }}>
              <SectionHeading eyebrow="Checkout" title={String(copy.title ?? "Fast checkout")} body={String(copy.body ?? "")} headingFont={theme.headingFont} accent={theme.accent} ink={theme.ink} muted={theme.muted} />
              <div className="mt-6 grid gap-4">
                {fields.slice(0, 4).map((field) => (
                  <input key={field} readOnly placeholder={field} className="rounded-[18px] border px-4 py-3 text-[13px] outline-none" style={{ borderColor: theme.border, color: theme.muted }} />
                ))}
              </div>
              <button type="button" className="mt-5 w-full rounded-full px-5 py-3 text-[14px] font-semibold" style={{ background: theme.ctaBg, color: theme.ctaText }}>Pay securely</button>
            </div>
          </section>
        );
      }
      return (
        <section key={kindSection.id} className="mx-auto max-w-[1240px] px-5 py-12 sm:px-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
            <div className="rounded-[32px] border bg-white p-6" style={{ borderColor: theme.border }}>
              <SectionHeading eyebrow="Checkout" title={String(copy.title ?? "Secure checkout")} body={String(copy.body ?? "")} headingFont={theme.headingFont} accent={theme.accent} ink={theme.ink} muted={theme.muted} />
              <div className="mt-6 grid gap-4">
                {fields.map((field) => (
                  <label key={field} className="grid gap-1.5 text-[12px] font-semibold" style={{ color: theme.ink }}>
                    {field}
                    <input readOnly value={field === "Email address" ? "customer@example.com" : ""} placeholder={field} className="rounded-[18px] border px-4 py-3 text-[13px] outline-none" style={{ borderColor: theme.border, color: theme.muted }} />
                  </label>
                ))}
              </div>
            </div>
            <div className="rounded-[32px] border bg-white p-6" style={{ borderColor: theme.border }}>
              <div className="text-[18px] font-semibold" style={{ color: theme.ink }}>Payment summary</div>
              <div className="mt-5 grid gap-3 text-[13px]" style={{ color: theme.muted }}>
                {steps.map((item, index) => (
                  <div key={`${kindSection.id}-${index}`} className="rounded-[18px] border px-4 py-3" style={{ borderColor: theme.border }}>
                    <strong style={{ color: theme.ink }}>{String(item.label ?? "Step")}</strong>
                    <div>{String(item.value ?? "Ready")}</div>
                  </div>
                ))}
              </div>
              <button type="button" className="mt-5 w-full rounded-full px-5 py-3 text-[14px] font-semibold" style={{ background: theme.ctaBg, color: theme.ctaText }}>Pay securely</button>
            </div>
          </div>
        </section>
      );
    }

    if (kindSection.kind === "promo-banner") {
      const promoAccent = theme.accent;
      const promoLayout = String(kindSection.settings?.layout ?? "gradient-sale");
      const promoAction = () => runCommerceAction(kindSection.settings?.primaryButtonAction ?? "products", kindSection.settings?.primaryButtonUrl);
      if (promoLayout === "minimal-strip") {
        return (
          <section key={kindSection.id} className="px-5 py-6 sm:px-8">
            <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-3 border-y py-4" style={{ borderColor: theme.border, color: theme.ink }}>
              <strong className="text-[18px]" style={{ fontFamily: theme.headingFont }}>{cleanCustomerCopy(copy.title, "Seasonal sale")}</strong>
              <button type="button" onClick={promoAction} className="rounded-full px-5 py-2 text-[12px] font-bold uppercase tracking-[0.1em]" style={{ background: theme.ctaBg, color: theme.ctaText }}>{cleanCustomerCopy(copy.cta, "Shop now")}</button>
            </div>
          </section>
        );
      }
      if (promoLayout === "split-offer" || promoLayout === "countdown") {
        const image = itemMediaUrl(kindSection.items?.[0]) || store.storeProducts[0]?.images[0];
        const endsAt = promoLayout === "countdown" ? readCountdownEnd(kindSection.settings) : null;
        return (
          <section key={kindSection.id} className="px-5 py-12 sm:px-8">
            <div className="mx-auto grid max-w-[1320px] overflow-hidden rounded-[28px] lg:grid-cols-[1.05fr_0.95fr]" style={{ background: theme.heroBg, color: theme.heroText }}>
              <div className="px-6 py-12 sm:px-10 lg:px-14">
                <div className="font-mono text-[12px] uppercase tracking-[0.28em]" style={{ color: rgba(theme.heroText, 0.68) }}>{endsAt ? "Ends soon" : "Limited time"}</div>
                <h2 className="mt-4 text-[40px] font-semibold leading-[0.96] sm:text-[58px]" style={{ fontFamily: theme.headingFont }}>{cleanCustomerCopy(copy.title, "Seasonal sale - up to 30% off selected items")}</h2>
                <p className="mt-5 max-w-[620px] text-[16px] leading-8" style={{ color: rgba(theme.heroText, 0.76) }}>{cleanCustomerCopy(copy.body, "Limited time offers on curated favorites, best sellers, and new arrivals.")}</p>
                {endsAt ? <PromoCountdown endsAt={endsAt} /> : null}
                <button type="button" onClick={promoAction} className="mt-8 rounded-full px-6 py-3 text-[12px] font-bold uppercase tracking-[0.12em]" style={{ background: theme.ctaBg, color: theme.ctaText }}>{cleanCustomerCopy(copy.cta, "Shop the sale")}</button>
              </div>
              <div className="min-h-[360px]">{renderMedia(image, String(copy.title ?? "Sale"), promoAccent, "h-full min-h-[360px] w-full object-cover")}</div>
            </div>
          </section>
        );
      }
      return (
        <section key={kindSection.id} className="px-5 py-12 sm:px-8">
          <div className="mx-auto max-w-[1320px] overflow-hidden rounded-[6px] px-6 py-12 sm:px-10 lg:px-14" style={{ background: `linear-gradient(105deg, ${rgba(promoAccent, 0.94)}, ${rgba(theme.heroBg, 0.94)})`, color: "#FFFFFF" }}>
            <div className="max-w-[820px]">
              <div className="font-mono text-[12px] uppercase tracking-[0.28em] text-white/72">Limited time</div>
              <h2 className="mt-4 text-[40px] font-semibold leading-[0.96] sm:text-[58px]" style={{ fontFamily: theme.headingFont }}>
                {cleanCustomerCopy(copy.title, "Seasonal sale - up to 30% off selected items")}
              </h2>
              <p className="mt-5 max-w-[640px] text-[16px] leading-8 text-white/84">
                {cleanCustomerCopy(copy.body, "Limited time offers on curated favorites, best sellers, and new arrivals.")}
              </p>
              <button type="button" onClick={promoAction} className="mt-8 border border-white/70 bg-white px-6 py-3 text-[12px] font-bold uppercase tracking-[0.12em]" style={{ color: theme.heroBg }}>
                {cleanCustomerCopy(copy.cta, "Shop the sale")}
              </button>
            </div>
          </div>
        </section>
      );
    }

    if (kindSection.kind === "story-split" || kindSection.kind === "text-columns") {
      const isStory = kindSection.kind === "story-split";
      const storyLayout = String(kindSection.settings?.layout ?? (isStory ? "image-collage" : "cards"));
      const imageSide = String(kindSection.settings?.imagePosition ?? "");
      if (!isStory && (storyLayout === "cards" || storyLayout === "minimal-columns")) {
        return (
          <section key={kindSection.id} className="px-5 py-16 sm:px-8" style={{ background: theme.paperBg }}>
            <div className="mx-auto max-w-[1320px]">
              <SectionHeading eyebrow={String(copy.eyebrow ?? "Details")} title={cleanCustomerCopy(copy.title, "Helpful store details")} body={cleanCustomerCopy(copy.body, "Share the details customers need before they buy.")} headingFont={theme.headingFont} accent={theme.accent} ink={theme.ink} muted={theme.muted} />
              <div className={`mt-8 grid gap-5 ${storyLayout === "minimal-columns" ? "md:grid-cols-3" : "lg:grid-cols-3"}`}>
                {(kindSection.items ?? []).slice(0, 6).map((item, index) => (
                  <div key={`${kindSection.id}-text-${index}`} className={storyLayout === "minimal-columns" ? "border-t pt-5" : "border p-6"} style={storyLayout === "minimal-columns" ? { borderColor: theme.border } : blockPanelStyle(item.variant, theme)}>
                    <div className="text-[15px] font-semibold" style={{ color: theme.ink }}>{cleanCustomerCopy(item.title ?? item.label, `Detail ${index + 1}`)}</div>
                    <p className="mt-3 text-[14px] leading-7" style={{ color: theme.muted }}>{cleanCustomerCopy(item.body ?? item.subtitle ?? item.value, "Add detail here.")}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        );
      }
      if (storyLayout === "ritual-steps") {
        return (
          <section key={kindSection.id} className="px-5 py-20 sm:px-8" style={{ background: rgba(theme.accent, 0.1) }}>
            <div className="mx-auto max-w-[1320px] text-center">
              <div className="font-mono text-[12px] uppercase tracking-[0.24em]" style={{ color: theme.accent }}>{cleanCustomerCopy(copy.eyebrow, "Ritual")}</div>
              <h2 className="mx-auto mt-4 max-w-[760px] text-[40px] font-light leading-[1.08] sm:text-[54px]" style={{ color: theme.ink, fontFamily: theme.headingFont }}>
                {cleanCustomerCopy(copy.title, "Build your daily ritual")}
              </h2>
              <p className="mx-auto mt-4 max-w-[620px] text-[15px] leading-8" style={{ color: theme.muted }}>
                {cleanCustomerCopy(copy.body, "Simple steps for a routine that is easy to repeat.")}
              </p>
              <div className="relative mt-14 grid gap-8 md:grid-cols-4">
                {(kindSection.items ?? []).slice(0, 4).map((item, index) => (
                  <div key={`${kindSection.id}-ritual-${index}`} className="relative px-4">
                    <div className="mx-auto grid h-[72px] w-[72px] place-items-center rounded-full border bg-white text-[26px] font-light shadow-sm" style={{ borderColor: rgba(theme.accent, 0.28), color: theme.accent, fontFamily: theme.headingFont }}>
                      {index + 1}
                    </div>
                    <div className="mt-5 text-[16px] font-semibold" style={{ color: theme.ink }}>{cleanCustomerCopy(item.title, `Step ${index + 1}`)}</div>
                    <p className="mt-2 text-[13px] leading-6" style={{ color: theme.muted }}>{cleanCustomerCopy(item.body, "Add content here.")}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        );
      }
      if (storyLayout === "ingredients-feature") {
        const image = itemMediaUrl(kindSection.items?.[0]) || store.storeProducts[0]?.images[0];
        return (
          <section key={kindSection.id} className="overflow-hidden" style={{ background: theme.ink }}>
            <div className="mx-auto grid max-w-[1320px] lg:grid-cols-2">
              <div className={`min-h-[520px] overflow-hidden ${imageSide === "right" ? "lg:order-last" : ""}`}>
                {renderMedia(image, String(copy.title ?? "Ingredients"), theme.accent, "h-full min-h-[520px] w-full object-cover")}
              </div>
              <div className="flex flex-col justify-center px-6 py-16 sm:px-10 lg:px-16">
                <div className="font-mono text-[12px] uppercase tracking-[0.24em]" style={{ color: rgba(theme.accent, 0.8) }}>{cleanCustomerCopy(copy.eyebrow, "Ingredients")}</div>
                <h2 className="mt-5 max-w-[620px] text-[40px] font-light leading-[1.08] sm:text-[56px]" style={{ color: theme.heroText, fontFamily: theme.headingFont }}>
                  {cleanCustomerCopy(copy.title, "Ingredient-led care")}
                </h2>
                <p className="mt-5 max-w-[600px] text-[15px] leading-8" style={{ color: rgba(theme.heroText, 0.66) }}>
                  {cleanCustomerCopy(copy.body, "Clear product education helps shoppers choose the right routine.")}
                </p>
                <div className="mt-8 grid gap-4 sm:grid-cols-2">
                  {(kindSection.items ?? []).slice(0, 4).map((item, index) => (
                      <div key={`${kindSection.id}-ing-${index}`} className="border px-4 py-4" style={{ borderColor: "rgba(255,255,255,.12)", background: "rgba(255,255,255,.06)", borderRadius: String(item.variant ?? "") === "outline" ? 6 : 18 }}>
                      <div className="text-[14px] font-semibold" style={{ color: theme.heroText }}>{cleanCustomerCopy(item.title, "Ingredient")}</div>
                      <div className="mt-1 text-[12px] leading-5" style={{ color: rgba(theme.heroText, 0.56) }}>{cleanCustomerCopy(item.body, "Add ingredient benefit.")}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        );
      }
      const storyImage = store.storeProducts[0]?.images[0] ?? store.storeProducts[1]?.images[0];
      const storyAccentImage = store.storeProducts[2]?.images[0] ?? store.storeProducts[0]?.images[0];
      const title = cleanCustomerCopy(copy.title, isStory ? "Designed for daily confidence" : "Details that make shopping easier");
      const body = cleanCustomerCopy(
        copy.body,
        isStory
          ? "A thoughtful storefront for quality products, clear delivery details, helpful support, and a checkout flow customers can trust."
          : "Highlight the services, guarantees, and details customers need before they buy.",
      );
      if (isStory && storyLayout === "text-first") {
        // Copy-led: the words take most of the width, one picture beside them, points underneath.
        return (
          <section key={kindSection.id} className="px-5 py-20 sm:px-8" style={{ background: theme.paperBg }}>
            <div className="mx-auto grid max-w-[1240px] gap-10 lg:grid-cols-[1.4fr_0.6fr] lg:items-start">
              <div className={imageSide === "left" ? "lg:order-last" : ""}>
                <div className="font-mono text-[12px] uppercase tracking-[0.28em]" style={{ color: theme.accent }}>{cleanCustomerCopy(copy.eyebrow, "Brand story")}</div>
                <h2 className="mt-4 max-w-[820px] text-[40px] font-semibold leading-[1.02] sm:text-[58px]" style={{ color: theme.ink, fontFamily: theme.headingFont }}>{title}</h2>
                <p className="mt-6 max-w-[720px] whitespace-pre-line text-[18px] leading-9" style={{ color: theme.muted }}>{body}</p>
                {(kindSection.items ?? []).length > 0 ? (
                  <div className="mt-10 grid gap-4 sm:grid-cols-3">
                    {(kindSection.items ?? []).slice(0, 3).map((item, index) => {
                      const clean = cleanStoryItem(item, index);
                      return (
                        <div key={`${kindSection.id}-${index}`} className={String(item.variant ?? "") === "soft" ? "border px-4 py-4 text-[13px] leading-6" : "border-t pt-5 text-[13px] leading-6"} style={String(item.variant ?? "") === "soft" ? blockPanelStyle(item.variant, theme) : { borderColor: theme.border }}>
                          <div className="text-[13px] font-bold uppercase tracking-[0.1em]" style={{ color: theme.ink }}>{clean.title}</div>
                          <div className="mt-3" style={{ color: theme.muted }}>{clean.body}</div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
              <div className="h-[420px] overflow-hidden rounded-[6px] lg:h-[520px]">
                {renderImage(storyImage, title, theme.accent, "h-full w-full object-cover")}
              </div>
            </div>
          </section>
        );
      }
      return (
        <section key={kindSection.id} className="px-5 py-20 sm:px-8" style={{ background: isStory ? theme.heroBg : theme.paperBg }}>
          <div className="mx-auto grid max-w-[1320px] gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <div>
              <div className="font-mono text-[12px] uppercase tracking-[0.28em]" style={{ color: isStory ? rgba(theme.heroText, 0.66) : theme.accent }}>
                {cleanCustomerCopy(copy.eyebrow, isStory ? "Brand story" : "More detail")}
              </div>
              <h2 className="mt-4 max-w-[680px] text-[42px] font-semibold leading-[0.98] sm:text-[64px]" style={{ color: isStory ? theme.heroText : theme.ink, fontFamily: theme.headingFont }}>
                {title}
              </h2>
              <p className="mt-6 max-w-[620px] text-[17px] leading-9" style={{ color: isStory ? rgba(theme.heroText, 0.72) : theme.muted }}>
                {body}
              </p>
              {(kindSection.items ?? []).length > 0 ? (
                <div className="mt-10 grid gap-4 sm:grid-cols-3">
                  {(kindSection.items ?? []).slice(0, 3).map((item, index) => {
                    const clean = cleanStoryItem(item, index);
                    return (
                      <div key={`${kindSection.id}-${index}`} className={String(item.variant ?? "") === "soft" ? "border px-4 py-4 text-[13px] leading-6" : "border-t pt-5 text-[13px] leading-6"} style={String(item.variant ?? "") === "soft" ? blockPanelStyle(item.variant, theme) : { borderColor: isStory ? rgba(theme.heroText, 0.18) : theme.border }}>
                        <div className="text-[13px] font-bold uppercase tracking-[0.1em]" style={{ color: isStory ? theme.heroText : theme.ink }}>{clean.title}</div>
                        <div className="mt-3" style={{ color: isStory ? rgba(theme.heroText, 0.66) : theme.muted }}>{clean.body}</div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
            <div className={`relative min-h-[520px] ${imageSide === "left" ? "lg:order-first" : ""}`}>
              <div className="absolute left-0 top-0 h-[72%] w-[72%] overflow-hidden rounded-[6px] bg-white/8">
                {renderImage(storyImage, title, theme.accent, "h-full w-full object-cover")}
              </div>
              <div className="absolute bottom-0 right-0 h-[62%] w-[54%] overflow-hidden rounded-[6px] border-[12px]" style={{ borderColor: isStory ? theme.heroBg : theme.paperBg }}>
                {renderImage(storyAccentImage, title, theme.accent, "h-full w-full object-cover")}
              </div>
            </div>
          </div>
        </section>
      );
    }

    if (kindSection.kind === "testimonials") {
      const testimonialLayout = String(kindSection.settings?.layout ?? "cards");
      if (testimonialLayout === "featured") {
        const [first, ...rest] = kindSection.items ?? [];
        return (
          <section key={kindSection.id} className="px-5 py-16 sm:px-8" style={{ background: theme.paperBg }}>
            <div className="mx-auto grid max-w-[1320px] gap-5 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="border px-7 py-8 sm:px-10 sm:py-12" style={{ ...blockPanelStyle(first?.variant ?? "feature", theme), color: theme.heroText }}>
                <div className="font-mono text-[12px] uppercase tracking-[0.24em]" style={{ color: rgba(theme.heroText, 0.62) }}>Featured review</div>
                <p className="mt-5 text-[clamp(30px,5vw,56px)] leading-[1.05]" style={{ fontFamily: theme.headingFont }}>"{cleanCustomerCopy(first?.quote, "The store was easy to shop and checkout felt smooth.")}"</p>
                <div className="mt-7 font-mono text-[12px] uppercase tracking-[0.22em]">{cleanCustomerCopy(first?.person, "Customer")}</div>
              </div>
              <div className="grid gap-4">
                {rest.slice(0, 3).map((item, index) => (
                  <div key={`${kindSection.id}-featured-${index}`} className="border p-5" style={blockPanelStyle(item.variant ?? "plain", theme)}>
                    <p className="text-[15px] leading-7" style={{ color: theme.ink }}>"{cleanCustomerCopy(item.quote, "Helpful review.")}"</p>
                    <div className="mt-4 font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: theme.muted }}>{cleanCustomerCopy(item.person, "Customer")}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        );
      }
      return (
        <section key={kindSection.id} className="px-5 py-14 sm:px-8">
          <div className="mx-auto max-w-[1320px]">
          <SectionHeading eyebrow={cleanCustomerCopy(copy.eyebrow, "Customer proof")} title={cleanCustomerCopy(copy.title, "What our customers say")} headingFont={theme.headingFont} accent={theme.accent} ink={theme.ink} muted={theme.muted} />
          <div
            className={`mt-8 grid gap-5 ${testimonialLayout === "slider" ? "auto-cols-[minmax(260px,380px)] grid-flow-col snap-x snap-mandatory overflow-x-auto overscroll-x-contain pb-3" : testimonialLayout === "masonry" ? "md:grid-cols-2 lg:grid-cols-4" : "lg:grid-cols-3"}`}
            {...(testimonialLayout === "slider" ? { tabIndex: 0, role: "region", "aria-label": "Reviews. Swipe or scroll sideways for more." } : {})}
          >
            {(kindSection.items ?? []).map((item, index) => (
              <div key={`${kindSection.id}-${index}`} className={`border px-6 py-6 ${testimonialLayout === "slider" ? "snap-start" : ""}`} style={blockPanelStyle(item.variant ?? (testimonialLayout === "masonry" && index % 2 ? "soft" : "plain"), theme)}>
                <div className="mb-5 flex gap-1 text-[13px]" style={{ color: theme.accent }}>
                  {Array.from({ length: 5 }).map((_, starIndex) => <span key={starIndex}>*</span>)}
                </div>
                <p className="text-[18px] leading-8" style={{ color: theme.ink }}>
                  "{cleanCustomerCopy(item.quote, "The product quality, delivery updates, and packaging all felt premium.")}"
                </p>
                <p className="hidden" aria-hidden="true">
                  “{String(item.quote ?? "Customer quote")}”
                </p>
                <div className="mt-6 font-mono text-[12px] font-semibold uppercase tracking-[0.22em]" style={{ color: theme.muted }}>
                  {cleanCustomerCopy(item.person, index === 0 ? "Ada W." : index === 1 ? "Kemi A." : "Tolu B.")}
                </div>
              </div>
            ))}
          </div>
          </div>
        </section>
      );
    }

    if (kindSection.kind === "faq") {
      const layout = String(kindSection.settings?.layout ?? "accordion");
      if (layout === "cards") {
        return (
          <section key={kindSection.id} className="px-5 py-14 sm:px-8">
            <div className="mx-auto max-w-[1320px]">
              <SectionHeading eyebrow="FAQ" title={cleanCustomerCopy(copy.title, "Common questions")} headingFont={theme.headingFont} accent={theme.accent} ink={theme.ink} muted={theme.muted} />
              <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {(kindSection.items ?? []).map((item, index) => (
                  <div key={`${kindSection.id}-card-${index}`} className="border p-5" style={blockPanelStyle(item.variant ?? "plain", theme)}>
                    <div className="text-[16px] font-semibold" style={{ color: theme.ink }}>{String(item.question ?? "Question")}</div>
                    <p className="mt-3 text-[14px] leading-7" style={{ color: theme.muted }}>{String(item.answer ?? "")}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        );
      }
      if (layout === "sidebar") {
        return (
          <section key={kindSection.id} className="px-5 py-14 sm:px-8">
            <div className="mx-auto grid max-w-[1320px] gap-8 lg:grid-cols-[320px_1fr]">
              <div>
                <SectionHeading eyebrow="FAQ" title={cleanCustomerCopy(copy.title, "Need help?")} body="Pick a question to preview the answer style." headingFont={theme.headingFont} accent={theme.accent} ink={theme.ink} muted={theme.muted} />
              </div>
              <div className="rounded-[28px] border bg-white p-5" style={{ borderColor: theme.border }}>
                {(kindSection.items ?? []).map((item, index) => {
                  const isOpen = openFaq === index;
                  return (
                    <button key={`${kindSection.id}-side-${index}`} type="button" onClick={() => setOpenFaq(isOpen ? -1 : index)} className="block w-full px-4 py-4 text-left" style={isOpen ? blockPanelStyle(item.variant ?? "soft", theme) : { background: "transparent", borderRadius: 18 }}>
                      <span className="font-semibold" style={{ color: theme.ink }}>{String(item.question ?? "Question")}</span>
                      {isOpen ? <p className="mt-3 text-[14px] leading-7" style={{ color: theme.muted }}>{String(item.answer ?? "")}</p> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        );
      }
      if (layout === "two-column" || layout === "support-center") {
        return (
          <section key={kindSection.id} className="px-5 py-14 sm:px-8" style={{ background: layout === "support-center" ? theme.cardBg : theme.paperBg }}>
            <div className={layout === "support-center" ? "mx-auto grid max-w-[1320px] gap-6 lg:grid-cols-[0.8fr_1.2fr]" : "mx-auto max-w-[1320px]"}>
              <div>
                <SectionHeading eyebrow="FAQ" title={cleanCustomerCopy(copy.title, "Common questions")} body={layout === "support-center" ? "Answers for delivery, payments, orders, returns, and product support." : undefined} headingFont={theme.headingFont} accent={theme.accent} ink={theme.ink} muted={theme.muted} />
                {layout === "support-center" ? <button type="button" onClick={() => navigate("contact")} className="mt-6 rounded-full px-5 py-3 text-[13px] font-semibold" style={{ background: theme.ctaBg, color: theme.ctaText }}>Contact support</button> : null}
              </div>
              <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
                {(kindSection.items ?? []).map((item, index) => (
                  <div key={`${kindSection.id}-two-${index}`} className="border-t pt-5" style={{ borderColor: theme.border }}>
                    <div className="text-[16px] font-semibold" style={{ color: theme.ink }}>{String(item.question ?? "Question")}</div>
                    <p className="mt-2 text-[14px] leading-7" style={{ color: theme.muted }}>{String(item.answer ?? "")}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        );
      }
      return (
        <section key={kindSection.id} className="px-5 py-14 sm:px-8">
          <div className="mx-auto max-w-[1320px]">
            <SectionHeading eyebrow="FAQ" title={cleanCustomerCopy(copy.title, "Common questions")} headingFont={theme.headingFont} accent={theme.accent} ink={theme.ink} muted={theme.muted} />
            <div className="mt-8 border-y" style={{ borderColor: theme.border }}>
              {(kindSection.items ?? []).map((item, index) => {
                const isOpen = openFaq === index;
                return (
                  <button key={`${kindSection.id}-${index}`} type="button" onClick={() => setOpenFaq(isOpen ? -1 : index)} className={String(item.variant ?? "") === "card" ? "mb-3 block w-full border px-5 py-5 text-left last:mb-0" : "block w-full border-b px-0 py-5 text-left last:border-b-0"} style={String(item.variant ?? "") === "card" ? blockPanelStyle(item.variant, theme) : { borderColor: theme.border }}>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-[17px] font-semibold" style={{ color: theme.ink }}>{String(item.question ?? "Question")}</span>
                      <Icon name={isOpen ? "x" : "plus"} size={14} color={theme.ink} />
                    </div>
                    {isOpen ? (
                      <p className="mt-3 max-w-[720px] text-[15px] leading-7" style={{ color: theme.muted }}>
                        {String(item.answer ?? "")}
                      </p>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      );
    }

    if (kindSection.kind === "newsletter") {
      const newsletterLayout = String(kindSection.settings?.layout ?? "dark-panel");
      if (newsletterLayout === "inline" || newsletterLayout === "minimal") {
        return (
          <section key={kindSection.id} className="px-5 py-10 sm:px-8" style={{ background: newsletterLayout === "minimal" ? theme.paperBg : theme.cardBg }}>
            <div className="mx-auto flex max-w-[1320px] flex-col items-start justify-between gap-5 border-y py-8 md:flex-row md:items-center" style={{ borderColor: theme.border }}>
              <div>
                <div className="font-mono text-[12px] uppercase tracking-[0.24em]" style={{ color: theme.accent }}>Stay close</div>
                <h2 className="mt-2 text-[30px] font-semibold leading-tight" style={{ color: theme.ink, fontFamily: theme.headingFont }}>{cleanCustomerCopy(copy.title, "Join the private list")}</h2>
              </div>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:min-w-[430px] sm:flex-row">
                <input value={formState.email} onChange={(event) => setFormState((prev) => ({ ...prev, email: event.target.value }))} placeholder="customer@email.com" className="w-full rounded-full border px-5 py-3 text-[14px] outline-none" style={{ borderColor: theme.border, color: theme.ink }} />
                <button type="button" onClick={() => void submitStoreForm("newsletter")} className="rounded-full px-6 py-3 text-[12px] font-bold uppercase tracking-[0.12em]" style={{ background: theme.ctaBg, color: theme.ctaText }}>{formStatus === "sending" ? "Saving..." : cleanCustomerCopy(copy.buttonLabel, "Subscribe")}</button>
              </div>
            </div>
          </section>
        );
      }
      if (newsletterLayout === "split") {
        return (
          <section key={kindSection.id} className="px-5 py-14 sm:px-8">
            <div className="mx-auto grid max-w-[1320px] gap-6 rounded-[32px] border p-6 md:grid-cols-[0.9fr_1.1fr] md:p-10" style={{ borderColor: theme.border, background: theme.cardBg }}>
              <SectionHeading eyebrow="Stay close" title={cleanCustomerCopy(copy.title, "Join the private list")} body={cleanCustomerCopy(copy.body, "Get new arrivals, offers, and launch updates before everyone else.")} headingFont={theme.headingFont} accent={theme.accent} ink={theme.ink} muted={theme.muted} />
              <div className="flex flex-col justify-center gap-3">
                <input value={formState.email} onChange={(event) => setFormState((prev) => ({ ...prev, email: event.target.value }))} placeholder="customer@email.com" className="w-full rounded-[18px] border px-5 py-4 text-[14px] outline-none" style={{ borderColor: theme.border, color: theme.ink }} />
                <button type="button" onClick={() => void submitStoreForm("newsletter")} className="rounded-[18px] px-6 py-4 text-[12px] font-bold uppercase tracking-[0.12em]" style={{ background: theme.ctaBg, color: theme.ctaText }}>{formStatus === "sending" ? "Saving..." : cleanCustomerCopy(copy.buttonLabel, "Subscribe")}</button>
              </div>
            </div>
          </section>
        );
      }
      return (
        <section key={kindSection.id} className="px-5 py-14 sm:px-8">
          <div className="mx-auto max-w-[1320px] px-6 py-14 sm:px-10 lg:px-14" style={{ background: theme.heroBg, color: theme.heroText, borderRadius: 6 }}>
            <div className="font-mono text-[12px] uppercase tracking-[0.28em]" style={{ color: rgba(theme.heroText, 0.62) }}>Stay close</div>
            <h2 className="mt-4 max-w-[740px] text-[42px] font-semibold leading-[0.98] sm:text-[62px]" style={{ fontFamily: theme.headingFont }}>
              {cleanCustomerCopy(copy.title, "Join the private list")}
            </h2>
            <p className="mt-5 max-w-[620px] text-[16px] leading-8" style={{ color: rgba(theme.heroText, 0.72) }}>
              {cleanCustomerCopy(copy.body, "Get new arrivals, offers, and launch updates before everyone else.")}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <input
                value={formState.email}
                onChange={(event) => setFormState((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="customer@email.com"
                className="w-full border bg-white px-5 py-4 text-[14px] outline-none sm:max-w-[420px]"
                style={{ borderColor: "transparent", color: theme.ink, borderRadius: 4 }}
              />
              <button type="button" onClick={() => void submitStoreForm("newsletter")} className="px-6 py-4 text-[12px] font-bold uppercase tracking-[0.12em]" style={{ background: theme.accent, color: theme.ctaText, borderRadius: 4 }}>
                {formStatus === "sending" ? "Saving..." : cleanCustomerCopy(copy.buttonLabel, "Subscribe")}
              </button>
            </div>
            {formStatus === "sent" ? <div className="mt-4 text-[12px]" style={{ color: theme.accent }}>Subscribed.</div> : null}
            {formStatus === "error" ? <div className="mt-3 text-[12px]" style={{ color: "#C0392B" }}>Could not submit. Please try again.</div> : null}
          </div>
        </section>
      );
    }

    if (kindSection.kind === "contact-form") {
      const contactLayout = String(kindSection.settings?.layout ?? "split-card");
      if (contactLayout === "whatsapp-first" || contactLayout === "map-card") {
        return (
          <section key={kindSection.id} className="mx-auto max-w-[1240px] px-5 py-12 sm:px-8">
            <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-[32px] border px-6 py-7 sm:px-8" style={{ background: contactLayout === "whatsapp-first" ? theme.heroBg : theme.cardBg, borderColor: theme.border, color: contactLayout === "whatsapp-first" ? theme.heroText : theme.ink }}>
                <div className="font-mono text-[12px] uppercase tracking-[0.2em]" style={{ color: contactLayout === "whatsapp-first" ? rgba(theme.heroText, 0.64) : theme.accent }}>{contactLayout === "whatsapp-first" ? "Fast support" : "Visit or message"}</div>
                <h2 className="mt-4 text-[42px] font-semibold leading-tight" style={{ fontFamily: theme.headingFont }}>{String(copy.title ?? "Reach the store")}</h2>
                <p className="mt-4 text-[15px] leading-8" style={{ color: contactLayout === "whatsapp-first" ? rgba(theme.heroText, 0.72) : theme.muted }}>{String(copy.body ?? "Send a message about orders, products, delivery, or partnerships.")}</p>
                {contactLayout === "map-card" ? (
                  <div className="mt-6 grid min-h-[220px] place-items-center rounded-[24px] border text-[13px] font-semibold" style={{ borderColor: theme.border, background: rgba(theme.accent, 0.08), color: theme.muted }}>
                    {String(copy.address ?? (store.city ? `${store.city}${store.country ? `, ${store.country}` : ""}` : "Store location"))}
                  </div>
                ) : (
                  <button type="button" onClick={() => runCommerceAction("whatsapp")} className="mt-7 rounded-full px-6 py-3 text-[13px] font-bold" style={{ background: theme.accent, color: theme.ctaText }}>Chat on WhatsApp</button>
                )}
              </div>
              <form onSubmit={(event) => { event.preventDefault(); void submitStoreForm("contact"); }} className="grid gap-4 rounded-[32px] border bg-white px-6 py-7 sm:px-8" style={{ borderColor: theme.border }}>
                {["Name", "Email", "Message"].map((field) => (
                  <label key={field} className="grid gap-1.5 text-[12px] font-semibold" style={{ color: theme.ink }}>
                    {field}
                    {field === "Message" ? <textarea rows={6} value={formState.message} onChange={(event) => setFormState((prev) => ({ ...prev, message: event.target.value }))} className="resize-none rounded-[18px] border bg-white px-4 py-3 text-[13px] outline-none" style={{ borderColor: theme.border, color: theme.muted }} /> : <input type={field === "Email" ? "email" : "text"} value={field === "Email" ? formState.email : formState.name} onChange={(event) => setFormState((prev) => ({ ...prev, [field === "Email" ? "email" : "name"]: event.target.value }))} className="rounded-[18px] border bg-white px-4 py-3 text-[13px] outline-none" style={{ borderColor: theme.border, color: theme.muted }} />}
                  </label>
                ))}
                <button type="submit" disabled={formStatus === "sending"} className="rounded-full px-5 py-3 text-[14px] font-semibold" style={{ background: theme.ctaBg, color: theme.ctaText }}>{formStatus === "sending" ? "Sending..." : String(copy.buttonLabel ?? "Send message")}</button>
              </form>
            </div>
          </section>
        );
      }
      return (
        <section key={kindSection.id} className="mx-auto max-w-[1240px] px-5 py-12 sm:px-8">
          <div className={contactLayout === "minimal" ? "mx-auto grid max-w-[760px] gap-5" : "grid gap-5 lg:grid-cols-[0.9fr_1.1fr]"}>
            <div className={contactLayout === "support-panel" ? "rounded-[10px] border px-6 py-7 sm:px-8" : "rounded-[32px] border bg-white px-6 py-7 sm:px-8"} style={contactLayout === "support-panel" ? { background: theme.heroBg, borderColor: rgba(theme.accent, 0.18), color: theme.heroText } : { borderColor: theme.border }}>
              <SectionHeading eyebrow="Contact" title={String(copy.title ?? "Reach the store")} body={String(copy.body ?? "")} headingFont={theme.headingFont} accent={theme.accent} ink={theme.ink} muted={theme.muted} />
              <div className="mt-6 grid gap-2 text-[13px]" style={{ color: theme.muted }}>
                <span>{String(copy.address ?? (store.city ? `${store.city}${store.country ? `, ${store.country}` : ""}` : "Online storefront"))}</span>
                {copy.email ? <span>{String(copy.email)}</span> : null}
                {copy.phone ? <span>{String(copy.phone)}</span> : null}
                <span>Secure checkout and multiple payment methods accepted</span>
                <span>Order questions, returns, and product enquiries welcome</span>
              </div>
            </div>
            <form onSubmit={(event) => { event.preventDefault(); void submitStoreForm("contact"); }} className="grid gap-4 rounded-[32px] border bg-white px-6 py-7 sm:px-8" style={{ borderColor: theme.border }}>
              {["Name", "Email", "Phone", "Message"].map((field) => (
                <label key={field} className="grid gap-1.5 text-[12px] font-semibold" style={{ color: theme.ink }}>
                  {field}
                  {field === "Message" ? (
                    <textarea
                      rows={5}
                      value={formState.message}
                      onChange={(event) => setFormState((prev) => ({ ...prev, message: event.target.value }))}
                      placeholder="Tell us how we can help."
                      className="resize-none rounded-[18px] border bg-white px-4 py-3 text-[13px] outline-none"
                      style={{ borderColor: theme.border, color: theme.muted }}
                    />
                  ) : (
                    <input
                      type={field === "Email" ? "email" : field === "Phone" ? "tel" : "text"}
                      value={field === "Email" ? formState.email : field === "Phone" ? formState.phone : formState.name}
                      onChange={(event) => {
                        const key = field === "Email" ? "email" : field === "Phone" ? "phone" : "name";
                        setFormState((prev) => ({ ...prev, [key]: event.target.value }));
                      }}
                      placeholder={field === "Email" ? "hello@example.com" : field === "Phone" ? "Phone number" : "Customer name"}
                      className="rounded-[18px] border bg-white px-4 py-3 text-[13px] outline-none"
                      style={{ borderColor: theme.border, color: theme.muted }}
                    />
                  )}
                </label>
              ))}
              <button type="submit" disabled={formStatus === "sending"} className="rounded-full px-5 py-3 text-[14px] font-semibold" style={{ background: theme.ctaBg, color: theme.ctaText }}>
                {formStatus === "sending" ? "Sending..." : String(copy.buttonLabel ?? "Send message")}
              </button>
              {formStatus === "sent" ? <div className="text-[12px]" style={{ color: theme.accent }}>Message received.</div> : null}
              {formStatus === "error" ? <div className="mt-3 text-[12px]" style={{ color: "#C0392B" }}>Could not submit. Please try again.</div> : null}
            </form>
          </div>
        </section>
      );
    }

    if (kindSection.kind === "about-section") {
      const aboutImageBlock = findImageBlock(kindSection);
      const aboutLayout = String(kindSection.settings?.layout ?? "split");
      if (aboutLayout === "team-grid" || aboutLayout === "mission-split") {
        return (
          <section key={kindSection.id} className="px-5 py-16 sm:px-8" style={{ background: theme.paperBg }}>
            <div className={aboutLayout === "mission-split" ? "mx-auto grid max-w-[1240px] gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center" : "mx-auto max-w-[1320px]"}>
              <div>
                <SectionHeading eyebrow="About" title={String(copy.title ?? (aboutLayout === "team-grid" ? "Meet the people behind the store" : "Our mission"))} body={String(copy.body ?? "Share what the store stands for and why customers should trust it.")} headingFont={theme.headingFont} accent={theme.accent} ink={theme.ink} muted={theme.muted} />
              </div>
              <div className={aboutLayout === "team-grid" ? "mt-8 grid gap-5 md:grid-cols-3" : "grid gap-4 md:grid-cols-2"}>
                {(kindSection.items ?? []).slice(0, aboutLayout === "team-grid" ? 6 : 4).map((item, index) => (
                  <div key={`${kindSection.id}-about-extra-${index}`} className="overflow-hidden rounded-[24px] border bg-white" style={{ borderColor: theme.border }}>
                    {aboutLayout === "team-grid" ? <div className="h-[240px]">{editableItemImage(kindSection.id, item, index, String(item.title ?? "Team"), String(item.color ?? theme.accent), "h-full w-full object-cover")}</div> : null}
                    <div className="p-5">
                      <div className="text-[18px] font-semibold" style={{ color: theme.ink, fontFamily: theme.headingFont }}>{String(item.title ?? item.label ?? (aboutLayout === "team-grid" ? "Team member" : "Promise"))}</div>
                      <p className="mt-2 text-[13px] leading-6" style={{ color: theme.muted }}>{String(item.body ?? item.value ?? item.subtitle ?? "Describe this clearly for customers.")}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        );
      }
      if (aboutLayout === "founder-note") {
        return (
          <section key={kindSection.id} className="px-5 py-16 sm:px-8" style={{ background: theme.paperBg }}>
            <div className="mx-auto grid max-w-[1120px] gap-8 lg:grid-cols-[360px_1fr] lg:items-center">
              <div className="h-[420px] overflow-hidden rounded-full">{aboutImageBlock ? renderImageBlock(aboutImageBlock, "h-full w-full object-cover") : renderImage(typeof kindSection.items?.[0]?.imageUrl === "string" ? String(kindSection.items[0].imageUrl) : undefined, String(copy.title ?? "Founder"), theme.accent, "h-full w-full object-cover")}</div>
              <div>
                <div className="font-mono text-[12px] uppercase tracking-[0.22em]" style={{ color: theme.accent }}>Founder note</div>
                <h2 className="mt-4 text-[clamp(36px,6vw,72px)] leading-[1.02]" style={{ color: theme.ink, fontFamily: theme.headingFont }}>{editableCopy(kindSection.id, "title", copy.title, "A note from our founder")}</h2>
                <p className="mt-6 text-[18px] leading-9" style={{ color: theme.muted }}>{editableCopy(kindSection.id, "body", copy.body, "Share the personal reason behind the store, the promise to customers, and what makes the buying experience thoughtful.")}</p>
              </div>
            </div>
          </section>
        );
      }
      if (aboutLayout === "values-grid") {
        return (
          <section key={kindSection.id} className="px-5 py-16 sm:px-8" style={{ background: theme.paperBg }}>
            <div className="mx-auto max-w-[1320px]">
              <SectionHeading eyebrow="About" title={String(copy.title ?? "What we stand for")} body={String(copy.body ?? "A clear promise customers can understand before buying.")} headingFont={theme.headingFont} accent={theme.accent} ink={theme.ink} muted={theme.muted} />
              <div className="mt-8 grid gap-5 md:grid-cols-3">
                {(kindSection.items ?? []).slice(0, 6).map((item, index) => (
                  <div key={`${kindSection.id}-values-${index}`} className="border p-6" style={blockPanelStyle(item.variant ?? (index === 0 ? "feature" : "plain"), theme)}>
                    <div className="font-mono text-[12px]" style={{ color: String(item.variant ?? "") === "feature" ? rgba(theme.heroText, 0.62) : theme.accent }}>0{index + 1}</div>
                    <h3 className="mt-4 text-[22px] font-semibold" style={{ color: String(item.variant ?? "") === "feature" ? theme.heroText : theme.ink, fontFamily: theme.headingFont }}>{String(item.title ?? item.label ?? "Value")}</h3>
                    <p className="mt-3 text-[14px] leading-7" style={{ color: String(item.variant ?? "") === "feature" ? rgba(theme.heroText, 0.7) : theme.muted }}>{String(item.body ?? item.value ?? "Describe this value.")}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        );
      }
      if (aboutLayout === "studio-story") {
        const image = typeof kindSection.items?.[0]?.imageUrl === "string" ? String(kindSection.items[0].imageUrl) : undefined;
        return (
          <section key={kindSection.id} className="overflow-hidden" style={{ background: theme.heroBg }}>
            <div className="mx-auto grid max-w-[1440px] lg:grid-cols-[1.05fr_0.95fr]">
              <div className="min-h-[560px]">{aboutImageBlock ? renderImageBlock(aboutImageBlock, "h-full min-h-[560px] w-full object-cover") : renderImage(image, String(copy.title ?? "About"), theme.accent, "h-full min-h-[560px] w-full object-cover")}</div>
              <div className="flex flex-col justify-center px-6 py-16 sm:px-10 lg:px-16">
                <div className="font-mono text-[12px] uppercase tracking-[0.24em]" style={{ color: rgba(theme.heroText, 0.58) }}>Studio story</div>
                <h2 className="mt-5 text-[clamp(40px,6vw,78px)] leading-[0.98]" style={{ color: theme.heroText, fontFamily: theme.headingFont }}>{editableCopy(kindSection.id, "title", copy.title, "Designed with care")}</h2>
                <p className="mt-6 max-w-[640px] text-[16px] leading-8" style={{ color: rgba(theme.heroText, 0.72) }}>{editableCopy(kindSection.id, "body", copy.body, "Tell customers how your products are sourced, styled, packed, and supported.")}</p>
              </div>
            </div>
          </section>
        );
      }
      if (aboutLayout === "centered" || aboutLayout === "timeline") {
        return (
          <section key={kindSection.id} className="px-5 py-16 sm:px-8 lg:py-24" style={{ background: theme.paperBg }}>
            <div className="mx-auto max-w-[960px] text-center">
              <div className="font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: theme.accent }}>{editableCopy(kindSection.id, "eyebrow", copy.eyebrow, "About")}</div>
              <h2 className="mt-4 text-[clamp(36px,6vw,68px)] font-semibold leading-[1.02]" style={{ fontFamily: theme.headingFont, color: theme.ink }}>{editableCopy(kindSection.id, "title", copy.title, "About this store")}</h2>
              <p className="mx-auto mt-5 max-w-[720px] text-[16px] leading-8" style={{ color: theme.muted }}>{editableCopy(kindSection.id, "body", copy.body, "Share what makes your store different.")}</p>
              {aboutLayout === "timeline" ? (
                <div className="mt-10 grid gap-4 md:grid-cols-3">
                  {(kindSection.items ?? []).slice(0, 3).map((item, index) => (
                    <div key={`${kindSection.id}-timeline-${index}`} className="border-t pt-5 text-left" style={{ borderColor: theme.border }}>
                      <div className="font-mono text-[12px]" style={{ color: theme.accent }}>0{index + 1}</div>
                      <div className="mt-2 font-semibold" style={{ color: theme.ink }}>{cleanCustomerCopy(item.title ?? item.label, `Step ${index + 1}`)}</div>
                      <p className="mt-2 text-[13px] leading-6" style={{ color: theme.muted }}>{cleanCustomerCopy(item.body ?? item.subtitle ?? item.value, "Add milestone.")}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </section>
        );
      }
      return (
        <section key={kindSection.id} className="px-5 py-14 sm:px-8 lg:py-20" style={{ background: theme.paperBg }}>
          <div className="mx-auto grid max-w-[1240px] items-center gap-10 lg:grid-cols-2">
            <div className="overflow-hidden rounded-[24px]">
              {aboutImageBlock
                ? renderImageBlock(aboutImageBlock, "h-full w-full object-cover min-h-[360px]")
                : renderImage(
                    typeof kindSection.items?.[0]?.imageUrl === "string" ? String(kindSection.items[0].imageUrl) : undefined,
                    String(copy.title ?? "About"),
                    String(kindSection.items?.[0]?.color ?? theme.accent),
                    "h-full w-full object-cover min-h-[360px]",
                  )}
            </div>
            <div className="max-w-[560px]">
              <div className="font-mono text-[11px] uppercase tracking-[0.16em]" style={{ color: theme.accent }}>
                {editableCopy(kindSection.id, "eyebrow", copy.eyebrow, "About")}
              </div>
              <h2 className="mt-4 text-[clamp(32px,5vw,56px)] font-semibold leading-[1.02] tracking-[-0.04em]" style={{ fontFamily: theme.headingFont, color: theme.ink }}>
                {editableCopy(kindSection.id, "title", copy.title, "About this store")}
              </h2>
              <p className="mt-5 text-[15px] leading-8" style={{ color: theme.muted }}>
                {editableCopy(kindSection.id, "body", copy.body, "Share your story — sourcing, standards, process, values, or what makes you different.")}
              </p>
              {copy.cta ? (
                <button type="button" onClick={() => navigate("contact")} className="mt-6 rounded-full px-6 py-3 text-[13px] font-semibold" style={{ background: theme.ctaBg, color: theme.ctaText }}>
                  {String(copy.cta)}
                </button>
              ) : null}
            </div>
          </div>
        </section>
      );
    }

    if (kindSection.kind === "delivery-info") {
      const deliveryItems = kindSection.items ?? [];
      const deliveryLayout = String(kindSection.settings?.layout ?? "cards");
      if (deliveryLayout === "compact-strip") {
        return (
          <section key={kindSection.id} className="px-5 py-5 sm:px-8" style={{ background: theme.paperBg }}>
            <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-center gap-2">
              {deliveryItems.map((item, index) => (
                <div key={`${kindSection.id}-delivery-strip-${index}`} className="rounded-full border px-4 py-2 text-[12px] font-semibold" style={{ borderColor: theme.border, background: theme.cardBg, color: theme.ink }}>{String(item.label ?? "")}: {String(item.value ?? "")}</div>
              ))}
            </div>
          </section>
        );
      }
      if (deliveryLayout === "timeline") {
        return (
          <section key={kindSection.id} className="px-5 py-14 sm:px-8" style={{ background: theme.paperBg }}>
            <div className="mx-auto max-w-[1240px]">
              <SectionHeading eyebrow="Delivery" title={String(copy.title ?? "Delivery information")} headingFont={theme.headingFont} accent={theme.accent} ink={theme.ink} muted={theme.muted} />
              <div className="mt-8 grid gap-4 md:grid-cols-4">
                {deliveryItems.map((item, index) => (
                  <div key={`${kindSection.id}-delivery-time-${index}`} className="border-t pt-5" style={{ borderColor: theme.border }}>
                    <div className="font-mono text-[12px]" style={{ color: theme.accent }}>0{index + 1}</div>
                    <div className="mt-2 font-semibold" style={{ color: theme.ink }}>{String(item.label ?? "")}</div>
                    <div className="mt-2 text-[14px] leading-6" style={{ color: theme.muted }}>{String(item.value ?? "")}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        );
      }
      return (
        <section key={kindSection.id} className="px-5 py-14 sm:px-8" style={{ background: theme.paperBg }}>
          <div className="mx-auto max-w-[1240px]">
            <div className="font-mono text-[11px] uppercase tracking-[0.16em]" style={{ color: theme.accent }}>Delivery</div>
            <h2 className="mt-3 text-[28px] font-semibold sm:text-[36px]" style={{ fontFamily: theme.headingFont, color: theme.ink }}>
              {editableCopy(kindSection.id, "title", copy.title, "Delivery information")}
            </h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {deliveryItems.map((item, index) => (
                <div key={`${kindSection.id}-delivery-${index}`} className="border p-5" style={blockPanelStyle(item.variant, theme)}>
                  <div className="text-[12px] font-bold uppercase tracking-[0.08em]" style={{ color: theme.accent }}>{String(item.label ?? "")}</div>
                  <div className="mt-2 text-[14px]" style={{ color: theme.ink }}>{String(item.value ?? "")}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      );
    }

    if (kindSection.kind === "payment-info") {
      const paymentItems = kindSection.items ?? [];
      const paymentLayout = String(kindSection.settings?.layout ?? "badges");
      if (paymentLayout === "compact-strip") {
        return (
          <section key={kindSection.id} className="px-5 py-5 sm:px-8" style={{ background: theme.paperBg }}>
            <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-center gap-2">
              {paymentItems.map((item, index) => (
                <span key={`${kindSection.id}-payment-strip-${index}`} className="rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em]" style={{ background: theme.heroBg, color: theme.heroText }}>{String(item.label ?? item.value ?? "")}</span>
              ))}
            </div>
          </section>
        );
      }
      if (paymentLayout === "security-card") {
        return (
          <section key={kindSection.id} className="px-5 py-14 sm:px-8" style={{ background: theme.paperBg }}>
            <div className="mx-auto grid max-w-[1240px] gap-6 rounded-[28px] border p-6 md:grid-cols-[0.8fr_1.2fr]" style={{ borderColor: theme.border, background: theme.cardBg }}>
              <SectionHeading eyebrow="Payment" title={String(copy.title ?? "Payment methods")} body="Customers can choose the payment method that works best for them." headingFont={theme.headingFont} accent={theme.accent} ink={theme.ink} muted={theme.muted} />
              <div className="grid gap-3 sm:grid-cols-2">
                {paymentItems.map((item, index) => (
                  <div key={`${kindSection.id}-payment-secure-${index}`} className="border p-4" style={blockPanelStyle(item.variant ?? "soft", theme)}>
                    <div className="font-semibold" style={{ color: theme.ink }}>{String(item.label ?? "")}</div>
                    <div className="mt-1 text-[13px]" style={{ color: theme.muted }}>{String(item.value ?? "")}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        );
      }
      return (
        <section key={kindSection.id} className="px-5 py-14 sm:px-8" style={{ background: theme.paperBg }}>
          <div className="mx-auto max-w-[1240px]">
            <div className="font-mono text-[11px] uppercase tracking-[0.16em]" style={{ color: theme.accent }}>Payment</div>
            <h2 className="mt-3 text-[28px] font-semibold sm:text-[36px]" style={{ fontFamily: theme.headingFont, color: theme.ink }}>
              {editableCopy(kindSection.id, "title", copy.title, "Payment methods")}
            </h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {paymentItems.map((item, index) => (
                <div key={`${kindSection.id}-payment-${index}`} className="border p-5" style={blockPanelStyle(item.variant, theme)}>
                  <div className="text-[12px] font-bold uppercase tracking-[0.08em]" style={{ color: theme.accent }}>{String(item.label ?? "")}</div>
                  <div className="mt-2 text-[14px]" style={{ color: theme.ink }}>{String(item.value ?? "")}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      );
    }

    return null;
  }

  const writtenAnnouncement = String(announcement?.blocks.find((entry) => entry.type === "copy")?.content.text ?? "");
  // Template starter copy ("Free shipping on orders over ₦30,000") is not a promise the seller made: on the live
  // store, untouched starter text is replaced by what their shipping zones and payment settings actually offer.
  const seededAnnouncement = String(
    getTemplateManifest(snapshot.templateId)?.seedPages.find((entry) => entry.pageType === "home")?.sections.find((entry) => entry.kind === "announcement-bar")?.blocks.find((entry) => entry.type === "copy")?.content.text ?? "",
  );
  const announcementText = mode === "live" && writtenAnnouncement && writtenAnnouncement === seededAnnouncement
    ? readShopperInfo(store.shopper).announcement ?? ""
    : writtenAnnouncement;
  const footerCopy = footer?.blocks.find((entry) => entry.type === "copy")?.content ?? {};
  // Null in the builder (no storefront layout around it).
  const storeBadges = useStoreFooterBadges();
  const footerPaymentBadges = Array.isArray(footer?.settings?.paymentBadges)
    ? footer.settings.paymentBadges.map((item) => String(item))
    : ["Cards", "Bank transfer", "USSD", "Mobile money"];
  const stickyCtaCopy = stickyCtaSection?.blocks.find((entry) => entry.type === "copy")?.content ?? {};

  const themeVars = {
    "--th-heroBg": theme.heroBg,
    "--th-heroText": theme.heroText,
    "--th-accent": theme.accent,
    "--th-ctaBg": theme.ctaBg,
    "--th-ctaText": theme.ctaText,
    "--th-paperBg": theme.paperBg,
    "--th-cardBg": theme.cardBg,
    "--th-ink": theme.ink,
    "--th-muted": theme.muted,
    "--th-border": theme.border,
  } as React.CSSProperties;

  return (
    <div
      className="overflow-hidden border bg-white"
      style={{
        ...themeVars,
        borderColor: mode === "editor" && device === "desktop" ? "transparent" : theme.border,
        borderRadius: mode === "editor" && device === "desktop" ? 0 : 14,
        background: theme.paperBg,
        color: theme.ink,
        fontFamily: theme.bodyFont,
        minHeight: mode === "editor" && device === "desktop" ? "100%" : device === "mobile" ? 720 : 760,
      }}
      onClick={isEditor ? () => onSelectSection?.(null) : undefined}
    >

      {announcementText ? sectionWrap(
        announcement!.id,
        <div style={{ background: "#121212", color: "rgba(255,255,255,0.82)" }}>
          <div className="mx-auto flex max-w-[1240px] flex-wrap justify-center gap-4 px-5 py-2 text-[11px] uppercase tracking-[0.14em] sm:px-8">
            <span>{announcementText}</span>
          </div>
        </div>,
        "announcement",
      ) : null}

      {header ? sectionWrap(header.id, <header
        className={headerLayout === "floating" ? "sticky top-3 z-30 mx-auto max-w-[1320px] rounded-full border backdrop-blur" : "sticky top-0 z-30 border-b backdrop-blur"}
        style={{
          background: headerLayout === "transparent" ? rgba(theme.paperBg, 0.72) : theme.paperBg,
          borderColor: theme.border,
          boxShadow: headerLayout === "floating" ? "0 18px 48px rgba(14,42,56,.12)" : undefined,
        }}
      >
        <div className={`mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-3 px-5 py-3.5 sm:px-8 ${headerLayout === "centered" ? "md:grid md:grid-cols-[1fr_auto_1fr]" : ""}`}>
          <button
            type="button"
            onClick={(event) => {
              if (isEditor && onUploadImage && onUpdateStoreLogo) {
                event.stopPropagation();
                onSelectSection?.(header.id);
                pickStoreLogo();
                return;
              }
              navigate("home");
            }}
            className="flex min-w-0 items-center gap-3 text-left"
            title={isEditor ? "Click to replace logo" : undefined}
          >
            {store.logoUrl
              ? <img src={store.logoUrl} alt="" className="h-10 w-10 rounded-[12px] object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} />
              : <div className="flex h-10 w-10 items-center justify-center rounded-[6px] text-[13px] font-bold" style={{ background: theme.accent, color: theme.ctaText }}>{logoMark}</div>}
            <div>
              <div className="text-[21px] font-medium tracking-[0.08em]" style={{ color: theme.ink, fontFamily: theme.headingFont }}>
                {String(headerCopy.logoText ?? "").trim() || store.name}
              </div>
            </div>
          </button>
          <nav className={`hidden min-w-0 flex-1 flex-wrap items-center ${headerLayout === "centered" ? "justify-start" : "justify-center"} gap-1 md:flex`}>
            {[...navLinks, ...utilityLinks.filter((pageType) => !navLinks.includes(pageType))].map((pageType) => (
              <button key={pageType} type="button" onClick={() => navigate(pageType)} className="rounded-[4px] px-3 py-2 text-[12px] font-bold uppercase tracking-[0.06em] transition-colors hover:opacity-80" style={{ color: currentPage === normalizePageType(pageType) ? theme.accent : theme.muted, background: "transparent" }}>
                {pageLabel(pageType)}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-2">
          {headerFeatures.search ? <button type="button" title="Search" className="rounded-full border px-3 py-2 text-[12px] font-semibold" style={{ borderColor: theme.border, color: theme.muted }}>Search</button> : null}
          {headerFeatures.wishlist ? <button type="button" onClick={() => navigate("wishlist")} title="Wishlist" className="rounded-full border px-3 py-2 text-[12px] font-semibold" style={{ borderColor: theme.border, color: theme.muted }}>Wishlist</button> : null}
          {mode === "live" && headerFeatures.cart ? (
            <button type="button" onClick={() => onOpenCart?.()} className="rounded-full px-5 py-2.5 text-[13px] font-semibold transition-opacity hover:opacity-90" style={{ background: theme.ctaBg, color: theme.ctaText }}>
              {String(headerCopy.cartLabel ?? "Cart")}{cartCount > 0 ? ` (${cartCount})` : ""}
            </button>
          ) : mode === "editor" ? (
            <div className="rounded-[6px] px-4 py-2 text-[12px] font-semibold" style={{ background: rgba(theme.heroBg, 0.06), color: theme.muted }}>
              Editor preview
            </div>
          ) : null}
          </div>
        </div>
        {categoryNavLayout === "bar" ? (
          <div className="border-t px-5 py-2 sm:px-8" style={{ borderColor: theme.border }}>
            <div className="mx-auto flex max-w-[1320px] gap-2 overflow-x-auto">
              {(productCategories.length ? productCategories : [{ slug: "new", name: "New arrivals" }, { slug: "best", name: "Best sellers" }, { slug: "sale", name: "Sale" }]).map((category) => (
                <button key={category.slug} type="button" onClick={() => navigate("products")} className="shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold" style={{ background: rgba(theme.accent, 0.09), color: theme.accent }}>{category.name}</button>
              ))}
            </div>
          </div>
        ) : null}
        {categoryNavLayout === "mega" ? (
          <div className="border-t px-5 py-5 sm:px-8" style={{ borderColor: theme.border, background: theme.cardBg }}>
            <div className="mx-auto grid max-w-[1320px] gap-5 md:grid-cols-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: theme.muted }}>Categories</div>
                <div className="mt-3 grid gap-2">
                  {(productCategories.length ? productCategories : [{ slug: "new", name: "New arrivals" }, { slug: "best", name: "Best sellers" }, { slug: "sale", name: "Sale" }]).map((category) => (
                    <button key={category.slug} type="button" onClick={() => navigate("products")} className="text-left text-[13px] font-semibold" style={{ color: theme.ink }}>{category.name}</button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: theme.muted }}>Featured</div>
                <div className="mt-3 grid gap-2 text-[13px]" style={{ color: theme.ink }}>
                  <span>Best sellers</span>
                  <span>New arrivals</span>
                  <span>Limited offers</span>
                </div>
              </div>
              <div className="rounded-[20px] p-5" style={{ background: theme.heroBg, color: theme.heroText }}>
                <div className="text-[11px] font-bold uppercase tracking-[0.12em] opacity-70">Promotion</div>
                <div className="mt-2 text-[20px] font-semibold" style={{ fontFamily: theme.headingFont }}>Shop the latest collection</div>
                <button type="button" onClick={() => navigate("products")} className="mt-4 rounded-full px-4 py-2 text-[12px] font-semibold" style={{ background: theme.ctaBg, color: theme.ctaText }}>Browse products</button>
              </div>
            </div>
          </div>
        ) : null}
      </header>, "header") : null}

      {categoryDrawerOpen ? (
        <div className="fixed inset-0 z-40" onClick={() => setCategoryDrawerOpen(false)}>
          <div className="absolute inset-0 bg-black/35" />
          <aside className="absolute bottom-0 top-0 w-[min(420px,100vw)] bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-[22px] font-semibold" style={{ color: theme.ink, fontFamily: theme.headingFont }}>Shop categories</h2>
              <button type="button" onClick={() => setCategoryDrawerOpen(false)} className="rounded-full border px-3 py-1" style={{ borderColor: theme.border }}>Close</button>
            </div>
            <div className="mt-6 grid gap-3">
              {(productCategories.length ? productCategories : [{ slug: "new", name: "New arrivals" }, { slug: "best", name: "Best sellers" }, { slug: "sale", name: "Sale" }]).map((category) => (
                <button key={category.slug} type="button" onClick={() => { setCategoryDrawerOpen(false); navigate("products"); }} className="rounded-[18px] border px-4 py-4 text-left font-semibold" style={{ borderColor: theme.border, color: theme.ink }}>{category.name}</button>
              ))}
            </div>
          </aside>
        </div>
      ) : null}

      <main>
        {contentSections.length > 0 ? insertHandle(contentSections[0]!.id, "Add section before first section") : insertHandle(null, "Add first section")}
          {contentSections.map((kindSection, index) => {
            const sectionBg = kindSection.background
              ? kindSection.background.gradient
                ? kindSection.background.gradient
                : kindSection.background.color
                  ? kindSection.background.color
                  : undefined
              : undefined;
            const sectionStyle: React.CSSProperties = {
              ...(sectionBg ? { background: sectionBg } : {}),
              ...(kindSection.styles?.padding ? { padding: kindSection.styles.padding } : {}),
              ...(kindSection.styles?.margin ? { margin: kindSection.styles.margin } : {}),
              ...(kindSection.styles?.maxWidth ? { maxWidth: kindSection.styles.maxWidth, marginLeft: "auto", marginRight: "auto" } : {}),
            };
            return (
              <div key={kindSection.id} style={sectionStyle}>
                {sectionWrap(kindSection.id, renderSection(kindSection), kindSection.kind)}
                {insertHandle(contentSections[index + 1]?.id ?? null, "Add section here")}
              </div>
            );
          })}
      </main>

      {footer ? sectionWrap(footer.id, <footer style={{ background: theme.heroBg, borderTop: `1px solid ${rgba(theme.border, 0.15)}` }}>
        {footer.settings?.layout === "minimal-footer" ? (
          <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-5 px-5 py-8 sm:px-8">
            <div className="text-[18px] font-semibold" style={{ fontFamily: theme.headingFont, color: theme.heroText }}>{store.name}</div>
            <div className="flex flex-wrap gap-4 text-[12px]" style={{ color: rgba(theme.heroText, 0.72) }}>
              {navLinks.slice(0, 5).map((pageType) => <button key={`footer-min-${pageType}`} type="button" onClick={() => navigate(pageType)}>{pageLabel(pageType)}</button>)}
            </div>
          </div>
        ) : (
          <div className={`mx-auto grid max-w-[1240px] gap-8 px-5 py-12 sm:px-8 ${footer.settings?.layout === "mega-footer" ? "lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr]" : "lg:grid-cols-[1.3fr_0.8fr_0.8fr]"}`}>
            <div>
              <div className="text-[20px] font-semibold tracking-[-0.03em]" style={{ fontFamily: theme.headingFont, color: theme.heroText }}>{store.name}</div>
              <p className="mt-3 max-w-[400px] text-[13px] leading-7" style={{ color: rgba(theme.heroText, 0.7) }}>
                {cleanCustomerCopy(footerCopy.summary, "Discover curated products, delivered with care.")}
              </p>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: rgba(theme.heroText, 0.6) }}>Browse</div>
              <div className="mt-4 flex flex-col gap-2.5">
                {navLinks.map((pageType) => (
                  <button key={`footer-${pageType}`} type="button" onClick={() => navigate(pageType)} className="text-left text-[13px] transition-colors hover:opacity-80" style={{ color: rgba(theme.heroText, 0.8) }}>
                    {pageLabel(pageType)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: rgba(theme.heroText, 0.6) }}>Store</div>
              <div className="mt-4 flex flex-col gap-2.5 text-[13px]" style={{ color: rgba(theme.heroText, 0.7) }}>
                <span>{store.city ? `${store.city}${store.country ? `, ${store.country}` : ""}` : "Online storefront"}</span>
                {footerCopy.email ? <span>{String(footerCopy.email)}</span> : null}
                {footerCopy.phone ? <span>{String(footerCopy.phone)}</span> : null}
                {footer.settings?.showDelivery !== false ? <span>Fast & reliable delivery</span> : null}
                {footerCopy.whatsappLabel ? (
                  <button type="button" className="mt-2 w-fit rounded-full px-4 py-2 text-[12px] font-semibold" style={{ background: theme.ctaBg, color: theme.ctaText }}>
                    {String(footerCopy.whatsappLabel)}
                  </button>
                ) : null}
              </div>
            </div>
            {footer.settings?.layout === "mega-footer" ? (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: rgba(theme.heroText, 0.6) }}>Legal</div>
                <div className="mt-4 flex flex-col gap-2.5 text-[13px]" style={{ color: rgba(theme.heroText, 0.7) }}>
                  {/* The live store links its published legal pages; the builder shows where they will go. */}
                  {policyLinks.length
                    ? policyLinks.map((link) => <a key={link.key} href={link.href} className="w-fit transition-colors hover:opacity-80" style={{ color: rgba(theme.heroText, 0.8) }}>{link.label}</a>)
                    : mode === "live"
                      ? null
                      : ["Privacy policy", "Terms of service", "Returns and refunds", "Delivery policy"].map((label) => <span key={label}>{label}</span>)}
                </div>
              </div>
            ) : null}
          </div>
        )}
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4 border-t px-5 py-5 text-[11px] sm:px-8" style={{ borderColor: rgba(theme.heroText, 0.14), color: rgba(theme.heroText, 0.62) }}>
          <span>Secure payment methods accepted</span>
          {footer.settings?.layout !== "mega-footer" && policyLinks.length ? (
            <nav aria-label="Policies" className="flex flex-wrap gap-x-4 gap-y-1">
              {policyLinks.map((link) => <a key={link.key} href={link.href} className="inline-flex min-h-[32px] items-center hover:underline" style={{ color: rgba(theme.heroText, 0.8) }}>{link.label}</a>)}
            </nav>
          ) : null}
          {/* On the storefront the seller's own payment logos and "Built with Shopinbos" (StoreFooterBadges); the builder keeps the sample chips. */}
          {storeBadges ? (
            <StoreFooterBadges muted={rgba(theme.heroText, 0.62)} border={rgba(theme.heroText, 0.18)} ink={theme.heroText} showPayments={footer.settings?.showPayments !== false} />
          ) : footer.settings?.showPayments !== false ? (
            <div className="flex flex-wrap gap-2">
              {footerPaymentBadges.map((badge) => (
                <span key={badge} className="rounded-[4px] border px-2.5 py-1 font-bold uppercase tracking-[0.06em]" style={{ borderColor: rgba(theme.heroText, 0.18), color: rgba(theme.heroText, 0.76) }}>
                  {badge}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </footer>, "footer") : null}
      {stickyCtaSection ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 p-3 shadow-[0_-14px_40px_rgba(14,42,56,.14)] backdrop-blur md:hidden" style={{ borderColor: theme.border, display: mode === "editor" && device !== "mobile" ? "none" : undefined, bottom: mode === "live" ? 76 : undefined }}>
          <div className="mx-auto flex max-w-[520px] gap-2">
            <CommerceButton
              block
              label={String(stickyCtaCopy.primaryCta ?? stickyCtaCopy.cta ?? stickyCtaCopy.buttonLabel ?? "Shop now")}
              theme={theme}
              variant={String(stickyCtaSection.settings?.primaryButtonVariant ?? "primary")}
              size="md"
              shape={String(stickyCtaSection.settings?.buttonShape ?? "pill")}
              icon="cart"
              onClick={() => runCommerceAction(stickyCtaSection.settings?.primaryButtonAction ?? "products", stickyCtaSection.settings?.primaryButtonUrl)}
            />
            <CommerceButton
              label="Contact"
              theme={theme}
              variant="outline"
              size="md"
              shape={String(stickyCtaSection.settings?.buttonShape ?? "pill")}
              onClick={() => runCommerceAction("contact")}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
