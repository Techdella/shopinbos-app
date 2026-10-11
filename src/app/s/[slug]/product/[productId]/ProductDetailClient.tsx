"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "@/hooks/useCart";
import { useWishlist } from "@/hooks/useWishlist";
import { getPublicStorefrontPath } from "@/lib/domains/storefront";
import { useState } from "react";
import { useStoreVisitBeacon } from "@/hooks/useStoreVisitor";
import { useCampaignAttribution } from "@/hooks/useCampaignAttribution";
import { CartDrawer } from "../../CartDrawer";
import { ShopperBottomNav } from "@/components/storefront/shopper/ShopperBottomNav";
import type { ShopperProduct } from "@/components/storefront/shopper/catalog";

interface Review {
  id: string;
  productId: string;
  buyerName: string;
  rating: number;
  title: string;
  body: string;
  sellerReply: string;
  repliedAt: string | null;
  createdAt: string;
}

interface ProductDetailClientProps {
  store: {
    id: string;
    name: string;
    slug: string;
    description?: string | null;
    logoUrl?: string | null;
    city?: string | null;
    country?: string | null;
    currency: string;
    brandSettings: any;
  };
  product: {
    id: string;
    name: string;
    description?: string | null;
    images: string[];
    retailPrice: number;
    currency: string;
    sku?: string | null;
    category?: { id: string; name: string; slug: string } | null;
    variants?: any;
  };
  reviews: Review[];
  avgRating: number;
  reviewCount: number;
  ratingCounts: number[];
  storeBasePath: string;
  /** The store's published products, for the phone bottom nav's search and wishlist. */
  catalog?: ShopperProduct[];
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function Stars({ rating, size = 20 }: { rating: number; size?: number }) {
  return (
    <span style={{ color: "#c9a96e", fontSize: size, lineHeight: 1 }}>
      {"★".repeat(Math.round(rating))}{"☆".repeat(5 - Math.round(rating))}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
}

type ProductVariant = {
  id?: string;
  name?: string;
  sku?: string;
  price?: number;
  color?: string;
  size?: string;
  imageUrl?: string;
  images?: string[];
  customFields?: Array<{ name?: string; value?: string }>;
  stock?: number;
};

function readVariants(value: unknown): ProductVariant[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is ProductVariant => !!item && typeof item === "object")
    .map((item) => item as ProductVariant)
    .filter((item) => item.name || item.color || item.size || item.sku);
}

function variantLabel(variant: ProductVariant) {
  return [variant.name, variant.color, variant.size].filter(Boolean).join(" / ") || variant.sku || "Variant";
}

const CART_LABELS: Record<string, string> = {
  add_to_cart: "Add to Cart",
  bag: "Add to Bag",
  basket: "Add to Basket",
  buy_now: "Buy Now",
  order_now: "Order Now",
};

export function ProductDetailClient({
  store, product, reviews, avgRating, reviewCount, ratingCounts, storeBasePath, catalog = [],
}: ProductDetailClientProps) {
  const [cartOpen, setCartOpen] = useState(false);
  const router = useRouter();
  const cart = useCart(store.slug);
  useCampaignAttribution(store.slug);
  useStoreVisitBeacon(store.slug);
  const wishlist = useWishlist(store.slug);
  const [selectedImage, setSelectedImage] = useState(0);
  const variants = readVariants(product.variants);
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);
  const [added, setAdded] = useState(false);
  const selectedVariant = variants[selectedVariantIndex] ?? null;
  const currentPrice = selectedVariant?.price ?? product.retailPrice;
  const currentSku = selectedVariant?.sku ?? product.sku;
  const variantImages = selectedVariant?.images?.filter(Boolean) ?? [];
  const currentImage = selectedVariant?.imageUrl ?? variantImages[0];
  const isWished = wishlist.productIds.includes(product.id);
  const selectedVariantFields = selectedVariant?.customFields?.filter((field) => field.name || field.value) ?? [];

  const cartConfig = store.brandSettings?.cartConfig && typeof store.brandSettings?.cartConfig === "object"
    ? store.brandSettings.cartConfig as Record<string, string | boolean>
    : {};
  const addToCartLabel = String(cartConfig.addToCartLabel || "add_to_cart");
  const addToCartBehavior = String(cartConfig.addToCartBehavior || "drawer");
  const enableWishlist = cartConfig.enableWishlist !== false;
  const buttonLabel = CART_LABELS[addToCartLabel] ?? "Add to Cart";

  const selectedStock = typeof selectedVariant?.stock === "number" ? selectedVariant.stock : null;

