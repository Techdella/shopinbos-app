import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import {
  buildTemplateSelectionMeta,
  createSectionFromLibrary,
  createSnapshotFromTemplate,
  fallbackDraftSnapshot,
  getTemplateManifest,
  isBoutiqueTheme,
  parseEditorState,
  resolveDraftSnapshot,
  switchThemeDraft,
  THEME_LIBRARY,
  tierIncludes,
  type StoreBrandSettingsLike,
  type ThemeTier,
  type StoreEditorSnapshot,
} from "@/lib/store-templates";
import { readPaymentChoices } from "@/lib/storefront/shopper-info";
import { draftHealthFacts, type StoreHealthFacts } from "@/lib/store-health";
import { BOUTIQUE_SECTION_KINDS, CLASSIC_SECTION_KINDS, type ApplyContext } from "@/lib/ai/rex/studio-plan";
import { boundRexVersions, readRexVersions, type RexVersionState } from "@/lib/ai/rex/studio-versions";
import { rexVersionLimitFor } from "@shared/rex-preferences";
import { isLiveStatus } from "@/lib/ai/rex/build-store";

// Server side of Rex Studio: loading the store, the facts behind store health, and saving the DRAFT
// (never the published store) together with its version history.

export const studioStoreSelect = {
  id: true,
  userId: true,
  name: true,
  slug: true,
  status: true,
  description: true,
  logoUrl: true,
  city: true,
  country: true,
  currency: true,
  customDomain: true,
  brandSettings: true,
} as const;

export type StudioStore = Prisma.StoreGetPayload<{ select: typeof studioStoreSelect }>;

export function settingsOf(store: { brandSettings: unknown }): StoreBrandSettingsLike {
  return (store.brandSettings && typeof store.brandSettings === "object" && !Array.isArray(store.brandSettings)
    ? store.brandSettings
    : {}) as StoreBrandSettingsLike;
}

/** The draft Rex edits: the saved draft, else the published store, else the chosen template, else the starter theme. */
export function studioDraft(store: StudioStore): { draft: StoreEditorSnapshot; saved: boolean } {
  const settings = settingsOf(store);
  const saved = resolveDraftSnapshot(settings, null);
  if (saved) return { draft: saved, saved: true };
  return { draft: fallbackDraftSnapshot(settings, store.name), saved: false };
}

export function themeNameFor(themeId: string | null | undefined, fallback?: string) {
  if (!themeId) return fallback ?? "Your";
  return getTemplateManifest(themeId)?.name ?? fallback ?? themeId;
}

export function allowedKindsFor(themeId: string) {
  return isBoutiqueTheme(themeId) ? BOUTIQUE_SECTION_KINDS : CLASSIC_SECTION_KINDS;
}

/** The themes Rex may offer: those the seller's plan includes (`tier`), plus the one the draft already uses. */
export function studioThemes(currentId: string, access: { tier: ThemeTier; owned?: readonly string[] } = { tier: "basic" }) {
  const list: Array<{ id: string; name: string; description: string }> = THEME_LIBRARY.filter((theme) => getTemplateManifest(theme.id) && (theme.id === currentId || tierIncludes(access.tier, theme.tier) || access.owned?.includes(theme.id))).map((theme) => ({ id: theme.id, name: theme.name, description: theme.blurb }));
  const current = getTemplateManifest(currentId);
  if (current && !list.some((theme) => theme.id === current.id)) list.push({ id: current.id, name: current.name, description: current.description });
  return list;
}

/** Approved reviews as section items, for the classic themes that read them from the section. */
export async function approvedReviewItems(storeId: string) {
  const rows = await db
    .$queryRawUnsafe<Array<{ buyerName: string; body: string; title: string }>>(
      `SELECT "buyerName", body, title FROM "ProductReview"
       WHERE "storeId" = $1 AND status = 'approved' AND rating >= 4 AND (COALESCE(body, '') <> '' OR COALESCE(title, '') <> '')
       ORDER BY "createdAt" DESC LIMIT 6`,
      storeId,
    )
    .catch(() => []);
  return rows.map((row) => ({ quote: (row.body || row.title).trim().slice(0, 240), person: row.buyerName.trim().split(/\s+/)[0] ?? "Customer" }));
}

