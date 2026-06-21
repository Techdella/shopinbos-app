"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { TemplateStorefrontSurface, type SurfaceStore } from "@/components/storefront/TemplateStorefrontSurface";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SectionPreviewPopover } from "@/components/builder/SectionPreview";
import { StoreLaunchBillingModal, type StoreLaunchPricing } from "@/components/billing/StoreLaunchBillingModal";
import {
  createBlankEditorSnapshot,
  createSectionFromLibrary,
  type StoreEditorSnapshot,
  type TemplatePageType,
  type TemplateSectionNode,
  type ThemeTokenSet,
} from "@/lib/store-templates";
import { normalizeImage } from "@/lib/store-templates/images";
import { EDITOR_CSS } from "./editor-styles";

// ─── TYPES ───────────────────────────────────────────────────────────────────
type DeviceKey = "desktop" | "tablet" | "mobile";
type RpTab = "content" | "design" | "seo";
type SbTab = "pages" | "elements" | "layers";
type PageGroup = "pages" | "templates" | "commerce" | "blog" | "legal";

interface BlogPost {
  id: number;
  title: string;
  status: "published" | "draft";
  cat: string;
  date: string;
  slug: string;
  content: string;
  imageUrl?: string;
}

interface StoreProduct {
  id: string;
  name: string;
  description?: string | null;
  retailPrice: number | null;
  currency: string | null;
  images: string[];
  avgRating?: number;
  reviewCount?: number;
}

interface ElementItem {
  id: string;
  svg: string;
  lbl: string;
}

interface BlockItem {
  id: string;
  svg: string;
  lbl: string;
  sectionKinds: string[];
}

interface EditorProps {
  initialRexOpen?: boolean;
}

