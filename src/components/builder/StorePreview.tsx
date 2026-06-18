"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import type { StoreConfig } from "@/lib/ai/client";

export type PreviewVariant = "classic" | "bold" | "editorial" | "minimal";

export const PREVIEW_VARIANTS: { id: PreviewVariant; label: string }[] = [
  { id: "classic", label: "Classic" },
  { id: "bold", label: "Bold" },
  { id: "editorial", label: "Editorial" },
  { id: "minimal", label: "Minimal" },
];

interface StorePreviewProps {
  store: StoreConfig;
  changed: string[];
  device?: "desktop" | "mobile";
  variant?: PreviewVariant;
  currentPage?: string;
  onPageChange?: (page: string) => void;
  pages?: string[];
}

type PreviewProduct = StoreConfig["products"][number] & {
  id: string;
  category: string;
};

interface CartLine {
  product: PreviewProduct;
  qty: number;
}

interface PreviewTheme {
  variant: PreviewVariant;
  headingFont: string;
  bodyFont: string;
  isItalic: boolean;
  heroBg: string;
  heroText: string;
  accent: string;
  ctaBg: string;
  ctaText: string;
  paperBg: string;
  ink: string;
  muted: string;
  line: string;
  cardBg: string;
  radius: number;
}

const PAGE_LABELS: Record<string, string> = {
  home: "Home",
  products: "Products",
  about: "About",
  contact: "Contact",
  faq: "FAQ",
  blog: "Blog",
  lookbook: "Lookbook",
  "size-guide": "Size Guide",
  delivery: "Delivery",
  catering: "Catering",
  deals: "Deals",
  warranty: "Warranty",
  support: "Support",
  "skin-guide": "Skin Guide",
  results: "Results",
  cart: "Cart",
  checkout: "Checkout",
};

const PAGE_COPY: Record<string, { title: string; kicker: string; sections: Array<{ heading: string; body: string }> }> = {
  lookbook: {
    kicker: "Styled stories",
    title: "A fuller look at how your collection fits into everyday life.",
    sections: [
      { heading: "New arrivals in context", body: "Rex creates a visual sequence that shows your products as outfits, routines, bundles, or use cases instead of isolated catalogue tiles." },
      { heading: "Customer moments", body: "Use this page for launch drops, seasonal edits, social photos, campaign shoots, and product combinations that make buying decisions easier." },
      { heading: "Shop the look", body: "Every look can connect back to matching products, sizes, colors, or bundles so the gallery becomes a sales page, not just a mood board." },
    ],
  },
  "size-guide": {
    kicker: "Fit confidence",
    title: "Help customers pick the right size before they order.",
    sections: [
      { heading: "Measurements", body: "Add bust, waist, hips, shoulder, inseam, footwear, or accessory dimensions in a clear table that reduces wrong-size returns." },
      { heading: "Fit notes", body: "Rex can describe whether items run fitted, relaxed, oversized, stretchy, structured, or adjustable." },
      { heading: "Care guidance", body: "Peggy can write washing, storage, and handling instructions so customers keep every piece in good condition." },
    ],
  },
  delivery: {
    kicker: "Ordering made clear",
    title: "Delivery details customers can understand before checkout.",
    sections: [
      { heading: "Coverage areas", body: "List the cities, states, or countries you deliver to, with clear timing for same-day, next-day, and nationwide orders." },
      { heading: "Pickup and dispatch", body: "Explain pickup windows, dispatch cutoffs, courier options, and what happens after a customer pays." },
      { heading: "Special handling", body: "Use this for frozen food, fragile items, bulk orders, perishables, gift packaging, and delivery instructions." },
    ],
  },
  catering: {
    kicker: "Bulk and events",
    title: "Turn one-time buyers into event and corporate customers.",
    sections: [
      { heading: "Event packages", body: "Show birthday, wedding, office, school, and corporate packages with minimum order sizes and recommended lead times." },
      { heading: "Custom menus", body: "Peggy can write package descriptions for trays, boxes, bundles, tasting menus, and seasonal offers." },
      { heading: "Booking process", body: "Customers can understand how to request a quote, confirm dates, pay deposits, and coordinate delivery." },
    ],
  },
  deals: {
    kicker: "Promotions",
    title: "A page for bundles, flash offers, and high-converting deals.",
    sections: [
      { heading: "Featured bundles", body: "Group related products together with clear savings, use cases, and urgency." },
      { heading: "Limited offers", body: "Rex can write promotional sections for launch discounts, holiday drops, clearance sales, and loyalty rewards." },
      { heading: "Upsell paths", body: "Each deal can point customers to add-ons, warranty coverage, or premium versions." },
    ],
  },
  warranty: {
    kicker: "Trust and protection",
    title: "Set expectations around returns, exchanges, and warranty support.",
    sections: [
      { heading: "Coverage", body: "Explain what is covered, how long coverage lasts, and what customers need to keep for a claim." },
      { heading: "Returns", body: "State return windows, product condition rules, refunds, exchanges, and inspection steps in plain language." },
      { heading: "Support flow", body: "Guide customers from issue reporting to diagnosis, replacement, repair, or refund." },
    ],
  },
  support: {
    kicker: "Help center",
    title: "Give buyers a clear support path after purchase.",
    sections: [
      { heading: "Setup help", body: "Use this page for installation, compatibility, charging, device pairing, product care, or usage notes." },
      { heading: "Contact channels", body: "Show WhatsApp, email, business hours, service center address, and expected response times." },
      { heading: "Quick fixes", body: "Peggy can write troubleshooting articles that reduce repeated support questions." },
    ],
  },
  "skin-guide": {
    kicker: "Routine builder",
    title: "Help customers choose the right products for their skin goals.",
    sections: [
      { heading: "Skin type guide", body: "Explain routines for oily, dry, sensitive, combination, acne-prone, or hyperpigmentation concerns." },
      { heading: "How to layer", body: "Peggy can write morning and evening routines with steps, frequency, and warnings." },
      { heading: "Ingredient notes", body: "Use plain language to explain what each ingredient does and who should use it." },
    ],
  },
  results: {
    kicker: "Proof page",
    title: "Show reviews, transformations, and customer wins.",
    sections: [
      { heading: "Customer stories", body: "Collect detailed testimonials that explain the problem, product used, timeline, and outcome." },
      { heading: "Before and after", body: "Add galleries, usage notes, and disclaimers where needed for health, beauty, or wellness products." },
      { heading: "Review prompts", body: "Peggy can create review questions that help customers submit useful social proof." },
    ],
  },
};

function hexToRgb(hex: string) {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return "14 42 56";
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return "14 42 56";
  return `${r} ${g} ${b}`;
}

function rgba(hex: string, alpha: number) {
  return `rgb(${hexToRgb(hex)} / ${alpha})`;
}

function normalizePage(page: string | undefined): string {
  const raw = (page ?? "home").toLowerCase().trim();
  if (raw.startsWith("product:")) return raw;
  if (raw === "shop" || raw === "catalog" || raw === "menu") return "products";
  if (raw === "story" || raw === "about-us" || raw === "about us") return "about";
  if (raw === "gallery" || raw === "lookbook / gallery") return "lookbook";
  if (raw === "delivery & ordering" || raw === "ordering") return "delivery";
  if (raw === "results / reviews" || raw === "reviews") return "results";
  if (raw === "tech support") return "support";
  return raw.replace(/\s+/g, "-").replace(/[^a-z0-9:-]/g, "");
}

