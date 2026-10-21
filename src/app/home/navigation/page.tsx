import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db/client";
import { saveStoreNavigationSettings } from "@/app/actions/workspace";
import { PageToast } from "@/components/PageToast";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { PillLink } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { getT } from "@/lib/i18n/server";
import { parseEditorState } from "@/lib/store-templates";
import { navigationDraft, navigationOf } from "@/lib/store-navigation.server";
import { navigationFingerprint } from "@/lib/storefront/store-navigation";
import { publicBrandSettings } from "@shared/public-brand-settings";
import { NavigationEditor } from "./NavigationEditor";
import { PageTip } from "@/components/learn/PageTip";
import { liveItemWhere } from "@/lib/cms/fields";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getT("store");
  return { title: t("nav.title") };
}

type NavPageProps = { searchParams?: Promise<{ saved?: string; conflict?: string; error?: string }> };

// The store's menus, read from (and saved to) the builder snapshot's header and footer: the same data the storefront
// renders and the store builder edits (src/lib/store-navigation.server.ts).
export default async function NavigationSettingsPage({ searchParams }: NavPageProps) {
  const params = await searchParams;
  const user = await requireRole(["seller"], "/login");
  const tipT = await getT("tips");
  const t = await getT("store");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace?.store) redirect("/onboarding?role=seller");

  const store = workspace.store;
  const draft = navigationDraft(store.brandSettings, store.name);
  const published = parseEditorState((store.brandSettings as Record<string, unknown> | null)?.editor).published ?? null;
  const nav = navigationOf(draft);
  // "What shoppers see now": the live menus when the store is published, else the draft's.
  const live = published ? navigationOf(published) : nav;
  const unpublishedBuilderChanges = Boolean(published) && navigationFingerprint(live) !== navigationFingerprint(nav);

  const products = await db.storeProduct.findMany({
    where: { storeId: store.id, status: "published" },
    select: { id: true, name: true, category: { select: { slug: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  const categories = [...new Map(products.filter((product) => product.category).map((product) => [product.category!.slug, { slug: product.category!.slug, name: product.category!.name }])).values()];
  // Content (CMS) collections and their live items, so the menu can link to the Blog or a single post.
  const collections = await db.cmsCollection.findMany({
    where: { storeId: store.id },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { name: true, slug: true, isPublished: true, items: { where: liveItemWhere(), orderBy: { updatedAt: "desc" }, take: 40, select: { slug: true, title: true } } },
  });
  const pageTypes = [...new Set((draft?.pages ?? []).map((page) => String(page.pageType)))];
  const logoText = (() => {
    const header = (draft?.pages ?? []).flatMap((page) => page.sections ?? []).find((section) => section?.kind === "header");
    const value = header?.blocks?.find((block) => block.type === "copy")?.content?.logoText;
    return typeof value === "string" && value.trim() && value.trim() !== "Store" ? value.trim() : store.name;
  })();

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("nav.title")}
      sub={t("nav.sub")}
      actions={
        <>
          <PillLink href="/home/pages" icon="document">{t("nav.pages")}</PillLink>
          <PillLink href="/builder" icon="palette" tone="ink">{t("nav.builder")}</PillLink>
        </>
      }
    >
      <PageToast />
      <div className="grid gap-5">
        <PageTip>{tipT("navigation")}</PageTip>
        {params?.saved && <Notice tone="success">{t("nav.saved")}</Notice>}
        {params?.conflict && <Notice tone="error">{t("nav.conflict")}</Notice>}
        {params?.error && <Notice tone="error">{t("nav.error")}</Notice>}
        <Notice tone="info">{published ? t("nav.live") : t("nav.liveDraft")}</Notice>
        {unpublishedBuilderChanges && <Notice tone="info">{t("nav.builderDraft")}</Notice>}
        {!nav.hasHeader && <Notice tone="info">{t("nav.noHeader")}</Notice>}
        {!nav.hasFooter && <Notice tone="info">{t("nav.noFooter")}</Notice>}

        <form action={saveStoreNavigationSettings}>
          <input type="hidden" name="fingerprint" value={navigationFingerprint(nav)} />
          <NavigationEditor
            initial={{ main: nav.main, mobileSource: nav.mobileSource, mobile: nav.mobile, mobileStyle: nav.mobileStyle, footer: nav.footer }}
            live={{ main: live.main, mobileSource: live.mobileSource, mobile: live.mobile, mobileStyle: live.mobileStyle, footer: live.footer }}
            pageTypes={pageTypes}
            categories={categories}
            products={products.map((product) => ({ id: product.id, name: product.name }))}
            content={collections}
            store={{ name: store.name, logoUrl: store.logoUrl ?? null, brandSettings: { ...(publicBrandSettings(store.brandSettings) as Record<string, unknown> | null ?? {}), editor: undefined } }}
            logoText={logoText}
          />
        </form>
      </div>
    </SellerPage>
  );
}