// ─── SVG ICON STRINGS (for innerHTML sections) ────────────────────────────────
const IMG_PH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="m3 15 5-5 4 4 3-3 6 6"/><circle cx="8.5" cy="8.5" r="1.5"/></svg>`;
const STAR_SVG = `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
const CART_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>`;
const SEARCH_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`;
const TRUCK_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`;
const LOCK_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
const RETURN_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>`;
const HEADSET_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>`;
const USER_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
const MAIL_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`;
const PHONE_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.56 1.18h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;
const PIN_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`;
const STAR_O_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;

// ─── PAGE DEFINITIONS ─────────────────────────────────────────────────────────
const DEFAULT_PAGES: Record<string, { title: string; secs: string[] }> = {
  homepage: { title: "Homepage", secs: [] },
  shop: { title: "Shop", secs: [] },
  product: { title: "Product Page", secs: [] },
  about: { title: "About Us", secs: [] },
  contact: { title: "Contact", secs: [] },
  blog: { title: "Blog", secs: [] },
};

const PAGE_ICONS: Record<string, string> = {
  homepage: "home", home: "home", shop: "shop", products: "shop", product: "box",
  categories: "shop", cart: "shop", checkout: "shop", wishlist: "shop",
  about: "info", contact: "mail", blog: "document", faq: "document"
};

const SEC_LABELS: Record<string, string> = {
  nav: "Navigation", hero: "Hero Banner", trust: "Trust Bar", products: "Products",
  banner: "Promo Banner", reviews: "Reviews", newsletter: "Newsletter", footer: "Footer",
  "shop-hd": "Shop Header", "shop-body": "Shop Body", "prod-body": "Product Detail",
  "prod-reviews": "Product Reviews", "ab-hero": "About Hero", "ab-story": "Our Story",
  team: "Team Section", "ct-body": "Contact Body", "bl-hd": "Blog Header", "blog-grid": "Blog Grid",
  gallery: "Gallery", features: "Features", text: "Text Block", image: "Image",
  button: "Button", divider: "Divider", spacer: "Spacer", columns: "Columns",
  atc: "Add to Cart", countdown: "Countdown", stars: "Stars", whatsapp: "WhatsApp",
  header: "Navigation", "hero-split": "Hero Banner", "featured-products": "Products",
  "promo-banner": "Promo Banner", testimonials: "Reviews", "text-columns": "Text Columns",
  "story-split": "Story Section", "category-list": "Categories", "product-detail": "Product Detail",
  "filters-toolbar": "Filters", "cart-summary": "Cart Summary", "checkout-form": "Checkout",
  "wishlist-grid": "Wishlist", "blog-index": "Blog Posts", "contact-form": "Contact Form",
  faq: "FAQ", "announcement-bar": "Announcement",
};

const TEMPLATE_KIND_BY_ELEMENT: Record<string, string> = {
  nav: "header",
  hero: "hero-split",
  trust: "trust-strip",
  products: "featured-products",
  banner: "promo-banner",
  reviews: "testimonials",
  newsletter: "newsletter",
  footer: "footer",
  features: "text-columns",
  gallery: "category-list",
  text: "story-split",
  image: "story-split",
  columns: "text-columns",
  atc: "product-detail",
  countdown: "promo-banner",
  stars: "testimonials",
  whatsapp: "contact-form",
};

const PAGE_TYPE_LABELS: Record<string, string> = {
  home: "Home",
  products: "Products",
  product: "Product Page",
  categories: "Categories",
  cart: "Cart",
  checkout: "Checkout",
  wishlist: "Wishlist",
  blog: "Blog",
  about: "About Us",
  contact: "Contact",
  faq: "FAQ",
};

const PAGE_GROUP_LABELS: Record<PageGroup, string> = {
  pages: "Pages",
  templates: "Dynamic Templates",
  commerce: "Commerce Experience",
  blog: "Blog",
  legal: "Legal Pages",
};

const PAGE_GROUP_HELP: Record<PageGroup, string> = {
  pages: "Seller-created pages that can appear in navigation.",
  templates: "Layouts used by products, collections, search results, and blog posts. These are not navigation pages.",
  commerce: "System-managed shopping routes. They work internally and should not be published as normal pages.",
  blog: "Blog routes activate when published posts exist.",
  legal: "Policies such as privacy, terms, cookies, shipping, refunds, and returns.",
};

const DYNAMIC_TEMPLATE_PAGE_TYPES = new Set(["product", "product-detail", "category", "categories", "collection", "search", "blog-post"]);
const COMMERCE_PAGE_TYPES = new Set(["cart", "checkout", "wishlist", "account", "orders", "order-tracking"]);
const LEGAL_PAGE_TYPES = new Set(["privacy-policy", "terms-and-conditions", "cookie-policy", "refund-policy", "shipping-policy", "return-policy"]);

const BUTTON_ACTIONS = [
  { id: "products", label: "Navigate to products" },
  { id: "product", label: "Open product template" },
  { id: "categories", label: "Open categories" },
  { id: "cart", label: "Open cart" },
  { id: "checkout", label: "Open checkout" },
  { id: "wishlist", label: "Open wishlist" },
  { id: "contact", label: "Contact seller" },
  { id: "whatsapp", label: "WhatsApp order" },
  { id: "about", label: "About page" },
  { id: "blog", label: "Blog" },
  { id: "external", label: "External link" },
  { id: "rex", label: "Run RexAI flow" },
];

const BUTTON_VARIANTS = [
  { id: "primary", label: "Primary" },
  { id: "secondary", label: "Secondary" },
  { id: "outline", label: "Outline" },
  { id: "ghost", label: "Ghost" },
  { id: "text", label: "Text" },
  { id: "gradient", label: "Gradient" },
  { id: "floating", label: "Floating" },
  { id: "sticky", label: "Sticky" },
];

const SECTION_VARIATIONS: Record<string, Array<{ id: string; name: string; hint: string }>> = {
  "announcement-bar": [
    { id: "ticker", name: "Ticker", hint: "Compact moving-style announcement." },
    { id: "centered", name: "Centered", hint: "Simple centered message." },
    { id: "split", name: "Split", hint: "Announcement with action text." },
  ],
  header: [
    { id: "standard", name: "Standard", hint: "Logo, navigation, wishlist and cart." },
    { id: "centered", name: "Centered Logo", hint: "Balanced boutique header." },
    { id: "floating", name: "Floating", hint: "Rounded floating header for premium stores." },
    { id: "transparent", name: "Transparent", hint: "Soft transparent header over visual sections." },
  ],
  "hero-split": [
    { id: "split-editorial", name: "Editorial Split", hint: "Large copy with supporting product visuals." },
    { id: "full-bleed", name: "Full Bleed", hint: "Immersive image-led hero." },
    { id: "video-background", name: "Video Background", hint: "Uploaded video or image behind hero copy." },
    { id: "video-split", name: "Video Split", hint: "Copy beside uploaded video or image." },
    { id: "minimal-center", name: "Minimal Center", hint: "Centered headline and primary CTA." },
    { id: "category-portal", name: "Category Portal", hint: "Hero with live product category cards." },
    { id: "product-spotlight", name: "Product Spotlight", hint: "Feature one product with buy action." },
    { id: "editorial-mosaic", name: "Editorial Mosaic", hint: "Magazine-style lead and supporting tiles." },
    { id: "beauty-split", name: "Beauty Split", hint: "Soft lifestyle split with a feature card." },
    { id: "carousel-cards", name: "Carousel Cards", hint: "Hero with stacked collection cards." },
    { id: "text-overlay", name: "Text Overlay", hint: "Strong copy over visual media." },
  ],
  "trust-strip": [
    { id: "icon-row", name: "Icon Row", hint: "Shipping, payment and support icons." },
    { id: "metric-cards", name: "Metric Cards", hint: "Store proof in cards." },
    { id: "compact-badges", name: "Compact Badges", hint: "Small customer-facing badges." },
    { id: "ingredients-strip", name: "Ticker Strip", hint: "Repeating ticker style." },
  ],
  "category-list": [
    { id: "image-grid", name: "Image Grid", hint: "Large image cards." },
    { id: "icon-row", name: "Icon Row", hint: "Horizontal icon category chips." },
    { id: "sidebar", name: "Sidebar Categories", hint: "Category sidebar with content panels." },
    { id: "beauty-pills", name: "Beauty Pills", hint: "Soft beauty category pills and rounded cards." },
    { id: "masonry", name: "Masonry Grid", hint: "Mixed category card heights." },
    { id: "circle-icons", name: "Circle Icons", hint: "Round image or icon category buttons." },
    { id: "banner-grid", name: "Banner Grid", hint: "Wide category banners for shop pages." },
    { id: "minimal-list", name: "Minimal List", hint: "Text-first category list with counts." },
  ],
  "category-grid": [
    { id: "image-grid", name: "Image Grid", hint: "Large image cards." },
    { id: "icon-row", name: "Icon Row", hint: "Horizontal icon category chips." },
    { id: "sidebar", name: "Sidebar Categories", hint: "Category sidebar with content panels." },
    { id: "beauty-pills", name: "Beauty Pills", hint: "Soft beauty category pills and rounded cards." },
    { id: "masonry", name: "Masonry Grid", hint: "Mixed category card heights." },
    { id: "circle-icons", name: "Circle Icons", hint: "Round image or icon category buttons." },
    { id: "banner-grid", name: "Banner Grid", hint: "Wide category banners for shop pages." },
    { id: "minimal-list", name: "Minimal List", hint: "Text-first category list with counts." },
  ],
  "lookbook-grid": [
    { id: "image-grid", name: "Image Grid", hint: "Large image cards." },
    { id: "editorial-mosaic", name: "Editorial Mosaic", hint: "Magazine-like visual tiles." },
    { id: "beauty-pills", name: "Soft Cards", hint: "Rounded image-led cards." },
  ],
  "filters-toolbar": [
    { id: "compact", name: "Compact", hint: "Search and filters in one row." },
    { id: "chips", name: "Filter Chips", hint: "Category chips with compact sorting." },
    { id: "sidebar", name: "Sidebar", hint: "Side filter panel for larger catalogs." },
    { id: "drawer", name: "Filter Drawer", hint: "Mobile-first filter drawer style." },
    { id: "topbar", name: "Shop Topbar", hint: "Search, count, category and sort controls." },
  ],
  "featured-products": [
    { id: "grid", name: "Product Grid", hint: "Balanced standard product grid." },
    { id: "premium-product-cards", name: "Luxury Cards", hint: "Premium editorial product cards." },
    { id: "beauty-rounded", name: "Rounded Beauty", hint: "Soft rounded product cards." },
    { id: "editorial-rows", name: "Editorial Rows", hint: "Wide product rows for storytelling." },
  ],
  "product-detail": [
    { id: "gallery-left", name: "Gallery Left", hint: "Thumbnails and main media." },
    { id: "split", name: "Split", hint: "Product image and buying panel." },
    { id: "minimal", name: "Minimal", hint: "Simple product detail." },
    { id: "sticky-summary", name: "Sticky Summary", hint: "Buying controls stay visible." },
  ],
  "cart-summary": [
    { id: "shopify", name: "Shopify Style", hint: "Items and order summary side-by-side." },
    { id: "floating", name: "Mini Floating Cart", hint: "Compact floating cart summary." },
    { id: "minimal", name: "Minimal", hint: "Slim checkout-focused cart." },
  ],
  "wishlist-grid": [
    { id: "page", name: "Wishlist Page", hint: "Saved products page." },
    { id: "drawer", name: "Wishlist Drawer", hint: "Saved products with drawer preview." },
    { id: "floating", name: "Floating Wishlist", hint: "Compact saved-items summary." },
  ],
  "checkout-form": [
    { id: "single-page", name: "Single Page", hint: "All checkout fields on one page." },
    { id: "multi-step", name: "Multi Step", hint: "Contact, delivery, payment steps." },
    { id: "minimal", name: "Minimal", hint: "Fast mobile-friendly checkout." },
  ],
  "promo-banner": [
    { id: "gradient-sale", name: "Gradient Sale", hint: "Strong offer banner." },
    { id: "split-offer", name: "Split Offer", hint: "Copy and product image." },
    { id: "minimal-strip", name: "Minimal Strip", hint: "Slim announcement offer." },
    { id: "countdown", name: "Countdown", hint: "Urgency-focused sale panel." },
  ],
  "story-split": [
    { id: "image-collage", name: "Image Collage", hint: "Story with layered images." },
    { id: "text-first", name: "Text First", hint: "Copy-led brand story." },
    { id: "ritual-steps", name: "Steps", hint: "Step-by-step education." },
    { id: "ingredients-feature", name: "Feature Split", hint: "Image and benefit cards." },
  ],
  "text-columns": [
    { id: "cards", name: "Cards", hint: "Reusable info cards." },
    { id: "minimal-columns", name: "Minimal Columns", hint: "Simple text columns." },
    { id: "ritual-steps", name: "Steps", hint: "Numbered steps." },
    { id: "ingredients-feature", name: "Feature Split", hint: "Image and detail cards." },
  ],
  faq: [
    { id: "accordion", name: "Accordion", hint: "Expandable FAQ rows." },
    { id: "cards", name: "Cards", hint: "Questions in separate cards." },
    { id: "sidebar", name: "Sidebar", hint: "Help-center style FAQ layout." },
    { id: "two-column", name: "Two Column", hint: "Questions arranged in two columns." },
    { id: "support-center", name: "Support Center", hint: "FAQ with contact prompt." },
  ],
  "contact-form": [
    { id: "split-card", name: "Split Card", hint: "Contact details beside form." },
    { id: "minimal", name: "Minimal", hint: "Simple contact form." },
    { id: "support-panel", name: "Support Panel", hint: "Support details with form." },
    { id: "map-card", name: "Map Card", hint: "Location and contact form layout." },
    { id: "whatsapp-first", name: "WhatsApp First", hint: "Fast chat and support-led contact." },
  ],
  newsletter: [
    { id: "dark-panel", name: "Dark Panel", hint: "High-contrast signup band." },
    { id: "inline", name: "Inline", hint: "Compact inline signup." },
    { id: "split", name: "Split", hint: "Copy and signup form side by side." },
    { id: "minimal", name: "Minimal", hint: "Quiet email capture." },
  ],
  "blog-index": [
    { id: "grid", name: "Grid", hint: "Blog homepage grid." },
    { id: "magazine", name: "Magazine", hint: "Editorial magazine layout." },
    { id: "minimal", name: "Minimal", hint: "Simple two-column blog list." },
    { id: "single-preview", name: "Single Post Preview", hint: "Preview one article page before publishing." },
    { id: "article-split", name: "Article Split", hint: "Single post with image and reading panel." },
    { id: "longform-editorial", name: "Longform Editorial", hint: "Large article typography with pull quote." },
    { id: "press-list", name: "Press List", hint: "Compact publication-style entries." },
    { id: "resource-hub", name: "Resource Hub", hint: "Guide categories and featured articles." },
    { id: "lookbook-journal", name: "Lookbook Journal", hint: "Visual article cards for image-led brands." },
    { id: "story-stack", name: "Story Stack", hint: "Stacked articles with rich excerpts." },
  ],
  footer: [
    { id: "standard-footer", name: "Standard", hint: "Brand, browse, store details." },
    { id: "mega-footer", name: "Mega Footer", hint: "Adds legal and policy links." },
    { id: "minimal-footer", name: "Minimal", hint: "Small footer with key links only." },
  ],
  testimonials: [
    { id: "cards", name: "Cards", hint: "Review cards in a grid." },
    { id: "featured", name: "Featured Quote", hint: "One large quote with supporting reviews." },
    { id: "masonry", name: "Masonry", hint: "Staggered review cards." },
    { id: "slider", name: "Slider Preview", hint: "Horizontal carousel style." },
  ],
  "about-section": [
    { id: "split", name: "Split", hint: "Image and store story." },
    { id: "centered", name: "Centered", hint: "Centered brand statement." },
    { id: "timeline", name: "Timeline", hint: "Brand milestones." },
    { id: "founder-note", name: "Founder Note", hint: "Personal store introduction." },
    { id: "values-grid", name: "Values Grid", hint: "Brand values with proof cards." },
    { id: "studio-story", name: "Studio Story", hint: "Image-led story section." },
    { id: "team-grid", name: "Team Grid", hint: "People and roles behind the store." },
    { id: "mission-split", name: "Mission Split", hint: "Mission copy with proof cards." },
  ],
  "delivery-info": [
    { id: "cards", name: "Cards", hint: "Delivery promise cards." },
    { id: "timeline", name: "Timeline", hint: "Order to delivery steps." },
    { id: "compact-strip", name: "Compact Strip", hint: "Small delivery badges." },
  ],
  "payment-info": [
    { id: "badges", name: "Badges", hint: "Accepted payment badges." },
    { id: "security-card", name: "Security Card", hint: "Trust and payment details." },
    { id: "compact-strip", name: "Compact Strip", hint: "Small payment strip." },
  ],
};

const BLOCK_VARIATIONS: Record<string, Array<{ id: string; name: string; hint: string }>> = {
  card: [
    { id: "plain", name: "Plain", hint: "Clean card." },
    { id: "soft", name: "Soft", hint: "Tinted background." },
    { id: "outline", name: "Outline", hint: "Border-first card." },
    { id: "feature", name: "Feature", hint: "Larger highlight card." },
  ],
  product: [
    { id: "classic", name: "Classic", hint: "Image, title and price." },
    { id: "overlay", name: "Overlay", hint: "Button overlays image." },
    { id: "editorial", name: "Editorial", hint: "Large visual product card." },
    { id: "compact", name: "Compact", hint: "Dense shopping card." },
  ],
  faq: [
    { id: "accordion", name: "Accordion", hint: "Expandable row." },
    { id: "card", name: "Card", hint: "Question card." },
    { id: "numbered", name: "Numbered", hint: "Numbered support answer." },
  ],
  review: [
    { id: "stars", name: "Stars", hint: "Star review card." },
    { id: "quote", name: "Quote", hint: "Typography-led quote." },
    { id: "compact", name: "Compact", hint: "Small testimonial." },
  ],
  category: [
    { id: "image", name: "Image", hint: "Image-led category." },
    { id: "pill", name: "Pill", hint: "Small rounded pill." },
    { id: "icon", name: "Icon", hint: "Icon category." },
    { id: "editorial", name: "Editorial", hint: "Large category tile." },
  ],
  option: [
    { id: "pill", name: "Pill", hint: "Rounded option buttons." },
    { id: "swatch", name: "Swatch", hint: "Color/size swatches." },
    { id: "list", name: "List", hint: "Stacked options." },
  ],
};

function blockVariationsFor(sectionKind?: string, item?: Record<string, unknown>) {
  if (!sectionKind || !item) return [];
  if ("question" in item) return BLOCK_VARIATIONS.faq;
  if ("quote" in item || "person" in item) return BLOCK_VARIATIONS.review;
  if ("mappedStoreProductId" in item || "priceLabel" in item) return BLOCK_VARIATIONS.product;
  if (sectionKind === "category-list" || sectionKind === "category-grid" || sectionKind === "lookbook-grid") return BLOCK_VARIATIONS.category;
  if ("values" in item) return BLOCK_VARIATIONS.option;
  return BLOCK_VARIATIONS.card;
}

const HEADER_CATEGORY_VARIATIONS = [
  { id: "simple", name: "Simple nav" },
  { id: "bar", name: "Category bar" },
  { id: "mega", name: "Mega menu" },
  { id: "drawer", name: "Category drawer" },
];

const SECTION_GUIDES: Record<string, string> = {
  header: "Choose what appears in the header: logo, menu, search, wishlist, cart and category navigation.",
  "category-list": "Categories help shoppers browse your products by need, collection, or department.",
  "featured-products": "Feature best sellers, new arrivals, sale items, or hand-picked products.",
  "cart-summary": "Cart sections should show items, subtotal, delivery expectations, discounts and checkout action.",
  "checkout-form": "Checkout should collect contact, delivery, payment, coupon and notes with minimal friction.",
  "wishlist-grid": "Wishlist keeps saved products synced so shoppers can return later.",
  faq: "FAQ answers common buying questions and reduces support messages.",
  "blog-index": "Blog previews let sellers inspect article layouts before publishing.",
  footer: "Footer should expose support, legal policies, contact, payments, and important links.",
};

const NON_NAV_PAGE_TYPES = new Set(["product", "product-detail"]);

function pageGroupFor(pageType: string): PageGroup {
  if (DYNAMIC_TEMPLATE_PAGE_TYPES.has(pageType)) return "templates";
  if (COMMERCE_PAGE_TYPES.has(pageType)) return "commerce";
  if (LEGAL_PAGE_TYPES.has(pageType)) return "legal";
  if (pageType === "blog") return "blog";
  return "pages";
}

function pageStatusFor(pageType: string, sectionCount: number, publishedPosts = 0) {
  if (DYNAMIC_TEMPLATE_PAGE_TYPES.has(pageType)) return "Template";
  if (COMMERCE_PAGE_TYPES.has(pageType)) return "System generated";
  if (pageType === "blog" && publishedPosts === 0) return "Inactive";
  if (LEGAL_PAGE_TYPES.has(pageType)) return sectionCount > 0 ? "Draft policy" : "Not created";
  if (pageType === "home" || pageType === "homepage") return "Draft";
  return sectionCount > 0 ? "Draft" : "Empty";
}

function cloneSnapshot(snapshot: StoreEditorSnapshot): StoreEditorSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as StoreEditorSnapshot;
}

function sectionLabel(sectionId: string, section?: TemplateSectionNode | null) {
  if (section?.name) return section.name;
  const base = sectionId.replace(/_\d+$/, "");
  return SEC_LABELS[base] ?? base;
}

function templateKindForElement(elementId: string) {
  return TEMPLATE_KIND_BY_ELEMENT[elementId] ?? elementId;
}

function isContentKind(kind?: string) {
  return Boolean(kind && !["announcement-bar", "header", "footer"].includes(kind));
}

// ─── SEC HTML GENERATORS (no emojis) ─────────────────────────────────────────
function makeSec(n = "My Store", prods: StoreProduct[] = []): Record<string, () => string> {
  const ph = (h: number) => `<div class="img-ph s-card-img" style="height:${h}px">${IMG_PH}</div>`;
  const stars = `<div class="s-rev-stars">${STAR_SVG.repeat(5)}</div>`;

  const prodCards = prods.length > 0
    ? prods.slice(0, 4).map(p => {
        const price = p.retailPrice ? `${p.currency ?? "NGN"} ${p.retailPrice.toLocaleString()}` : "—";
        return `<div class="s-card">${ph(180)}<div class="s-card-info"><div class="s-card-name">${p.name}</div><span class="s-card-price">${price}</span></div></div>`;
      }).join("")
    : ["Product One", "Product Two", "Product Three", "Product Four"].map(name =>
        `<div class="s-card">${ph(180)}<div class="s-card-info"><div class="s-card-name">${name}</div><span class="s-card-price">—</span></div></div>`
      ).join("");

  return {
    nav: () => `<div class="s-nav"><div class="s-logo">${n}</div><div class="s-nav-links"><a class="s-nav-link">Home</a><a class="s-nav-link">Shop</a><a class="s-nav-link">About</a><a class="s-nav-link">Contact</a></div><div class="s-nav-acts"><button class="s-search-btn">${SEARCH_SVG}</button><button class="s-cart-btn">${CART_SVG} Cart</button></div></div>`,
    hero: () => `<div class="s-hero"><div class="s-hero-text"><div class="s-hero-badge">New Collection</div><h1 class="s-hero-h">Your Store<br><em>Headline Here</em></h1><p class="s-hero-p">Write a short description of what makes your store unique. This is your first impression — make it count.</p><div class="s-hero-btns"><button class="sbtn-c">Shop Now</button><button class="sbtn-o">Learn More</button></div></div><div class="s-hero-img">${IMG_PH}<span class="s-hero-img-lbl">Hero Image</span></div></div>`,
    trust: () => `<div class="s-trust"><div class="s-trust-i">${TRUCK_SVG}<span>Free delivery on orders over NGN 50,000</span></div><div class="s-trust-i">${LOCK_SVG}<span>Secure payments</span></div><div class="s-trust-i">${RETURN_SVG}<span>Easy 14-day returns</span></div><div class="s-trust-i">${HEADSET_SVG}<span>24/7 customer support</span></div></div>`,
    products: () => `<div class="s-sec"><h2 class="s-title">Featured Products</h2><p class="s-sub">Handpicked favourites from your collection</p><div class="s-prods c4">${prodCards}</div></div>`,
    banner: () => `<div class="s-banner"><h2 class="s-banner-h">Mid-Season Sale</h2><p class="s-banner-p">Limited time offer. Shop before stocks run out.</p><button class="sbtn-c">Shop the Sale</button></div>`,
    reviews: () => `<div class="s-sec alt"><h2 class="s-title">What Customers Say</h2><p class="s-sub">Trusted by thousands of shoppers</p><div class="s-revs"><div class="s-rev">${stars}<p class="s-rev-txt">"Add a real customer review here. Authentic reviews build trust and increase conversions."</p><div class="s-rev-name">Customer Name</div><div class="s-rev-loc">Lagos, Nigeria</div></div><div class="s-rev">${stars}<p class="s-rev-txt">"Another happy customer review. Share genuine experiences from your buyers."</p><div class="s-rev-name">Customer Name</div><div class="s-rev-loc">Accra, Ghana</div></div><div class="s-rev">${stars}<p class="s-rev-txt">"A third review builds social proof and encourages first-time buyers."</p><div class="s-rev-name">Customer Name</div><div class="s-rev-loc">Nairobi, Kenya</div></div></div></div>`,
    newsletter: () => `<div class="s-nl"><h2>Stay in the Loop</h2><p>Get new arrivals, exclusive offers, and updates delivered to your inbox.</p><div class="s-nl-f"><input class="s-nl-i" placeholder="Enter your email" type="email"/><button class="sbtn-c">Subscribe</button></div></div>`,
    footer: () => `<div class="s-footer"><div class="s-footer-g"><div><div class="s-footer-logo">${n}</div><p class="s-footer-tag">Your store tagline goes here. Tell customers what you stand for.</p></div><div><div class="s-footer-ht">Shop</div><a class="s-footer-lnk">All Products</a><a class="s-footer-lnk">New Arrivals</a><a class="s-footer-lnk">Sale</a></div><div><div class="s-footer-ht">Help</div><a class="s-footer-lnk">FAQ</a><a class="s-footer-lnk">Returns</a><a class="s-footer-lnk">Contact</a></div><div><div class="s-footer-ht">Company</div><a class="s-footer-lnk">About Us</a><a class="s-footer-lnk">Blog</a><a class="s-footer-lnk">Privacy</a></div></div><div class="s-footer-btm"><span>&#169; ${new Date().getFullYear()} ${n}. All rights reserved.</span><span>Powered by Shopinbos</span></div></div>`,
    "shop-hd": () => `<div class="s-shop-hd"><h1 class="s-shop-h1">All Products</h1><p style="color:var(--g500);font-size:13px">Browse our full catalogue</p></div>`,
    "shop-body": () => `<div class="s-shop-body"><div class="s-shop-sb"><div class="s-filter-g"><div class="s-filter-t">Category</div><label class="s-filter-o"><input type="checkbox"> All</label><label class="s-filter-o"><input type="checkbox"> Category One</label><label class="s-filter-o"><input type="checkbox"> Category Two</label></div><div class="s-filter-g"><div class="s-filter-t">Price</div><label class="s-filter-o"><input type="radio" name="pr"> Under NGN 10,000</label><label class="s-filter-o"><input type="radio" name="pr" checked> NGN 10k&#8211;30k</label></div></div><div class="s-shop-prods"><div class="s-shop-bar"><span class="s-shop-cnt">Products</span></div><div class="s-prods c3">${prodCards}</div></div></div>`,
    "prod-body": () => `<div class="s-prod-body"><div class="s-prod-gallery"><div class="s-prod-main img-ph">${IMG_PH}</div><div class="s-prod-thumbs">${[1,2,3].map(() => `<div class="s-prod-thumb img-ph">${IMG_PH}</div>`).join("")}</div></div><div class="s-prod-info"><h1 class="s-prod-h">Product Name</h1><div class="s-prod-price-row"><span class="s-prod-price">NGN 0</span></div><p class="s-prod-desc">Add your product description here. Explain what makes this product special, its materials, sizing, or unique features.</p><div class="s-prod-opts"><div class="s-opt-l">Size</div><div class="s-opt-bs"><button class="s-opt-b on">S</button><button class="s-opt-b">M</button><button class="s-opt-b">L</button></div></div><div class="s-prod-qty"><button class="s-qty-b">&#8722;</button><div class="s-qty-v">1</div><button class="s-qty-b">+</button></div><button class="s-atc">Add to Cart</button><button class="s-byn">Buy Now</button></div></div>`,
    "prod-reviews": () => `<div class="s-sec alt"><h2 class="s-title">Customer Reviews</h2><div class="s-revs"><div class="s-rev">${stars}<p class="s-rev-txt">"Add real customer reviews here to build trust with new shoppers."</p><div class="s-rev-name">Customer</div></div><div class="s-rev">${stars}<p class="s-rev-txt">"Genuine reviews increase conversion rates significantly."</p><div class="s-rev-name">Customer</div></div><div class="s-rev"><div class="s-rev-stars">${STAR_SVG.repeat(4)}${STAR_O_SVG}</div><p class="s-rev-txt">"Great product, fast delivery!"</p><div class="s-rev-name">Customer</div></div></div></div>`,
    "ab-hero": () => `<div class="s-about-hero"><h1>Our Story</h1><p>Tell customers who you are and why you started. This is your chance to connect authentically with your audience.</p></div>`,
    "ab-story": () => `<div class="s-about-story"><div class="s-about-img">${IMG_PH}</div><div><h2 class="s-title" style="text-align:left">From Passion to Business</h2><p style="color:var(--g600);line-height:1.8;margin-bottom:14px">Write your brand story here. Share where you started, what drives you, and what makes your business different from others in your space.</p><p style="color:var(--g600);line-height:1.8">Your story creates a genuine connection with customers who share your values.</p></div></div>`,
    team: () => `<div class="s-sec"><h2 class="s-title">Meet the Team</h2><p class="s-sub">The people behind your favourite store</p><div class="s-team-g">${[1,2,3].map(() => `<div class="s-team-c"><div class="s-team-av">${USER_SVG}</div><div class="s-team-nm">Team Member</div><div class="s-team-rl">Role / Title</div></div>`).join("")}</div></div>`,
    "ct-body": () => `<div class="s-ct-body"><div class="s-ct-left"><h2 class="s-title" style="text-align:left">Get in Touch</h2><p style="color:var(--g500);margin-bottom:10px;font-size:13px">We'd love to hear from you. Fill in your contact details in the editor.</p><div class="s-ct-info"><div class="s-ct-item">${MAIL_SVG}<span>hello@yourstore.com</span></div><div class="s-ct-item">${PHONE_SVG}<span>+234 000 000 0000</span></div><div class="s-ct-item">${PIN_SVG}<span>Your address here</span></div></div></div><div class="s-ct-form"><h3 style="font-family:var(--serif);font-size:17px;color:var(--navy);margin-bottom:14px">Send a Message</h3><div class="s-frow"><div class="s-fld"><label>First Name</label><input placeholder="John"/></div><div class="s-fld"><label>Last Name</label><input placeholder="Doe"/></div></div><div class="s-fld"><label>Email</label><input placeholder="john@email.com" type="email"/></div><div class="s-fld"><label>Message</label><textarea placeholder="How can we help?"></textarea></div><button class="sbtn-c" style="width:100%">Send Message</button></div></div>`,
    "bl-hd": () => `<div class="s-blog-hd"><h1>Our Blog</h1><p style="color:var(--g500);font-size:14px">Insights, tips, and stories from our team</p></div>`,
    "blog-grid": () => `<div class="s-blog-g">${[1,2,3].map(i => `<div class="s-blog-card"><div class="s-bc-img img-ph">${IMG_PH}</div><div class="s-bc-body"><div class="s-bc-cat">Category</div><h3 class="s-bc-title">Blog Post Title ${i}</h3><p class="s-bc-ex">A short excerpt from your blog post goes here. Write about topics relevant to your audience.</p><div class="s-bc-meta"><span>Date</span><span>5 min read</span></div></div></div>`).join("")}</div>`,
    gallery: () => `<div class="s-sec"><h2 class="s-title">Gallery</h2><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">${Array(8).fill(0).map(() => `<div class="img-ph" style="height:140px;border-radius:8px">${IMG_PH}</div>`).join("")}</div></div>`,
    features: () => `<div class="s-sec"><h2 class="s-title">Why Choose Us</h2><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:24px">${[["Quality", "Every product is carefully curated"], ["Delivery", "Fast nationwide delivery"], ["Support", "Dedicated customer service"]].map(([t, d]) => `<div style="text-align:center;padding:20px"><div style="width:40px;height:40px;border-radius:10px;background:var(--teal3);display:flex;align-items:center;justify-content:center;margin:0 auto 10px;color:var(--teal)">${STAR_O_SVG}</div><h3 style="font-family:var(--serif);color:var(--navy);margin-bottom:6px;font-size:15px">${t}</h3><p style="font-size:13px;color:var(--g500)">${d}</p></div>`).join("")}</div></div>`,
    text: () => `<div class="s-sec"><p style="max-width:680px;margin:0 auto;text-align:center;font-size:15px;color:var(--g600);line-height:1.8">Add your text content here. Double-click to edit or use the Content panel on the right.</p></div>`,
    image: () => `<div style="padding:32px 40px"><div class="img-ph" style="height:280px;border-radius:10px;border:2px dashed var(--g200)">${IMG_PH}<span style="font-size:13px;margin-top:8px;display:block">Click to add image</span></div></div>`,
    button: () => `<div class="s-sec" style="text-align:center;padding:28px 40px"><button class="sbtn-c">Button Text</button></div>`,
    divider: () => `<div style="padding:12px 40px"><hr style="border:none;border-top:1px solid var(--g200)"/></div>`,
    spacer: () => `<div style="height:60px"></div>`,
    columns: () => `<div class="s-sec"><div style="display:grid;grid-template-columns:1fr 1fr;gap:28px"><div style="background:var(--g50);border-radius:8px;padding:24px;min-height:140px;border:1px dashed var(--g200);display:flex;align-items:center;justify-content:center;color:var(--g400);font-size:13px">Column 1 content</div><div style="background:var(--g50);border-radius:8px;padding:24px;min-height:140px;border:1px dashed var(--g200);display:flex;align-items:center;justify-content:center;color:var(--g400);font-size:13px">Column 2 content</div></div></div>`,
    atc: () => `<div class="s-sec" style="text-align:center;padding:28px 40px"><button class="s-atc" style="width:280px">Add to Cart</button></div>`,
    countdown: () => `<div style="background:var(--navy);padding:20px 40px;text-align:center"><p style="color:var(--teal2);font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px">OFFER ENDS IN</p><div style="display:flex;gap:12px;justify-content:center">${["DAYS","HRS","MIN","SEC"].map(l => `<div style="text-align:center"><div style="background:rgba(255,255,255,.1);border-radius:6px;padding:8px 14px;font-size:28px;font-weight:700;color:#fff;min-width:52px">00</div><div style="font-size:9px;color:rgba(255,255,255,.5);margin-top:3px">${l}</div></div>`).join("")}</div></div>`,
    stars: () => `<div class="s-sec" style="text-align:center;padding:20px 40px"><div style="font-size:22px;display:flex;justify-content:center;gap:4px;color:var(--coral)">${STAR_SVG.repeat(5)}</div><p style="font-size:13px;color:var(--g600);margin-top:8px">4.9 / 5 based on customer reviews</p></div>`,
    whatsapp: () => `<div style="position:relative;min-height:72px"><div style="position:absolute;bottom:16px;right:20px;background:#25D366;color:#fff;border-radius:50%;width:50px;height:50px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(37,211,102,.4);cursor:pointer"><svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg></div></div>`,
  };
}