function pageLabel(page: string) {
  if (page.startsWith("product:")) return "Product";
  return PAGE_LABELS[page] ?? page.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function makeTheme(store: StoreConfig, variant: PreviewVariant): PreviewTheme {
  const headingFont = store.fontStyle === "fraunces"
    ? "'Fraunces', Georgia, serif"
    : "'Space Grotesk', system-ui, sans-serif";

  return {
    variant,
    headingFont,
    bodyFont: "'Space Grotesk', system-ui, sans-serif",
    isItalic: store.fontStyle === "fraunces",
    heroBg: store.palette.heroBg,
    heroText: store.palette.heroText,
    accent: store.palette.accent,
    ctaBg: store.palette.ctaBg,
    ctaText: store.palette.ctaText,
    paperBg: variant === "minimal" ? "#FFFFFF" : store.palette.paperBg,
    ink: "#0E2A38",
    muted: "#6E6E68",
    line: "rgb(14 42 56 / 0.09)",
    cardBg: variant === "bold" ? "rgb(255 255 255 / 0.96)" : "#FFFFFF",
    radius: variant === "minimal" ? 6 : variant === "editorial" ? 2 : variant === "bold" ? 18 : 12,
  };
}

function parsePrice(price: string) {
  const numeric = Number(price.replace(/[^0-9.]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatMoney(amount: number, samplePrice: string) {
  const prefix = samplePrice.replace(/[0-9.,\s]/g, "") || "NGN";
  if (prefix === "NGN") return `NGN ${amount.toLocaleString()}`;
  return `${prefix}${amount.toLocaleString()}`;
}

function productCategory(product: StoreConfig["products"][number], index: number) {
  const text = `${product.name} ${product.subtitle}`.toLowerCase();
  if (/dress|shirt|bag|shoe|wear|ankara|fabric|blazer|wrap/.test(text)) return "Fashion";
  if (/cream|soap|serum|skin|hair|glow|oil/.test(text)) return "Beauty";
  if (/sauce|food|blend|snack|rice|cake|drink|habanero/.test(text)) return "Food";
  if (/charger|phone|earbud|tech|stand|laptop|cable/.test(text)) return "Tech";
  return ["New", "Popular", "Ready to ship"][index % 3];
}

function buildProducts(store: StoreConfig): PreviewProduct[] {
  return store.products.map((product, index) => ({
    ...product,
    id: String(index),
    category: productCategory(product, index),
  }));
}

function buildNavItems(store: StoreConfig, pages?: string[]) {
  const preferred = ["home", "products"];
  const fromPages = (pages ?? []).map(normalizePage);
  const fromStore = store.navLinks.map(normalizePage);
  const combined = [...preferred, ...fromPages, ...fromStore, "cart"];
  return Array.from(new Set(combined)).filter((item) => item && !item.startsWith("product:"));
}

function LogoMark({ store, theme }: { store: StoreConfig; theme: PreviewTheme }) {
  if (store.logoUrl) {
    return (
      <img
        src={store.logoUrl}
        alt={store.name}
        className="h-8 w-24 object-contain object-left"
      />
    );
  }

  return (
    <span
      className="block truncate text-[15px] font-bold"
      style={{
        fontFamily: theme.headingFont,
        fontStyle: theme.isItalic ? "italic" : "normal",
        color: "inherit",
      }}
    >
      {store.name}
    </span>
  );
}

function Kicker({ children, theme }: { children: React.ReactNode; theme: PreviewTheme }) {
  return (
    <div
      className="font-mono text-[10px] font-bold uppercase tracking-[0.16em]"
      style={{ color: theme.accent }}
    >
      {children}
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
  theme,
  block = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  theme: PreviewTheme;
  block?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={block ? "w-full rounded-full px-4 py-2.5 text-[12px] font-bold transition-transform hover:-translate-y-0.5" : "rounded-full px-4 py-2 text-[12px] font-bold transition-transform hover:-translate-y-0.5"}
      style={{ background: theme.ctaBg, color: theme.ctaText, border: "none" }}
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  onClick,
  theme,
  block = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  theme: PreviewTheme;
  block?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={block ? "w-full rounded-full px-4 py-2.5 text-[12px] font-bold transition-colors" : "rounded-full px-4 py-2 text-[12px] font-bold transition-colors"}
      style={{ background: "transparent", color: theme.ink, border: `1px solid ${theme.line}` }}
    >
      {children}
    </button>
  );
}

function ProductImage({
  product,
  className,
  theme,
}: {
  product: PreviewProduct;
  className?: string;
  theme: PreviewTheme;
}) {
  if (product.imageUrl) {
    return <img src={product.imageUrl} alt={product.name} className={className ?? "h-full w-full object-cover"} />;
  }

  return (
    <div
      className={className ?? "h-full w-full"}
      style={{
        background: `linear-gradient(145deg, ${product.color}, color-mix(in srgb, ${product.color} 58%, ${theme.heroBg}))`,
      }}
    />
  );
}

function ProductCard({
  product,
  theme,
  onOpen,
  onAdd,
  onWishlist,
  wished,
  compact = false,
}: {
  product: PreviewProduct;
  theme: PreviewTheme;
  onOpen: () => void;
  onAdd: () => void;
  onWishlist: () => void;
  wished: boolean;
  compact?: boolean;
}) {
  const imageHeight = compact
    ? "relative h-28 overflow-hidden"
    : theme.variant === "editorial"
      ? "relative h-52 overflow-hidden"
      : theme.variant === "bold"
        ? "relative h-44 overflow-hidden"
        : "relative h-40 overflow-hidden";
  const cardBackground = theme.variant === "minimal" ? "#FFFFFF" : theme.cardBg;
  return (
    <article
      onClick={onOpen}
      className="group cursor-pointer overflow-hidden border transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
      style={{
        background: cardBackground,
        borderColor: theme.variant === "bold" ? rgba(theme.accent, 0.26) : theme.line,
        borderRadius: theme.radius,
        boxShadow: theme.variant === "bold" ? `0 14px 34px ${rgba(theme.heroBg, 0.14)}` : undefined,
      }}
    >
      <div className={imageHeight}>
        <ProductImage product={product} theme={theme} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
        <div
          className="absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          style={{ background: `linear-gradient(180deg, transparent 15%, ${rgba(theme.heroBg, 0.82)} 100%)` }}
        />
        <div className="absolute bottom-3 left-3 right-3 flex translate-y-2 gap-2 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onAdd();
            }}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-bold"
            style={{ background: theme.ctaBg, color: theme.ctaText }}
          >
            <Icon name="bag" size={13} color="currentColor" />
            Add
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onWishlist();
            }}
            aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
            className="flex h-8 w-8 items-center justify-center rounded-full"
            style={{ background: wished ? theme.accent : "white", color: theme.ink }}
          >
            <Icon name="star" size={13} color="currentColor" />
          </button>
        </div>
      </div>
      <div className="p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-[13px] font-bold" style={{ color: theme.ink }}>{product.name}</h3>
            <p className="mt-1 truncate text-[11px]" style={{ color: theme.muted }}>{product.subtitle}</p>
          </div>
          <div className="shrink-0 text-right font-mono text-[11px] font-bold" style={{ color: theme.ink }}>
            {product.price}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="rounded-full px-2 py-1 text-[9px] font-bold" style={{ background: rgba(theme.accent, 0.16), color: theme.ink }}>
            {product.category}
          </span>
          <span className="text-[10px] font-semibold" style={{ color: theme.muted }}>Quick view</span>
        </div>
      </div>
    </article>
  );
}

