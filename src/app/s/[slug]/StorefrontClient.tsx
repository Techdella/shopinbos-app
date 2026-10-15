"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStoreVisitBeacon } from "@/hooks/useStoreVisitor";
import { rewardTiersFor } from "@/lib/gamification/logic";
import { useCampaignAttribution } from "@/hooks/useCampaignAttribution";
import type { MouseEvent } from "react";
import Link from "next/link";
import { CartDrawer } from "./CartDrawer";
import { MarketingMount } from "@/components/storefront/marketing/MarketingMount";
import { themeHeadingFont } from "@/lib/marketing/forms";
import { TemplateStorefrontSurface } from "@/components/storefront/TemplateStorefrontSurface";
import { ShopperBottomNav } from "@/components/storefront/shopper/ShopperBottomNav";
import { freeDeliveryEverywhereOver, readShopperInfo } from "@/lib/storefront/shopper-info";
import { useCart } from "@/hooks/useCart";
import { useWishlist } from "@/hooks/useWishlist";
import { getPublicStorefrontPath } from "@/lib/domains/storefront";
import { needsOptions } from "@/components/storefront/shopper/catalog";
import { readCartSettings } from "@shared/cart-checkout";
import {
  createSnapshotFromTemplate,
  getTemplateManifest,
  isBoutiqueTheme,
  STORE_TEMPLATE_MANIFESTS,
  type StoreEditorSnapshot,
} from "@/lib/store-templates";

interface StoreProduct {
  id: string;
  name: string;
  description?: string | null;
  images: string[];
  retailPrice: number;
  compareAtPrice?: number | null;
  variants?: unknown;
  supplierProduct?: { stockQuantity?: number | null } | null;
  currency: string;
  category?: { id: string; name: string; slug: string } | null;
  avgRating?: number;
  reviewCount?: number;
}

interface StorePageRecord {
  id: string;
  type: string;
  title: string;
  slug: string;
  order: number;
  content?: unknown;
  publishedContent?: unknown;
}

interface Store {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  logoUrl?: string | null;
  city?: string | null;
  country?: string | null;
  currency: string;
  brandSettings: {
    template?: {
      templateId?: string;
      templateName?: string;
    };
    heroHeadline?: string;
    heroSubline?: string;
    heroCtaText?: string;
    tagline?: string;
    themeTokens?: {
      heroBg: string;
      heroText: string;
      accent: string;
      ctaBg: string;
      ctaText: string;
      paperBg: string;
      cardBg: string;
      ink: string;
      muted: string;
      border: string;
      headingStyle: "serif" | "grotesk";
      radius: "soft" | "rounded" | "sharp";
    };
    editor?: {
      draft?: StoreEditorSnapshot | null;
      published?: StoreEditorSnapshot | null;
    };
  };
  storeProducts: StoreProduct[];
  pages?: StorePageRecord[];
  /** StorefrontShopperInfo from the public store API. */
  shopper?: unknown;
}

interface Props {
  store: Store;
  storeBasePath: string;
  previewSnapshot?: StoreEditorSnapshot | null;
  previewMode?: boolean;
  /** The owner viewing their own store before it's live (/s/<slug> or /preview). */
  ownerPreview?: boolean;
  device?: "desktop" | "mobile";
  selectedPage?: string;
  onSelectPage?: (page: string) => void;
  selectedSectionId?: string | null;
  onSelectSection?: (sectionId: string | null) => void;
  /** The ?page= the shopper asked for, so the server renders that page rather than flashing home first. */
  initialPage?: string;
}

const velourFallbackImages = [
  "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=900&q=80&fit=crop&crop=top",
  "https://images.unsplash.com/photo-1551232864-3f0987b1e3cb?w=900&q=80&fit=crop&crop=top",
  "https://images.unsplash.com/photo-1599643478589-d4c9fe3671ed?w=900&q=80&fit=crop",
  "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=900&q=80&fit=crop",
  "https://images.unsplash.com/photo-1532453288672-3a27e9be9efd?w=900&q=80&fit=crop",
  "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=900&q=80&fit=crop",
  "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=900&q=80&fit=crop",
  "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=900&q=80&fit=crop",
];

