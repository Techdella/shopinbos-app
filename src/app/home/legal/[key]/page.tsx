import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { PillLink } from "@/components/app-kit";
import { buildStorefrontOrigin } from "@/lib/domains/storefront";
import { cmsTheme } from "@/lib/cms/storefront";
import { isStandardLegalKey } from "@/lib/legal/pages";
import { legalContext, sellerLegalPage } from "@/lib/legal/server";
import { LegalEditor } from "./LegalEditor";
import { formatDate } from "@shared/i18n";
import { getLocale, getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

// The full editor for one legal page: Content (rich text, templates, Peggy) | Style | SEO.
export default async function LegalPageEditor({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const user = await requireRole(["seller"], "/login");
  const t = await getT("legal");
  const locale = await getLocale();
  const workspace = await getSellerWorkspace(user.id);
  const store = workspace?.store;
  if (!store) redirect("/onboarding?role=seller");
  const page = sellerLegalPage(store, key);
  if (!page) notFound();

  const ctx = await legalContext(store, { email: user.email, phone: user.phone ?? null });
  const theme = cmsTheme({ brandSettings: store.brandSettings, status: store.status });
  const vars = theme.vars as Record<string, string>;

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={page.title}
      sub={page.updatedAt ? t("lastSaved", { date: formatDate(page.updatedAt, locale, { dateStyle: "medium", timeStyle: "short" }) }) : t("notSavedHere")}
      actions={<PillLink href="/home/legal" icon="arrowLeft">{t("allPages")}</PillLink>}
    >
      <LegalEditor
        page={JSON.parse(JSON.stringify(page))}
        standard={isStandardLegalKey(page.key)}
        storeOrigin={buildStorefrontOrigin({ slug: store.slug, customDomain: store.customDomain ?? null })}
        storeSlug={store.slug}
        storeName={store.name}
        templateContext={ctx}
        theme={{ accent: vars["--cms-accent"] ?? "#E8590C", ink: vars["--cms-ink"] ?? "#16141F", paper: vars["--cms-paper"] ?? "#FFFFFF", soft: vars["--cms-soft"] ?? "#F6F4F9", serifHeadings: theme.headingFont.includes("Fraunces") }}
      />
    </SellerPage>
  );
}