function StoreNav({
  store,
  theme,
  device,
  navItems,
  activePage,
  cartCount,
  wishlistCount,
  onNavigate,
}: {
  store: StoreConfig;
  theme: PreviewTheme;
  device: "desktop" | "mobile";
  navItems: string[];
  activePage: string;
  cartCount: number;
  wishlistCount: number;
  onNavigate: (page: string) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const visibleItems = device === "mobile" ? navItems.slice(0, 4) : navItems.slice(0, 7);

  return (
    <header
      className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b px-4 py-3 backdrop-blur"
      style={{
        background: activePage === "home" ? rgba(theme.heroBg, 0.96) : "rgb(255 255 255 / 0.94)",
        borderColor: activePage === "home" ? rgba(theme.heroText, 0.12) : theme.line,
        color: activePage === "home" ? theme.heroText : theme.ink,
      }}
    >
      <button type="button" onClick={() => onNavigate("home")} className="min-w-0 text-left">
        <LogoMark store={store} theme={theme} />
      </button>

      <nav className="flex min-w-0 flex-1 justify-center gap-1 overflow-x-auto">
        {visibleItems.map((item) => {
          const active = activePage === item || (activePage.startsWith("product:") && item === "products");
          const isHover = hovered === item;
          return (
            <button
              key={item}
              type="button"
              onClick={() => onNavigate(item)}
              onMouseEnter={() => setHovered(item)}
              onMouseLeave={() => setHovered(null)}
              className="shrink-0 rounded-full px-2.5 py-1.5 text-[10px] font-bold transition-all"
              style={{
                background: active ? theme.accent : isHover ? rgba(theme.accent, 0.18) : "transparent",
                color: active ? theme.ink : activePage === "home" ? theme.heroText : theme.muted,
              }}
            >
              {pageLabel(item)}
            </button>
          );
        })}
      </nav>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onNavigate("products")}
          className="hidden rounded-full px-3 py-1.5 text-[10px] font-bold transition-transform hover:-translate-y-0.5 sm:block"
          style={{ background: theme.ctaBg, color: theme.ctaText }}
        >
          Shop
        </button>
        <button
          type="button"
          onClick={() => onNavigate("cart")}
          className="relative flex h-8 w-8 items-center justify-center rounded-full transition-transform hover:-translate-y-0.5"
          style={{ background: activePage === "home" ? rgba(theme.heroText, 0.12) : rgba(theme.accent, 0.18), color: activePage === "home" ? theme.heroText : theme.ink }}
          aria-label="Open cart"
        >
          <Icon name="bag" size={14} color="currentColor" />
          {cartCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold" style={{ background: theme.accent, color: theme.ink }}>
              {cartCount}
            </span>
          )}
        </button>
        {wishlistCount > 0 && (
          <span className="hidden rounded-full px-2 py-1 text-[9px] font-bold sm:inline-flex" style={{ background: rgba(theme.accent, 0.16), color: activePage === "home" ? theme.heroText : theme.ink }}>
            {wishlistCount} saved
          </span>
        )}
      </div>
    </header>
  );
}

function StoreFooter({
  store,
  theme,
  onNavigate,
}: {
  store: StoreConfig;
  theme: PreviewTheme;
  onNavigate: (page: string) => void;
}) {
  return (
    <footer className="grid gap-5 border-t px-5 py-6 sm:grid-cols-[1.2fr_1fr_1fr]" style={{ borderColor: theme.line, background: "#FFFFFF" }}>
      <div>
        <LogoMark store={store} theme={theme} />
        <p className="mt-3 max-w-sm text-[12px] leading-6" style={{ color: theme.muted }}>
          {store.tagline}. Rex keeps the store structure editable, and Peggy can keep writing product copy, pages, and blog articles after launch.
        </p>
      </div>
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: theme.ink }}>Shop</div>
        <div className="mt-3 flex flex-col gap-2">
          {["products", "cart", "checkout"].map((item) => (
            <button key={item} type="button" onClick={() => onNavigate(item)} className="text-left text-[12px] hover:underline" style={{ color: theme.muted }}>
              {pageLabel(item)}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: theme.ink }}>Help</div>
        <div className="mt-3 flex flex-col gap-2">
          {["about", "contact", "faq"].map((item) => (
            <button key={item} type="button" onClick={() => onNavigate(item)} className="text-left text-[12px] hover:underline" style={{ color: theme.muted }}>
              {pageLabel(item)}
            </button>
          ))}
        </div>
      </div>
    </footer>
  );
}