const emptyProductImage = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='900' height='900' viewBox='0 0 900 900'%3E%3Crect width='900' height='900' fill='%23f3efe9'/%3E%3Cpath d='M292 568h316l-28-250H320l-28 250Z' fill='none' stroke='%23c9a96e' stroke-width='18' stroke-linejoin='round'/%3E%3Cpath d='M372 320c0-48 34-84 78-84s78 36 78 84' fill='none' stroke='%230c0c0c' stroke-width='18' stroke-linecap='round'/%3E%3Ctext x='450' y='660' font-family='Arial, sans-serif' font-size='30' text-anchor='middle' fill='%236a6a6a'%3EProducts coming soon%3C/text%3E%3C/svg%3E";

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function VelourStorefront({
  store,
  cartCount,
  onOpenCart,
  onAddToCart,
  previewMode,
  device,
  storeBasePath,
  selectedSectionId,
  onSelectSection,
}: {
  store: Store;
  cartCount: number;
  onOpenCart?: () => void;
  onAddToCart?: (productId: string) => void;
  previewMode: boolean;
  device: "desktop" | "mobile";
  storeBasePath: string;
  selectedSectionId?: string | null;
  onSelectSection?: (sectionId: string | null) => void;
}) {
  const products = store.storeProducts;

  const productImage = (product: StoreProduct | undefined, index: number) => product?.images[0] ?? (previewMode ? velourFallbackImages[index % velourFallbackImages.length] : emptyProductImage);
  const heroProduct = products[0];
  const brand = store.name || "VELOUR";
  const isMobile = device === "mobile";

  const sectionProps = (id: string) => ({
    "data-section-id": id,
    onClick: previewMode ? (event: MouseEvent<HTMLElement>) => {
      event.stopPropagation();
      onSelectSection?.(id);
    } : undefined,
    style: {
      outline: previewMode && selectedSectionId === id ? "2px solid #c9a96e" : "none",
      outlineOffset: previewMode && selectedSectionId === id ? -2 : 0,
    },
  });

  return (
    <div className="velour-store">
      <style>{`
        .velour-store,*{box-sizing:border-box}
        .velour-store{--ink:#0c0c0c;--ink2:#2a2a2a;--ink3:#6a6a6a;--ink4:#a8a8a8;--cream:#faf8f5;--cream2:#f3efe9;--cream3:#e8e2d9;--gold:#c9a96e;--gold2:#b8924e;--white:#fff;--bd:#e8e2d9;--err:#c0392b;--ok:#2d7a4f;--r:6px;min-height:100vh;background:#faf8f5;color:#0c0c0c;font-family:'DM Sans',system-ui,sans-serif}
        .velour-store button{font-family:inherit;cursor:pointer}
        .velour-store img{display:block;width:100%;object-fit:cover}
        .velour-ann{background:var(--ink);color:white;text-align:center;padding:9px 20px;font-size:12px;letter-spacing:.08em}
        .velour-ann span{color:var(--gold)}
        .velour-nav{background:white;border-bottom:1px solid var(--bd);position:sticky;top:0;z-index:20}
        .velour-nav-inner{max-width:1320px;margin:0 auto;padding:0 32px;height:68px;display:flex;align-items:center}
        .velour-logo{font-family:'Cormorant Garamond',Georgia,serif;font-size:26px;font-weight:500;letter-spacing:.12em;flex:1;background:none;border:0;text-align:left}
        .velour-logo span{color:var(--gold)}
        .velour-links{display:flex;gap:36px;justify-content:center;flex:2}
        .velour-link{font-size:12.5px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--ink2);background:none;border:0;position:relative}
        .velour-link:after{content:'';position:absolute;bottom:-4px;left:0;width:0;height:1px;background:var(--gold);transition:.2s}
        .velour-link:hover:after,.velour-link.on:after{width:100%}
        .velour-actions{display:flex;gap:18px;justify-content:flex-end;flex:1;align-items:center}
        .velour-ico{width:20px;height:20px;color:var(--ink2);background:none;border:0;padding:0;position:relative}
        .velour-count{position:absolute;top:-8px;right:-9px;width:16px;height:16px;border-radius:50%;background:var(--gold);color:white;font-size:9px;font-weight:800;display:grid;place-items:center}
        .velour-hero{height:92vh;display:grid;grid-template-columns:1fr 1fr;overflow:hidden}
        .velour-hero-left{position:relative;display:flex;flex-direction:column;justify-content:flex-end;padding:70px 64px;overflow:hidden;background:var(--cream2)}
        .velour-hero-img{position:absolute;inset:0}
        .velour-hero-img img{height:100%;object-position:center top}
        .velour-hero-img:after{content:'';position:absolute;inset:0;background:linear-gradient(to top,rgba(12,12,12,.72),rgba(12,12,12,.2) 50%,transparent)}
        .velour-hero-text{position:relative;z-index:1}
        .velour-eyebrow{font-size:11px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:var(--gold);margin-bottom:16px}
        .velour-h1{font-family:'Cormorant Garamond',Georgia,serif;font-size:72px;font-weight:300;line-height:1.05;color:white;margin:0 0 20px}
        .velour-h1 em{font-style:italic;color:var(--gold)}
        .velour-sub{font-size:14px;color:rgba(255,255,255,.75);line-height:1.65;max-width:340px;margin:0 0 32px}
        .velour-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:13px 28px;border-radius:6px;font-size:12.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;border:0}
        .velour-btn.dark{background:var(--ink);color:white}.velour-btn.gold{background:var(--gold);color:white}.velour-btn.white{background:white;color:var(--ink)}
        .velour-hero-right{display:grid;grid-template-rows:1fr 1fr}
        .velour-hero-top,.velour-tile{position:relative;overflow:hidden}
        .velour-hero-top img,.velour-tile img{height:100%;transition:.6s}
        .velour-hero-top:hover img,.velour-tile:hover img{transform:scale(1.04)}
        .velour-hero-bottom{display:grid;grid-template-columns:1fr 1fr}
        .velour-tile-label{position:absolute;bottom:16px;left:16px;background:rgba(255,255,255,.92);padding:7px 14px;border-radius:3px;font-size:11.5px;font-weight:700;letter-spacing:.05em}
        .velour-trust{background:var(--ink);padding:14px 32px}
        .velour-trust-inner{max-width:1320px;margin:0 auto;display:flex;align-items:center;justify-content:center;gap:60px;flex-wrap:wrap}
        .velour-trust-item{display:flex;align-items:center;gap:9px;color:rgba(255,255,255,.8);font-size:12px;font-weight:600;letter-spacing:.04em}
        .velour-trust-item svg{color:var(--gold)}
        .velour-section{padding:80px 32px;max-width:1320px;margin:0 auto}
        .velour-section-head{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:40px;gap:24px}
        .velour-title{font-family:'Cormorant Garamond',Georgia,serif;font-size:46px;font-weight:400;line-height:1.1}
        .velour-title em{font-style:italic;color:var(--gold)}
        .velour-section-sub{font-size:13.5px;color:var(--ink3);line-height:1.6;max-width:380px;margin-top:8px}
        .velour-collections{display:grid;grid-template-columns:1fr 1fr 1fr;gap:2px}
        .velour-coll{position:relative;overflow:hidden;min-height:420px}.velour-coll.tall{grid-row:span 2;min-height:844px}
        .velour-coll img{height:100%;transition:.5s}.velour-coll:hover img{transform:scale(1.04)}
        .velour-coll-info{position:absolute;bottom:0;left:0;right:0;padding:28px;background:linear-gradient(to top,rgba(12,12,12,.75),transparent)}
        .velour-coll-label{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.75);margin-bottom:5px}
        .velour-coll-name{font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;font-weight:400;color:white;margin-bottom:10px}
        .velour-coll-link{font-size:11.5px;color:var(--gold);letter-spacing:.06em;font-weight:700}
        .velour-products{display:grid;grid-template-columns:repeat(4,1fr);gap:28px}
        .velour-product{cursor:pointer;position:relative}
        .velour-product-img{position:relative;overflow:hidden;border-radius:6px;background:var(--cream2)}
        .velour-product-img img{height:340px;object-position:center top;transition:.5s}
        .velour-product:hover .velour-product-img img{transform:scale(1.04)}
        .velour-product-overlay{position:absolute;inset:0;display:flex;align-items:flex-end;padding:16px;opacity:0;transition:.25s}
        .velour-product:hover .velour-product-overlay{opacity:1}
        .velour-atc{width:100%;padding:11px;background:rgba(12,12,12,.88);color:white;border:0;border-radius:4px;font-size:12px;font-weight:700;letter-spacing:.06em}
        .velour-wish{position:absolute;top:12px;right:12px;width:34px;height:34px;border-radius:50%;background:white;display:grid;place-items:center;box-shadow:0 2px 8px rgba(0,0,0,.06)}
        .velour-badge{position:absolute;top:12px;left:12px;padding:4px 10px;border-radius:3px;font-size:10.5px;font-weight:800;letter-spacing:.05em;color:white}
        .velour-badge.new{background:var(--ink)}.velour-badge.sale{background:var(--err)}
        .velour-prod-info{padding:14px 2px 0}.velour-brand{font-size:10.5px;color:var(--ink4);letter-spacing:.06em;font-weight:600;text-transform:uppercase;margin-bottom:4px}
        .velour-name{font-size:14.5px;font-weight:600;margin-bottom:8px;line-height:1.35}.velour-prices{display:flex;gap:9px;align-items:center}
        .velour-price{font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;font-weight:500}.velour-old{font-size:13px;color:var(--ink4);text-decoration:line-through}.velour-sale{color:var(--err)}
        .velour-stars{display:flex;gap:3px;margin-top:5px;color:var(--gold);font-size:11px}.velour-reviews{color:var(--ink4);margin-left:3px}
        .velour-story{background:var(--ink);padding:100px 32px;overflow:hidden}
        .velour-story-inner{max-width:1320px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:80px;align-items:center}
        .velour-story-title{font-family:'Cormorant Garamond',Georgia,serif;font-size:52px;font-weight:300;line-height:1.1;color:white;margin:0 0 22px}
        .velour-story-title em{color:var(--gold);font-style:italic}.velour-story-body{font-size:14px;color:rgba(255,255,255,.65);line-height:1.75;margin-bottom:32px}
        .velour-stats{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:40px;padding-top:40px;border-top:1px solid rgba(255,255,255,.1)}
        .velour-stat-val{font-family:'Cormorant Garamond',Georgia,serif;font-size:42px;color:var(--gold);line-height:1}.velour-stat-lbl{font-size:12px;color:rgba(255,255,255,.55);margin-top:5px}
        .velour-story-img{border-radius:4px;overflow:hidden}.velour-story-img img{height:580px;object-position:center}
        .velour-footer{background:#050505;color:white;padding:64px 32px 28px}.velour-footer-inner{max-width:1320px;margin:0 auto}
        .velour-footer-grid{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:52px;padding-bottom:46px;border-bottom:1px solid rgba(255,255,255,.1)}
        .velour-ft-logo{font-family:'Cormorant Garamond',Georgia,serif;font-size:30px;letter-spacing:.12em;margin-bottom:18px}.velour-ft-logo span{color:var(--gold)}
        .velour-ft-copy{font-size:13px;color:rgba(255,255,255,.55);line-height:1.7;max-width:320px}.velour-ft-title{font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;margin-bottom:18px;color:var(--gold)}
        .velour-ft-link{font-size:13px;color:rgba(255,255,255,.6);margin-bottom:11px}.velour-footer-bottom{display:flex;justify-content:space-between;gap:24px;padding-top:22px;color:rgba(255,255,255,.45);font-size:12px}
        .velour-payments{display:flex;gap:7px;flex-wrap:wrap}.velour-pay{border:1px solid rgba(255,255,255,.18);border-radius:3px;padding:4px 8px;font-size:10px;color:rgba(255,255,255,.55)}
        .velour-empty-products{grid-column:1 / -1;padding:42px 24px;border:1px solid var(--bd);border-radius:6px;background:white;text-align:center}
        .velour-empty-title{font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;color:var(--ink);margin-bottom:8px}
        .velour-empty-copy{margin:0 auto;max-width:460px;color:var(--ink3);line-height:1.6}
        .velour-product-link{text-decoration:none;color:inherit;display:block}
        @media(max-width:900px){.velour-nav-inner{padding:0 18px}.velour-links{display:none}.velour-hero{height:auto;grid-template-columns:1fr}.velour-hero-left{min-height:640px;padding:48px 28px}.velour-h1{font-size:52px}.velour-hero-right{display:none}.velour-section{padding:58px 20px}.velour-section-head{display:block}.velour-collections,.velour-products,.velour-story-inner,.velour-footer-grid{grid-template-columns:1fr}.velour-coll,.velour-coll.tall{min-height:420px}.velour-footer-bottom{display:block}.velour-products{gap:22px}}
        ${isMobile ? ".velour-store .velour-links{display:none}.velour-store .velour-hero{grid-template-columns:1fr;height:auto}.velour-store .velour-hero-left{min-height:640px;padding:48px 28px}.velour-store .velour-h1{font-size:50px}.velour-store .velour-hero-right{display:none}.velour-store .velour-products,.velour-store .velour-collections,.velour-store .velour-story-inner,.velour-store .velour-footer-grid{grid-template-columns:1fr}.velour-store .velour-section-head{display:block}" : ""}
      `}</style>

      <div className="velour-ann">FREE LAGOS DELIVERY ON ORDERS OVER <span>N50,000</span> - NEW SEASON LIVE</div>
      <nav className="velour-nav">
        <div className="velour-nav-inner">
          <button className="velour-logo">{brand}<span>.</span></button>
          <div className="velour-links">
            {["Home", "Shop", "About", "Journal", "Contact"].map((item, index) => (
              <button className={`velour-link ${index === 0 ? "on" : ""}`} key={item}>{item}</button>
            ))}
          </div>
          <div className="velour-actions">
            <button className="velour-ico" aria-label="Search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.5-4.5"/></svg></button>
            <button className="velour-ico" aria-label="Account"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></svg></button>
            <button className="velour-ico" aria-label="Cart" onClick={onOpenCart}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M5 8h14l-1 12H6z"/><path d="M9 8a3 3 0 016 0"/></svg><span className="velour-count">{cartCount}</span></button>
          </div>
        </div>
      </nav>

      <section className="velour-hero" {...sectionProps("velour-hero")}>
        <div className="velour-hero-left">
          <div className="velour-hero-img"><img src={productImage(heroProduct, 0)} alt={heroProduct?.name ?? `${brand} products coming soon`} /></div>
          <div className="velour-hero-text">
            <div className="velour-eyebrow">New season collection</div>
            <h1 className="velour-h1">Elevated style for <em>everyday luxury</em></h1>
            <p className="velour-sub">{store.description ?? "Discover refined pieces, warm details and premium essentials curated for the modern wardrobe."}</p>
            <button className="velour-btn white">Shop new arrivals</button>
          </div>
        </div>
        <div className="velour-hero-right">
          <div className="velour-hero-top"><img src={productImage(products[1] ?? heroProduct, 1)} alt="" /></div>
          <div className="velour-hero-bottom">
            {[products[2] ?? heroProduct, products[3] ?? heroProduct].map((product, index) => (
              <div className="velour-tile" key={product?.id ?? `empty-hero-${index}`}><img src={productImage(product, index + 2)} alt={product?.name ?? ""} /><div className="velour-tile-label">{index ? "Accessories" : "New arrivals"}</div></div>
            ))}
          </div>
        </div>
      </section>

      <section className="velour-trust" {...sectionProps("velour-trust")}>
        <div className="velour-trust-inner">
          {["Free Lagos delivery", "Pay securely", "Easy returns", "Premium quality"].map((item) => (
            <div className="velour-trust-item" key={item}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 12l4 4L19 6"/></svg>{item}</div>
          ))}
        </div>
      </section>

      <section className="velour-section" {...sectionProps("velour-collections")}>
        <div className="velour-section-head">
          <div><h2 className="velour-title">Shop by <em>collection</em></h2><p className="velour-section-sub">Curated edits for work, weekends, events and every beautiful detail in between.</p></div>
          <button className="velour-btn dark">View all</button>
        </div>
        <div className="velour-collections">
          {[
            ["New Arrivals", "Shop", products[0], true],
            ["Best Sellers", "Shop", products[1], false],
            ["Gift Picks", "Shop", products[2], false],
            ["Essentials", "Shop", products[3], false],
            ["Fresh Finds", "Shop", products[4] ?? products[0], false],
          ].map(([title, label, product, tall], index) => (
            <div className={`velour-coll ${tall ? "tall" : ""}`} key={String(title)}>
              <img src={productImage(product as StoreProduct | undefined, index)} alt={String(title)} />
              <div className="velour-coll-info"><div className="velour-coll-label">{String(label)}</div><div className="velour-coll-name">{String(title)}</div><div className="velour-coll-link">Shop now</div></div>
            </div>
          ))}
        </div>
      </section>

      <section className="velour-section" {...sectionProps("velour-products")}>
        <div className="velour-section-head">
          <div><h2 className="velour-title">New <em>arrivals</em></h2><p className="velour-section-sub">Fresh pieces selected for polish, comfort and easy styling.</p></div>
          <button className="velour-btn gold">Shop all</button>
        </div>
        <div className="velour-products">
          {products.length === 0 ? (
            <div className="velour-empty-products">
              <div className="velour-empty-title">Products coming soon</div>
              <p className="velour-empty-copy">This store is published, but products have not been added yet. Please check back shortly.</p>
            </div>
          ) : products.slice(0, 8).map((product, index) => {
            const isSale = index % 3 === 0;
            return (
              <article className="velour-product" key={product.id}>
                <Link href={previewMode ? "#" : getPublicStorefrontPath(storeBasePath, `/product/${product.id}`)} className="velour-product-link">
                <div className="velour-product-img">
                  <img src={productImage(product, index)} alt={product.name} />
                  <div className={`velour-badge ${isSale ? "sale" : "new"}`}>{isSale ? "SALE" : "NEW"}</div>
                  <div className="velour-product-overlay">
                    {previewMode ? (
                      <button className="velour-atc" onClick={(event) => { event.stopPropagation(); onAddToCart?.(product.id); }}>Add to Bag</button>
                    ) : (
                      <button className="velour-atc" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onAddToCart?.(product.id); }}>Add to Bag</button>
                    )}
                  </div>
                  <div className="velour-wish"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20.8 6.6a5 5 0 00-7-.6L12 7.5 10.3 6a5 5 0 00-7 .6 5 5 0 00.6 7L12 21l8.1-7.4a5 5 0 00.7-7z"/></svg></div>
                </div>
                <div className="velour-prod-info">
                  <div className="velour-brand">{brand}</div>
                  <div className="velour-name">{product.name}</div>
                  <div className="velour-prices">
                    <div className={`velour-price ${isSale ? "velour-sale" : ""}`}>{money(product.retailPrice, product.currency)}</div>
                    {isSale ? <div className="velour-old">{money(Math.round(product.retailPrice * 1.22), product.currency)}</div> : null}
                  </div>
                  <div className="velour-stars">
                    {"★".repeat(Math.round(product.avgRating ?? 5))}
                    {"☆".repeat(5 - Math.round(product.avgRating ?? 5))}
                    <span className="velour-reviews">({product.reviewCount ?? 0})</span>
                  </div>
                </div>
              </Link>
              </article>
            );
          })}
        </div>
      </section>

      <section className="velour-story" {...sectionProps("velour-story")}>
        <div className="velour-story-inner">
          <div>
            <div className="velour-eyebrow">Our story</div>
            <h2 className="velour-story-title">Designed for women who dress with <em>intention</em></h2>
            <p className="velour-story-body">Every piece in {brand} is chosen for lasting wear, premium hand-feel and the kind of quiet detail that makes customers come back.</p>
            <button className="velour-btn gold">Read our story</button>
            <div className="velour-stats">
              <div><div className="velour-stat-val">8k+</div><div className="velour-stat-lbl">Happy customers</div></div>
              <div><div className="velour-stat-val">4.9</div><div className="velour-stat-lbl">Average rating</div></div>
            </div>
          </div>
          <div className="velour-story-img"><img src={productImage(products[5] ?? heroProduct, 5)} alt="" /></div>
        </div>
      </section>

      <footer className="velour-footer">
        <div className="velour-footer-inner">
          <div className="velour-footer-grid">
            <div><div className="velour-ft-logo">{brand}<span>.</span></div><p className="velour-ft-copy">Premium commerce experiences for beautiful brands. Built for discovery, trust and conversion.</p></div>
            {[
              ["Shop", ["New arrivals", "Dresses", "Accessories", "Best sellers"]],
              ["Support", ["Contact Us", "Size Guide", "Shipping Info", "Returns"]],
              ["Company", ["Our Story", "Journal", "Wholesale", "Press"]],
            ].map(([title, links]) => (
              <div key={title as string}><div className="velour-ft-title">{title as string}</div>{(links as string[]).map((link) => <div className="velour-ft-link" key={link}>{link}</div>)}</div>
            ))}
          </div>
          <div className="velour-footer-bottom">
            <div>© 2026 {brand}. All rights reserved. Lagos, Nigeria.</div>
            <div className="velour-payments">{["PAYSTACK", "VISA", "MASTERCARD", "VERVE", "BANK TRANSFER"].map((pay) => <div className="velour-pay" key={pay}>{pay}</div>)}</div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function buildLegacySnapshot(store: Store): StoreEditorSnapshot {
  const templateId = store.brandSettings?.template?.templateId;
  const manifest = (templateId ? getTemplateManifest(templateId) : null) ?? STORE_TEMPLATE_MANIFESTS[0];
  const snapshot = createSnapshotFromTemplate(manifest);
  const products = store.storeProducts.slice(0, 3);
  const home = snapshot.pages.find((page) => page.pageType === "home");

  if (home) {
    home.sections = home.sections.map((section) => {
      if (section.kind === "hero-split") {
        return {
          ...section,
          blocks: section.blocks.map((entry) =>
            entry.type === "copy"
              ? {
                  ...entry,
                  content: {
                    ...entry.content,
                    eyebrow: store.brandSettings?.tagline ?? store.name,
                    title: store.brandSettings?.heroHeadline ?? `Welcome to ${store.name}`,
                    body: store.brandSettings?.heroSubline ?? store.description ?? "Discover this store.",
                    primaryCta: store.brandSettings?.heroCtaText ?? "Shop now",
                  },
                }
              : entry,
          ),
        };
      }

      if (section.kind === "featured-products") {
        return {
          ...section,
          items: section.items?.map((item, index) => ({
            ...item,
            mappedStoreProductId: products[index]?.id ?? null,
            imageUrl: products[index]?.images[0] ?? item.imageUrl,
            title: products[index]?.name ?? item.title,
            subtitle: products[index]?.description?.slice(0, 80) ?? item.subtitle,
            priceLabel: products[index] ? new Intl.NumberFormat("en-NG", { style: "currency", currency: products[index].currency, maximumFractionDigits: 0 }).format(products[index].retailPrice) : item.priceLabel,
          })),
        };
      }

      return section;
    });
  }

  snapshot.pages = snapshot.pages.map((page) => {
    if (page.pageType === "products") {
      return {
        ...page,
        sections: page.sections.map((section) =>
          section.kind === "featured-products"
            ? {
                ...section,
                items: store.storeProducts.slice(0, 6).map((product, index) => ({
                  id: `${page.pageType}-${product.id}`,
                  title: product.name,
                  subtitle: product.description?.slice(0, 80) ?? "Mapped product",
                  priceLabel: new Intl.NumberFormat("en-NG", {
                    style: "currency",
                    currency: product.currency,
                    maximumFractionDigits: 0,
                  }).format(product.retailPrice),
                  color: ["#2E7E78", "#C9973A", "#466378", "#8A5A3A", "#6E5685", "#406A4A"][index % 6],
                  imageUrl: product.images[0],
                  mappedStoreProductId: product.id,
                })),
              }
            : section,
        ),
      };
    }

    return page;
  });

  snapshot.updatedAt = new Date().toISOString();
  return snapshot;
}

