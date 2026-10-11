import { redirect } from "next/navigation";
import { ThemeLibrary } from "@/components/builder/ThemeLibrary";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { loadShopperInfo } from "@/lib/storefront/shopper-info.server";
import { resolveDraftSnapshot } from "@/lib/store-templates";
import { getSellerWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/** Only same-site paths are followed after a first-run pick. */
function safeNext(value: string | undefined) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : null;
}

export default async function BuilderTemplatesPage({ searchParams }: { searchParams?: Promise<{ next?: string; onboarding?: string }> }) {
  const user = await requireRole(["seller"], "/login");
  const params = await searchParams;

  const workspace = await getSellerWorkspace(user.id);

  if (!workspace?.store) {
    redirect("/onboarding?role=seller");
  }

  // "Current" is the theme the seller is editing: the draft's, else the store's chosen template.
  const draft = resolveDraftSnapshot(workspace.store.brandSettings, null);
  const currentThemeId = draft?.templateId ?? workspace.settings.template?.templateId ?? null;

  // First run (from onboarding, or no theme chosen yet): picking a theme carries straight on to the builder.
  const firstRunNext = safeNext(params?.next) ?? (params?.onboarding === "true" || !currentThemeId ? "/builder" : null);

  // "Show with my products" in the theme previews: the store's newest products that have a photo.
  const store = workspace.store;
  const products = await db.storeProduct
    .findMany({
      where: { storeId: store.id, NOT: { images: { isEmpty: true } } },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { id: true, name: true, description: true, images: true, retailPrice: true, compareAtPrice: true, currency: true, variants: true, category: { select: { id: true, name: true, slug: true } } },
    })
    .catch(() => []);
  const shopper = products.length >= 4 ? await loadShopperInfo(store.id, store.brandSettings, products) : null;
  const ownStore = products.length >= 4
    ? {
        name: store.name,
        slug: store.slug,
        logoUrl: store.logoUrl,
        description: store.description,
        city: store.city,
        country: store.country,
        currency: store.currency,
        shopper,
        storeProducts: products.map((product) => ({ ...product, currency: product.currency || store.currency })),
      }
    : null;

  return (
    <SellerPage
      user={user}
      store={storeSummary(workspace.store)}
      title="Store templates"
      sub="Switch any time. Your products, prices and orders stay."
    >
      <ThemeLibrary
        mode="page"
        currentThemeId={currentThemeId}
        nextPath={firstRunNext}
        ownStore={ownStore}
        // Open on the seller's category only while they're choosing their first theme; after that show all.
        initialCategory={currentThemeId ? null : workspace.settings.onboardingMemory?.category}
      />
    </SellerPage>
  );
}