  function handleAdd() {
    if (selectedStock !== null && selectedStock <= 0) return;
    cart.add({
      productId: product.id,
      name: selectedVariant ? `${product.name} - ${variantLabel(selectedVariant)}` : product.name,
      price: currentPrice,
      image: currentImage ?? product.images[0],
      variant: selectedVariant ? variantLabel(selectedVariant) : undefined,
      maxQuantity: selectedStock ?? undefined,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
    if (addToCartBehavior === "drawer") setCartOpen(true);
    if (addToCartBehavior === "checkout") {
      router.push(getPublicStorefrontPath(storeBasePath, "/checkout"));
    }
  }

  function handleBuyNow() {
    if (selectedStock !== null && selectedStock <= 0) return;
    cart.clear();
    cart.add({
      productId: product.id,
      name: selectedVariant ? `${product.name} - ${variantLabel(selectedVariant)}` : product.name,
      price: currentPrice,
      image: currentImage ?? product.images[0],
      variant: selectedVariant ? variantLabel(selectedVariant) : undefined,
      maxQuantity: selectedStock ?? undefined,
      quantity: 1,
    });
    router.push(getPublicStorefrontPath(storeBasePath, "/checkout"));
  }

  const baseImages = currentImage
    ? [currentImage, ...variantImages.filter((image) => image !== currentImage), ...product.images.filter((image) => image !== currentImage && !variantImages.includes(image))]
    : product.images;
  const allImages = baseImages.length > 0 ? baseImages : [
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='900' height='900' viewBox='0 0 900 900'%3E%3Crect width='900' height='900' fill='%23f3efe9'/%3E%3Ctext x='450' y='460' font-family='Arial, sans-serif' font-size='30' text-anchor='middle' fill='%236a6a6a'%3ENo image%3C/text%3E%3C/svg%3E",
  ];

  const theme = store.brandSettings?.palette ?? {};
  const accent = theme.accent ?? "#c9a96e";
  const paperBg = theme.paperBg ?? "#faf8f5";
  const ink = theme.ink ?? "#0c0c0c";
  const border = theme.border ?? "#e8e2d9";

  return (
    <div style={{ background: paperBg, minHeight: "100vh", color: ink, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <style>{`
        *,*:before,*:after{box-sizing:border-box}
        .pd-review-card{border:1px solid ${border};border-radius:10px;padding:20px;background:white}
        .pd-review-card+.pd-review-card{margin-top:14px}
        .pd-stars{color:#c9a96e}
        @media(max-width:760px){.pd-grid{grid-template-columns:1fr !important;gap:24px !important}.pd-main-img{height:auto !important;aspect-ratio:1/1}.pd-page{padding-bottom:110px !important}}
      `}</style>

      <nav style={{ borderBottom: `1px solid ${border}`, background: "white", position: "sticky", top: 0, zIndex: 20 }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px", height: 60, display: "flex", alignItems: "center", gap: 12 }}>
          <Link href={getPublicStorefrontPath(storeBasePath, "/")} style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 10 }}>
            {store.logoUrl && <img src={store.logoUrl} alt={store.name} style={{ width: 26, height: 26, borderRadius: 6, objectFit: "cover" }} />}
            <span style={{ fontWeight: 700, fontSize: 15, color: ink }}>{store.name}</span>
          </Link>
          <span style={{ color: border, margin: "0 4px" }}>/</span>
          {product.category ? (
            <Link href={getPublicStorefrontPath(storeBasePath, "/")} style={{ textDecoration: "none", color: "#6a6a6a", fontSize: 13 }}>
              {product.category.name}
            </Link>
          ) : null}
          <span style={{ color: border, margin: "0 4px" }}>/</span>
          <span style={{ fontSize: 13, color: "#6a6a6a" }}>{product.name}</span>
        </div>
      </nav>

      <div className="pd-page" style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px 60px" }}>
        <div className="pd-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, marginBottom: 60 }}>
          <div>
            <div style={{ borderRadius: 12, overflow: "hidden", background: "#f3efe9", marginBottom: 12 }}>
              <img className="pd-main-img" src={allImages[selectedImage]} alt={product.name} style={{ width: "100%", height: 480, objectFit: "cover", display: "block" }} />
            </div>
            {allImages.length > 1 ? (
              <div style={{ display: "flex", gap: 8 }}>
                {allImages.map((img, i) => (
                  <button key={i} onClick={() => setSelectedImage(i)}
                    style={{ width: 64, height: 64, borderRadius: 8, overflow: "hidden", border: i === selectedImage ? `2px solid ${accent}` : "2px solid transparent", background: "#f3efe9", padding: 0, cursor: "pointer" }}>
                    <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div>
            {product.category ? (
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#a8a8a8", marginBottom: 8 }}>
                {product.category.name}
              </div>
            ) : null}
            <h1 style={{ margin: "0 0 8px", fontSize: 32, fontWeight: 600, lineHeight: 1.2 }}>{product.name}</h1>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
              {reviewCount > 0 ? (
                <>
                  <Stars rating={avgRating} size={16} />
                  <span style={{ fontSize: 13, color: "#6a6a6a" }}>{avgRating.toFixed(1)} ({reviewCount} {reviewCount === 1 ? "review" : "reviews"})</span>
                </>
              ) : (
                <span style={{ fontSize: 13, color: "#a8a8a8" }}>No reviews yet</span>
              )}
            </div>

            <div style={{ fontSize: 28, fontWeight: 700, color: ink, marginBottom: 24 }}>
              {money(currentPrice, product.currency)}
            </div>

            <p style={{ margin: "0 0 28px", fontSize: 14, lineHeight: 1.7, color: "#4a4a4a" }}>
              {product.description || "No description available."}
            </p>

            {variants.length > 0 ? (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: "#6a6a6a", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 10 }}>Options</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {variants.map((variant, index) => {
                    const selected = index === selectedVariantIndex;
                    const disabled = typeof variant.stock === "number" && variant.stock <= 0;
                    return (
                      <button
                        key={`${variant.id ?? variant.sku ?? variantLabel(variant)}-${index}`}
                        type="button"
                        onClick={() => {
                          setSelectedVariantIndex(index);
                          setSelectedImage(0);
                        }}
                        disabled={disabled}
                        style={{
                          border: selected ? `1.5px solid ${accent}` : `1px solid ${border}`,
                          color: selected ? ink : "#6a6a6a",
                          background: selected ? `${accent}18` : "#fff",
                          borderRadius: 999,
                          padding: "9px 13px",
                          fontSize: 12.5,
                          fontWeight: 700,
                          cursor: disabled ? "not-allowed" : "pointer",
                          opacity: disabled ? 0.45 : 1,
                        }}
                      >
                        {variantLabel(variant)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {currentSku ? (
              <div style={{ fontSize: 12, color: "#a8a8a8", marginBottom: 16 }}>SKU: {currentSku}</div>
            ) : null}

            {selectedVariantFields.length > 0 ? (
              <div style={{ marginBottom: 20, border: `1px solid ${border}`, borderRadius: 10, background: "#fff", overflow: "hidden" }}>
                <div style={{ padding: "10px 12px", borderBottom: `1px solid ${border}`, fontSize: 12, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: "#6a6a6a" }}>
                  Variant details
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))" }}>
                  {selectedVariantFields.map((field, index) => (
                    <div key={`${field.name}-${index}`} style={{ padding: "10px 12px", borderTop: index > 1 ? `1px solid ${border}` : "none", borderLeft: index % 2 ? `1px solid ${border}` : "none" }}>
                      <div style={{ fontSize: 11, color: "#a8a8a8", marginBottom: 3 }}>{field.name}</div>
                      <div style={{ fontSize: 13, color: ink, fontWeight: 700 }}>{field.value || "—"}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {selectedStock !== null && selectedStock <= 0 ? (
              <div style={{ padding: "12px 18px", background: "#fef2f2", border: "1px solid #fee2e2", borderRadius: 8, color: "#991b1b", fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
                Out of stock
              </div>
            ) : selectedStock !== null && selectedStock <= 5 ? (
              <div style={{ fontSize: 12, color: "#d97706", fontWeight: 600, margin: "0 0 8px" }}>
                Only {selectedStock} left in stock
              </div>
            ) : null}

            {addToCartLabel === "buy_now" ? (
              <button onClick={handleBuyNow}
                disabled={selectedStock !== null && selectedStock <= 0}
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px 36px", borderRadius: 8, background: accent, color: "white", border: "none", fontSize: 14, fontWeight: 700, cursor: selectedStock !== null && selectedStock <= 0 ? "not-allowed" : "pointer", opacity: selectedStock !== null && selectedStock <= 0 ? 0.6 : 1, transition: "background .2s", width: "100%" }}>
                {buttonLabel}
              </button>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                <button onClick={handleAdd}
                  disabled={selectedStock !== null && selectedStock <= 0}
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px 36px", borderRadius: 8, background: added ? "#2d7a4f" : accent, color: "white", border: "none", fontSize: 14, fontWeight: 700, cursor: selectedStock !== null && selectedStock <= 0 ? "not-allowed" : "pointer", opacity: selectedStock !== null && selectedStock <= 0 ? 0.5 : 1, transition: "background .2s" }}>
                  {added ? "Added" : buttonLabel}
                </button>
                {enableWishlist ? (
                  <button onClick={() => void wishlist.toggle(product.id)}
                    style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px 22px", borderRadius: 8, background: "#fff", color: ink, border: `1px solid ${border}`, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                    {isWished ? "Saved" : "Save"}
                  </button>
                ) : null}
                <button onClick={handleBuyNow}
                  disabled={selectedStock !== null && selectedStock <= 0}
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px 26px", borderRadius: 8, background: "#fff", color: ink, border: `1px solid ${border}`, fontSize: 14, fontWeight: 700, cursor: selectedStock !== null && selectedStock <= 0 ? "not-allowed" : "pointer", opacity: selectedStock !== null && selectedStock <= 0 ? 0.5 : 1 }}>
                  Buy Now
                </button>
              </div>
            )}

            <div style={{ marginTop: 22, display: "grid", gap: 8, fontSize: 13, color: "#6a6a6a" }}>
              <span>Secure payment at checkout</span>
              <span>Delivery options calculated by location</span>
              <span>Returns and support policies visible before payment</span>
            </div>
          </div>
        </div>

        {reviewCount > 0 ? (
          <section>
            <h2 style={{ fontSize: 22, fontWeight: 600, margin: "0 0 24px" }}>Customer Reviews</h2>

            <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 40, marginBottom: 32 }}>
              <div style={{ textAlign: "center", padding: 24, border: `1px solid ${border}`, borderRadius: 10, background: "white" }}>
                <div style={{ fontSize: 48, fontWeight: 700, color: ink, lineHeight: 1 }}>{avgRating.toFixed(1)}</div>
                <div style={{ margin: "8px 0" }}><Stars rating={avgRating} size={22} /></div>
                <div style={{ fontSize: 13, color: "#6a6a6a" }}>{reviewCount} {reviewCount === 1 ? "review" : "reviews"}</div>
                <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 4 }}>
                  {[5, 4, 3, 2, 1].map((star) => (
                    <div key={star} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                      <span style={{ color: "#c9a96e", minWidth: 24 }}>{star}★</span>
                      <div style={{ flex: 1, height: 6, background: border, borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${reviewCount > 0 ? (ratingCounts[star - 1] / reviewCount) * 100 : 0}%`, height: "100%", background: "#c9a96e", borderRadius: 3 }} />
                      </div>
                      <span style={{ color: "#6a6a6a", minWidth: 20, textAlign: "right" }}>{ratingCounts[star - 1]}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                {reviews.map((review) => (
                  <div key={review.id} className="pd-review-card">
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#f3efe9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#6a6a6a" }}>
                        {review.buyerName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{review.buyerName}</div>
                        <div style={{ fontSize: 11, color: "#a8a8a8" }}>{formatDate(review.createdAt)}</div>
                      </div>
                      <div style={{ marginLeft: "auto" }}><Stars rating={review.rating} size={14} /></div>
                    </div>
                    {review.title ? <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{review.title}</div> : null}
                    {review.body ? <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "#4a4a4a" }}>{review.body}</p> : null}
                    {review.sellerReply ? (
                      <div style={{ marginTop: 12, padding: "10px 14px", background: "#f9f9f7", borderRadius: 8, borderLeft: `3px solid ${accent}` }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#6a6a6a", marginBottom: 4 }}>{store.name} replied {review.repliedAt ? formatDate(review.repliedAt) : ""}</div>
                        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "#4a4a4a" }}>{review.sellerReply}</p>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : (
          <section style={{ textAlign: "center", padding: "60px 24px", border: `1px solid ${border}`, borderRadius: 12, background: "white" }}>
            <div style={{ fontSize: 42, marginBottom: 12 }}>🛍️</div>
            <h2 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 8px" }}>No reviews yet</h2>
            <p style={{ fontSize: 14, color: "#6a6a6a", margin: 0 }}>Be the first to review this product.</p>
          </section>
        )}

        <div style={{ marginTop: 40, textAlign: "center" }}>
          <Link href={getPublicStorefrontPath(storeBasePath, "/")}
            style={{ display: "inline-block", padding: "13px 32px", borderRadius: 8, background: accent, color: "white", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>
            Continue Shopping
          </Link>
        </div>
      </div>

      <ShopperBottomNav
        storeSlug={store.slug}
        storeName={store.name}
        basePath={storeBasePath}
        products={catalog.some((entry) => entry.id === product.id) ? catalog : [product, ...catalog]}
        wishlistIds={wishlist.productIds}
        onToggleWishlist={wishlist.toggle}
        cartCount={cart.count}
        onOpenBag={() => setCartOpen(true)}
        colors={{ active: ink, activeText: "#ffffff", badge: accent }}
      />
      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        cart={cart}
        storeBasePath={storeBasePath}
        currency={store.currency}
        accentColor={accent}
        accentTextColor="#ffffff"
      />
    </div>
  );
}
