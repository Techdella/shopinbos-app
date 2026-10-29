import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { notify } from "@/lib/notifications/notify.server";
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

// Putting a store on a theme: shared by POST /api/store/templates/apply (the seller's own switch) and the move of
// stores off the old blank starter (scripts/move-blank-starter-stores.ts).

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

/** The newest non-archived products a theme's product sections show (the seller's own and dropshipped alike). */
export const THEME_PRODUCTS_SELECT = {
  where: { status: { not: "archived" } },
  orderBy: { createdAt: "desc" },
  take: 8,
  select: { id: true, name: true, description: true, images: true, retailPrice: true, currency: true },
} satisfies Prisma.Store$storeProductsArgs;

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

export type BlankStarterMove =
  | { storeId: string; result: "moved"; themeId: string; themeName: string; live: boolean; notified: boolean; carriedSections: number }
  | { storeId: string; result: "skipped"; reason: "not-found" | "not-blank" | "no-theme" };

/**
 * Moves a store whose draft is still the old blank starter onto a free theme that fits what it sells, keeping the
 * seller's own copy, images, products and pages. A store that never went live takes the theme straight away; a live
 * store gets it as a draft and the seller is told, with a link to preview and publish it. Safe to re-run: a store
 * already moved is no longer blank, and the notice is deduped per store.
 */
export async function moveStoreOffBlankStarter(storeId: string, options: { dryRun?: boolean; notify?: boolean } = {}): Promise<BlankStarterMove> {
  const store = await db.store.findUnique({
    where: { id: storeId },
    select: { id: true, userId: true, name: true, logoUrl: true, currency: true, brandSettings: true, storeProducts: THEME_PRODUCTS_SELECT },
  });
  if (!store) return { storeId, result: "skipped", reason: "not-found" };

  const settings = ((store.brandSettings as Record<string, unknown> | null) ?? {}) as StoreBrandSettingsLike;
  const draft = resolveDraftSnapshot(settings, null);
  if (!draft) return { storeId, result: "skipped", reason: "not-blank" };
  const moved = moveOffBlankStarter(draft, settings, store.name, { productNames: store.storeProducts.map((product) => product.name) });
  if (!moved.moved) return { storeId, result: "skipped", reason: "not-blank" };
  const manifest = getTemplateManifest(moved.snapshot.templateId);
  if (!manifest) return { storeId, result: "skipped", reason: "no-theme" };

  const live = Boolean(resolvePublishedSnapshot(settings, null));
  const themeName = themeLibraryEntry(manifest.id)?.name ?? manifest.name;
  const base = { storeId, result: "moved" as const, themeId: manifest.id, themeName, live, carriedSections: moved.carriedSections };
  if (options.dryRun) return { ...base, notified: false };

  const next = settingsWithThemeDraft(settings, manifest, hydrateDraftWithStoreData(moved.snapshot, store));
  await db.store.update({ where: { id: store.id }, data: { brandSettings: next as unknown as Prisma.InputJsonValue } });

  let notified = false;
  if (live && options.notify !== false) {
    await notify({
      userId: store.userId,
      event: "account.update",
      type: "store_builder",
      title: `We've set up a new look for ${store.name}`,
      description: `Your store was set up with a temporary starter layout. We've prepared ${themeName} for you, with your products, logo and words already in. Preview it and publish when you're happy, or pick another theme.`,
      link: "/builder/editor",
      actionLabel: "Preview & publish",
      actionUrl: "/builder/editor",
      email: true,
      dedupeKey: `blank-starter-move:${store.id}`,
      metadata: { storeId: store.id, themeId: manifest.id },
    })
      .then(() => { notified = true; })
      .catch((error) => console.error("[themes] blank starter notice failed", store.id, error));
  }
  return { ...base, notified };
}

/** Stores whose working draft is the blank starter (the saved draft, else the live version). */
export async function findBlankStarterStores() {
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Store"
    WHERE COALESCE("brandSettings"->'editor'->'draft'->>'templateId', "brandSettings"->'editor'->'published'->>'templateId') = 'blank'
    ORDER BY "createdAt" ASC`;
  return rows.map((row) => row.id);
}
