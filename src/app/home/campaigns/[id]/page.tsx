import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { AppFrame } from "@/components/shell/AppFrame";
import { getT } from "@/lib/i18n/server";
import { parseDiscountConfig } from "@/lib/discounts";
import { readPopupConfig } from "@/lib/marketing/forms";
import { isBoutiqueTheme, type StoreEditorSnapshot, type ThemeTokenSet } from "@/lib/store-templates";
import { resolveStoreTemplateId } from "@/lib/storefront/product-page.server";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { CampaignError, campaignDetail, type SellerStore } from "@/lib/store-campaigns/server";
import { CampaignEditor, type EditorStore } from "./CampaignEditor";

// One seasonal campaign: Overview (schedule, priority, linked discount), Look (campaign colours, logo and home page
// sections, saved as changes on top of the store's own design), Blocks (announcement bar, pop-up, badges,
// countdown) and Report.

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("campaigns");
  return { title: t("metaTitle") };
}

function snapshotOf(brandSettings: unknown): StoreEditorSnapshot | null {
  const settings = (brandSettings && typeof brandSettings === "object" ? brandSettings : {}) as Record<string, unknown>;
  const editor = (settings.editor && typeof settings.editor === "object" ? settings.editor : {}) as Record<string, unknown>;
  const snapshot = (editor.published ?? editor.draft) as StoreEditorSnapshot | undefined;
  return snapshot && Array.isArray(snapshot.pages) ? snapshot : null;
}

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true, customDomain: true, brandSettings: true, userId: true } });
  if (!store) notFound();
  const sellerStore: SellerStore = store;
  const now = new Date();
  const campaign = await campaignDetail(sellerStore, id, now).catch((error) => {
    if (error instanceof CampaignError) return null;
    throw error;
  });
  if (!campaign) notFound();

  const [discounts, products, collections, popups] = await Promise.all([
    db.discount.findMany({ where: { storeId: store.id, status: { in: ["active", "scheduled", "draft", "disabled"] } }, orderBy: { createdAt: "desc" }, take: 200, select: { id: true, name: true, code: true, status: true, startsAt: true, expiresAt: true, config: true } }),
    db.storeProduct.findMany({ where: { storeId: store.id, status: { not: "archived" } }, orderBy: { createdAt: "desc" }, take: 500, select: { id: true, name: true, images: true, retailPrice: true, compareAtPrice: true, currency: true } }),
    db.collection.findMany({ where: { storeId: store.id }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    db.storeForm.findMany({ where: { storeId: store.id, isPopup: true }, orderBy: { updatedAt: "desc" }, take: 50, select: { id: true, name: true, popupConfig: true } }),
  ]);

  const snapshot = snapshotOf(store.brandSettings);
  const templateId = resolveStoreTemplateId(store.brandSettings) ?? snapshot?.templateId ?? "";
  const settings = (store.brandSettings ?? {}) as Record<string, unknown>;
  const baseTokens = (snapshot?.themeTokens ?? (settings.themeTokens as ThemeTokenSet | undefined) ?? null) as ThemeTokenSet | null;
  const editorStore: EditorStore = {
    name: store.name,
    slug: store.slug,
    logoUrl: store.logoUrl,
    host: buildStorefrontUrl({ slug: store.slug, customDomain: store.customDomain }).replace(/^https?:\/\//, "").replace(/\/$/, ""),
    renderer: isBoutiqueTheme(templateId) ? "boutique" : "classic",
    themeId: templateId,
    baseTokens,
    snapshot,
    products: products.map((product) => ({ id: product.id, name: product.name, images: product.images, retailPrice: product.retailPrice, compareAtPrice: product.compareAtPrice, currency: product.currency })),
    collections,
    discounts: discounts.map((discount) => ({
      id: discount.id,
      name: discount.name,
      code: discount.code,
      status: discount.status,
      automatic: parseDiscountConfig(discount.config).automatic,
      startsAt: discount.startsAt?.toISOString() ?? null,
      expiresAt: discount.expiresAt?.toISOString() ?? null,
    })),
    popups: popups.filter((form) => !readPopupConfig(form.popupConfig).campaignId).map((form) => ({ id: form.id, name: form.name })),
  };

  return (
    <AppFrame
      role="seller"
      storeName={store.name}
      storeSlug={store.slug}
      storeInitial={store.name.charAt(0).toUpperCase()}
      storeLogoUrl={store.logoUrl}
      userName={user.name}
      avatarUrl={user.avatarUrl}
      userEmail={user.email}
    >
      <CampaignEditor initial={campaign} store={editorStore} serverNow={now.toISOString()} />
    </AppFrame>
  );
}