function buildPublishedPagesSnapshot(store: Store): StoreEditorSnapshot | null {
  const pages = (store.pages ?? [])
    .map((page, index) => {
      const rawContent = page.publishedContent ?? page.content;
      const content = rawContent && typeof rawContent === "object" && !Array.isArray(rawContent)
        ? rawContent as Record<string, unknown>
        : null;
      const sections = Array.isArray(content?.sections) ? content.sections : [];
      if (sections.length === 0) return null;
      return {
        id: page.id,
        pageType: String(content?.pageType ?? page.type) as StoreEditorSnapshot["pages"][number]["pageType"],
        title: String(content?.title ?? page.title),
        slug: page.slug === "home" ? "" : page.slug,
        sections: sections as StoreEditorSnapshot["pages"][number]["sections"],
        seo: (content?.seo && typeof content.seo === "object" && !Array.isArray(content.seo))
          ? content.seo as StoreEditorSnapshot["pages"][number]["seo"]
          : undefined,
        order: page.order ?? index,
      };
    })
    .filter((page): page is NonNullable<typeof page> => Boolean(page))
    .sort((a, b) => a.order - b.order)
    .map(({ order: _order, ...page }) => page);

  if (pages.length === 0) return null;

  const templateId = store.brandSettings?.template?.templateId;
  const manifest = (templateId ? getTemplateManifest(templateId) : null) ?? STORE_TEMPLATE_MANIFESTS[0];
  return {
    templateId: store.brandSettings?.template?.templateId ?? "published-pages",
    templateName: store.brandSettings?.template?.templateName ?? store.name,
    layoutFamily: manifest.layoutFamily,
    themeTokens: store.brandSettings?.editor?.published?.themeTokens ?? store.brandSettings?.themeTokens ?? createSnapshotFromTemplate(manifest).themeTokens,
    pages,
    updatedAt: new Date().toISOString(),
  };
}