function ProductModal({
  product,
  theme,
  wished,
  onClose,
  onWishlist,
  onAdd,
  onViewPage,
}: {
  product: PreviewProduct;
  theme: PreviewTheme;
  wished: boolean;
  onClose: () => void;
  onWishlist: () => void;
  onAdd: () => void;
  onViewPage: () => void;
}) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[rgb(14_42_56_/_0.58)] p-4 backdrop-blur-sm">
      <div className="grid max-h-[86%] w-full max-w-[680px] overflow-y-auto bg-white shadow-xl sm:grid-cols-[1fr_1fr]" style={{ borderRadius: theme.radius }}>
        <div className="grid gap-2 bg-[var(--color-paper)] p-3">
          <div className="h-64 overflow-hidden" style={{ borderRadius: theme.radius }}>
            <ProductImage product={product} theme={theme} className="h-full w-full object-cover" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-20 overflow-hidden border" style={{ borderColor: theme.line, borderRadius: theme.radius }}>
                <ProductImage product={product} theme={theme} className="h-full w-full object-cover" />
              </div>
            ))}
          </div>
        </div>
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Kicker theme={theme}>{product.category}</Kicker>
              <h2 className="mt-2 text-[24px] font-bold leading-tight" style={{ color: theme.ink, fontFamily: theme.headingFont }}>
                {product.name}
              </h2>
            </div>
            <button type="button" onClick={onClose} className="rounded-full p-2" style={{ border: `1px solid ${theme.line}`, color: theme.ink }}>
              <Icon name="x" size={15} color="currentColor" />
            </button>
          </div>
          <p className="mt-3 text-[13px] leading-6" style={{ color: theme.muted }}>
            {product.subtitle}. Peggy can expand this into a full conversion-focused product description with benefits, use cases, ingredients or specs, care notes, and SEO keywords.
          </p>
          <div className="mt-4 font-mono text-[20px] font-bold" style={{ color: theme.ink }}>{product.price}</div>
          <div className="mt-5 grid gap-2">
            <PrimaryButton theme={theme} block onClick={onAdd}>Add to cart</PrimaryButton>
            <SecondaryButton theme={theme} block onClick={onWishlist}>{wished ? "Remove from wishlist" : "Save to wishlist"}</SecondaryButton>
            <SecondaryButton theme={theme} block onClick={onViewPage}>Open single product page</SecondaryButton>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2 text-center">
            {["Fast delivery", "Secure checkout", "Rex editable"].map((item) => (
              <div key={item} className="rounded-[10px] border px-2 py-3 text-[10px] font-bold" style={{ borderColor: theme.line, color: theme.ink }}>
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function HomePage({
  store,
  theme,
  products,
  device,
  onNavigate,
  onOpen,
  onAdd,
  onWishlist,
  wishlist,
}: {
  store: StoreConfig;
  theme: PreviewTheme;
  products: PreviewProduct[];
  device: "desktop" | "mobile";
  onNavigate: (page: string) => void;
  onOpen: (product: PreviewProduct) => void;
  onAdd: (product: PreviewProduct) => void;
  onWishlist: (product: PreviewProduct) => void;
  wishlist: string[];
}) {
  const heroLines = store.heroHeadline.split("\\n");
  const heroGrid = device === "desktop"
    ? theme.variant === "editorial"
      ? "0.82fr 1.18fr"
      : theme.variant === "minimal"
        ? "1.2fr 0.8fr"
        : "1.05fr 0.95fr"
    : "1fr";
  const featured = products[0];
  const isBold = theme.variant === "bold";
  const isMinimal = theme.variant === "minimal";
  const isEditorial = theme.variant === "editorial";

  return (
    <>
      <section
        className="relative overflow-hidden px-5 py-8 sm:px-8"
        style={{
          paddingTop: isBold ? 58 : isMinimal ? 42 : 44,
          paddingBottom: isBold ? 62 : isMinimal ? 42 : 48,
          background: isMinimal
            ? "#FFFFFF"
            : isEditorial
              ? `linear-gradient(90deg, ${theme.heroBg} 0%, ${theme.heroBg} 44%, ${theme.paperBg} 44%, ${theme.paperBg} 100%)`
              : `linear-gradient(${isBold ? "180deg" : "145deg"}, ${theme.heroBg}, color-mix(in srgb, ${theme.heroBg} ${isBold ? "64%" : "78%"}, ${isBold ? theme.accent : "black"}))`,
          color: isMinimal ? theme.ink : theme.heroText,
        }}
      >
        {!isMinimal && (
          <div
            className="absolute inset-0 opacity-70"
            style={{
              backgroundImage: isEditorial
                ? `linear-gradient(90deg, ${rgba(theme.heroText, 0.08)} 1px, transparent 1px)`
                : `radial-gradient(${rgba(theme.accent, isBold ? 0.24 : 0.14)} 1px, transparent 1px)`,
              backgroundSize: isEditorial ? "42px 42px" : "18px 18px",
            }}
          />
        )}
        <div className="relative grid items-center gap-7" style={{ gridTemplateColumns: heroGrid }}>
          <div style={{ textAlign: isBold ? "center" : "left", maxWidth: isBold ? 760 : undefined, margin: isBold ? "0 auto" : undefined }}>
            <Kicker theme={theme}>{store.tagline}</Kicker>
            <h1
              className="mt-4 max-w-[620px] font-bold leading-[1.02] tracking-[-0.03em]"
              style={{
                fontFamily: theme.headingFont,
                fontStyle: theme.isItalic ? "italic" : "normal",
                color: isMinimal ? theme.ink : theme.heroText,
                fontSize: isBold ? 58 : isEditorial ? 46 : 42,
                marginLeft: isBold ? "auto" : undefined,
                marginRight: isBold ? "auto" : undefined,
              }}
            >
              {heroLines.map((line, index) => (
                <span key={line + index}>{line}{index < heroLines.length - 1 ? <br /> : null}</span>
              ))}
            </h1>
            <p className="mt-4 max-w-md text-[13px] leading-6" style={{ color: isMinimal ? theme.muted : rgba(theme.heroText, 0.78), marginLeft: isBold ? "auto" : undefined, marginRight: isBold ? "auto" : undefined }}>
              {store.heroSubline}
            </p>
            <div className="mt-6 flex flex-wrap gap-2" style={{ justifyContent: isBold ? "center" : "flex-start" }}>
              <PrimaryButton theme={theme} onClick={() => onNavigate("products")}>{store.heroCtaText.replace(/[^\x20-\x7E]/g, "").replace("->", "").trim() || "Shop now"}</PrimaryButton>
              <button type="button" onClick={() => onNavigate("about")} className="rounded-full px-4 py-2 text-[12px] font-bold" style={{ border: `1px solid ${isMinimal ? theme.line : rgba(theme.heroText, 0.24)}`, color: isMinimal ? theme.ink : theme.heroText }}>
                Meet the brand
              </button>
            </div>
          </div>
          {featured && !isBold && (
            <div className="relative">
              <div className="overflow-hidden border shadow-xl" style={{ borderColor: rgba(theme.accent, 0.38), borderRadius: isEditorial ? 2 : theme.radius + 10 }}>
                <div className={isEditorial ? "h-80" : "h-64"}>
                  <ProductImage product={featured} theme={theme} className="h-full w-full object-cover" />
                </div>
              </div>
              <div className="absolute -bottom-4 left-5 right-5 border bg-white p-3 shadow-md" style={{ borderColor: theme.line, borderRadius: theme.radius }}>
                <div className="text-[11px] font-bold" style={{ color: theme.muted }}>Featured product</div>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <span className="text-[13px] font-bold" style={{ color: theme.ink }}>{featured.name}</span>
                  <span className="font-mono text-[12px] font-bold" style={{ color: theme.ink }}>{featured.price}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-3 px-5 py-5 sm:grid-cols-3 sm:px-8" style={{ background: theme.paperBg }}>
        {[
          ["Built around trust", "Clear policies, visible contact details, and direct support make customers more comfortable buying."],
          ["Designed to convert", "Rex sets up sections that move shoppers from first impression to product choice to checkout."],
          ["Ready for content", "Peggy can write descriptions, page copy, captions, and long-form blog articles inside the workspace."],
        ].map(([heading, body]) => (
          <div key={heading} className="border bg-white p-4" style={{ borderColor: theme.line, borderRadius: theme.radius }}>
            <h3 className="text-[13px] font-bold" style={{ color: theme.ink }}>{heading}</h3>
            <p className="mt-2 text-[11px] leading-5" style={{ color: theme.muted }}>{body}</p>
          </div>
        ))}
      </section>

      <section className="px-5 py-7 sm:px-8" style={{ background: "#FFFFFF" }}>
        <div className="flex items-end justify-between gap-4">
          <div>
            <Kicker theme={theme}>Featured products</Kicker>
            <h2 className="mt-2 text-[24px] font-bold tracking-[-0.02em]" style={{ color: theme.ink, fontFamily: theme.headingFont }}>
              Shop the first collection
            </h2>
          </div>
          <button type="button" onClick={() => onNavigate("products")} className="text-[12px] font-bold hover:underline" style={{ color: theme.ink }}>
            View all
          </button>
        </div>
        <div className="mt-5 grid gap-4" style={{ gridTemplateColumns: device === "desktop" ? (isEditorial ? "1.2fr 0.9fr 0.9fr" : "repeat(3, minmax(0, 1fr))") : "1fr" }}>
          {products.slice(0, 3).map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              theme={theme}
              onOpen={() => onOpen(product)}
              onAdd={() => onAdd(product)}
              onWishlist={() => onWishlist(product)}
              wished={wishlist.includes(product.id)}
              compact={device === "mobile"}
            />
          ))}
        </div>
      </section>

      <section className="grid gap-5 px-5 py-7 sm:grid-cols-[1fr_1.1fr] sm:px-8" style={{ background: theme.paperBg }}>
        <div>
          <Kicker theme={theme}>Brand promise</Kicker>
          <h2 className="mt-2 text-[26px] font-bold leading-tight tracking-[-0.02em]" style={{ color: theme.ink, fontFamily: theme.headingFont }}>
            Every section is editable with Rex after the first build.
          </h2>
        </div>
        <div className="grid gap-3">
          {[
            "Add, remove, or rewrite page sections with natural language.",
            "Turn selected pages into richer sales pages with product blocks and FAQs.",
            "Publish blog articles from the CMS when Peggy finishes writing them.",
          ].map((item, index) => (
            <div key={item} className="flex gap-3 rounded-[14px] border bg-white p-4" style={{ borderColor: theme.line }}>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-bold" style={{ background: theme.accent, color: theme.ink }}>{index + 1}</span>
              <p className="text-[12px] leading-5" style={{ color: theme.muted }}>{item}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function ProductsPage({
  theme,
  products,
  onOpen,
  onAdd,
  onWishlist,
  wishlist,
}: {
  theme: PreviewTheme;
  products: PreviewProduct[];
  onOpen: (product: PreviewProduct) => void;
  onAdd: (product: PreviewProduct) => void;
  onWishlist: (product: PreviewProduct) => void;
  wishlist: string[];
}) {
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState("Featured");
  const categories = ["All", ...Array.from(new Set(products.map((product) => product.category)))];
  const visibleProducts = products
    .filter((product) => category === "All" || product.category === category)
    .sort((a, b) => {
      if (sort === "Price low") return parsePrice(a.price) - parsePrice(b.price);
      if (sort === "Price high") return parsePrice(b.price) - parsePrice(a.price);
      return Number(a.id) - Number(b.id);
    });

  return (
    <section className="px-5 py-7 sm:px-8" style={{ background: theme.paperBg }}>
      <div className="rounded-[18px] border bg-white p-5" style={{ borderColor: theme.line }}>
        <Kicker theme={theme}>Catalogue</Kicker>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[30px] font-bold tracking-[-0.03em]" style={{ color: theme.ink, fontFamily: theme.headingFont }}>Products page</h1>
            <p className="mt-2 max-w-lg text-[12px] leading-6" style={{ color: theme.muted }}>
              This page includes product filtering, sorting, quick-view modals, wishlist actions, cart actions, and individual product pages.
            </p>
          </div>
          <div className="flex gap-2">
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-full border px-3 py-2 text-[11px] outline-none" style={{ borderColor: theme.line, color: theme.ink, background: "#FFFFFF" }}>
              {categories.map((item) => <option key={item}>{item}</option>)}
            </select>
            <select value={sort} onChange={(event) => setSort(event.target.value)} className="rounded-full border px-3 py-2 text-[11px] outline-none" style={{ borderColor: theme.line, color: theme.ink, background: "#FFFFFF" }}>
              {["Featured", "Price low", "Price high"].map((item) => <option key={item}>{item}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {visibleProducts.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            theme={theme}
            onOpen={() => onOpen(product)}
            onAdd={() => onAdd(product)}
            onWishlist={() => onWishlist(product)}
            wished={wishlist.includes(product.id)}
          />
        ))}
      </div>
    </section>
  );
}

function ProductDetailPage({
  product,
  products,
  theme,
  onBack,
  onAdd,
  onWishlist,
  wished,
  onOpen,
}: {
  product: PreviewProduct;
  products: PreviewProduct[];
  theme: PreviewTheme;
  onBack: () => void;
  onAdd: (product: PreviewProduct, qty?: number) => void;
  onWishlist: (product: PreviewProduct) => void;
  wished: boolean;
  onOpen: (product: PreviewProduct) => void;
}) {
  const [qty, setQty] = useState(1);
  const related = products.filter((item) => item.id !== product.id).slice(0, 3);

  return (
    <section className="px-5 py-7 sm:px-8" style={{ background: theme.paperBg }}>
      <button type="button" onClick={onBack} className="mb-4 text-[12px] font-bold hover:underline" style={{ color: theme.ink }}>
        Back to products
      </button>
      <div className="grid gap-6 rounded-[18px] border bg-white p-4 sm:grid-cols-[1fr_1fr]" style={{ borderColor: theme.line }}>
        <div className="overflow-hidden" style={{ borderRadius: theme.radius }}>
          <div className="h-80">
            <ProductImage product={product} theme={theme} className="h-full w-full object-cover" />
          </div>
        </div>
        <div className="flex flex-col justify-center">
          <Kicker theme={theme}>{product.category}</Kicker>
          <h1 className="mt-3 text-[34px] font-bold leading-tight tracking-[-0.03em]" style={{ color: theme.ink, fontFamily: theme.headingFont }}>
            {product.name}
          </h1>
          <p className="mt-3 text-[13px] leading-6" style={{ color: theme.muted }}>
            {product.subtitle}. This full product page includes image gallery space, benefits, usage details, delivery information, wishlist support, and cart quantity controls.
          </p>
          <div className="mt-4 font-mono text-[24px] font-bold" style={{ color: theme.ink }}>{product.price}</div>
          <div className="mt-5 grid gap-3 rounded-[14px] border p-4" style={{ borderColor: theme.line }}>
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-bold" style={{ color: theme.ink }}>Quantity</span>
              <div className="flex items-center rounded-full border" style={{ borderColor: theme.line }}>
                <button type="button" onClick={() => setQty(Math.max(1, qty - 1))} className="px-3 py-1.5 text-[13px] font-bold" style={{ color: theme.ink }}>-</button>
                <span className="min-w-8 text-center text-[12px] font-bold" style={{ color: theme.ink }}>{qty}</span>
                <button type="button" onClick={() => setQty(qty + 1)} className="px-3 py-1.5 text-[13px] font-bold" style={{ color: theme.ink }}>+</button>
              </div>
            </div>
            <PrimaryButton theme={theme} block onClick={() => onAdd(product, qty)}>Add to cart</PrimaryButton>
            <SecondaryButton theme={theme} block onClick={() => onWishlist(product)}>{wished ? "Remove from wishlist" : "Save to wishlist"}</SecondaryButton>
          </div>
          <div className="mt-5 grid gap-2 text-[12px]" style={{ color: theme.muted }}>
            <p><strong style={{ color: theme.ink }}>Details:</strong> Peggy can write materials, ingredients, dimensions, variants, or product specs here.</p>
            <p><strong style={{ color: theme.ink }}>Delivery:</strong> Rex connects this product to the cart and checkout flow.</p>
          </div>
        </div>
      </div>
      {related.length > 0 && (
        <div className="mt-7">
          <h2 className="text-[18px] font-bold" style={{ color: theme.ink }}>Related products</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {related.map((item) => (
              <ProductCard
                key={item.id}
                product={item}
                theme={theme}
                onOpen={() => onOpen(item)}
                onAdd={() => onAdd(item)}
                onWishlist={() => onWishlist(item)}
                wished={false}
                compact
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function AboutPage({ store, theme, onNavigate }: { store: StoreConfig; theme: PreviewTheme; onNavigate: (page: string) => void }) {
  return (
    <section className="px-5 py-7 sm:px-8" style={{ background: theme.paperBg }}>
      <div className="grid gap-5 rounded-[18px] border bg-white p-5 sm:grid-cols-[0.9fr_1.1fr]" style={{ borderColor: theme.line }}>
        <div>
          <Kicker theme={theme}>Our story</Kicker>
          <h1 className="mt-3 text-[34px] font-bold leading-tight tracking-[-0.03em]" style={{ color: theme.ink, fontFamily: theme.headingFont }}>
            Built for customers who care about quality, clarity, and trust.
          </h1>
        </div>
        <div className="space-y-4 text-[13px] leading-6" style={{ color: theme.muted }}>
          <p>{store.name} exists to make buying easier: clear products, honest details, fast support, and a checkout experience customers can understand.</p>
          <p>Rex can expand this into a founder story, mission section, team notes, process details, quality promise, and brand values. Peggy can handle the writing voice so it sounds like the business, not a template.</p>
        </div>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {[
          ["Quality first", "Show sourcing, production, ingredients, materials, packaging, or inspection details."],
          ["Customer clarity", "Explain delivery, returns, support, and product expectations before checkout."],
          ["Built to grow", "Use pages, products, blogs, and campaigns together as one sales system."],
        ].map(([heading, body]) => (
          <div key={heading} className="rounded-[14px] border bg-white p-4" style={{ borderColor: theme.line }}>
            <h2 className="text-[14px] font-bold" style={{ color: theme.ink }}>{heading}</h2>
            <p className="mt-2 text-[12px] leading-5" style={{ color: theme.muted }}>{body}</p>
          </div>
        ))}
      </div>
      <div className="mt-5 rounded-[18px] border p-5" style={{ borderColor: theme.line, background: rgba(theme.accent, 0.13) }}>
        <h2 className="text-[22px] font-bold" style={{ color: theme.ink, fontFamily: theme.headingFont }}>Ready to explore the collection?</h2>
        <p className="mt-2 text-[12px]" style={{ color: theme.muted }}>The about page points shoppers back to products with more confidence.</p>
        <div className="mt-4"><PrimaryButton theme={theme} onClick={() => onNavigate("products")}>Browse products</PrimaryButton></div>
      </div>
    </section>
  );
}

function ContactPage({ theme }: { theme: PreviewTheme }) {
  const inputStyle = { borderColor: theme.line, color: theme.ink, background: "#FFFFFF" };
  return (
    <section className="grid gap-5 px-5 py-7 sm:grid-cols-[0.9fr_1.1fr] sm:px-8" style={{ background: theme.paperBg }}>
      <div className="rounded-[18px] border bg-white p-5" style={{ borderColor: theme.line }}>
        <Kicker theme={theme}>Contact</Kicker>
        <h1 className="mt-3 text-[32px] font-bold leading-tight tracking-[-0.03em]" style={{ color: theme.ink, fontFamily: theme.headingFont }}>Questions before ordering?</h1>
        <p className="mt-3 text-[13px] leading-6" style={{ color: theme.muted }}>
          Customers can ask about stock, bulk orders, delivery windows, returns, product details, and partnership requests.
        </p>
        <div className="mt-5 grid gap-3">
          {["WhatsApp support", "Email replies within one business day", "Order and delivery updates"].map((item) => (
            <div key={item} className="rounded-[12px] border px-3 py-3 text-[12px] font-semibold" style={{ borderColor: theme.line, color: theme.ink }}>
              {item}
            </div>
          ))}
        </div>
      </div>
      <form className="rounded-[18px] border bg-white p-5" style={{ borderColor: theme.line }}>
        <div className="grid gap-3">
          <label className="grid gap-1 text-[11px] font-bold" style={{ color: theme.ink }}>
            Name
            <input className="rounded-[10px] border px-3 py-2.5 text-[13px] outline-none" style={inputStyle} placeholder="Customer name" />
          </label>
          <label className="grid gap-1 text-[11px] font-bold" style={{ color: theme.ink }}>
            Email
            <input className="rounded-[10px] border px-3 py-2.5 text-[13px] outline-none" style={inputStyle} placeholder="customer@email.com" />
          </label>
          <label className="grid gap-1 text-[11px] font-bold" style={{ color: theme.ink }}>
            Message
            <textarea rows={5} className="resize-none rounded-[10px] border px-3 py-2.5 text-[13px] outline-none" style={inputStyle} placeholder="How can we help?" />
          </label>
          <PrimaryButton theme={theme} block>Send message</PrimaryButton>
        </div>
      </form>
    </section>
  );
}

function FaqPage({ theme }: { theme: PreviewTheme }) {
  const faqs = [
    ["How long does delivery take?", "Delivery timing depends on location and product availability. Rex can rewrite this with exact cities, shipping partners, and cutoff times."],
    ["Can I return or exchange an item?", "Yes. The final policy can include return windows, item condition, inspection steps, refunds, store credit, or exchange rules."],
    ["Do you support bulk orders?", "Yes. Add wholesale, event, corporate, or reseller details here so customers know how to request larger quantities."],
    ["Can Peggy write the FAQ for me?", "Yes. Peggy can turn customer questions into clear, SEO-friendly answers that reduce support load."],
    ["Can Rex edit this page later?", "Yes. Rex can add sections, remove sections, rewrite tone, or connect FAQs to products and checkout instructions."],
  ];
  const [open, setOpen] = useState(0);

  return (
    <section className="px-5 py-7 sm:px-8" style={{ background: theme.paperBg }}>
      <div className="mx-auto max-w-3xl">
        <Kicker theme={theme}>FAQ</Kicker>
        <h1 className="mt-3 text-[34px] font-bold tracking-[-0.03em]" style={{ color: theme.ink, fontFamily: theme.headingFont }}>Answers before checkout</h1>
        <div className="mt-5 grid gap-3">
          {faqs.map(([question, answer], index) => (
            <button key={question} type="button" onClick={() => setOpen(open === index ? -1 : index)} className="rounded-[14px] border bg-white p-4 text-left transition-colors" style={{ borderColor: open === index ? theme.accent : theme.line }}>
              <div className="flex items-center justify-between gap-4">
                <span className="text-[14px] font-bold" style={{ color: theme.ink }}>{question}</span>
                <Icon name={open === index ? "x" : "plus"} size={14} color={theme.ink} />
              </div>
              {open === index && <p className="mt-3 text-[12px] leading-6" style={{ color: theme.muted }}>{answer}</p>}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function BlogPage({ store, theme }: { store: StoreConfig; theme: PreviewTheme }) {
  const posts = [
    ["How to choose the right product for your needs", "Peggy can write a full buyer guide with comparisons, objections, and product links."],
    ["Behind the scenes at " + store.name, "Use storytelling to build trust, show process, and make the brand more memorable."],
    ["Customer questions answered", "Turn support questions into searchable content that improves SEO and conversion."],
  ];

  return (
    <section className="px-5 py-7 sm:px-8" style={{ background: theme.paperBg }}>
      <div className="rounded-[18px] border p-5" style={{ borderColor: theme.line, background: "#FFFFFF" }}>
        <Kicker theme={theme}>Blog and CMS</Kicker>
        <h1 className="mt-3 text-[34px] font-bold leading-tight tracking-[-0.03em]" style={{ color: theme.ink, fontFamily: theme.headingFont }}>
          Your blog is set up.
        </h1>
        <p className="mt-3 max-w-2xl text-[13px] leading-6" style={{ color: theme.muted }}>
          Rex has prepared the blog structure. Go to Workspace, then CMS, to have Peggy write and publish long-form SEO articles for your store.
        </p>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {posts.map(([title, body]) => (
          <article key={title} className="rounded-[14px] border bg-white p-4" style={{ borderColor: theme.line }}>
            <div className="mb-4 h-28 rounded-[10px]" style={{ background: `linear-gradient(135deg, ${rgba(theme.accent, 0.34)}, ${rgba(theme.heroBg, 0.14)})` }} />
            <h2 className="text-[15px] font-bold leading-tight" style={{ color: theme.ink }}>{title}</h2>
            <p className="mt-2 text-[12px] leading-5" style={{ color: theme.muted }}>{body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function GenericPage({ page, store, theme, onNavigate }: { page: string; store: StoreConfig; theme: PreviewTheme; onNavigate: (page: string) => void }) {
  const fallback = {
    kicker: pageLabel(page),
    title: `${pageLabel(page)} for ${store.name}`,
    sections: [
      { heading: "Page purpose", body: "Rex builds this page around the exact details customers need before they decide to buy." },
      { heading: "Conversion copy", body: "Peggy can write headlines, section body copy, trust points, SEO descriptions, and calls to action." },
      { heading: "Editable layout", body: "You can ask Rex to add, remove, reorder, or rewrite any section after the build." },
    ],
  };
  const copy = PAGE_COPY[page] ?? fallback;

  return (
    <section className="px-5 py-7 sm:px-8" style={{ background: theme.paperBg }}>
      <div className="rounded-[18px] border bg-white p-5" style={{ borderColor: theme.line }}>
        <Kicker theme={theme}>{copy.kicker}</Kicker>
        <h1 className="mt-3 max-w-2xl text-[34px] font-bold leading-tight tracking-[-0.03em]" style={{ color: theme.ink, fontFamily: theme.headingFont }}>{copy.title}</h1>
        <p className="mt-3 max-w-2xl text-[13px] leading-6" style={{ color: theme.muted }}>
          This page is intentionally fuller than a simple one-section placeholder. Rex creates a sales-ready structure, and Peggy handles the writing.
        </p>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {copy.sections.map((section) => (
          <div key={section.heading} className="rounded-[14px] border bg-white p-4" style={{ borderColor: theme.line }}>
            <h2 className="text-[15px] font-bold" style={{ color: theme.ink }}>{section.heading}</h2>
            <p className="mt-2 text-[12px] leading-5" style={{ color: theme.muted }}>{section.body}</p>
          </div>
        ))}
      </div>
      <div className="mt-5 rounded-[18px] border p-5" style={{ borderColor: theme.line, background: rgba(theme.accent, 0.13) }}>
        <h2 className="text-[20px] font-bold" style={{ color: theme.ink }}>Ready to connect this page to products?</h2>
        <p className="mt-2 text-[12px]" style={{ color: theme.muted }}>Rex can add product blocks, forms, FAQs, and calls to action here.</p>
        <div className="mt-4"><PrimaryButton theme={theme} onClick={() => onNavigate("products")}>View products</PrimaryButton></div>
      </div>
    </section>
  );
}

function CartPage({
  theme,
  lines,
  onQty,
  onRemove,
  onNavigate,
  samplePrice,
}: {
  theme: PreviewTheme;
  lines: CartLine[];
  onQty: (id: string, qty: number) => void;
  onRemove: (id: string) => void;
  onNavigate: (page: string) => void;
  samplePrice: string;
}) {
  const subtotal = lines.reduce((sum, line) => sum + parsePrice(line.product.price) * line.qty, 0);

  return (
    <section className="px-5 py-7 sm:px-8" style={{ background: theme.paperBg }}>
      <div className="grid gap-5 sm:grid-cols-[1.1fr_0.8fr]">
        <div className="rounded-[18px] border bg-white p-5" style={{ borderColor: theme.line }}>
          <Kicker theme={theme}>Cart</Kicker>
          <h1 className="mt-2 text-[30px] font-bold tracking-[-0.03em]" style={{ color: theme.ink, fontFamily: theme.headingFont }}>Review your items</h1>
          <div className="mt-5 grid gap-3">
            {lines.length === 0 ? (
              <div className="rounded-[14px] border p-5 text-[13px]" style={{ borderColor: theme.line, color: theme.muted }}>
                Your cart is empty. Add a product to test the checkout flow.
              </div>
            ) : lines.map((line) => (
              <div key={line.product.id} className="grid gap-3 rounded-[14px] border p-3 sm:grid-cols-[80px_1fr_auto]" style={{ borderColor: theme.line }}>
                <div className="h-20 overflow-hidden rounded-[10px]">
                  <ProductImage product={line.product} theme={theme} className="h-full w-full object-cover" />
                </div>
                <div>
                  <h2 className="text-[13px] font-bold" style={{ color: theme.ink }}>{line.product.name}</h2>
                  <p className="mt-1 text-[11px]" style={{ color: theme.muted }}>{line.product.subtitle}</p>
                  <button type="button" onClick={() => onRemove(line.product.id)} className="mt-2 text-[11px] font-bold hover:underline" style={{ color: theme.muted }}>
                    Remove
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => onQty(line.product.id, line.qty - 1)} className="h-7 w-7 rounded-full border text-[13px] font-bold" style={{ borderColor: theme.line, color: theme.ink }}>-</button>
                  <span className="w-5 text-center text-[12px] font-bold" style={{ color: theme.ink }}>{line.qty}</span>
                  <button type="button" onClick={() => onQty(line.product.id, line.qty + 1)} className="h-7 w-7 rounded-full border text-[13px] font-bold" style={{ borderColor: theme.line, color: theme.ink }}>+</button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <aside className="h-fit rounded-[18px] border bg-white p-5" style={{ borderColor: theme.line }}>
          <h2 className="text-[16px] font-bold" style={{ color: theme.ink }}>Order summary</h2>
          <div className="mt-4 grid gap-3 text-[12px]" style={{ color: theme.muted }}>
            <div className="flex justify-between"><span>Subtotal</span><strong style={{ color: theme.ink }}>{formatMoney(subtotal, samplePrice)}</strong></div>
            <div className="flex justify-between"><span>Delivery</span><span>Calculated at checkout</span></div>
            <div className="border-t pt-3" style={{ borderColor: theme.line }}>
              <div className="flex justify-between text-[14px] font-bold" style={{ color: theme.ink }}><span>Total</span><span>{formatMoney(subtotal, samplePrice)}</span></div>
            </div>
          </div>
          <div className="mt-5 grid gap-2">
            <PrimaryButton theme={theme} block onClick={() => onNavigate("checkout")}>Proceed to checkout</PrimaryButton>
            <SecondaryButton theme={theme} block onClick={() => onNavigate("products")}>Continue shopping</SecondaryButton>
          </div>
        </aside>
      </div>
    </section>
  );
}

function CheckoutPage({ theme, lines, samplePrice }: { theme: PreviewTheme; lines: CartLine[]; samplePrice: string }) {
  const inputStyle = { borderColor: theme.line, color: theme.ink, background: "#FFFFFF" };
  const subtotal = lines.reduce((sum, line) => sum + parsePrice(line.product.price) * line.qty, 0);

  return (
    <section className="px-5 py-7 sm:px-8" style={{ background: theme.paperBg }}>
      <div className="rounded-[18px] border bg-white p-5" style={{ borderColor: theme.line }}>
        <Kicker theme={theme}>Secure checkout</Kicker>
        <h1 className="mt-2 text-[30px] font-bold tracking-[-0.03em]" style={{ color: theme.ink, fontFamily: theme.headingFont }}>Checkout page</h1>
        <p className="mt-2 text-[12px]" style={{ color: theme.muted }}>This page is ready for customer details, delivery method, order review, and payment setup.</p>
      </div>
      <div className="mt-5 grid gap-5 sm:grid-cols-[1.1fr_0.8fr]">
        <form className="grid gap-4 rounded-[18px] border bg-white p-5" style={{ borderColor: theme.line }}>
          {[
            ["Contact information", ["Email address", "Phone number"]],
            ["Delivery details", ["Full name", "Delivery address", "City or state"]],
            ["Payment", ["Card number", "Expiry date", "Security code"]],
          ].map(([heading, fields]) => (
            <div key={heading as string} className="grid gap-3">
              <h2 className="text-[15px] font-bold" style={{ color: theme.ink }}>{heading}</h2>
              {(fields as string[]).map((field) => (
                <label key={field} className="grid gap-1 text-[11px] font-bold" style={{ color: theme.ink }}>
                  {field}
                  <input className="rounded-[10px] border px-3 py-2.5 text-[13px] outline-none" style={inputStyle} placeholder={field} />
                </label>
              ))}
            </div>
          ))}
          <PrimaryButton theme={theme} block>Place order</PrimaryButton>
        </form>
        <aside className="h-fit rounded-[18px] border bg-white p-5" style={{ borderColor: theme.line }}>
          <h2 className="text-[16px] font-bold" style={{ color: theme.ink }}>Your order</h2>
          <div className="mt-4 grid gap-3">
            {lines.length === 0 ? (
              <p className="text-[12px]" style={{ color: theme.muted }}>No items yet. Add products to preview the full order summary.</p>
            ) : lines.map((line) => (
              <div key={line.product.id} className="flex items-center justify-between gap-3 text-[12px]">
                <span style={{ color: theme.muted }}>{line.product.name} x {line.qty}</span>
                <strong style={{ color: theme.ink }}>{formatMoney(parsePrice(line.product.price) * line.qty, samplePrice)}</strong>
              </div>
            ))}
          </div>
          <div className="mt-4 border-t pt-4" style={{ borderColor: theme.line }}>
            <div className="flex justify-between text-[14px] font-bold" style={{ color: theme.ink }}>
              <span>Total</span>
              <span>{formatMoney(subtotal, samplePrice)}</span>
            </div>
          </div>
          <div className="mt-4 rounded-[12px] p-3 text-[11px] leading-5" style={{ background: rgba(theme.accent, 0.14), color: theme.ink }}>
            Rex can connect the real payment provider and delivery options during launch setup.
          </div>
        </aside>
      </div>
    </section>
  );
}

export function StorePreview({
  store,
  changed,
  device = "desktop",
  variant = "classic",
  currentPage,
  onPageChange,
  pages,
}: StorePreviewProps) {
  void changed;
  const theme = useMemo(() => makeTheme(store, variant), [store, variant]);
  const products = useMemo(() => buildProducts(store), [store]);
  const navItems = useMemo(() => buildNavItems(store, pages), [store, pages]);
  const [internalPage, setInternalPage] = useState(normalizePage(currentPage));
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [modalProductId, setModalProductId] = useState<string | null>(null);

  useEffect(() => {
    if (currentPage) setInternalPage(normalizePage(currentPage));
  }, [currentPage]);

  const activePage = normalizePage(currentPage ?? internalPage);
  const cartLines = Object.values(cart);
  const cartCount = cartLines.reduce((sum, line) => sum + line.qty, 0);
  const modalProduct = products.find((product) => product.id === modalProductId) ?? null;
  const samplePrice = products[0]?.price ?? "NGN 0";

  function navigate(page: string) {
    const next = normalizePage(page);
    setInternalPage(next);
    onPageChange?.(next);
  }

  function addToCart(product: PreviewProduct, qty = 1) {
    setCart((prev) => {
      const existing = prev[product.id];
      return {
        ...prev,
        [product.id]: {
          product,
          qty: Math.max(1, (existing?.qty ?? 0) + qty),
        },
      };
    });
  }

  function setLineQty(id: string, qty: number) {
    setCart((prev) => {
      if (qty <= 0) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      if (!prev[id]) return prev;
      return { ...prev, [id]: { ...prev[id], qty } };
    });
  }

  function removeLine(id: string) {
    setCart((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function toggleWishlist(product: PreviewProduct) {
    setWishlist((prev) => prev.includes(product.id) ? prev.filter((id) => id !== product.id) : [...prev, product.id]);
  }

  function openProduct(product: PreviewProduct) {
    setModalProductId(product.id);
  }

  function renderPage() {
    if (activePage.startsWith("product:")) {
      const id = activePage.split(":")[1];
      const product = products.find((item) => item.id === id) ?? products[0];
      if (!product) return null;
      return (
        <ProductDetailPage
          product={product}
          products={products}
          theme={theme}
          onBack={() => navigate("products")}
          onAdd={addToCart}
          onWishlist={toggleWishlist}
          wished={wishlist.includes(product.id)}
          onOpen={openProduct}
        />
      );
    }

    if (activePage === "products") {
      return <ProductsPage theme={theme} products={products} onOpen={openProduct} onAdd={addToCart} onWishlist={toggleWishlist} wishlist={wishlist} />;
    }
    if (activePage === "about") return <AboutPage store={store} theme={theme} onNavigate={navigate} />;
    if (activePage === "contact") return <ContactPage theme={theme} />;
    if (activePage === "faq") return <FaqPage theme={theme} />;
    if (activePage === "blog") return <BlogPage store={store} theme={theme} />;
    if (activePage === "cart") return <CartPage theme={theme} lines={cartLines} onQty={setLineQty} onRemove={removeLine} onNavigate={navigate} samplePrice={samplePrice} />;
    if (activePage === "checkout") return <CheckoutPage theme={theme} lines={cartLines} samplePrice={samplePrice} />;
    if (activePage !== "home") return <GenericPage page={activePage} store={store} theme={theme} onNavigate={navigate} />;

    return (
      <HomePage
        store={store}
        theme={theme}
        products={products}
        device={device}
        onNavigate={navigate}
        onOpen={openProduct}
        onAdd={addToCart}
        onWishlist={toggleWishlist}
        wishlist={wishlist}
      />
    );
  }

  return (
    <div
      className="relative overflow-hidden border bg-white"
      style={{
        borderColor: theme.line,
        borderRadius: 14,
        color: theme.ink,
        fontFamily: theme.bodyFont,
        minHeight: device === "mobile" ? 720 : 760,
      }}
    >
      <StoreNav
        store={store}
        theme={theme}
        device={device}
        navItems={navItems}
        activePage={activePage}
        cartCount={cartCount}
        wishlistCount={wishlist.length}
        onNavigate={navigate}
      />

      <main>{renderPage()}</main>

      <StoreFooter store={store} theme={theme} onNavigate={navigate} />

      {modalProduct && (
        <ProductModal
          product={modalProduct}
          theme={theme}
          wished={wishlist.includes(modalProduct.id)}
          onClose={() => setModalProductId(null)}
          onWishlist={() => toggleWishlist(modalProduct)}
          onAdd={() => addToCart(modalProduct)}
          onViewPage={() => {
            setModalProductId(null);
            navigate(`product:${modalProduct.id}`);
          }}
        />
      )}
    </div>
  );
}
