// Builds what a theme preview renders: the theme's own seed pages and tokens, plus either the sample catalogue
// (demo-catalogue.ts) or the seller's own products. Nothing here is saved; previews never touch the draft.

import { BOUTIQUE_TEMPLATE_MANIFESTS, isBoutiqueTheme, type BoutiqueThemeId } from "@/lib/store-templates/boutique-themes";
import { demoBanners, demoCatalogueFor, demoProducts } from "@/lib/store-templates/demo-catalogue";
import type { StoreEditorSnapshot } from "@/lib/store-templates/types";
import type { StorefrontShopperInfo } from "@/lib/storefront/shopper-info";
import type { ShopperProduct } from "@/components/storefront/shopper/catalog";
import type { BoutiqueStore } from "@/components/storefront/boutique/BoutiqueStorefront";

/** The seller's store, as the builder and /builder/templates know it. */
export interface PreviewOwnStore {
  name: string;
  slug: string;
  logoUrl?: string | null;
  description?: string | null;
  city?: string | null;
  country?: string | null;
  currency: string;
  storeProducts: ShopperProduct[];
  shopper?: unknown;
}

/** Sample delivery and payment settings, so the announcement bar, FAQ and product page look like a set-up store. */
const DEMO_SHOPPER: StorefrontShopperInfo = {
  announcement: "Free delivery in Lagos over ₦50,000 · Pay on delivery available",
  delivery: [
    { name: "Lagos", regions: ["Lagos"], fee: 2500, freeOver: 50000, alwaysFree: false, estimatedDays: "1-2 days", pickupOnly: false },
    { name: "Everywhere else", regions: [], fee: 4500, freeOver: null, alwaysFree: false, estimatedDays: "3-5 days", pickupOnly: false },
  ],
  flatRate: null,
  payOnDelivery: true,
  payOnDeliveryLimit: 100000,
  paymentLabels: ["Card", "Transfer", "USSD", "Pay on delivery"],
  // No number: sample stores never link to a real WhatsApp chat.
  whatsappNumber: null,
  collections: [],
  rating: null,
  reviews: [],
};

const SNAPSHOTS = new Map<string, StoreEditorSnapshot>();

function seedSnapshot(themeId: BoutiqueThemeId): StoreEditorSnapshot {
  const cached = SNAPSHOTS.get(themeId);
  if (cached) return cached;
  const manifest = BOUTIQUE_TEMPLATE_MANIFESTS.find((entry) => entry.id === themeId)!;
  const snapshot: StoreEditorSnapshot = {
    templateId: manifest.id,
    templateName: manifest.name,
    sourcePack: manifest.sourcePack,
    sourcePath: manifest.sourcePath,
    sourceType: manifest.sourceType,
    layoutFamily: manifest.layoutFamily,
    themeTokens: manifest.themeTokens,
    pages: JSON.parse(JSON.stringify(manifest.seedPages)),
    updatedAt: "",
  };
  SNAPSHOTS.set(themeId, snapshot);
  return snapshot;
}

/** Sample banners go into the hero and story sections; the seller's own preview uses their product photos. */
function withBanners(snapshot: StoreEditorSnapshot, hero: string, story: string): StoreEditorSnapshot {
  return {
    ...snapshot,
    pages: snapshot.pages.map((page) => ({
      ...page,
      sections: page.sections.map((section) => {
        // Ìwé's shelf shows product covers, so its sample hero uses the sample books.
        if (section.kind === "hero-split") return snapshot.templateId === "iwe" ? section : { ...section, items: [{ imageUrl: hero }] };
        if (section.kind === "story-split") return { ...section, items: [{ imageUrl: story }] };
        return section;
      }),
    })),
  };
}

export interface ThemePreviewData {
  themeId: BoutiqueThemeId;
  store: BoutiqueStore;
  snapshot: StoreEditorSnapshot;
  sample: boolean;
}

const DEMO_CACHE = new Map<string, ThemePreviewData>();

/** The seller's name and logo on a sample store (sign-up, before the shop has products of its own). */
export interface PreviewBrand {
  name: string;
  logoUrl?: string | null;
}

export function previewData(themeId: string, own?: PreviewOwnStore | null, brand?: PreviewBrand | null): ThemePreviewData | null {
  if (!isBoutiqueTheme(themeId)) return null;
  if (brand && !own) {
    const sample = previewData(themeId);
    return sample ? { ...sample, store: { ...sample.store, name: brand.name || sample.store.name, logoUrl: brand.logoUrl ?? null } } : null;
  }
  const snapshot = seedSnapshot(themeId);
  if (own) {
    return {
      themeId,
      sample: false,
      snapshot,
      store: { name: own.name, slug: own.slug, logoUrl: own.logoUrl, description: own.description, city: own.city, country: own.country, currency: own.currency, storeProducts: own.storeProducts, shopper: own.shopper },
    };
  }
  const cached = DEMO_CACHE.get(themeId);
  if (cached) return cached;
  const tokens = snapshot.themeTokens;
  const colours = { accent: tokens.accent, ink: tokens.ink, cardBg: tokens.cardBg, paperBg: tokens.paperBg };
  const catalogue = demoCatalogueFor(themeId);
  const banners = demoBanners(themeId, colours);
  const data: ThemePreviewData = {
    themeId,
    sample: true,
    snapshot: withBanners(snapshot, banners.hero, banners.story),
    store: {
      name: catalogue.storeName,
      slug: `sample-${themeId}`,
      description: catalogue.description,
      city: catalogue.city,
      country: "Nigeria",
      currency: "NGN",
      storeProducts: demoProducts(themeId, colours),
      shopper: DEMO_SHOPPER,
    },
  };
  DEMO_CACHE.set(themeId, data);
  return data;
}
