"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type React from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { getPublicStorefrontPath } from "@/lib/domains/storefront";
import { formatStoreMoney } from "@/lib/storefront/shopper-info";
import { productCategories, searchProducts, type ShopperProduct } from "./catalog";

// The phone shopper journey every storefront theme shares: a floating bottom bar with Home, Search,
// Wishlist (count), Bag (count) and Account, plus the sheets behind Search, Wishlist and Account.

export type ShopperSheet = "search" | "wishlist" | "account" | null;

export interface ShopperNavColors {
  /** Bar background and its text. */
  bar: string;
  barText: string;
  /** Active pill and its text. */
  active: string;
  activeText: string;
  /** Count badges. */
  badge: string;
  badgeText: string;
  /** Sheet surface. */
  sheet: string;
  ink: string;
  muted: string;
  border: string;
}

export const DEFAULT_SHOPPER_NAV_COLORS: ShopperNavColors = {
  bar: "#FFFFFF",
  barText: "#2A2420",
  active: "#2A2420",
  activeText: "#FFFFFF",
  badge: "#F26B2B",
  badgeText: "#FFFFFF",
  sheet: "#FFFFFF",
  ink: "#1A1A18",
  muted: "#6E6E68",
  border: "#E6E1D8",
};

interface Props {
  storeSlug: string;
  storeName: string;
  basePath: string;
  products: ShopperProduct[];
  wishlistIds: string[];
  onToggleWishlist?: (productId: string) => void;
  cartCount: number;
  onOpenBag?: () => void;
  /** Home: defaults to a link to the storefront home. */
  onHome?: () => void;
  colors?: Partial<ShopperNavColors>;
  /** "fixed" floats over the page on phones (hidden from md up); "inline" sits at the bottom of an editor preview. */
  placement?: "fixed" | "inline";
  /** Editor and template previews show the bar without doing anything. */
  interactive?: boolean;
  /** Opens the search sheet with this query (the storefront's ?q= link). */
  initialQuery?: string;
  activeTab?: "home" | "search" | "wishlist" | "bag" | "account";
  /** Controlled sheet, so a desktop header search or wishlist button can open the same sheets. */
  sheet?: ShopperSheet;
  onSheetChange?: (sheet: ShopperSheet) => void;
}

function productHref(basePath: string, id: string) {
  return getPublicStorefrontPath(basePath, `/product/${id}`);
}

function Thumb({ src, alt, colors }: { src?: string; alt: string; colors: ShopperNavColors }) {
  return (
    <span className="block h-14 w-14 shrink-0 overflow-hidden rounded-[10px]" style={{ background: colors.border }}>
      {src ? <img src={src} alt={alt} width={56} height={56} loading="lazy" className="h-full w-full object-cover" /> : null}
    </span>
  );
}