// ─── ELEMENTS CATALOGUE ───────────────────────────────────────────────────────
const PageSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
const HomeSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`;
const LayerSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`;
const GridSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`;
const TypeSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>`;
const ImgSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="m3 15 5-5 4 4 3-3 6 6"/><circle cx="8.5" cy="8.5" r="1.5"/></svg>`;
const ColSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="18" rx="1"/><rect x="13" y="3" width="8" height="18" rx="1"/></svg>`;
const BtnSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="10" rx="5"/></svg>`;
const DivSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/></svg>`;
const SpaceSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 16 12 21 17 16"/><polyline points="7 8 12 3 17 8"/></svg>`;
const TimerSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
const StarSVGEl = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
const NavSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`;
const HeroSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>`;
const ShopSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`;
const ReviewSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
const MailSVGEl = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`;
const FooterSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
const ChatSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 21 1.9-5.7A8.5 8.5 0 1 1 5.8 17.5z"/></svg>`;
const SparkSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
const SendSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;
const EyeSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const TrashSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
const CopySVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const PaletteSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="14.5" r="2.5"/><circle cx="6.5" cy="14.5" r="2.5"/></svg>`;
const UpSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>`;
const DownSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
const XSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
const UploadSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`;
const BackSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`;
const SelectSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`;
const BlogSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`;
const DesktopSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`;
const TabletSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>`;
const MobileSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>`;

const ELEMENTS = [
  { cat: "Store", items: [
    { id: "nav", svg: NavSVG, lbl: "Navigation" },
    { id: "hero", svg: HeroSVG, lbl: "Hero" },
    { id: "trust", svg: SelectSVG, lbl: "Trust Bar" },
    { id: "products", svg: ShopSVG, lbl: "Products" },
    { id: "banner", svg: HeroSVG, lbl: "Banner" },
    { id: "reviews", svg: ReviewSVG, lbl: "Reviews" },
    { id: "newsletter", svg: MailSVGEl, lbl: "Newsletter" },
    { id: "footer", svg: FooterSVG, lbl: "Footer" },
  ]},
  { cat: "Blocks", items: [
    { id: "features", svg: GridSVG, lbl: "Features" },
    { id: "gallery", svg: ImgSVG, lbl: "Gallery" },
    { id: "text", svg: TypeSVG, lbl: "Text" },
    { id: "image", svg: ImgSVG, lbl: "Image" },
    { id: "columns", svg: ColSVG, lbl: "Columns" },
    { id: "button", svg: BtnSVG, lbl: "Button" },
    { id: "divider", svg: DivSVG, lbl: "Divider" },
    { id: "spacer", svg: SpaceSVG, lbl: "Spacer" },
  ]},
  { cat: "Commerce", items: [
    { id: "atc", svg: ShopSVG, lbl: "Add to Cart" },
    { id: "countdown", svg: TimerSVG, lbl: "Countdown" },
    { id: "stars", svg: StarSVGEl, lbl: "Stars" },
  ]},
  { cat: "Social", items: [
    { id: "whatsapp", svg: ChatSVG, lbl: "WhatsApp" },
  ]},
];

const BLOCK_LIBRARY: BlockItem[] = [
  { id: "text-point", svg: TypeSVG, lbl: "Text point", sectionKinds: ["story-split", "text-columns"] },
  { id: "image-tile", svg: ImgSVG, lbl: "Image tile", sectionKinds: ["category-list", "lookbook-grid"] },
  { id: "product-card", svg: ShopSVG, lbl: "Product card", sectionKinds: ["featured-products", "cart-summary", "wishlist-grid"] },
  { id: "review", svg: ReviewSVG, lbl: "Review", sectionKinds: ["testimonials"] },
  { id: "faq", svg: SelectSVG, lbl: "FAQ item", sectionKinds: ["faq"] },
  { id: "filter", svg: GridSVG, lbl: "Filter option", sectionKinds: ["filters-toolbar"] },
  { id: "option", svg: ColSVG, lbl: "Product option", sectionKinds: ["product-detail"] },
  { id: "cta", svg: BtnSVG, lbl: "CTA button", sectionKinds: ["hero-split", "promo-banner", "newsletter", "contact-form", "story-split"] },
  { id: "whatsapp-cta", svg: ChatSVG, lbl: "WhatsApp CTA", sectionKinds: ["contact-form", "footer"] },
];

// ─── RIGHT PANEL CONTENT ──────────────────────────────────────────────────────
function getRpContentHtml(secId: string | null): string {
  if (!secId) return `<div class="rp-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32"><path d="M15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9l-6-6z"/></svg><p style="font-size:12px;color:var(--g500);margin-top:4px">Select a section to edit its content</p></div>`;
  const base = secId.replace(/_\d+$/, "");
  const map: Record<string, string> = {
    hero: `<div class="rps"><div class="rpst">Hero Text</div><div class="rf"><label class="rl">Eyebrow</label><input class="ri" placeholder="e.g. New Collection"/></div><div class="rf"><label class="rl">Headline</label><textarea class="rtx" rows="2" placeholder="Your store headline"></textarea></div><div class="rf"><label class="rl">Subheading</label><textarea class="rtx" rows="2" placeholder="Short description"></textarea></div></div><div class="rps"><div class="rpst">Buttons</div><div class="rf"><label class="rl">Primary</label><input class="ri" placeholder="e.g. Shop Now"/></div><div class="rf"><label class="rl">Secondary</label><input class="ri" placeholder="e.g. Learn More"/></div></div>`,
    trust: `<div class="rps"><div class="rpst">Trust Items</div><div class="rf"><label class="rl">Item 1</label><input class="ri" placeholder="e.g. Free delivery..."/></div><div class="rf"><label class="rl">Item 2</label><input class="ri" placeholder="e.g. Secure payments"/></div><div class="rf"><label class="rl">Item 3</label><input class="ri" placeholder="e.g. Easy returns"/></div><div class="rf"><label class="rl">Item 4</label><input class="ri" placeholder="e.g. 24/7 support"/></div><button class="rp-btn-add">+ Add Item</button></div>`,
    products: `<div class="rps"><div class="rpst">Section</div><div class="rf"><label class="rl">Title</label><input class="ri" placeholder="e.g. Featured Products"/></div><div class="rf"><label class="rl">Subtitle</label><input class="ri" placeholder="e.g. Handpicked favourites"/></div></div><div class="rps"><div class="rpst">Layout</div><div class="rf"><label class="rl">Columns</label><div class="rbg"><button class="rbgb">2</button><button class="rbgb">3</button><button class="rbgb on">4</button></div></div></div>`,
    banner: `<div class="rps"><div class="rpst">Banner</div><div class="rf"><label class="rl">Headline</label><input class="ri" placeholder="e.g. End of Season Sale"/></div><div class="rf"><label class="rl">Subtext</label><input class="ri" placeholder="e.g. Up to 40% off"/></div><div class="rf"><label class="rl">Button Text</label><input class="ri" placeholder="e.g. Shop Now"/></div></div>`,
    reviews: `<div class="rps"><div class="rpst">Section</div><div class="rf"><label class="rl">Title</label><input class="ri" placeholder="e.g. What Customers Say"/></div></div><div class="rps"><div class="rpst">Reviews</div><div class="rf"><label class="rl">Review 1</label><textarea class="rtx" rows="2" placeholder="Customer quote..."></textarea></div><div class="rf"><label class="rl">Reviewer Name</label><input class="ri" placeholder="e.g. Adaeze O."/></div><button class="rp-btn-add">+ Add Review</button></div>`,
    newsletter: `<div class="rps"><div class="rpst">Newsletter</div><div class="rf"><label class="rl">Heading</label><input class="ri" placeholder="e.g. Stay in the Loop"/></div><div class="rf"><label class="rl">Subtext</label><input class="ri" placeholder="e.g. Get new arrivals..."/></div><div class="rf"><label class="rl">Button</label><input class="ri" placeholder="e.g. Subscribe"/></div></div>`,
    footer: `<div class="rps"><div class="rpst">Footer</div><div class="rf"><label class="rl">Tagline</label><textarea class="rtx" rows="2" placeholder="Your store tagline"></textarea></div><div class="rf"><label class="rl">Copyright</label><input class="ri" placeholder="© 2025 Your Store"/></div></div>`,
    nav: `<div class="rps"><div class="rpst">Navigation</div><div class="rf"><label class="rl">Logo Text</label><input class="ri" placeholder="Store name"/></div></div><div class="rps"><div class="rpst">Links</div><div class="rf"><label class="rl">Link 1</label><input class="ri" placeholder="Home"/></div><div class="rf"><label class="rl">Link 2</label><input class="ri" placeholder="Shop"/></div><div class="rf"><label class="rl">Link 3</label><input class="ri" placeholder="About"/></div><button class="rp-btn-add">+ Add Link</button></div>`,
  };
  return map[base] ?? `<div class="rp-empty"><p style="font-size:12px">No content settings for <strong>${SEC_LABELS[base] ?? base}</strong></p></div>`;
}

const RP_DESIGN = `<div class="rps"><div class="rpst">Background</div><div class="rf"><label class="rl">Color</label><div class="rr-row"><input type="color" class="rcsw" value="#ffffff"/><input class="ri" value="#ffffff" style="flex:1"/></div></div><div class="rf"><label class="rl">Style</label><select class="rsel"><option>Solid</option><option>Gradient</option></select></div></div><div class="rps"><div class="rpst">Typography</div><div class="rf"><label class="rl">Heading Font</label><select class="rsel"><option>Fraunces (Serif)</option><option>Space Grotesk</option></select></div><div class="rf"><label class="rl">Heading Color</label><div class="rr-row"><input type="color" class="rcsw" value="#0F1F3D"/><input class="ri" value="#0F1F3D" style="flex:1"/></div></div></div><div class="rps"><div class="rpst">Spacing</div><div class="rf"><label class="rl">Padding</label><div class="rr-row"><input type="range" class="rr" min="0" max="120" value="52"/><span class="rr-v">52px</span></div></div></div>`;

const RP_SEO = `<div class="rps"><div class="rpst">Page SEO</div><div class="rf"><label class="rl">Page Title</label><input class="ri" placeholder="Page title for search engines"/></div><div class="rf"><label class="rl">Meta Description</label><textarea class="rtx" rows="3" placeholder="Brief description of this page (155 chars)"></textarea></div><div class="rf"><label class="rl">Keywords</label><input class="ri" placeholder="keyword1, keyword2"/></div></div><div class="rps"><div class="rpst">Preview</div><div class="seo-preview"><div class="seo-t">Page Title &#8212; Store Name</div><div class="seo-u">yourstore.shopinbos.com</div><div class="seo-d">Your meta description will appear here in search results.</div></div></div>`;