function buildEmptyPublishedSnapshot(store: Store): StoreEditorSnapshot {
  const templateId = store.brandSettings?.template?.templateId;
  const manifest = (templateId ? getTemplateManifest(templateId) : null) ?? STORE_TEMPLATE_MANIFESTS[0];
  return {
    templateId: store.brandSettings?.template?.templateId ?? "empty-published",
    templateName: store.brandSettings?.template?.templateName ?? store.name,
    layoutFamily: manifest.layoutFamily,
    themeTokens: store.brandSettings?.editor?.published?.themeTokens ?? store.brandSettings?.themeTokens ?? createSnapshotFromTemplate(manifest).themeTokens,
    pages: [],
    updatedAt: new Date().toISOString(),
  };
}

export function StorefrontClient({
  store,
  storeBasePath,
  previewSnapshot = null,
  previewMode = false,
  ownerPreview = false,
  device = "desktop",
  selectedPage,
  onSelectPage,
  selectedSectionId,
  onSelectSection,
  initialPage,
}: Props) {
  const templateRootRef = useRef<HTMLDivElement>(null);
  // Capture ?sib_c from email campaign links (no-op in the editor preview).
  useCampaignAttribution(previewMode ? "" : store.slug);
  useStoreVisitBeacon(previewMode ? "" : store.slug);
  const [cartOpen, setCartOpen] = useState(false);
  const cart = useCart(store.slug);
  const wishlist = useWishlist(store.slug);
  const cartSettings = readCartSettings(store.brandSettings);
  // Sellers can turn wishlists off; hearts and the wishlist tab then disappear on the live store.
  const wishlistOn = previewMode || cartSettings.wishlist;
  // Live storefronts own the current page so the phone bottom nav can go Home, and ?page= / ?q= links work.
  const [livePage, setLivePage] = useState(() => (initialPage && /^[a-z-]{2,20}$/.test(initialPage) ? initialPage : "home"));
  const [initialQuery, setInitialQuery] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (previewMode) return;
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("page");
    if (requested && /^[a-z-]{2,20}$/.test(requested)) setLivePage(requested);
    const q = params.get("q")?.trim();
    if (q) setInitialQuery(q.slice(0, 80));
  }, [previewMode]);
  // Back/Forward move between the pages a shopper opened (each one is its own /?page= address).
  useEffect(() => {
    if (previewMode) return;
    const onPop = () => {
      const requested = new URLSearchParams(window.location.search).get("page");
      setLivePage(requested && /^[a-z-]{2,20}$/.test(requested) ? requested : "home");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [previewMode]);
  function selectLivePage(page: string) {
    setLivePage(page);
    if (!previewMode) {
      // Every page gets its own address (/?page=about), so it can be shared, bookmarked and refreshed.
      const params = new URLSearchParams(window.location.search);
      const current = params.get("page") || "home";
      if (page === "home") params.delete("page");
      else params.set("page", page);
      if (page !== "products") {
        params.delete("category");
        params.delete("sort");
        params.delete("q");
      }
      const query = params.toString();
      const next = `${window.location.pathname}${query ? `?${query}` : ""}`;
      if (current !== page) window.history.pushState({ page }, "", next);
      else window.history.replaceState({ page }, "", next);
    }
    window.scrollTo({ top: 0 });
  }

  const snapshot = useMemo(() => {
    if (previewSnapshot) return previewSnapshot;
    if (store.brandSettings?.editor?.published) return store.brandSettings.editor.published;
    if (!previewMode) {
      const published = buildPublishedPagesSnapshot(store);
      if (published) return published;
      // The owner previewing a store with nothing published yet sees its draft or template, not a blank page.
      if (!ownerPreview) return buildEmptyPublishedSnapshot(store);
    }
    if (store.brandSettings?.editor?.draft) return store.brandSettings.editor.draft;
    if (store.brandSettings?.themeTokens) {
      const templateId = store.brandSettings?.template?.templateId;
      const manifest = (templateId ? getTemplateManifest(templateId) : null) ?? STORE_TEMPLATE_MANIFESTS[0];
      const snapshot = createSnapshotFromTemplate(manifest);
      snapshot.themeTokens = { ...snapshot.themeTokens, ...store.brandSettings.themeTokens };
      return snapshot;
    }
    return buildLegacySnapshot(store);
  }, [previewSnapshot, store, previewMode, ownerPreview]);
  const cartVariation = useMemo(() => {
    const cartPage = snapshot.pages.find((entry) => entry.pageType === "cart");
    const cartSection = cartPage?.sections.find((entry) => entry.kind === "cart-summary");
    return String(cartSection?.settings?.drawerVariation ?? cartSection?.settings?.layout ?? "right-drawer");
  }, [snapshot]);

  function handleAdd(productId: string) {
    const product = store.storeProducts.find((entry) => entry.id === productId);
    if (!product) return;
    // Sizes or colours to choose: the product page picks them (the checkout needs one).
    if (needsOptions(product)) {
      window.location.assign(getPublicStorefrontPath(storeBasePath, `/product/${product.id}`));
      return;
    }
    cart.add({
      productId: product.id,
      name: product.name,
      price: product.retailPrice,
      image: product.images[0],
    });
    // The seller's "after adding to bag" setting (Cart settings).
    if (cartSettings.afterAdd === "drawer") setCartOpen(true);
    else window.location.assign(getPublicStorefrontPath(storeBasePath, cartSettings.afterAdd === "checkout" ? "/checkout" : "/cart"));
  }

  useEffect(() => {
    if (templateRootRef.current) {
      templateRootRef.current.style.background = snapshot.themeTokens.paperBg;
    }
  }, [snapshot.themeTokens.paperBg]);

  const boutique = isBoutiqueTheme(snapshot.templateId);

  return (
    <div ref={templateRootRef} className={`template-store-root${!previewMode && !boutique ? " pb-24 md:pb-0" : ""}`}>
      <TemplateStorefrontSurface
        store={store}
        snapshot={snapshot}
        storeBasePath={storeBasePath}
        mode={previewMode ? "editor" : "live"}
        device={device}
        selectedPage={selectedPage ?? (previewMode ? undefined : livePage)}
        onSelectPage={onSelectPage ?? (previewMode ? undefined : selectLivePage)}
        initialQuery={initialQuery}
        selectedSectionId={selectedSectionId}
        onSelectSection={onSelectSection}
        visitorKey={wishlist.visitorKey}
        wishlistProductIds={wishlistOn ? wishlist.productIds : []}
        onToggleWishlist={wishlistOn ? wishlist.toggle : undefined}
        cartCount={cart.count}
        onOpenCart={previewMode ? undefined : () => setCartOpen(true)}
        onAddToCart={previewMode ? undefined : handleAdd}
      />

      {/* The 2026 themes draw their own bottom nav; every other template gets the shared phone shopper bar. */}
      {!previewMode && !boutique ? (
        <ShopperBottomNav
          storeSlug={store.slug}
          storeName={store.name}
          basePath={storeBasePath}
          products={store.storeProducts}
          wishlistIds={wishlistOn ? wishlist.productIds : []}
          onToggleWishlist={wishlistOn ? wishlist.toggle : undefined}
          cartCount={cart.count}
          onOpenBag={() => setCartOpen(true)}
          onHome={() => selectLivePage("home")}
          colors={{ active: snapshot.themeTokens.ink, activeText: snapshot.themeTokens.paperBg }}
          initialQuery={initialQuery}
          activeTab={livePage === "home" ? "home" : undefined}
        />
      ) : null}

      {!previewMode ? <MarketingMount storeSlug={store.slug} storeBasePath={storeBasePath} currency={store.currency} colors={{ ink: snapshot.themeTokens.ink, paper: snapshot.themeTokens.paperBg, accent: snapshot.themeTokens.ctaBg, accentText: snapshot.themeTokens.ctaText, heading: themeHeadingFont(snapshot.themeTokens.headingStyle) }} /> : null}

      {!previewMode ? (
        <CartDrawer
          open={cartOpen}
          onClose={() => setCartOpen(false)}
          cart={cart}
          storeBasePath={storeBasePath}
          currency={store.currency}
          accentColor={snapshot.themeTokens.ctaBg}
          accentTextColor={snapshot.themeTokens.ctaText}
          variation={cartVariation}
          freeDeliveryThreshold={freeDeliveryEverywhereOver(readShopperInfo(store.shopper).delivery) ?? undefined}
          rewardTiers={rewardTiersFor(store.brandSettings)}
        />
      ) : null}
    </div>
  );
}