function Sheet({
  title,
  onClose,
  colors,
  children,
}: {
  title: string;
  onClose: () => void;
  colors: ShopperNavColors;
  children: React.ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>("input, button, a[href]");
    first?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeRef.current();
      if (event.key === "Tab" && panel) {
        const focusable = [...panel.querySelectorAll<HTMLElement>("input, button, a[href], select, textarea")].filter((el) => !el.hasAttribute("disabled"));
        if (!focusable.length) return;
        const firstEl = focusable[0]!;
        const lastEl = focusable[focusable.length - 1]!;
        if (event.shiftKey && document.activeElement === firstEl) {
          event.preventDefault();
          lastEl.focus();
        } else if (!event.shiftKey && document.activeElement === lastEl) {
          event.preventDefault();
          firstEl.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-center" role="presentation">
      <button type="button" aria-label="Close" tabIndex={-1} className="absolute inset-0 h-full w-full cursor-default bg-black/40" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[85vh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-[24px] shadow-2xl md:rounded-[24px]"
        style={{ background: colors.sheet, color: colors.ink }}
      >
        <div className="flex items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: colors.border }}>
          <h2 id={titleId} className="text-[17px] font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" style={{ background: colors.border }} aria-label={`Close ${title.toLowerCase()}`}>
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4" style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>{children}</div>
      </div>
    </div>
  );
}

function SearchSheet({ props, colors, onClose }: { props: Props; colors: ShopperNavColors; onClose: () => void }) {
  const [query, setQuery] = useState(props.initialQuery ?? "");
  const results = useMemo(() => searchProducts(props.products, query).slice(0, 24), [props.products, query]);
  const categories = useMemo(() => productCategories(props.products).slice(0, 8), [props.products]);
  const inputId = useId();
  return (
    <Sheet title="Search" onClose={onClose} colors={colors}>
      <form role="search" onSubmit={(event) => event.preventDefault()}>
        <label htmlFor={inputId} className="sr-only">Search {props.storeName}</label>
        <div className="flex items-center gap-2 rounded-full border px-4" style={{ borderColor: colors.border }}>
          <Icon name="search" size={16} color={colors.muted} />
          <input
            id={inputId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${props.storeName}`}
            className="h-11 w-full bg-transparent text-[15px] outline-none"
            autoComplete="off"
            enterKeyHint="search"
          />
        </div>
      </form>
      {!query.trim() && categories.length ? (
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Categories">
          {categories.map((category) => (
            <button key={category.slug} type="button" onClick={() => setQuery(category.name)} className="rounded-full border px-3.5 py-1.5 text-[13px] font-medium focus-visible:outline focus-visible:outline-2" style={{ borderColor: colors.border }}>
              {category.name}
            </button>
          ))}
        </div>
      ) : null}
      <p className="mt-4 text-[12px]" style={{ color: colors.muted }} aria-live="polite">
        {query.trim() ? `${results.length} ${results.length === 1 ? "result" : "results"}` : `${props.products.length} products`}
      </p>
      <ul className="mt-2 grid gap-1">
        {results.map((product) => (
          <li key={product.id}>
            <Link href={productHref(props.basePath, product.id)} onClick={onClose} className="flex items-center gap-3 rounded-[14px] p-2 focus-visible:outline focus-visible:outline-2">
              <Thumb src={product.images[0]} alt="" colors={colors} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium">{product.name}</span>
                <span className="block text-[13px]" style={{ color: colors.muted }}>{formatStoreMoney(product.retailPrice, product.currency)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {query.trim() && results.length === 0 ? <p className="py-6 text-center text-[14px]" style={{ color: colors.muted }}>Nothing matches “{query.trim()}”. Try a shorter word.</p> : null}
    </Sheet>
  );
}

function WishlistSheet({ props, colors, onClose }: { props: Props; colors: ShopperNavColors; onClose: () => void }) {
  const saved = props.products.filter((product) => props.wishlistIds.includes(product.id));
  return (
    <Sheet title={`Wishlist (${props.wishlistIds.length})`} onClose={onClose} colors={colors}>
      {saved.length === 0 ? (
        <p className="py-6 text-center text-[14px]" style={{ color: colors.muted }}>
          Tap the heart on any product to save it here.
        </p>
      ) : (
        <ul className="grid gap-1">
          {saved.map((product) => (
            <li key={product.id} className="flex items-center gap-3 rounded-[14px] p-2">
              <Link href={productHref(props.basePath, product.id)} onClick={onClose} className="flex min-w-0 flex-1 items-center gap-3 focus-visible:outline focus-visible:outline-2">
                <Thumb src={product.images[0]} alt="" colors={colors} />
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-medium">{product.name}</span>
                  <span className="block text-[13px]" style={{ color: colors.muted }}>{formatStoreMoney(product.retailPrice, product.currency)}</span>
                </span>
              </Link>
              {props.onToggleWishlist ? (
                <button type="button" onClick={() => props.onToggleWishlist?.(product.id)} className="rounded-full border px-3 py-1.5 text-[12px] font-medium focus-visible:outline focus-visible:outline-2" style={{ borderColor: colors.border }} aria-label={`Remove ${product.name} from wishlist`}>
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

function AccountSheet({ props, colors, onClose }: { props: Props; colors: ShopperNavColors; onClose: () => void }) {
  const router = useRouter();
  const [orderNumber, setOrderNumber] = useState("");
  const [contact, setContact] = useState("");
  const [status, setStatus] = useState<"idle" | "looking" | "error">("idle");
  const [message, setMessage] = useState("");
  const orderId = useId();
  const contactId = useId();

  async function lookup(event: React.FormEvent) {
    event.preventDefault();
    if (!props.interactive) return;
    setStatus("looking");
    setMessage("");
    try {
      const response = await fetch(`/api/public/store/${encodeURIComponent(props.storeSlug)}/orders/lookup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber, contact }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.data?.orderId) {
        setStatus("error");
        setMessage(json?.error?.message ?? "We couldn't find that order.");
        return;
      }
      onClose();
      router.push(getPublicStorefrontPath(props.basePath, `/order/${json.data.orderId}`));
    } catch {
      setStatus("error");
      setMessage("Couldn't reach the store. Check your connection and try again.");
    }
  }

  return (
    <Sheet title="Track an order" onClose={onClose} colors={colors}>
      <p className="text-[14px] leading-6" style={{ color: colors.muted }}>
        Enter the order number from your confirmation message and the email or phone number you ordered with.
      </p>
      <form onSubmit={lookup} className="mt-4 grid gap-3">
        <div>
          <label htmlFor={orderId} className="text-[13px] font-medium">Order number</label>
          <input id={orderId} value={orderNumber} onChange={(event) => setOrderNumber(event.target.value)} required minLength={4} placeholder="SB-…" autoCapitalize="characters" className="mt-1 h-11 w-full rounded-[12px] border bg-transparent px-3 text-[15px]" style={{ borderColor: colors.border }} />
        </div>
        <div>
          <label htmlFor={contactId} className="text-[13px] font-medium">Email or phone</label>
          <input id={contactId} value={contact} onChange={(event) => setContact(event.target.value)} required minLength={4} autoComplete="email" className="mt-1 h-11 w-full rounded-[12px] border bg-transparent px-3 text-[15px]" style={{ borderColor: colors.border }} />
        </div>
        {status === "error" ? <p role="alert" className="text-[13px]" style={{ color: "#B42318" }}>{message}</p> : null}
        <button type="submit" disabled={status === "looking"} className="h-11 rounded-full text-[14px] font-semibold disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" style={{ background: colors.active, color: colors.activeText }}>
          {status === "looking" ? "Looking…" : "Find my order"}
        </button>
      </form>
    </Sheet>
  );
}

export function ShopperBottomNav(props: Props) {
  const colors = { ...DEFAULT_SHOPPER_NAV_COLORS, ...props.colors };
  const interactive = props.interactive !== false;
  const [ownSheet, setOwnSheet] = useState<ShopperSheet>(props.initialQuery && interactive ? "search" : null);
  const sheet = props.sheet !== undefined ? props.sheet : ownSheet;
  const setSheet = (next: ShopperSheet) => {
    setOwnSheet(next);
    props.onSheetChange?.(next);
  };
  const placement = props.placement ?? "fixed";

  // A ?q= search link (the storefront's SearchAction) opens search once the query is known.
  useEffect(() => {
    if (props.initialQuery && interactive) setSheet("search");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.initialQuery, interactive]);
  const active = sheet === "search" ? "search" : sheet === "wishlist" ? "wishlist" : sheet === "account" ? "account" : props.activeTab ?? null;

  const items: Array<{ key: "home" | "search" | "wishlist" | "bag" | "account"; label: string; icon: IconName; count?: number; onClick: () => void }> = [
    { key: "home", label: "Home", icon: "home", onClick: () => (props.onHome ? props.onHome() : undefined) },
    { key: "search", label: "Search", icon: "search", onClick: () => setSheet("search") },
    { key: "wishlist", label: "Wishlist", icon: "heart", count: props.wishlistIds.length, onClick: () => setSheet("wishlist") },
    { key: "bag", label: "Bag", icon: "bag", count: props.cartCount, onClick: () => props.onOpenBag?.() },
    { key: "account", label: "Account", icon: "user", onClick: () => setSheet("account") },
  ];

  const wrapperClass =
    placement === "fixed"
      ? "fixed inset-x-0 bottom-0 z-40 px-3 md:hidden"
      : "sticky bottom-0 z-30 px-3";

  return (
    <>
      <nav aria-label="Shop" className={wrapperClass} style={{ paddingBottom: placement === "fixed" ? "max(12px, env(safe-area-inset-bottom))" : 12 }}>
        <ul className="mx-auto flex max-w-[480px] items-center justify-between gap-1 rounded-full p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.18)]" style={{ background: colors.bar, color: colors.barText }}>
          {items.map((item) => {
            const isActive = active === item.key;
            const content = (
              <>
                <span className="relative inline-flex">
                  <Icon name={item.icon} size={20} />
                  {item.count ? (
                    <span className="absolute -right-2.5 -top-2 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-bold leading-none" style={{ background: colors.badge, color: colors.badgeText }}>
                      {item.count > 99 ? "99+" : item.count}
                    </span>
                  ) : null}
                </span>
                <span className={isActive ? "text-[13px] font-semibold" : "sr-only"}>{item.label}</span>
                {item.count && !isActive ? <span className="sr-only">, {item.count} {item.key === "bag" ? "items" : "saved"}</span> : null}
              </>
            );
            const className = `flex h-12 items-center justify-center gap-2 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${isActive ? "px-4" : "w-12"}`;
            const style = isActive ? { background: colors.active, color: colors.activeText } : undefined;
            if (item.key === "home" && !props.onHome && interactive) {
              return (
                <li key={item.key}>
                  <Link href={getPublicStorefrontPath(props.basePath, "/")} className={className} style={style} aria-current={isActive ? "page" : undefined} aria-label={isActive ? undefined : item.label}>
                    {content}
                  </Link>
                </li>
              );
            }
            return (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={interactive ? item.onClick : undefined}
                  aria-disabled={interactive ? undefined : true}
                  className={className}
                  style={style}
                  aria-label={isActive ? undefined : item.label}
                  aria-current={isActive && item.key === "home" ? "page" : undefined}
                  aria-haspopup={item.key === "search" || item.key === "wishlist" || item.key === "account" ? "dialog" : undefined}
                >
                  {content}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      {interactive && sheet === "search" ? <SearchSheet props={props} colors={colors} onClose={() => setSheet(null)} /> : null}
      {interactive && sheet === "wishlist" ? <WishlistSheet props={props} colors={colors} onClose={() => setSheet(null)} /> : null}
      {interactive && sheet === "account" ? <AccountSheet props={{ ...props, interactive }} colors={colors} onClose={() => setSheet(null)} /> : null}
    </>
  );
}
