// Putting a store on a theme, without the database: the apply route, the move off the old blank starter
// (src/lib/themes/apply.server.ts) and its REST runner (scripts/move-blank-starter-stores.ts) all use it.

import {
  applyTemplateToDraft,
  buildTemplateSelectionMeta,
  getTemplateManifest,
  moveOffBlankStarter,
  parseEditorState,
  resolveDraftSnapshot,
  resolvePublishedSnapshot,
  themeLibraryEntry,
  type StoreBrandSettingsLike,
  type StoreEditorSnapshot,
  type StoreTemplateManifest,
} from "@/lib/store-templates";

export function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, stripUndefinedDeep(entry)]),
    ) as T;
  }
  return value;
}

function formatMoney(currency: string | null | undefined, amount: number | null | undefined) {
  const value = Number(amount ?? 0);
  const code = currency || "NGN";
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${code} ${value.toLocaleString()}`;
  }
}

export interface ThemeStoreData {
  name: string;
  logoUrl?: string | null;
  currency?: string | null;
  storeProducts: Array<{
    id: string;
    name: string;
    description?: string | null;
    images: string[];
    retailPrice: number | null;
    currency: string | null;
  }>;
}

/** The store's logo and name in the header, and its real products in the product sections. */
export function hydrateDraftWithStoreData(draft: StoreEditorSnapshot, store: ThemeStoreData): StoreEditorSnapshot {
  const products = store.storeProducts.slice(0, 8);
  if (products.length === 0 && !store.logoUrl) return draft;

  return {
    ...draft,
    pages: draft.pages.map((page) => ({
      ...page,
      sections: page.sections.map((section) => {
        if (section.kind === "header") {
          return {
            ...section,
            settings: {
              ...section.settings,
              editableLogo: true,
              logoUrl: store.logoUrl ?? null,
              syncedStoreName: store.name,
            },
          };
        }

        const alreadyMapped = (section.items ?? []).some((item) => typeof item.mappedStoreProductId === "string" && item.mappedStoreProductId);
        if ((section.kind === "featured-products" || section.kind === "cart-summary" || section.kind === "wishlist-grid") && products.length > 0 && !alreadyMapped) {
          const styleItems = section.items && section.items.length > 0 ? section.items : [];
          return {
            ...section,
            settings: {
              ...section.settings,
              allowMapping: true,
              dataSource: "storeProducts",
            },
            items: products.slice(0, Math.max(styleItems.length, 3)).map((product, index) => {
              const style = styleItems[index % Math.max(styleItems.length, 1)] ?? {};
              return {
                ...style,
                id: product.id,
                title: product.name,
                subtitle: product.description?.slice(0, 90) || String(style.subtitle ?? "Store product"),
                priceLabel: formatMoney(product.currency ?? store.currency, product.retailPrice),
                imageUrl: product.images[0] ?? style.imageUrl,
                mappedStoreProductId: product.id,
              };
            }),
          };
        }

        return section;
      }),
    })),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Brand settings with `draft` as the store's draft on `manifest`. A live store keeps its published look until the
 * seller publishes; only the draft changes. A store that has never published takes the theme straight away.
 */
export function settingsWithThemeDraft(current: StoreBrandSettingsLike, manifest: StoreTemplateManifest, draft: StoreEditorSnapshot) {
  const published = resolvePublishedSnapshot(current, null);
  const next: StoreBrandSettingsLike = published
    ? {
        ...current,
        editor: {
          ...parseEditorState(current.editor),
          template: buildTemplateSelectionMeta(manifest),
          draft,
        },
      }
    : applyTemplateToDraft(current, manifest, draft);
  return stripUndefinedDeep(next);
}

export type BlankStarterPlan =
  | { result: "moved"; themeId: string; themeName: string; live: boolean; carriedSections: number; brandSettings: StoreBrandSettingsLike }
  | { result: "skipped"; reason: "not-blank" | "no-theme" };

/**
 * A store whose draft is still the old blank starter, moved onto a free theme that fits what it sells: the seller's
 * own copy, images, products and pages come across. A never-live store takes the theme; a live one gets it as a draft.
 */
export function planBlankStarterMove(store: ThemeStoreData & { brandSettings: unknown }): BlankStarterPlan {
  const settings = ((store.brandSettings as Record<string, unknown> | null) ?? {}) as StoreBrandSettingsLike;
  const draft = resolveDraftSnapshot(settings, null);
  if (!draft) return { result: "skipped", reason: "not-blank" };
  const moved = moveOffBlankStarter(draft, settings, store.name, { productNames: store.storeProducts.map((product) => product.name) });
  if (!moved.moved) return { result: "skipped", reason: "not-blank" };
  const manifest = getTemplateManifest(moved.snapshot.templateId);
  if (!manifest) return { result: "skipped", reason: "no-theme" };
  return {
    result: "moved",
    themeId: manifest.id,
    themeName: themeLibraryEntry(manifest.id)?.name ?? manifest.name,
    live: Boolean(resolvePublishedSnapshot(settings, null)),
    carriedSections: moved.carriedSections,
    brandSettings: settingsWithThemeDraft(settings, manifest, hydrateDraftWithStoreData(moved.snapshot, store)),
  };
}

/** What a live seller is told when their store is moved (bell, push and email). */
export function blankStarterNotice(storeId: string, storeName: string, themeId: string, themeName: string) {
  return {
    event: "account.update",
    type: "store_builder" as const,
    title: `We've set up a new look for ${storeName}`,
    description: `Your store was set up with a temporary starter layout. We've prepared ${themeName} for you, with your products, logo and words already in. Preview it and publish when you're happy, or pick another theme.`,
    link: "/builder/editor",
    actionLabel: "Preview & publish",
    actionUrl: "/builder/editor",
    dedupeKey: `blank-starter-move:${storeId}`,
    metadata: { storeId, themeId },
  };
}