// ─── COMPONENT ────────────────────────────────────────────────────────────────
export function StoreEditor({ initialRexOpen = false }: EditorProps) {
  const router = useRouter();
  const [screen, setScreen] = useState<"editor" | "preview" | "blog">("editor");
  const [page, setPage] = useState<string>("homepage");
  const [device, setDevice] = useState<DeviceKey>("desktop");
  const [zoom, setZoom] = useState(100);
  const [sel, setSel] = useState<string | null>(null);
  const [lCol, setLCol] = useState(false);
  const [rCol, setRCol] = useState(false);
  const [rpTab, setRpTab] = useState<RpTab>("content");
  const [sbTab, setSbTab] = useState<SbTab>("pages");
  const [storeName, setStoreName] = useState("My Store");
  const [storeSlug, setStoreSlug] = useState("my-store");
  const [storeProducts, setStoreProducts] = useState<StoreProduct[]>([]);
  const [storeDescription, setStoreDescription] = useState<string | null>(null);
  const [storeLogoUrl, setStoreLogoUrl] = useState<string | null>(null);
  const [storeCity, setStoreCity] = useState<string | null>(null);
  const [storeCountry, setStoreCountry] = useState<string | null>(null);
  const [storeCurrency, setStoreCurrency] = useState("NGN");
  const [draft, setDraft] = useState<StoreEditorSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [launchPricing, setLaunchPricing] = useState<StoreLaunchPricing | null>(null);
  const [pages, setPages] = useState<Record<string, { title: string; secs: string[] }>>(() => {
    const p: Record<string, { title: string; secs: string[] }> = {};
    Object.keys(DEFAULT_PAGES).forEach(k => { p[k] = { ...DEFAULT_PAGES[k], secs: [] }; });
    return p;
  });

  const [modal, setModal] = useState<"" | "newpage" | "sectionpicker" | "publish">("");
  const [insertAfterSec, setInsertAfterSec] = useState<string | null>(null);
  const [pubStep, setPubStep] = useState(0);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; secId: string } | null>(null);

  const [rexOpen, setRexOpen] = useState(initialRexOpen);
  const [rexMsgs, setRexMsgs] = useState<Array<{ role: "ai" | "usr"; text: string; time: string }>>([
    { role: "ai", text: "Hi! I'm Rex, your AI store assistant. I can help you write copy, design sections, and optimise your store. What would you like to build?", time: nowTime() }
  ]);
  const [rexInput, setRexInput] = useState("");
  const [rexBusy, setRexBusy] = useState(false);

  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [selPost, setSelPost] = useState<BlogPost | null>(null);

  const [toast, setToast] = useState<{ msg: string; ok: boolean; show: boolean }>({ msg: "", ok: true, show: false });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rexMsgsRef = useRef<HTMLDivElement>(null);

  function nowTime() { return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }

  const showToast = useCallback((msg: string, ok = true) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, ok, show: true });
    toastTimer.current = setTimeout(() => setToast(t => ({ ...t, show: false })), 2600);
  }, []);

  const currentDraftPage = draft?.pages.find(entry => entry.pageType === page) ?? draft?.pages[0] ?? null;
  const selectedDraftSection = currentDraftPage?.sections.find(section => section.id === sel) ?? null;
  const curSecs = currentDraftPage ? currentDraftPage.sections.map(section => section.id) : (pages[page]?.secs ?? []);
  const pageRows = Object.keys(pages).map(key => {
    const pageType = key === "homepage" ? "home" : key;
    const sectionCount = draft?.pages.find(entry => entry.pageType === key)?.sections.length ?? pages[key]?.secs?.length ?? 0;
    return {
      key,
      pageType,
      group: pageGroupFor(pageType),
      title: pages[key]?.title ?? PAGE_TYPE_LABELS[pageType] ?? key,
      sectionCount,
      status: pageStatusFor(pageType, sectionCount, posts.filter(post => post.status === "published").length),
    };
  });
  const visiblePageKeys = pageRows.filter(row => row.group === "pages" || row.group === "blog" || row.group === "legal").map(row => row.key);
  const groupedPageRows = (["pages", "templates", "commerce", "blog", "legal"] as PageGroup[]).map(group => ({
    group,
    rows: pageRows.filter(row => row.group === group),
  })).filter(entry => entry.rows.length > 0 || entry.group === "pages" || entry.group === "templates" || entry.group === "commerce");
  const SEC = makeSec(storeName, storeProducts);
  const surfaceStore: SurfaceStore = {
    name: storeName,
    slug: storeSlug,
    description: storeDescription,
    logoUrl: storeLogoUrl,
    city: storeCity,
    country: storeCountry,
    currency: storeCurrency,
    storeProducts: storeProducts.map(product => ({
      id: product.id,
      name: product.name,
      description: product.description ?? null,
      images: product.images,
      retailPrice: product.retailPrice ?? 0,
      currency: product.currency ?? storeCurrency,
      avgRating: product.avgRating,
      reviewCount: product.reviewCount,
    })),
  };

  const updateDraft = useCallback((updater: (snapshot: StoreEditorSnapshot) => StoreEditorSnapshot) => {
    setDraft(prev => {
      if (!prev) return prev;
      const next = updater(cloneSnapshot(prev));
      next.updatedAt = new Date().toISOString();
      setSaved(false);
      return next;
    });
  }, []);

  const getInsertionContext = useCallback((beforeSectionId: string | null = insertAfterSec) => {
    const sections = currentDraftPage?.sections ?? [];
    const rawIndex = beforeSectionId ? sections.findIndex(section => section.id === beforeSectionId) : sections.length;
    const index = rawIndex === -1 ? sections.length : rawIndex;
    const previous = sections[index - 1] ?? null;
    const next = sections[index] ?? null;
    const firstContentIndex = sections.findIndex(section => isContentKind(section.kind));
    const headerIndex = sections.findIndex(section => section.kind === "header");
    const footerIndex = sections.findIndex(section => section.kind === "footer");
    const topBoundary = firstContentIndex === -1
      ? headerIndex === -1 ? 0 : headerIndex + 1
      : firstContentIndex;

    return {
      sections,
      index,
      previous,
      next,
      hasHeader: sections.some(section => section.kind === "header"),
      hasFooter: footerIndex !== -1,
      hasHero: sections.some(section => section.kind === "hero-split"),
      atTop: index <= Math.max(0, topBoundary),
      nearFooter: next?.kind === "footer" || index >= (footerIndex === -1 ? sections.length : footerIndex),
      inBody: previous?.kind !== "footer" && next?.kind !== "header",
    };
  }, [currentDraftPage, insertAfterSec]);

  const canAddElementAt = useCallback((item: ElementItem, beforeSectionId: string | null = insertAfterSec) => {
    if (!draft || !currentDraftPage) return true;

    const kind = templateKindForElement(item.id);
    const ctx = getInsertionContext(beforeSectionId);
    const pageType = currentDraftPage.pageType;
    const bodyOnlyKinds = new Set([
      "trust-strip",
      "text-columns",
      "featured-products",
      "promo-banner",
      "testimonials",
      "newsletter",
      "category-list",
      "product-detail",
    ]);

    if (["button", "divider", "spacer", "image", "whatsapp"].includes(item.id)) return false;
    if (item.id === "atc" || kind === "product-detail") return false;
    if (kind === "header") return !ctx.hasHeader && ctx.atTop;
    if (kind === "footer") return !ctx.hasFooter && ctx.nearFooter && ctx.sections.some(section => isContentKind(section.kind));
    if (kind === "hero-split") return !ctx.hasHero && ctx.atTop && pageType !== "cart" && pageType !== "checkout";
    if (kind === "contact-form") return pageType === "contact" && ctx.inBody && ctx.nearFooter && !ctx.atTop;
    if (kind === "featured-products") return pageType !== "checkout" && pageType !== "cart" && ctx.inBody && !ctx.atTop;
    if (kind === "newsletter") return ctx.inBody && ctx.nearFooter && !ctx.atTop;
    if (bodyOnlyKinds.has(kind)) return ctx.inBody && !ctx.atTop;
    return ctx.inBody;
  }, [currentDraftPage, draft, getInsertionContext, insertAfterSec]);

  const sectionPickerGroups = draft
    ? ELEMENTS.map(group => ({
        ...group,
        items: group.items.filter(item => canAddElementAt(item)),
      })).filter(group => group.items.length > 0)
    : ELEMENTS;

  const defaultBodyInsertBefore = currentDraftPage?.sections.find(section => section.kind === "footer")?.id ?? null;
  const sidebarInsertBefore = currentDraftPage && sel
    ? currentDraftPage.sections[currentDraftPage.sections.findIndex(section => section.id === sel) + 1]?.id ?? defaultBodyInsertBefore
    : defaultBodyInsertBefore;
  const sidebarElementGroups = draft
    ? ELEMENTS.map(group => ({
        ...group,
        items: group.items.filter(item => canAddElementAt(item, sidebarInsertBefore)),
      })).filter(group => group.items.length > 0)
    : ELEMENTS;

  // CSS injection
  useEffect(() => {
    const style = document.createElement("style");
    style.id = "sbi-editor-css";
    style.textContent = EDITOR_CSS;
    document.head.appendChild(style);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.getElementById("sbi-editor-css")?.remove();
      document.body.style.overflow = prev;
    };
  }, []);

  // Window globals for onclick in innerHTML
  useEffect(() => {
    (window as any).goPg = (pg: string) => { if (pages[pg]) { setPage(pg); setSel(null); } };
    return () => { delete (window as any).goPg; };
  }, [pages]);

  // Rex scroll
  useEffect(() => {
    if (rexMsgsRef.current) rexMsgsRef.current.scrollTop = rexMsgsRef.current.scrollHeight;
  }, [rexMsgs]);

  useEffect(() => {
    if (!draft) return;
    const pageMap: Record<string, { title: string; secs: string[] }> = {};
    for (const draftPage of draft.pages) {
      pageMap[draftPage.pageType] = {
        title: draftPage.title ?? PAGE_TYPE_LABELS[draftPage.pageType] ?? draftPage.pageType,
        secs: draftPage.sections.map(section => section.id),
      };
    }
    setPages(pageMap);
    if (!draft.pages.some(draftPage => draftPage.pageType === page) || NON_NAV_PAGE_TYPES.has(page)) {
      setPage(draft.pages.find(draftPage => !NON_NAV_PAGE_TYPES.has(draftPage.pageType))?.pageType ?? "home");
      setSel(null);
    }
  }, [draft, page]);

  // Load from API or create blank snapshot
  useEffect(() => {
    fetch("/api/store/editor")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.data) throw new Error("No data");
        const { store, draft } = d.data;
        if (store?.name) setStoreName(store.name);
        if (store?.slug) setStoreSlug(store.slug);
        if (store?.description !== undefined) setStoreDescription(store.description);
        if (store?.logoUrl !== undefined) setStoreLogoUrl(store.logoUrl);
        if (store?.city !== undefined) setStoreCity(store.city);
        if (store?.country !== undefined) setStoreCountry(store.country);
        if (store?.currency) setStoreCurrency(store.currency);
        if (Array.isArray(store?.storeProducts)) setStoreProducts(store.storeProducts);
        if (draft?.pages && Array.isArray(draft.pages)) {
          setDraft(draft as StoreEditorSnapshot);
          const pageMap: Record<string, { title: string; secs: string[] }> = {};
          for (const draftPage of draft.pages) {
            pageMap[draftPage.pageType] = {
              title: draftPage.title ?? PAGE_TYPE_LABELS[draftPage.pageType] ?? draftPage.pageType,
              secs: Array.isArray(draftPage.sections) ? draftPage.sections.map((section: TemplateSectionNode) => section.id) : [],
            };
          }
          setPages(pageMap);
          setPage(draft.pages.find((draftPage: { pageType: string }) => !NON_NAV_PAGE_TYPES.has(draftPage.pageType))?.pageType ?? "home");
        }
      })
      .catch(() => {
        // Create blank snapshot if no draft exists
        const blank = createBlankEditorSnapshot(storeName);
        setDraft(blank);
      })
      .finally(() => setLoading(false));
  }, []);

  // Close ctx menu on outside click
  useEffect(() => {
    if (!ctxMenu) return;
    const h = (e: MouseEvent) => {
      if (!(document.getElementById("sbi-ctx")?.contains(e.target as Node))) setCtxMenu(null);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [ctxMenu]);

  // ── Unsaved changes guard ──
  const [leaveDialog, setLeaveDialog] = useState(false);
  const pendingLeaveDest = useRef<string | null>(null);

  useEffect(() => {
    if (saved) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [saved]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: CustomEvent) => {
      if (saved) { router.push(e.detail); return; }
      pendingLeaveDest.current = e.detail;
      setLeaveDialog(true);
    };
    window.addEventListener("editor:requestLeave" as any, handler as any);
    return () => window.removeEventListener("editor:requestLeave" as any, handler as any);
  }, [saved, router]);

  // Auto-save draft after 5s of inactivity
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doSaveRef = useRef<() => Promise<void>>(() => Promise.resolve());
  useEffect(() => {
    if (saved || !draft) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => { void doSaveRef.current(); }, 5000);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [saved, draft]);

  const renderSection = (secId: string) => {
    const base = secId.replace(/_\d+$/, "");
    const gen = SEC[base];
    return gen ? gen() : `<div style="padding:20px 40px;background:var(--g50);text-align:center;color:var(--g500);font-size:13px;border:1px dashed var(--g300)">[${SEC_LABELS[base] ?? base}]</div>`;
  };

  const doSave = useCallback(async () => {
    doSaveRef.current = doSave;
    setSaved(false);
    const snapshot = draft ?? {
      sbi_pages: Object.fromEntries(Object.entries(pages).map(([k, v]) => [k, v.secs])),
      storeName,
      savedAt: new Date().toISOString(),
    };
    try {
      await fetch("/api/store/editor", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot }),
      });
      showToast("Changes saved");
      setSaved(true);
    } catch {
      showToast("Failed to save", false);
      setSaved(true);
    }
  }, [draft, pages, storeName, showToast]);

  const uploadEditorImage = useCallback(async (file: File) => {
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("folder", "store-banners");
      const response = await fetch("/api/upload", { method: "POST", body });
      const json = await response.json().catch(() => null) as { data?: { publicUrl?: string }; error?: { message?: string } } | null;
      if (!response.ok || !json?.data?.publicUrl) {
        throw new Error(json?.error?.message ?? "Image upload failed.");
      }
      showToast(file.type.startsWith("video/") ? "Video uploaded" : "Image replaced");
      return json.data.publicUrl;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Image upload failed.", false);
      return null;
    }
  }, [showToast]);

  const updateStoreLogo = useCallback(async (url: string) => {
    setStoreLogoUrl(url);
    try {
      const response = await fetch("/api/app/store", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoUrl: url }),
      });
      if (!response.ok) throw new Error("Logo save failed.");
      showToast("Logo updated");
    } catch {
      showToast("Logo updated in editor, but could not be saved yet.", false);
    }
  }, [showToast]);

  const doPublish = useCallback(async () => {
    setPublishing(true);
    setPubStep(1);
    try {
      const response = await fetch("/api/store/editor/publish", { method: "POST" });
      const json = await response.json().catch(() => null) as {
        billing?: StoreLaunchPricing;
        error?: { message?: string };
      } | null;
      if (response.status === 402 && json?.billing) {
        setPubStep(0);
        setModal("");
        setLaunchPricing(json.billing);
        return;
      }
      if (!response.ok) throw new Error(json?.error?.message ?? "Publish failed");
      setPubStep(2);
      setTimeout(() => setPubStep(3), 1200);
    } catch (error) { showToast(error instanceof Error ? error.message : "Publish failed", false); }
    finally { setPublishing(false); }
  }, [showToast]);

  const startBlankStore = useCallback(async () => {
    const next = createBlankEditorSnapshot(storeName);
    setDraft(next);
    setPage("home");
    setSel(null);
    setSaved(false);
    try {
      const response = await fetch("/api/store/editor", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot: next }),
      });
      const json = await response.json().catch(() => null) as { data?: { draft?: StoreEditorSnapshot | null } } | null;
      if (json?.data?.draft) setDraft(json.data.draft);
      setSaved(true);
      showToast("Blank store created");
    } catch {
      showToast("Blank store created locally. Save when you are ready.", false);
    }
  }, [showToast, storeName]);

  const moveSecUp = (secId: string) => {
    if (draft) {
      updateDraft(snapshot => ({
        ...snapshot,
        pages: snapshot.pages.map(draftPage => {
          if (draftPage.pageType !== page) return draftPage;
          const sections = [...draftPage.sections];
          const i = sections.findIndex(section => section.id === secId);
          if (i <= 0) return draftPage;
          [sections[i - 1], sections[i]] = [sections[i]!, sections[i - 1]!];
          return { ...draftPage, sections };
        }),
      }));
      return;
    }
    setPages(prev => {
      const secs = [...(prev[page]?.secs ?? [])];
      const i = secs.indexOf(secId);
      if (i <= 0) return prev;
      [secs[i - 1], secs[i]] = [secs[i], secs[i - 1]];
      return { ...prev, [page]: { ...prev[page], secs } };
    });
  };

  const moveSecDown = (secId: string) => {
    if (draft) {
      updateDraft(snapshot => ({
        ...snapshot,
        pages: snapshot.pages.map(draftPage => {
          if (draftPage.pageType !== page) return draftPage;
          const sections = [...draftPage.sections];
          const i = sections.findIndex(section => section.id === secId);
          if (i === -1 || i >= sections.length - 1) return draftPage;
          [sections[i], sections[i + 1]] = [sections[i + 1]!, sections[i]!];
          return { ...draftPage, sections };
        }),
      }));
      return;
    }
    setPages(prev => {
      const secs = [...(prev[page]?.secs ?? [])];
      const i = secs.indexOf(secId);
      if (i === -1 || i >= secs.length - 1) return prev;
      [secs[i], secs[i + 1]] = [secs[i + 1], secs[i]];
      return { ...prev, [page]: { ...prev[page], secs } };
    });
  };

  const dupSec = (secId: string) => {
    if (draft) {
      updateDraft(snapshot => ({
        ...snapshot,
        pages: snapshot.pages.map(draftPage => {
          if (draftPage.pageType !== page) return draftPage;
          const sections = [...draftPage.sections];
          const i = sections.findIndex(section => section.id === secId);
          if (i === -1) return draftPage;
          const copy = cloneSnapshot({ ...snapshot, pages: [{ ...draftPage, sections: [sections[i]!] }] }).pages[0]!.sections[0]!;
          copy.id = `${copy.kind}-${Date.now()}`;
          copy.name = `${copy.name} Copy`;
          sections.splice(i + 1, 0, copy);
          return { ...draftPage, sections };
        }),
      }));
      setCtxMenu(null);
      showToast("Section duplicated");
      return;
    }
    setPages(prev => {
      const secs = [...(prev[page]?.secs ?? [])];
      const i = secs.indexOf(secId);
      if (i === -1) return prev;
      secs.splice(i + 1, 0, `${secId.replace(/_\d+$/, "")}_${Date.now()}`);
      return { ...prev, [page]: { ...prev[page], secs } };
    });
    setCtxMenu(null);
    showToast("Section duplicated");
  };

  const delSec = (secId: string) => {
    if (draft) {
      updateDraft(snapshot => ({
        ...snapshot,
        pages: snapshot.pages.map(draftPage => draftPage.pageType === page
          ? { ...draftPage, sections: draftPage.sections.filter(section => section.id !== secId) }
          : draftPage),
      }));
      if (sel === secId) setSel(null);
      setCtxMenu(null);
      showToast("Section removed");
      return;
    }
    setPages(prev => ({ ...prev, [page]: { ...prev[page], secs: (prev[page]?.secs ?? []).filter(s => s !== secId) } }));
    if (sel === secId) setSel(null);
    setCtxMenu(null);
    showToast("Section removed");
  };

  const addSec = (secId: string, afterSec: string | null) => {
    if (draft) {
      const kind = templateKindForElement(secId);
      let addedId = "";
      updateDraft(snapshot => ({
        ...snapshot,
        pages: snapshot.pages.map(draftPage => {
          if (draftPage.pageType !== page) return draftPage;
          const sections = [...draftPage.sections];
          const section = createSectionFromLibrary(kind);
          addedId = section.id;
          if (afterSec) {
            const i = sections.findIndex(entry => entry.id === afterSec);
            sections.splice(i === -1 ? sections.length : i, 0, section);
          } else {
            sections.push(section);
          }
          return { ...draftPage, sections };
        }),
      }));
      setModal("");
      if (addedId) setSel(addedId);
      showToast(`${SEC_LABELS[kind] ?? kind} added`);
      return;
    }
    setPages(prev => {
      const secs = [...(prev[page]?.secs ?? [])];
      if (afterSec) {
        const i = secs.indexOf(afterSec);
        secs.splice(i + 1, 0, secId);
      } else secs.push(secId);
      return { ...prev, [page]: { ...prev[page], secs } };
    });
    setModal("");
    setSel(secId);
    showToast(`${SEC_LABELS[secId] ?? secId} added`);
  };

  const addNewPage = (title: string) => {
    const key = title.toLowerCase().replace(/\s+/g, "-");
    if (draft) {
      const pageType = key.replace(/[^a-z0-9-]/g, "") as TemplatePageType;
      updateDraft(snapshot => ({
        ...snapshot,
        pages: [
          ...snapshot.pages,
          {
            id: `custom-${pageType}-${Date.now()}`,
            pageType,
            title,
            slug: pageType === "home" ? "" : pageType,
            sections: [createSectionFromLibrary("hero-split"), createSectionFromLibrary("newsletter")],
            seo: {
              metaTitle: `${title} | ${storeName}`,
              metaDescription: `Shop ${title} from ${storeName}.`,
            },
          },
        ],
      }));
      setPages(prev => ({ ...prev, [pageType]: { title, secs: [] } }));
      setModal("");
      setPage(pageType);
      showToast(`"${title}" page created`);
      return;
    }
    setPages(prev => ({ ...prev, [key]: { title, secs: [] } }));
    setModal("");
    setPage(key);
    showToast(`"${title}" page created`);
  };

  const addLegalPages = useCallback(() => {
    if (!draft) return;
    const legalPages = [
      ["privacy-policy", "Privacy Policy", "How customer data is collected, used, and protected."],
      ["terms-and-conditions", "Terms & Conditions", "The terms customers accept when shopping from this store."],
      ["cookie-policy", "Cookie Policy", "How cookies and similar technologies are used."],
      ["refund-policy", "Refund Policy", "Refund eligibility, timelines, and process."],
      ["shipping-policy", "Shipping Policy", "Delivery locations, timelines, and shipping fees."],
      ["return-policy", "Return Policy", "Return eligibility, condition requirements, and support steps."],
    ];
    updateDraft(snapshot => {
      const existing = new Set(snapshot.pages.map(entry => entry.pageType));
      const additions = legalPages
        .filter(([slug]) => !existing.has(slug as TemplatePageType))
        .map(([slug, title, body]) => ({
          id: `legal-${slug}`,
          pageType: slug as TemplatePageType,
          title,
          slug,
          sections: [{
            id: `${slug}-content`,
            kind: "text-columns",
            name: title,
            visible: true,
            blocks: [{ id: `${slug}-copy`, type: "copy", content: { title, body } }],
            items: [
              { title: "Editable policy", body },
              { title: "Store details", body: "Update this page with your delivery, payment, return, and support terms." },
            ],
          }],
          seo: { metaTitle: `${title} | ${storeName}`, metaDescription: body },
        }));
      return { ...snapshot, pages: [...snapshot.pages, ...additions] };
    });
    setModal("");
    showToast("Legal pages added");
  }, [draft, showToast, storeName, updateDraft]);

  const sendRex = async () => {
    const msg = rexInput.trim();
    if (!msg || rexBusy) return;
    setRexInput("");
    setRexMsgs(m => [...m, { role: "usr", text: msg, time: nowTime() }, { role: "ai", text: "__typing__", time: "" }]);
    setRexBusy(true);
    try {
      const r = await fetch("/api/ai/store-editor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: msg }], context: { storeName, page, selectedSection: sel } }),
      });
      const d = await r.json();
      const reply = d?.data?.reply ?? d?.reply ?? "Done! Let me know what else you need.";
      setRexMsgs(m => [...m.slice(0, -1), { role: "ai", text: reply, time: nowTime() }]);
    } catch {
      setRexMsgs(m => [...m.slice(0, -1), { role: "ai", text: "Sorry, I could not connect right now. Please try again.", time: nowTime() }]);
    }
    setRexBusy(false);
  };

  const pgIconSvg: Record<string, string> = {
    home: HomeSVG, shop: ShopSVG, box: PageSVG, info: PageSVG, mail: MailSVGEl, document: BlogSVG
  };

  const updateSelectedSection = (updater: (section: TemplateSectionNode) => TemplateSectionNode) => {
    if (!selectedDraftSection) return;
    updateDraft(snapshot => ({
      ...snapshot,
      pages: snapshot.pages.map(draftPage => draftPage.pageType === page
        ? {
            ...draftPage,
            sections: draftPage.sections.map(section => section.id === selectedDraftSection.id ? updater(section) : section),
          }
        : draftPage),
    }));
  };

  const updateSectionCopyById = useCallback((sectionId: string, key: string, value: string) => {
    updateDraft(snapshot => ({
      ...snapshot,
      pages: snapshot.pages.map(draftPage => draftPage.pageType === page
        ? {
            ...draftPage,
            sections: draftPage.sections.map(section => section.id === sectionId
              ? {
                  ...section,
                  blocks: section.blocks.map((block, index) => index === 0 || block.type === "copy"
                    ? { ...block, type: "copy", content: { ...block.content, [key]: value } }
                    : block),
                }
              : section),
          }
        : draftPage),
    }));
  }, [page, updateDraft]);

  const updateSectionItemById = useCallback((sectionId: string, itemIndex: number, changes: Record<string, unknown>) => {
    updateDraft(snapshot => ({
      ...snapshot,
      pages: snapshot.pages.map(draftPage => draftPage.pageType === page
        ? {
            ...draftPage,
            sections: draftPage.sections.map(section => section.id === sectionId
              ? {
                  ...section,
                  items: (section.items ?? []).map((item, index) => index === itemIndex ? { ...item, ...changes } : item),
                }
              : section),
          }
        : draftPage),
    }));
  }, [page, updateDraft]);

  const updateImageBlockById = useCallback((sectionId: string, blockId: string, url: string) => {
    updateDraft(snapshot => ({
      ...snapshot,
      pages: snapshot.pages.map(draftPage => draftPage.pageType === page
        ? {
            ...draftPage,
            sections: draftPage.sections.map(section => section.id === sectionId
              ? {
                  ...section,
                  blocks: section.blocks.map(block => block.id === blockId
                    ? { ...block, content: { ...block.content, originalSrc: url, resolvedSrc: url } }
                    : block),
                }
              : section),
          }
        : draftPage),
    }));
  }, [page, updateDraft]);

  const updateSelectedCopy = (key: string, value: string) => {
    updateSelectedSection(section => ({
      ...section,
      blocks: section.blocks.map((block, index) => index === 0 || block.type === "copy"
        ? { ...block, type: "copy", content: { ...block.content, [key]: value } }
        : block),
    }));
  };

  const updateSelectedCopyValue = (key: string, value: string | string[]) => {
    updateSelectedSection(section => ({
      ...section,
      blocks: section.blocks.map((block, index) => index === 0 || block.type === "copy"
        ? { ...block, type: "copy", content: { ...block.content, [key]: value } }
        : block),
    }));
  };

  const updateSelectedSetting = (key: string, value: unknown) => {
    updateSelectedSection(section => ({
      ...section,
      settings: { ...section.settings, [key]: value },
    }));
  };

  const isHeaderToolEnabled = (section: TemplateSectionNode, tool: string) => {
    const defaultOn = !["whatsapp", "currency", "language"].includes(tool);
    return defaultOn ? section.settings?.[tool] !== false : section.settings?.[tool] === true;
  };

  const toggleSectionVisibilityById = useCallback((sectionId: string) => {
    updateDraft(snapshot => ({
      ...snapshot,
      pages: snapshot.pages.map(draftPage => draftPage.pageType === page
        ? {
            ...draftPage,
            sections: draftPage.sections.map(section => section.id === sectionId ? { ...section, visible: section.visible === false } : section),
          }
        : draftPage),
    }));
  }, [page, updateDraft]);

  const openStylePickerFor = useCallback((sectionId: string) => {
    setSel(sectionId);
    setRpTab("design");
  }, []);

  const updateSelectedItem = (index: number, key: string, value: string) => {
    updateSelectedSection(section => {
      const items = [...(section.items ?? [])];
      const nextValue = key === "values"
        ? value.split(",").map(entry => entry.trim()).filter(Boolean)
        : key === "mappedStoreProductId" && !value
          ? null
          : value;
      items[index] = { ...(items[index] ?? {}), [key]: nextValue };
      return { ...section, items };
    });
  };

  const updateSelectedImageBlock = (index: number, key: string, value: string) => {
    if (!selectedDraftSection) return;
    const imgBlocks = selectedDraftSection.blocks.filter(b => b.type === "image");
    const block = imgBlocks[index];
    if (!block) return;
    const currentAlt = String(block.content.alt ?? "");
    const resolved = key === "originalSrc" && value ? normalizeImage(value, currentAlt) : null;
    updateSelectedSection(section => ({
      ...section,
      blocks: section.blocks.map(b => b.id === block.id ? {
        ...b,
        content: {
          ...b.content,
          [key]: value,
          ...(resolved ? { resolvedSrc: resolved.resolvedSrc, placeholder: resolved.placeholder } : {}),
        },
      } : b),
    }));
  };

  const uploadSelectedImageBlock = async (index: number) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,video/mp4,video/webm,video/ogg";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const url = await uploadEditorImage(file);
      if (url) updateSelectedImageBlock(index, "originalSrc", url);
    };
    input.click();
  };

  const uploadSelectedItemMedia = async (index: number) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,video/mp4,video/webm,video/ogg";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const url = await uploadEditorImage(file);
      if (!url) return;
      updateSelectedSection(section => {
        const items = [...(section.items ?? [])];
        const current = items[index] ?? {};
        items[index] = {
          ...current,
          imageUrl: url,
          originalSrc: url,
          resolvedSrc: url,
          ...(file.type.startsWith("video/") ? { videoUrl: url } : {}),
        };
        return { ...section, items };
      });
    };
    input.click();
  };

  const uploadActivePostMedia = async (post: BlogPost) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,video/mp4,video/webm,video/ogg";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const url = await uploadEditorImage(file);
      if (!url) return;
      const nextPost = { ...post, imageUrl: url };
      setPosts(current => current.map(entry => entry.id === post.id ? nextPost : entry));
      setSelPost(nextPost);
    };
    input.click();
  };

  const addBlockToSelectedSection = (blockId: string) => {
    if (!selectedDraftSection) return;

    if (blockId === "cta" || blockId === "whatsapp-cta") {
      const key = blockId === "whatsapp-cta" && selectedDraftSection.kind === "footer"
        ? "whatsappLabel"
        : selectedDraftSection.kind === "hero-split"
        ? "primaryCta"
        : selectedDraftSection.kind === "newsletter" || selectedDraftSection.kind === "contact-form"
          ? "buttonLabel"
          : "cta";
      updateSelectedCopy(key, blockId === "whatsapp-cta" ? "Chat on WhatsApp" : "Shop now");
      showToast(blockId === "whatsapp-cta" ? "WhatsApp CTA added" : "CTA button added");
      return;
    }

    const item =
      blockId === "text-point" ? { title: "New text point", body: "Add a helpful detail for shoppers." } :
      blockId === "image-tile" ? { title: "New image tile", subtitle: "Describe this image or collection.", color: "#0FA493" } :
      blockId === "product-card" ? { title: "New product", subtitle: "Short product description", priceLabel: "NGN 0", color: "#0FA493", mappedStoreProductId: null } :
      blockId === "review" ? { quote: "Add a customer review here.", person: "Customer" } :
      blockId === "faq" ? { question: "New question", answer: "Add a clear answer for shoppers." } :
      blockId === "filter" ? { label: "New filter", value: "All" } :
      blockId === "option" ? { label: "New option", values: ["Choice one", "Choice two"] } :
      null;

    if (!item) return;
    updateSelectedSection(section => ({ ...section, items: [...(section.items ?? []), item] }));
    showToast("Block added");
  };

  const updateTheme = (key: keyof ThemeTokenSet, value: string) => {
    updateDraft(snapshot => ({
      ...snapshot,
      themeTokens: { ...snapshot.themeTokens, [key]: value },
    }));
  };

  const updatePageSeo = (key: "metaTitle" | "metaDescription", value: string) => {
    updateDraft(snapshot => ({
      ...snapshot,
      pages: snapshot.pages.map(draftPage => draftPage.pageType === page
        ? { ...draftPage, seo: { metaTitle: draftPage.seo?.metaTitle ?? "", metaDescription: draftPage.seo?.metaDescription ?? "", [key]: value } }
        : draftPage),
    }));
  };

  const renderSnapshotRightPanel = () => {
    if (!draft) return null;
    const copy = selectedDraftSection?.blocks.find(block => block.type === "copy")?.content ?? {};
    const selectedTitle = selectedDraftSection ? sectionLabel(selectedDraftSection.id, selectedDraftSection) : "";
    const availableBlocks = selectedDraftSection
      ? BLOCK_LIBRARY.filter(block => block.sectionKinds.includes(selectedDraftSection.kind))
      : [];

    if (!selectedDraftSection && rpTab !== "seo") {
      return (
        <div className="rp-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="32" height="32"><path d="M15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9l-6-6z" /></svg>
          <p style={{ fontSize: 12, color: "var(--g500)", marginTop: 4 }}>Select a section to edit its content</p>
        </div>
      );
    }

    if (rpTab === "design") {
      return (
        <>
          <div className="rps">
            <div className="rpst">Theme Colours</div>
            {([
              ["heroBg", "Hero background"],
              ["heroText", "Hero text"],
              ["accent", "Accent"],
              ["ctaBg", "Button background"],
              ["paperBg", "Page background"],
              ["cardBg", "Card background"],
              ["ink", "Text colour"],
            ] as Array<[keyof ThemeTokenSet, string]>).map(([key, label]) => (
              <div className="rf" key={key}>
                <label className="rl">{label}</label>
                <div className="rr-row">
                  <input type="color" className="rcsw" value={String(draft.themeTokens[key])} onChange={event => updateTheme(key, event.target.value)} />
                  <input className="ri" value={String(draft.themeTokens[key])} onChange={event => updateTheme(key, event.target.value)} style={{ flex: 1 }} />
                </div>
              </div>
            ))}
          </div>
          {selectedDraftSection ? (
            <>
              <div className="rps">
                <div className="rpst">Section</div>
                <div className="rf"><label className="rl">Section name</label><input className="ri" value={selectedDraftSection.name} onChange={event => updateSelectedSection(section => ({ ...section, name: event.target.value }))} /></div>
                <div className="rf"><label className="rl">Visibility</label><div className="rbg"><button className={`rbgb${selectedDraftSection.visible !== false ? " on" : ""}`} onClick={() => updateSelectedSection(section => ({ ...section, visible: true }))}>Show</button><button className={`rbgb${selectedDraftSection.visible === false ? " on" : ""}`} onClick={() => updateSelectedSection(section => ({ ...section, visible: false }))}>Hide</button></div></div>
              </div>
              {SECTION_VARIATIONS[selectedDraftSection.kind]?.length ? (
                <div className="rps">
                  <div className="rpst">Change Style</div>
                  <div className="var-grid">
                    {SECTION_VARIATIONS[selectedDraftSection.kind].map(variation => {
                      const current = String(selectedDraftSection.settings?.layout ?? SECTION_VARIATIONS[selectedDraftSection.kind][0]?.id ?? "");
                      return (
                        <button key={variation.id} type="button" className={`var-card${current === variation.id ? " on" : ""}`} onClick={() => updateSelectedSetting("layout", variation.id)}>
                          <span className="var-name">{variation.name}</span>
                          <span className="var-hint">{variation.hint}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              {selectedDraftSection.kind === "header" ? (
                <div className="rps">
                  <div className="rpst">Category Navigation</div>
                  <div className="var-grid">
                    {HEADER_CATEGORY_VARIATIONS.map(variation => (
                      <button key={variation.id} type="button" className={`var-card${String(selectedDraftSection.settings?.categoryNavLayout ?? "simple") === variation.id ? " on" : ""}`} onClick={() => updateSelectedSetting("categoryNavLayout", variation.id)}>
                        <span className="var-name">{variation.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="rps">
                <div className="rpst">Background</div>
                <div className="rf"><label className="rl">Color</label><div className="rr-row">
                  <input type="color" className="rcsw" value={selectedDraftSection.background?.color ?? "#ffffff"} onChange={event => updateSelectedSection(section => ({ ...section, background: { ...section.background, color: event.target.value } }))} />
                  <input className="ri" value={selectedDraftSection.background?.color ?? ""} onChange={event => updateSelectedSection(section => ({ ...section, background: { ...section.background, color: event.target.value || undefined } }))} style={{ flex: 1 }} placeholder="#ffffff" />
                </div></div>
                <div className="rf"><label className="rl">Gradient</label><input className="ri" value={selectedDraftSection.background?.gradient ?? ""} onChange={event => updateSelectedSection(section => ({ ...section, background: { ...section.background, gradient: event.target.value || undefined } }))} placeholder="linear-gradient(135deg, #667eea, #764ba2)" /></div>
              </div>
              <div className="rps">
                <div className="rpst">Spacing</div>
                <div className="rf"><label className="rl">Padding</label><input className="ri" value={selectedDraftSection.styles?.padding ?? ""} onChange={event => updateSelectedSection(section => ({ ...section, styles: { ...section.styles, padding: event.target.value || undefined } }))} placeholder="e.g. 40px 20px" /></div>
                <div className="rf"><label className="rl">Margin</label><input className="ri" value={selectedDraftSection.styles?.margin ?? ""} onChange={event => updateSelectedSection(section => ({ ...section, styles: { ...section.styles, margin: event.target.value || undefined } }))} placeholder="e.g. 0 0 20px" /></div>
                <div className="rf"><label className="rl">Max width</label><input className="ri" value={selectedDraftSection.styles?.maxWidth ?? ""} onChange={event => updateSelectedSection(section => ({ ...section, styles: { ...section.styles, maxWidth: event.target.value || undefined } }))} placeholder="e.g. 1240px" /></div>
              </div>
            </>
          ) : null}
        </>
      );
    }

    if (rpTab === "seo") {
      return (
        <div className="rps">
          <div className="rpst">Page SEO</div>
          <div className="rf"><label className="rl">Page Title</label><input className="ri" value={currentDraftPage?.seo?.metaTitle ?? ""} onChange={event => updatePageSeo("metaTitle", event.target.value)} /></div>
          <div className="rf"><label className="rl">Meta Description</label><textarea className="rtx" rows={3} value={currentDraftPage?.seo?.metaDescription ?? ""} onChange={event => updatePageSeo("metaDescription", event.target.value)} /></div>
          <div className="seo-preview"><div className="seo-t">{currentDraftPage?.seo?.metaTitle || `${currentDraftPage?.title ?? "Page"} - ${storeName}`}</div><div className="seo-u">{storeSlug}.shopinbos.com/{currentDraftPage?.slug}</div><div className="seo-d">{currentDraftPage?.seo?.metaDescription || "Your meta description will appear here in search results."}</div></div>
        </div>
      );
    }

    return (
      <>
        <div className="rps">
          <div className="rpst">{selectedTitle}</div>
          {selectedDraftSection ? (
            <div className="guide-card">
              <div className="guide-title">Guide</div>
              <p>{SECTION_GUIDES[selectedDraftSection.kind] ?? "Select Change Style to switch layout without losing content."}</p>
            </div>
          ) : null}
          <div className="rf"><label className="rl">Section name</label><input className="ri" value={selectedDraftSection?.name ?? ""} onChange={event => updateSelectedSection(section => ({ ...section, name: event.target.value }))} /></div>
          {selectedDraftSection && SECTION_VARIATIONS[selectedDraftSection.kind]?.length ? (
            <div className="rf">
              <label className="rl">Variation</label>
              <select className="rsel" value={String(selectedDraftSection.settings?.layout ?? SECTION_VARIATIONS[selectedDraftSection.kind][0]?.id ?? "")} onChange={event => updateSelectedSetting("layout", event.target.value)}>
                {SECTION_VARIATIONS[selectedDraftSection.kind].map(variation => <option key={variation.id} value={variation.id}>{variation.name}</option>)}
              </select>
            </div>
          ) : null}
          <div className="rf">
            <label className="rl">Actions</label>
            <div className="rbg" style={{ flexWrap: "wrap" }}>
              <button className="rbgb" onClick={() => selectedDraftSection && moveSecUp(selectedDraftSection.id)}>Move up</button>
              <button className="rbgb" onClick={() => selectedDraftSection && moveSecDown(selectedDraftSection.id)}>Move down</button>
              <button className="rbgb" onClick={() => selectedDraftSection && dupSec(selectedDraftSection.id)}>Duplicate</button>
              <button className="rbgb" onClick={() => selectedDraftSection && updateSelectedSection(section => ({ ...section, visible: section.visible === false ? true : false }))}>{selectedDraftSection?.visible === false ? "Show" : "Hide"}</button>
              <button className="rbgb" onClick={() => selectedDraftSection && delSec(selectedDraftSection.id)}>Delete</button>
            </div>
          </div>
          <div className="rf"><label className="rl">Eyebrow</label><input className="ri" value={String(copy.eyebrow ?? copy.text ?? "")} onChange={event => updateSelectedCopy("eyebrow", event.target.value)} /></div>
          {selectedDraftSection?.kind === "header" ? (
            <>
              <div className="rf"><label className="rl">Logo text</label><input className="ri" value={String(copy.logoText ?? storeName)} onChange={event => updateSelectedCopy("logoText", event.target.value)} /></div>
              <button type="button" className="rp-btn-add" onClick={() => { window.location.href = "/builder/rex?tool=logo"; }}>
                <span dangerouslySetInnerHTML={{ __html: SparkSVG }} /> Generate logo with RexAI
              </button>
              <div className="rf"><label className="rl">Category menu</label><select className="rsel" value={String(selectedDraftSection.settings?.categoryNavLayout ?? "simple")} onChange={event => updateSelectedSetting("categoryNavLayout", event.target.value)}>{HEADER_CATEGORY_VARIATIONS.map(variation => <option key={variation.id} value={variation.id}>{variation.name}</option>)}</select></div>
              <div className="rf"><label className="rl">Header tools</label><div className="rbg" style={{ flexWrap: "wrap" }}>
                {(["search", "wishlist", "cart", "whatsapp", "currency", "language"] as const).map(tool => (
                  <button key={tool} type="button" className={`rbgb${isHeaderToolEnabled(selectedDraftSection, tool) ? " on" : ""}`} onClick={() => updateSelectedSetting(tool, !isHeaderToolEnabled(selectedDraftSection, tool))}>{tool}</button>
                ))}
              </div></div>
              <div className="rf"><label className="rl">Navigation links</label><input className="ri" value={Array.isArray(copy.navLinks) ? (copy.navLinks as string[]).join(", ") : "home, products, about, contact"} onChange={event => updateSelectedCopyValue("navLinks", event.target.value.split(",").map(item => item.trim()).filter(Boolean))} /></div>
              <div className="rf"><label className="rl">Utility links</label><input className="ri" value={Array.isArray(copy.utilityLinks) ? (copy.utilityLinks as string[]).join(", ") : "wishlist, cart"} onChange={event => updateSelectedCopyValue("utilityLinks", event.target.value.split(",").map(item => item.trim()).filter(Boolean))} /></div>
              <div className="rf"><label className="rl">Cart label</label><input className="ri" value={String(copy.cartLabel ?? "Cart")} onChange={event => updateSelectedCopy("cartLabel", event.target.value)} /></div>
            </>
          ) : null}
          {selectedDraftSection?.kind === "cart-summary" ? (
            <div className="rf">
              <label className="rl">Cart drawer</label>
              <select className="rsel" value={String(selectedDraftSection.settings?.drawerVariation ?? "right-drawer")} onChange={event => updateSelectedSetting("drawerVariation", event.target.value)}>
                <option value="right-drawer">Right drawer</option>
                <option value="left-drawer">Left drawer</option>
                <option value="modal">Modal cart</option>
                <option value="floating">Mini floating cart</option>
                <option value="minimal">Minimal cart</option>
              </select>
            </div>
          ) : null}
          <div className="rf"><label className="rl">Title</label><textarea className="rtx" rows={2} value={String(copy.title ?? "")} onChange={event => updateSelectedCopy("title", event.target.value)} /></div>
          <div className="rf"><label className="rl">Body</label><textarea className="rtx" rows={3} value={String(copy.body ?? copy.summary ?? "")} onChange={event => updateSelectedCopy("body", event.target.value)} /></div>
          {selectedDraftSection?.kind === "footer" ? (
            <>
              <div className="rf"><label className="rl">Footer summary</label><textarea className="rtx" rows={3} value={String(copy.summary ?? "")} onChange={event => updateSelectedCopy("summary", event.target.value)} /></div>
              <div className="rf"><label className="rl">Footer modules</label><div className="rbg"><button className={`rbgb${selectedDraftSection.settings?.showPayments !== false ? " on" : ""}`} onClick={() => updateSelectedSetting("showPayments", selectedDraftSection.settings?.showPayments === false)}>Payments</button><button className={`rbgb${selectedDraftSection.settings?.showDelivery !== false ? " on" : ""}`} onClick={() => updateSelectedSetting("showDelivery", selectedDraftSection.settings?.showDelivery === false)}>Delivery</button></div></div>
              <div className="rf"><label className="rl">Contact email</label><input className="ri" value={String(copy.email ?? "")} onChange={event => updateSelectedCopy("email", event.target.value)} /></div>
              <div className="rf"><label className="rl">Contact phone</label><input className="ri" value={String(copy.phone ?? "")} onChange={event => updateSelectedCopy("phone", event.target.value)} /></div>
              <div className="rf"><label className="rl">WhatsApp CTA</label><input className="ri" value={String(copy.whatsappLabel ?? "")} onChange={event => updateSelectedCopy("whatsappLabel", event.target.value)} /></div>
            </>
          ) : null}
          {selectedDraftSection?.kind === "contact-form" ? (
            <>
              <div className="rf"><label className="rl">Address</label><input className="ri" value={String(copy.address ?? "")} onChange={event => updateSelectedCopy("address", event.target.value)} /></div>
              <div className="rf"><label className="rl">Contact email</label><input className="ri" value={String(copy.email ?? "")} onChange={event => updateSelectedCopy("email", event.target.value)} /></div>
              <div className="rf"><label className="rl">Contact phone</label><input className="ri" value={String(copy.phone ?? "")} onChange={event => updateSelectedCopy("phone", event.target.value)} /></div>
            </>
          ) : null}
          <div className="rf"><label className="rl">Button text</label><input className="ri" value={String(copy.primaryCta ?? copy.cta ?? copy.buttonLabel ?? "")} onChange={event => updateSelectedCopy(selectedDraftSection?.kind === "hero-split" ? "primaryCta" : selectedDraftSection?.kind === "newsletter" || selectedDraftSection?.kind === "contact-form" ? "buttonLabel" : "cta", event.target.value)} /></div>
          {selectedDraftSection && ["hero-split", "promo-banner", "featured-products", "product-detail", "cart-summary", "checkout-form", "contact-form", "newsletter"].includes(selectedDraftSection.kind) ? (
            <div className="rps">
              <div className="rpst">Commerce Buttons</div>
              <div className="guide-card">
                <div className="guide-title">Button guide</div>
                <p>Buttons are actions. Choose what each CTA does, then style it without losing the action.</p>
              </div>
              <div className="rf">
                <label className="rl">Primary style</label>
                <select className="rsel" value={String(selectedDraftSection.settings?.primaryButtonVariant ?? "primary")} onChange={event => updateSelectedSetting("primaryButtonVariant", event.target.value)}>
                  {BUTTON_VARIANTS.map(variant => <option key={variant.id} value={variant.id}>{variant.label}</option>)}
                </select>
              </div>
              <div className="rf">
                <label className="rl">Primary action</label>
                <select className="rsel" value={String(selectedDraftSection.settings?.primaryButtonAction ?? "products")} onChange={event => updateSelectedSetting("primaryButtonAction", event.target.value)}>
                  {BUTTON_ACTIONS.map(action => <option key={action.id} value={action.id}>{action.label}</option>)}
                </select>
              </div>
              {selectedDraftSection.settings?.primaryButtonAction === "external" ? (
                <div className="rf"><label className="rl">Primary link</label><input className="ri" value={String(selectedDraftSection.settings?.primaryButtonUrl ?? "")} onChange={event => updateSelectedSetting("primaryButtonUrl", event.target.value)} placeholder="https://example.com" /></div>
              ) : null}
              <div className="rf">
                <label className="rl">Secondary style</label>
                <select className="rsel" value={String(selectedDraftSection.settings?.secondaryButtonVariant ?? "outline")} onChange={event => updateSelectedSetting("secondaryButtonVariant", event.target.value)}>
                  {BUTTON_VARIANTS.map(variant => <option key={variant.id} value={variant.id}>{variant.label}</option>)}
                </select>
              </div>
              <div className="rf">
                <label className="rl">Secondary action</label>
                <select className="rsel" value={String(selectedDraftSection.settings?.secondaryButtonAction ?? "about")} onChange={event => updateSelectedSetting("secondaryButtonAction", event.target.value)}>
                  {BUTTON_ACTIONS.map(action => <option key={action.id} value={action.id}>{action.label}</option>)}
                </select>
              </div>
              <div className="rf"><label className="rl">Size</label><select className="rsel" value={String(selectedDraftSection.settings?.buttonSize ?? "lg")} onChange={event => updateSelectedSetting("buttonSize", event.target.value)}><option value="xs">Extra small</option><option value="sm">Small</option><option value="md">Medium</option><option value="lg">Large</option><option value="xl">Extra large</option></select></div>
              <div className="rf"><label className="rl">Shape</label><select className="rsel" value={String(selectedDraftSection.settings?.buttonShape ?? "pill")} onChange={event => updateSelectedSetting("buttonShape", event.target.value)}><option value="square">Square</option><option value="rounded">Rounded</option><option value="pill">Pill</option><option value="full">Fully rounded</option></select></div>
              <div className="rf"><label className="rl">Mobile sticky CTA</label><div className="rbg"><button type="button" className={`rbgb${selectedDraftSection.settings?.stickyMobileCta === true ? " on" : ""}`} onClick={() => updateSelectedSetting("stickyMobileCta", true)}>On</button><button type="button" className={`rbgb${selectedDraftSection.settings?.stickyMobileCta !== true ? " on" : ""}`} onClick={() => updateSelectedSetting("stickyMobileCta", false)}>Off</button></div></div>
            </div>
          ) : null}
        </div>
        {(selectedDraftSection?.blocks ?? []).filter(b => b.type === "image").length > 0 ? (
          <div className="rps">
            <div className="rpst">Images</div>
            {(selectedDraftSection?.blocks ?? []).filter(b => b.type === "image").map((block, index) => {
              const imgContent = block.content as Record<string, unknown>;
              return (
                <div key={block.id} style={{ marginBottom: 0 }}>
                  <div className="rf"><label className="rl">Image URL {index + 1}</label><input className="ri" value={String(imgContent.originalSrc ?? "")} onChange={event => updateSelectedImageBlock(index, "originalSrc", event.target.value)} placeholder="https://..." /></div>
                  <button type="button" className="rp-btn-add" onClick={() => uploadSelectedImageBlock(index)}>
                    Upload image or video
                  </button>
                  <div className="rf"><label className="rl">Alt text</label><input className="ri" value={String(imgContent.alt ?? "")} onChange={event => updateSelectedImageBlock(index, "alt", event.target.value)} /></div>
                  <div className="rf"><label className="rl">Fit</label><select className="rsel" value={String(imgContent.objectFit ?? "cover")} onChange={event => updateSelectedImageBlock(index, "objectFit", event.target.value)}>
                    <option value="cover">Cover</option>
                    <option value="contain">Contain</option>
                    <option value="fill">Fill</option>
                    <option value="none">None</option>
                  </select></div>
                </div>
              );
            })}
          </div>
        ) : null}
        {(selectedDraftSection?.items ?? []).slice(0, 6).map((item, index) => {
          const itemVariations = blockVariationsFor(selectedDraftSection?.kind, item);
          const itemVariation = String(item.variant ?? itemVariations[0]?.id ?? "");
          return (
            <div className="rps" key={`${selectedDraftSection?.id ?? "section"}-item-${index}`}>
              <div className="rpst">Item {index + 1}</div>
              {itemVariations.length > 0 ? (
                <div className="rf">
                  <label className="rl">Block style</label>
                  <select className="rsel" value={itemVariation} onChange={event => updateSelectedItem(index, "variant", event.target.value)}>
                    {itemVariations.map(variation => <option key={variation.id} value={variation.id}>{variation.name}</option>)}
                  </select>
                  <div className="var-hint">{itemVariations.find(variation => variation.id === itemVariation)?.hint ?? "Choose how this block appears."}</div>
                </div>
              ) : null}
              {"title" in item || "label" in item ? <div className="rf"><label className="rl">Title</label><input className="ri" value={String(item.title ?? item.label ?? "")} onChange={event => updateSelectedItem(index, "title" in item ? "title" : "label", event.target.value)} /></div> : null}
              {"subtitle" in item || "body" in item || "value" in item ? <div className="rf"><label className="rl">Text</label><textarea className="rtx" rows={2} value={String(item.subtitle ?? item.body ?? item.value ?? "")} onChange={event => updateSelectedItem(index, "subtitle" in item ? "subtitle" : "body" in item ? "body" : "value", event.target.value)} /></div> : null}
              {"quote" in item ? <div className="rf"><label className="rl">Quote</label><textarea className="rtx" rows={2} value={String(item.quote ?? "")} onChange={event => updateSelectedItem(index, "quote", event.target.value)} /></div> : null}
              {"person" in item ? <div className="rf"><label className="rl">Customer</label><input className="ri" value={String(item.person ?? "")} onChange={event => updateSelectedItem(index, "person", event.target.value)} /></div> : null}
              {"question" in item ? <div className="rf"><label className="rl">Question</label><input className="ri" value={String(item.question ?? "")} onChange={event => updateSelectedItem(index, "question", event.target.value)} /></div> : null}
              {"answer" in item ? <div className="rf"><label className="rl">Answer</label><textarea className="rtx" rows={2} value={String(item.answer ?? "")} onChange={event => updateSelectedItem(index, "answer", event.target.value)} /></div> : null}
              {"values" in item ? <div className="rf"><label className="rl">Choices</label><input className="ri" value={Array.isArray(item.values) ? item.values.join(", ") : String(item.values ?? "")} onChange={event => updateSelectedItem(index, "values", event.target.value)} /></div> : null}
              {"priceLabel" in item ? <div className="rf"><label className="rl">Price</label><input className="ri" value={String(item.priceLabel ?? "")} onChange={event => updateSelectedItem(index, "priceLabel", event.target.value)} /></div> : null}
              {"imageUrl" in item || selectedDraftSection?.kind === "category-list" || selectedDraftSection?.kind === "category-grid" || selectedDraftSection?.kind === "hero-split" || selectedDraftSection?.kind === "blog-index" ? (
                <>
                  <div className="rf"><label className="rl">Image or video URL</label><input className="ri" value={String(item.imageUrl ?? item.videoUrl ?? "")} onChange={event => updateSelectedItem(index, "imageUrl", event.target.value)} /></div>
                  <button type="button" className="rp-btn-add" onClick={() => uploadSelectedItemMedia(index)}>
                    Upload image or video
                  </button>
                </>
              ) : null}
              {"color" in item ? <div className="rf"><label className="rl">Accent colour</label><div className="rr-row"><input type="color" className="rcsw" value={String(item.color ?? "#0FA493")} onChange={event => updateSelectedItem(index, "color", event.target.value)} /><input className="ri" value={String(item.color ?? "#0FA493")} onChange={event => updateSelectedItem(index, "color", event.target.value)} style={{ flex: 1 }} /></div></div> : null}
              {"mappedStoreProductId" in item ? (
                <div className="rf">
                  <label className="rl">Mapped product</label>
                  <select className="rsel" value={String(item.mappedStoreProductId ?? "")} onChange={event => updateSelectedItem(index, "mappedStoreProductId", event.target.value)}>
                    <option value="">Use editable placeholder</option>
                    {storeProducts.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}
                  </select>
                </div>
              ) : null}
            </div>
          );
        })}
        {availableBlocks.length > 0 ? (
          <div className="rps">
            <div className="rpst">Add Blocks</div>
            <div className="sp-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              {availableBlocks.map(block => (
                <button key={block.id} type="button" className="sp-card" onClick={() => addBlockToSelectedSection(block.id)} style={{ textAlign: "left" }}>
                  <div className="sp-thumb"><span dangerouslySetInnerHTML={{ __html: block.svg }} /></div>
                  <div className="sp-info"><div className="sp-name">{block.lbl}</div></div>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </>
    );
  };

  const frameClass = `e-canvas-frame${device === "tablet" ? " tablet" : device === "mobile" ? " mobile" : ""}`;

  if (loading) {
    return (
      <div className="sbi-editor" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", color: "var(--g400)", fontSize: 13 }}>
          <div style={{ width: 32, height: 32, border: "3px solid var(--g200)", borderTopColor: "var(--teal)", borderRadius: "50%", margin: "0 auto 12px", animation: "sbi-pulse 0.8s linear infinite" }} />
          Loading editor...
        </div>
      </div>
    );
  }

  // ─ PREVIEW ─
  if (screen === "preview") {
    return (
      <div className="sbi-editor">
        <div className="pv-screen">
          <div className="pv-bar">
            <button className="tbtn tbtn-ghost" onClick={() => setScreen("editor")}>
              <span dangerouslySetInnerHTML={{ __html: BackSVG }} /> Back
            </button>
            <div className="pv-url">{storeSlug}.shopinbos.com/{page !== "homepage" ? page : ""}</div>
            <button className="tbtn tbtn-coral" onClick={() => { setModal("publish"); setPubStep(0); }}>Publish</button>
          </div>
          <div className="pv-content">
            {draft ? (
              <TemplateStorefrontSurface
                store={surfaceStore}
                snapshot={draft}
                storeBasePath={`/s/${storeSlug}`}
                mode="live"
                device={device === "mobile" ? "mobile" : "desktop"}
                selectedPage={page}
                onSelectPage={(nextPage) => { setPage(nextPage); setSel(null); }}
              />
            ) : (
              <div style={{ padding: 60, textAlign: "center", color: "var(--g400)", fontSize: 14 }}>This page has no sections yet.</div>
            )}
          </div>
        </div>
        <div className={`toast${toast.show ? " show" : ""}${toast.ok ? " ok" : ""}`}>{toast.msg}</div>
      </div>
    );
  }

  // ─ BLOG ─
  if (screen === "blog") {
    const displayPosts = posts.length > 0 ? posts : [
      { id: 1, title: "First Blog Post", status: "draft" as const, cat: "General", date: new Date().toLocaleDateString(), slug: "first-post", content: "" }
    ];
    const activePost = selPost ?? displayPosts[0];
    return (
      <div className="sbi-editor">
        <div className="blog-screen">
          <div className="cms-top">
            <button className="tbtn tbtn-ghost" onClick={() => setScreen("editor")}>
              <span dangerouslySetInnerHTML={{ __html: BackSVG }} /> Back
            </button>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 14, marginLeft: 8 }}>Blog CMS</span>
            <div style={{ flex: 1 }} />
            <button className="tbtn tbtn-teal" onClick={() => showToast("Post saved!")}>Save</button>
            <button className="tbtn tbtn-ghost" onClick={() => { setScreen("editor"); setPage("blog"); showToast("Single blog preview is available from the Blog section variation."); }}>Preview Post</button>
            <button className="tbtn tbtn-coral" style={{ marginLeft: 6 }} onClick={() => showToast("Post published!")}>Publish</button>
          </div>
          <div className="cms-body">
            <div className="cms-sb">
              <div className="cms-sbh">
                <span className="cms-sbh-t">Posts ({displayPosts.length})</span>
                <button className="sbh-add" onClick={() => {
                  const np: BlogPost = { id: Date.now(), title: "New Post", status: "draft", cat: "General", date: new Date().toLocaleDateString(), slug: `post-${Date.now()}`, content: "" };
                  setPosts(p => [np, ...p]);
                  setSelPost(np);
                }}>+</button>
              </div>
              <div className="cms-list">
                {displayPosts.map(p => (
                  <div key={p.id} className={`cms-post${activePost?.id === p.id ? " on" : ""}`} onClick={() => setSelPost(p)}>
                    <div className="cms-pt">{p.title}</div>
                    <div className="cms-pm">{p.date} · {p.cat}</div>
                    <span className={`cms-badge ${p.status === "published" ? "pub" : "draft"}`}>{p.status}</span>
                  </div>
                ))}
              </div>
            </div>
            {activePost && (
              <div className="cms-main">
                <div className="cms-wrap">
                  <input className="cms-title-in" defaultValue={activePost.title} placeholder="Post title..." />
                  <div className="cms-meta-row">
                    <div className="cms-mf"><label className="cms-ml">Category</label><input className="cms-mi" defaultValue={activePost.cat} /></div>
                    <div className="cms-mf">
                      <label className="cms-ml">Status</label>
                      <select className="cms-mi" defaultValue={activePost.status}>
                        <option value="draft">Draft</option>
                        <option value="published">Published</option>
                      </select>
                    </div>
                    <div className="cms-mf"><label className="cms-ml">Date</label><input className="cms-mi" defaultValue={activePost.date} /></div>
                  </div>
                  <div className="cms-featimg" onClick={() => void uploadActivePostMedia(activePost)}>
                    <span dangerouslySetInnerHTML={{ __html: UploadSVG }} />
                    <span className="cms-featimg-lbl">{activePost.imageUrl ? "Featured media uploaded - click to replace" : "Click to upload featured image or video"}</span>
                  </div>
                  <div className="cms-toolbar">
                    {[["B", "Bold", "fontWeight:700"], ["I", "Italic", "fontStyle:italic"], ["U", "Underline", "textDecoration:underline"]].map(([l, t, s]) => (
                      <button key={l} className="cms-tb" title={t} style={Object.fromEntries([s.split(":")])}>
                        {l}
                      </button>
                    ))}
                    <div className="cms-tbsep" />
                    {["H1", "H2", "H3"].map(h => <button key={h} className="cms-tb" style={{ fontSize: 10, fontWeight: 700 }}>{h}</button>)}
                    <div className="cms-tbsep" />
                    <button className="cms-tb" title="Image"><span dangerouslySetInnerHTML={{ __html: ImgSVG }} /></button>
                  </div>
                  <textarea className="cms-content" defaultValue={activePost.content || "Start writing your post here..."} />
                  <div style={{ marginTop: 20 }}>
                    <div className="cms-card">
                      <div className="cms-card-title">SEO</div>
                      <div className="rf"><label className="rl">Meta Title</label><input className="ri" defaultValue={activePost.title} /></div>
                      <div className="rf"><label className="rl">Meta Description</label><textarea className="rtx" rows={2} placeholder="Brief description for search engines" /></div>
                      <div className="seo-preview">
                        <div className="seo-t">{activePost.title}</div>
                        <div className="seo-u">{storeSlug}.shopinbos.com/blog/{activePost.slug}</div>
                        <div className="seo-d">Your meta description will appear here in search results.</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className={`toast${toast.show ? " show" : ""}${toast.ok ? " ok" : ""}`}>{toast.msg}</div>
      </div>
    );
  }

  // ─ EDITOR ─
  return (
    <div className="sbi-editor">
      {/* TOPBAR */}
      <div className="e-topbar">
        <button className="tb-logo" onClick={() => { window.location.href = "/seller/store"; }}>
          <BrandLogo theme="light" className="tb-logo-img" priority />
          <span className="tb-logo-label">Editor</span>
        </button>
        <div className="tb-store"><strong>{storeName}</strong><span> &middot; {storeSlug}.shopinbos.com</span></div>
        <div className="tb-mid">
          <button className={`tb-dev${device === "desktop" ? " on" : ""}`} title="Desktop" onClick={() => setDevice("desktop")} dangerouslySetInnerHTML={{ __html: DesktopSVG }} />
          <button className={`tb-dev${device === "tablet" ? " on" : ""}`} title="Tablet" onClick={() => setDevice("tablet")} dangerouslySetInnerHTML={{ __html: TabletSVG }} />
          <button className={`tb-dev${device === "mobile" ? " on" : ""}`} title="Mobile" onClick={() => setDevice("mobile")} dangerouslySetInnerHTML={{ __html: MobileSVG }} />
          <div className="tb-div" />
          <div className="pg-wrap">
            <select className="pg-sel" value={page} onChange={e => { setPage(e.target.value); setSel(null); }}>
              {NON_NAV_PAGE_TYPES.has(page) ? <option value={page}>Product detail preview</option> : null}
              {visiblePageKeys.map(k => <option key={k} value={k}>{pages[k]?.title ?? k}</option>)}
            </select>
            <span className="pg-arr">&#9660;</span>
          </div>
        </div>
        <div className="tb-right">
          <button className="tbtn tbtn-ghost" onClick={() => setScreen("blog")}><span dangerouslySetInnerHTML={{ __html: BlogSVG }} />Blog</button>
          <button className="tbtn tbtn-ghost" onClick={() => { window.location.href = "/builder/rex"; }}><span dangerouslySetInnerHTML={{ __html: SparkSVG }} />RexAI</button>
          <button className="tbtn tbtn-ghost" onClick={() => setScreen("preview")}><span dangerouslySetInnerHTML={{ __html: EyeSVG }} />Preview</button>
          <button className="tbtn tbtn-ghost" onClick={doSave}>{saved ? "Saved" : "Save"}</button>
          <button className="tbtn tbtn-coral" onClick={() => { setModal("publish"); setPubStep(0); }} disabled={publishing}>Publish</button>
        </div>
      </div>

      {/* LAYOUT */}
      <div className="e-layout">
        {/* SIDEBAR */}
        <div className={`e-sidebar${lCol ? " collapsed" : ""}`}>
          <div className="sb-tabs">
            {(["pages", "elements", "layers"] as SbTab[]).map(t => (
              <button key={t} className={`sb-tab${sbTab === t ? " on" : ""}`} onClick={() => setSbTab(t)}>
                {t === "pages" ? "Pages & Templates" : t === "elements" ? "Elements" : "Layers"}
              </button>
            ))}
          </div>

          {/* Pages pane */}
          <div className={`sb-pane${sbTab === "pages" ? " on" : ""}`}>
            <div className="sbh"><span>Pages & Templates</span><button className="sbh-add" onClick={() => setModal("newpage")} title="Create a real page">+</button></div>
            <div className="pg-list">
              {visiblePageKeys.length === 0 ? (
                <div className="pg-empty">
                  <div className="pg-empty-title">No pages created yet</div>
                  <p>Create your first page, browse templates, or build with RexAI. Product, cart, checkout, and wishlist stay under templates and commerce.</p>
                  <button type="button" className="pg-empty-btn" onClick={() => setModal("newpage")}>Create Page</button>
                  <button type="button" className="pg-empty-btn ghost" onClick={() => { window.location.href = "/builder/templates"; }}>Browse Templates</button>
                  <button type="button" className="pg-empty-btn ghost" onClick={() => { window.location.href = "/builder/rex"; }}>Build with RexAI</button>
                </div>
              ) : null}
              {groupedPageRows.map(group => (
                <div key={group.group} className="pg-group">
                  <div className="pg-group-head" title={PAGE_GROUP_HELP[group.group]}>
                    <span>{PAGE_GROUP_LABELS[group.group]}</span>
                    <span className="pg-help">?</span>
                  </div>
                  {group.rows.length === 0 ? (
                    <div className="pg-group-empty">
                      {group.group === "pages" ? "Create your first page to show it here." : group.group === "templates" ? "Templates activate when matching content exists." : "Commerce routes are available internally when enabled."}
                    </div>
                  ) : group.rows.map(row => {
                    const disabled = row.group === "commerce" || row.group === "templates";
                    return (
                      <div key={row.key} className={`pg-row${page === row.key ? " on" : ""}${disabled ? " muted" : ""}`} onClick={() => { if (!disabled) { setPage(row.key); setSel(null); } }}>
                        <div className="pg-ico" dangerouslySetInnerHTML={{ __html: pgIconSvg[PAGE_ICONS[row.key] ?? "document"] ?? PageSVG }} />
                        <div className="pg-meta">
                          <div className="pg-name">{row.title}</div>
                          <div className={`pg-status${row.status === "Published" ? " live" : ""}`}>{row.status} &middot; {row.sectionCount} sections</div>
                        </div>
                        {disabled ? <span className="pg-chip">{row.group === "templates" ? "Template" : "System"}</span> : <button className="pg-more" onClick={e => e.stopPropagation()}>&#8943;</button>}
                      </div>
                    );
                  })}
                </div>
              ))}
              <div className="sb-divider" />
              <div className="pg-row" onClick={() => setScreen("blog")}>
                <div className="pg-ico" dangerouslySetInnerHTML={{ __html: BlogSVG }} />
                <div className="pg-meta">
                  <div className="pg-name">Blog Manager</div>
                  <div className="pg-status">{posts.filter(p => p.status === "published").length ? `${posts.filter(p => p.status === "published").length} published` : "Inactive until a post is published"}</div>
                </div>
              </div>
              <div className="pg-row" onClick={addLegalPages}>
                <div className="pg-ico" dangerouslySetInnerHTML={{ __html: PageSVG }} />
                <div className="pg-meta">
                  <div className="pg-name">Add Legal Pages</div>
                  <div className="pg-status">Privacy, terms, cookies, refunds, shipping</div>
                </div>
              </div>
            </div>
          </div>

          {/* Elements pane */}
          <div className={`sb-pane${sbTab === "elements" ? " on" : ""}`}>
            <div className="el-search-wrap">
              <span className="el-search-ico" dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>` }} />
              <input className="el-search" placeholder="Search blocks..." />
            </div>
            <div className="el-scroll">
              {sidebarElementGroups.map(cat => (
                <div key={cat.cat}>
                  <div className="el-cat">{cat.cat}</div>
                  <div className="el-grid">
                    {cat.items.map(item => {
                      const previewKind = TEMPLATE_KIND_BY_ELEMENT[item.id];
                      const previewSection = previewKind ? { id: previewKind, label: item.lbl } : null;
                      const inner = (
                        <div
                          key={item.id}
                          className="el-item"
                          draggable
                          onClick={() => addSec(item.id, draft ? sidebarInsertBefore : (sel ?? (curSecs[curSecs.length - 1] ?? null)))}
                          title={`Add ${item.lbl}`}
                        >
                          <div className="el-ico" dangerouslySetInnerHTML={{ __html: item.svg }} />
                          <div className="el-lbl">{item.lbl}</div>
                        </div>
                      );
                      return previewSection ? (
                        <SectionPreviewPopover key={item.id} section={previewSection} position="right">
                          {inner}
                        </SectionPreviewPopover>
                      ) : inner;
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Layers pane */}
          <div className={`sb-pane${sbTab === "layers" ? " on" : ""}`}>
            <div className="sbh"><span>Layers</span></div>
            <div className="lyr-scroll">
              {curSecs.length === 0 && <div style={{ padding: "20px 10px", fontSize: 12, color: "var(--g400)", textAlign: "center" }}>No sections on this page</div>}
              {curSecs.map(s => {
                const base = s.replace(/_\d+$/, "");
                const draftSection = currentDraftPage?.sections.find(section => section.id === s) ?? null;
                return (
                  <div key={s} className={`lyr-item${sel === s ? " on" : ""}`} onClick={() => setSel(s)}>
                    <span dangerouslySetInnerHTML={{ __html: LayerSVG }} />
                    <span>{sectionLabel(base, draftSection)}</span>
                    <button className="lyr-vis" title="Toggle visibility" dangerouslySetInnerHTML={{ __html: EyeSVG }} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Left collapse toggle */}
        <button className="ptog ltog" style={{ left: lCol ? 0 : "var(--sbW)" }} onClick={() => setLCol(v => !v)}>
          {lCol ? "›" : "‹"}
        </button>

        {/* CANVAS */}
        <div className="e-canvas-area">
          <div className="e-canvas-bar">
            <div className="zg">
              <button className="zb" onClick={() => setZoom(z => Math.max(z - 10, 30))}>&#8722;</button>
              <span className="zv" onClick={() => setZoom(100)} title="Reset zoom">{zoom}%</span>
              <button className="zb" onClick={() => setZoom(z => Math.min(z + 10, 200))}>+</button>
            </div>
            <div className="cb-wrap">
              <button className="cb-pg" onClick={() => setSel(null)}>{pages[page]?.title ?? page}</button>
              {sel && <><span className="cb-sep">&#8250;</span><span className="cb-sec">{sectionLabel(sel, selectedDraftSection)}</span></>}
            </div>
            <div className="sv-dot">
              <span className="sv-ind" style={{ background: saved ? "var(--teal)" : "var(--coral)" }} />
              {saved ? "Saved" : "Unsaved changes"}
            </div>
          </div>

          <div className="e-canvas-scroll" onClick={e => { if (e.target === e.currentTarget) setSel(null); }}>
            <div className={frameClass} style={{ zoom: zoom / 100 }}>

              {draft ? (
                <TemplateStorefrontSurface
                  store={surfaceStore}
                  snapshot={draft}
                  storeBasePath={`/s/${storeSlug}`}
                  mode="editor"
                  device={device === "mobile" ? "mobile" : "desktop"}
                  selectedPage={page}
                  selectedSectionId={sel}
                  onSelectPage={(nextPage) => { setPage(nextPage); setSel(null); }}
                  onSelectSection={(sectionId) => { setSel(sectionId); if (sectionId) setRpTab("content"); }}
                  onInsertSectionBefore={(sectionId) => { setInsertAfterSec(sectionId); setModal("sectionpicker"); }}
                  onChangeSectionStyle={openStylePickerFor}
                  onDuplicateSection={dupSec}
                  onMoveSection={(sectionId, direction) => direction === "up" ? moveSecUp(sectionId) : moveSecDown(sectionId)}
                  onToggleSectionVisibility={toggleSectionVisibilityById}
                  onDeleteSection={delSec}
                  onSaveReusableSection={() => showToast("Reusable sections will be available in your block library soon.")}
                  onUpdateSectionCopy={updateSectionCopyById}
                  onUploadImage={uploadEditorImage}
                  onUpdateStoreLogo={updateStoreLogo}
                  onUpdateSectionItem={updateSectionItemById}
                  onUpdateImageBlock={updateImageBlockById}
                  cartCount={0}
                />
              ) : (
                <div className="canvas-empty">
                  <div className="canvas-empty-icon" dangerouslySetInnerHTML={{ __html: PageSVG }} />
                  <h3>Let's build your online store</h3>
                  <p>Choose a template, start from scratch, or let RexAI create your first editable store layout.</p>
                  <div className="canvas-empty-opts">
                    <button className="ce-opt" onClick={() => { window.location.href = "/builder/templates"; }}>
                      <div className="ce-opt-icon" dangerouslySetInnerHTML={{ __html: PaletteSVG }} />
                      <div className="ce-opt-lbl">Use a Template</div>
                      <div className="ce-opt-sub">Pick a ready-made store design and customize it.</div>
                    </button>
                    <button className="ce-opt" onClick={() => void startBlankStore()}>
                      <div className="ce-opt-icon" dangerouslySetInnerHTML={{ __html: GridSVG }} />
                      <div className="ce-opt-lbl">Start From Scratch</div>
                      <div className="ce-opt-sub">Build section by section with a working store shell.</div>
                    </button>
                    <button className="ce-opt" onClick={() => { window.location.href = "/builder/rex"; }}>
                      <div className="ce-opt-icon" dangerouslySetInnerHTML={{ __html: SparkSVG }} />
                      <div className="ce-opt-lbl">Build with RexAI</div>
                      <div className="ce-opt-sub">Answer a few questions and get an editable store.</div>
                    </button>
                  </div>
                  <div className="canvas-checklist">
                    {["Add store name", "Add logo", "Add products", "Choose store design", "Set delivery options", "Set payment method", "Publish store"].map(item => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right collapse toggle */}
        <button className="ptog rtog" style={{ right: rCol ? 0 : "var(--rpW)" }} onClick={() => setRCol(v => !v)}>
          {rCol ? "‹" : "›"}
        </button>

        {/* RIGHT PANEL */}
        <div className={`e-right-panel${rCol ? " collapsed" : ""}`}>
          <div className="rp-hd">
            <div className="rp-title">{sel ? sectionLabel(sel, selectedDraftSection) : "Store Editor"}</div>
            <div className="rp-sub">{sel ? "Edit section content and styles" : "Select a section to edit"}</div>
          </div>
          <div className="rp-tabs">
            {(["content", "design", "seo"] as RpTab[]).map(t => (
              <button key={t} className={`rp-tab${rpTab === t ? " on" : ""}`} onClick={() => setRpTab(t)}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <div className="rp-body">
            {draft ? renderSnapshotRightPanel() : (
              <>
                {rpTab === "content" && <div dangerouslySetInnerHTML={{ __html: getRpContentHtml(sel) }} />}
                {rpTab === "design" && <div dangerouslySetInnerHTML={{ __html: RP_DESIGN }} />}
                {rpTab === "seo" && <div dangerouslySetInnerHTML={{ __html: RP_SEO }} />}
              </>
            )}
          </div>
        </div>
      </div>

      {/* REX FLOAT BUTTON */}
      {!rexOpen && (
        <button className="rex-btn" onClick={() => setRexOpen(true)} title="Open Rex AI">
          <span dangerouslySetInnerHTML={{ __html: SparkSVG }} />
        </button>
      )}

      {/* REX PANEL */}
      <div className={`rex-panel${rexOpen ? " on" : ""}`}>
        <div className="rex-hd">
          <div className="rex-av"><span dangerouslySetInnerHTML={{ __html: SparkSVG }} /></div>
          <div>
            <div className="rex-nm">Rex AI</div>
            <div className="rex-st"><div className="rex-d" />Online</div>
          </div>
          <button className="rex-xb" onClick={() => setRexOpen(false)}>
            <span dangerouslySetInnerHTML={{ __html: XSvg }} />
          </button>
        </div>
        <div className="rex-msgs" ref={rexMsgsRef}>
          {rexMsgs.map((m, i) => (
            <div key={i} className={`rmsg ${m.role}`}>
              {m.text === "__typing__"
                ? <div className="rex-typing"><div className="rtd" /><div className="rtd" /><div className="rtd" /></div>
                : <div className="rbub">{m.text}</div>
              }
              {m.time && <div className="rtime">{m.time}</div>}
            </div>
          ))}
        </div>
        <div className="rex-qs">
          {["Write hero copy", "Add product section", "Improve SEO"].map(q => (
            <button key={q} className="rex-q" onClick={() => setRexInput(q)}>{q}</button>
          ))}
        </div>
        <div className="rex-in">
          <textarea
            className="rex-ta"
            rows={1}
            placeholder="Ask Rex anything..."
            value={rexInput}
            onChange={e => setRexInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendRex(); } }}
          />
          <button className="rex-sb" onClick={sendRex} disabled={rexBusy || !rexInput.trim()}>
            <span dangerouslySetInnerHTML={{ __html: SendSVG }} />
          </button>
        </div>
      </div>

      {/* CONTEXT MENU */}
      {ctxMenu && (
        <div id="sbi-ctx" className="ctx-menu on" style={{ top: ctxMenu.y, left: ctxMenu.x }}>
          <button className="ctx-item" onClick={() => { moveSecUp(ctxMenu.secId); setCtxMenu(null); }}>
            <span dangerouslySetInnerHTML={{ __html: UpSVG }} />Move Up
          </button>
          <button className="ctx-item" onClick={() => { moveSecDown(ctxMenu.secId); setCtxMenu(null); }}>
            <span dangerouslySetInnerHTML={{ __html: DownSVG }} />Move Down
          </button>
          <div className="ctx-sep" />
          <button className="ctx-item" onClick={() => dupSec(ctxMenu.secId)}>
            <span dangerouslySetInnerHTML={{ __html: CopySVG }} />Duplicate
          </button>
          <button className="ctx-item" onClick={() => { setSel(ctxMenu.secId); setRpTab("design"); setCtxMenu(null); }}>
            <span dangerouslySetInnerHTML={{ __html: PaletteSVG }} />Edit Design
          </button>
          <div className="ctx-sep" />
          <button className="ctx-item red" onClick={() => delSec(ctxMenu.secId)}>
            <span dangerouslySetInnerHTML={{ __html: TrashSVG }} />Delete
          </button>
        </div>
      )}

      {/* TOAST */}
      <div className={`toast${toast.show ? " show" : ""}${toast.ok ? " ok" : ""}`}>{toast.msg}</div>

      {/* MODAL: New Page */}
      <div className={`ovl${modal === "newpage" ? " on" : ""}`} onClick={e => { if (e.target === e.currentTarget) setModal(""); }}>
        <div className="modal" style={{ maxWidth: 420 }}>
          <div className="mhd">
            <div><div className="mtitle">New Page</div><div className="msub">Add a new page to your store</div></div>
            <button className="mx" onClick={() => setModal("")}><span dangerouslySetInnerHTML={{ __html: XSvg }} /></button>
          </div>
          <div className="mbody">
            <div className="rf"><label className="rl">Page Name</label><input className="ri" id="new-page-name" placeholder="e.g. About Us, FAQ, Sale..." autoFocus /></div>
            <div className="rf"><label className="rl">Start from</label>
              <select className="rsel"><option>Blank Page</option><option>Copy of Homepage</option></select>
            </div>
          </div>
          <div className="mfoot">
            <button className="mbtn mbtn-ghost" onClick={() => setModal("")}>Cancel</button>
            <button className="mbtn mbtn-t" onClick={() => {
              const v = (document.getElementById("new-page-name") as HTMLInputElement)?.value?.trim();
              if (v) addNewPage(v); else showToast("Enter a page name", false);
            }}>Create Page</button>
          </div>
        </div>
      </div>

      {/* MODAL: Section Picker */}
      <div className={`ovl${modal === "sectionpicker" ? " on" : ""}`} onClick={e => { if (e.target === e.currentTarget) setModal(""); }}>
        <div className="modal" style={{ maxWidth: 640 }}>
          <div className="mhd">
            <div><div className="mtitle">Add Section</div><div className="msub">Only sections that fit this spot are shown</div></div>
            <button className="mx" onClick={() => setModal("")}><span dangerouslySetInnerHTML={{ __html: XSvg }} /></button>
          </div>
          <div className="mbody">
            {sectionPickerGroups.length === 0 ? (
              <div className="rp-empty" style={{ padding: 24 }}>
                <p style={{ fontSize: 12, color: "var(--g500)" }}>There is no sensible section to add at this spot. Select a body section to add content blocks, or choose another insert point.</p>
              </div>
            ) : sectionPickerGroups.map(cat => (
              <div key={cat.cat}>
                <div className="el-cat">{cat.cat}</div>
                <div className="sp-grid" style={{ marginBottom: 16 }}>
                  {cat.items.map(item => {
                    const previewKind = TEMPLATE_KIND_BY_ELEMENT[item.id];
                    const previewSection = previewKind ? { id: previewKind, label: item.lbl } : null;
                    const inner = (
                      <div key={item.id} className="sp-card" onClick={() => addSec(item.id, insertAfterSec)}>
                        <div className="sp-thumb"><span dangerouslySetInnerHTML={{ __html: item.svg }} /></div>
                        <div className="sp-info"><div className="sp-name">{item.lbl}</div></div>
                      </div>
                    );
                    return previewSection ? (
                      <SectionPreviewPopover key={item.id} section={previewSection} position="top">
                        {inner}
                      </SectionPreviewPopover>
                    ) : inner;
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* MODAL: Publish */}
      <StoreLaunchBillingModal open={Boolean(launchPricing)} pricing={launchPricing} onClose={() => setLaunchPricing(null)} />
      <div className={`ovl${modal === "publish" ? " on" : ""}`} onClick={e => { if (e.target === e.currentTarget) setModal(""); }}>
        <div className="modal" style={{ maxWidth: 460 }}>
          <div className="mhd">
            <div><div className="mtitle">Publish Store</div><div className="msub">Make your store live</div></div>
            <button className="mx" onClick={() => setModal("")}><span dangerouslySetInnerHTML={{ __html: XSvg }} /></button>
          </div>
          <div className="mbody">
            <div className="pub-steps">
              {["Build", "Deploy", "Live"].map((lbl, idx) => (
                <div key={lbl} style={{ display: "contents" }}>
                  {idx > 0 && <div className={`pub-connector${pubStep > idx ? " done" : ""}`} />}
                  <div className={`pub-step${pubStep > idx ? " done" : pubStep === idx ? " cur" : ""}`}>
                    <div className="pub-step-d">{pubStep > idx ? <span dangerouslySetInnerHTML={{ __html: SelectSVG }} /> : idx + 1}</div>
                    <div className="pub-step-l">{lbl}</div>
                  </div>
                </div>
              ))}
            </div>
            {pubStep === 3 ? (
              <div style={{ background: "#f0fdf4", borderRadius: 8, padding: "14px 16px", border: "1px solid #bbf7d0" }}>
                <div style={{ fontWeight: 700, color: "#166534", marginBottom: 8 }}>Your store is live!</div>
                <div className="pub-url-b">
                  <span className="pub-url-t">https://{storeSlug}.shopinbos.com</span>
                  <button className="pub-cp" onClick={() => { navigator.clipboard.writeText(`https://${storeSlug}.shopinbos.com`); showToast("URL copied!"); }}>Copy</button>
                </div>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: 13, color: "var(--g600)", marginBottom: 12 }}>Your store will be published at:</p>
                <div className="pub-url-b"><span className="pub-url-t">https://{storeSlug}.shopinbos.com</span></div>
                <div style={{ background: "var(--g50)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "var(--g600)", marginTop: 10 }}>
                  All published pages will be visible to customers.
                </div>
              </div>
            )}
          </div>
          <div className="mfoot">
            <button className="mbtn mbtn-ghost" onClick={() => setModal("")}>{pubStep === 3 ? "Close" : "Cancel"}</button>
            {pubStep === 0 && <button className="mbtn mbtn-c" onClick={doPublish} disabled={publishing}>Publish Now</button>}
            {pubStep === 3 && <button className="mbtn mbtn-t" onClick={() => window.open(`https://${storeSlug}.shopinbos.com`, "_blank")}>View Live Store</button>}
          </div>
        </div>
      </div>
      {/* ── Unsaved changes leave dialog ── */}
      <ConfirmDialog
        open={leaveDialog}
        title="Unsaved changes"
        message="You have unsaved changes in the store editor. If you leave now, your progress will be lost."
        confirmLabel="Leave anyway"
        cancelLabel="Stay"
        variant="warning"
        onConfirm={() => {
          setLeaveDialog(false);
          const dest = pendingLeaveDest.current;
          pendingLeaveDest.current = null;
          if (dest) router.push(dest);
        }}
        onCancel={() => {
          setLeaveDialog(false);
          pendingLeaveDest.current = null;
        }}
      />
    </div>
  );
}