export async function studioApplyContext(store: StudioStore): Promise<ApplyContext> {
  return {
    storeName: store.name,
    themeSnapshot: (themeId) => {
      const manifest = getTemplateManifest(themeId);
      return manifest ? createSnapshotFromTemplate(manifest) : null;
    },
    themeName: (themeId) => getTemplateManifest(themeId)?.name ?? null,
    switchTheme: (current, seed) => {
      const oldManifest = getTemplateManifest(current.templateId);
      return switchThemeDraft(current, seed, oldManifest ? createSnapshotFromTemplate(oldManifest) : null).snapshot;
    },
    createSection: createSectionFromLibrary,
    allowedKinds: allowedKindsFor,
    reviewItems: await approvedReviewItems(store.id),
    isBoutique: isBoutiqueTheme,
  };
}

/** The real facts behind the store health score (draft facts are derived from `draft`). */
export async function loadHealthFacts(store: StudioStore, draft: StoreEditorSnapshot | null): Promise<StoreHealthFacts> {
  const settings = settingsOf(store) as Record<string, unknown>;
  const [products, zones, liveChat, reviews] = await Promise.all([
    db.storeProduct
      .findMany({ where: { storeId: store.id, status: "published" }, select: { images: true, retailPrice: true } })
      .catch(() => []),
    db.shippingZone.count({ where: { storeId: store.id, active: true } }).catch(() => 0),
    db.liveChatConfig.findUnique({ where: { storeId: store.id }, select: { whatsappNumber: true } }).catch(() => null),
    db
      .$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT COUNT(*)::bigint AS count FROM "ProductReview" WHERE "storeId" = $1 AND status = 'approved'`, store.id)
      .catch(() => []),
  ]);
  const shipping = (settings.shippingConfig && typeof settings.shippingConfig === "object" ? settings.shippingConfig : {}) as Record<string, unknown>;
  const legal = (settings.legal && typeof settings.legal === "object" ? settings.legal : {}) as Record<string, unknown>;
  const filled = (value: unknown) => typeof value === "string" && value.trim().length > 0;
  return {
    products: products.length,
    productsWithPhoto: products.filter((product) => product.images.some(Boolean)).length,
    productsWithPrice: products.filter((product) => product.retailPrice > 0).length,
    hasLogo: Boolean(store.logoUrl),
    deliveryOptions: zones > 0 ? zones : typeof shipping.flatRate === "number" ? 1 : 0,
    paymentMethods: readPaymentChoices(settings).labels.filter((label) => label !== "USSD").length,
    approvedReviews: Number(reviews[0]?.count ?? 0),
    hasCustomDomain: Boolean(store.customDomain),
    hasReturnPolicy: filled(legal.returnPolicy),
    hasDeliveryPolicy: filled(legal.shippingPolicy),
    hasWhatsapp: filled(liveChat?.whatsappNumber),
    draft: draftHealthFacts(draft),
  };
}

/**
 * Saves a new draft and its version history. Only editor.draft changes for a store shoppers can already
 * see; the top-level look and template the live storefront falls back on are left alone until Publish.
 */
export async function saveStudioDraft(store: StudioStore, draft: StoreEditorSnapshot, versions: RexVersionState) {
  const settings = settingsOf(store);
  const editor = parseEditorState(settings.editor);
  const shoppersSeeIt = isLiveStatus(store.status) || Boolean(editor.published);
  const manifest = getTemplateManifest(draft.templateId);
  const meta = manifest ? buildTemplateSelectionMeta(manifest) : null;
  const next: StoreBrandSettingsLike = {
    ...settings,
    editor: { ...editor, ...(meta ? { template: meta } : {}), draft },
    // History length follows Settings > Peggy & Rex ("Keep the last N versions").
    rexVersions: { ...versions, items: boundRexVersions(versions.items, rexVersionLimitFor(settings)) },
  };
  // The live storefront reads the published snapshot first; the top-level template only picks the
  // manifest at publish time. A store without a published snapshot falls back on the top-level look.
  if (meta && (editor.published || !shoppersSeeIt)) next.template = meta;
  if (!shoppersSeeIt) next.themeTokens = draft.themeTokens;
  // JSON round trip drops undefined values Prisma would reject inside a Json column.
  const clean = JSON.parse(JSON.stringify(next)) as StoreBrandSettingsLike;
  await db.store.update({ where: { id: store.id }, data: { brandSettings: clean as unknown as Prisma.InputJsonValue } });
  return clean;
}

export function versionsOf(store: { brandSettings: unknown }) {
  return readRexVersions(store.brandSettings);
}
