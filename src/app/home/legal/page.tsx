import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { PageToast } from "@/components/PageToast";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, Card, Pill, PillLink, type Tone } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { MAX_CUSTOM_LEGAL_PAGES, legalPagePath, legalPageStatus, readLegalPages, standardLegalPage, type LegalStatus } from "@/lib/legal/pages";
import { wordCount } from "@/lib/cms/richtext";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { AddLegalPage } from "./AddLegalPage";
import { formatDate, type Locale } from "@shared/i18n";
import { getLocale, getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getT("legal");
  return { title: t("title") };
}

// The store's legal pages, like Shopify's Policies screen: one card per page with its status, last edit and
// length, linking to the full editor (/home/legal/[key]) and to the live page.

const STATUS_TONE: Record<LegalStatus, Tone> = {
  published: "success",
  draft: "warning",
  empty: "muted",
};

const dateText = (iso: string | null, locale: Locale) => (iso ? formatDate(iso, locale, { day: "numeric", month: "short", year: "numeric" }) : null);

export default async function LegalPagesPage() {
  const user = await requireRole(["seller"], "/login");
  const t = await getT("legal", "common");
  const locale = await getLocale();
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace?.store) redirect("/onboarding?role=seller");

  const store = workspace.store;
  const pages = readLegalPages(store.brandSettings);
  const customCount = pages.filter((page) => page.custom).length;
  const publishedCount = pages.filter((page) => legalPageStatus(page) === "published").length;

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("title")}
      sub={t("sub", { published: publishedCount, total: pages.length })}
      actions={customCount < MAX_CUSTOM_LEGAL_PAGES ? <AddLegalPage /> : null}
    >
      <PageToast />
      <div className="grid gap-5">
        <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2 2xl:grid-cols-3">
          {pages.map((page) => {
            const status = legalPageStatus(page);
            const words = status === "empty" ? 0 : wordCount(page.doc);
            const updated = dateText(page.updatedAt, locale);
            const live = buildStorefrontUrl({ slug: store.slug, customDomain: store.customDomain ?? null }, legalPagePath(page.key));
            return (
              <li key={page.key} className="min-w-0">
                <Card className="flex h-full flex-col p-5">
                  <div className="flex items-start gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-app-canvas"><Icon name={page.custom ? "document" : "shield"} size={18} /></span>
                    <div className="min-w-0 flex-1">
                      <a href={`/home/legal/${page.key}`} className="block truncate text-[17px] font-extrabold text-app-ink no-underline hover:underline">{page.title}</a>
                      <p className="m-0 truncate text-[13px] text-app-ink-soft">/policies/{page.key}</p>
                    </div>
                    <Pill tone={STATUS_TONE[status]} dot>{t(`status.${status}`)}</Pill>
                  </div>
                  <p className="mb-0 mt-3 line-clamp-2 text-[13.5px] text-app-ink-soft">
                    {page.custom ? t("ownPage") : t.dynamic(`help.${page.key}`, standardLegalPage(page.key)?.help ?? "")}
                  </p>
                  <p className="mb-0 mt-2 text-[12.5px] text-app-ink-soft">
                    {status === "empty" ? t("notWritten") : t("words", { count: words })}
                    {updated ? ` ${t("updated", { date: updated })}` : page.updatedAt === null && status !== "empty" ? ` ${t("fromOld")}` : ""}
                  </p>
                  <div className="mt-auto flex flex-wrap gap-2 pt-4">
                    <PillLink href={`/home/legal/${page.key}`} size="sm" tone={status === "empty" ? "ink" : "white"} icon="edit">{status === "empty" ? t("writeIt") : t("edit")}</PillLink>
                    {status === "published" && (
                      <a href={live} target="_blank" rel="noreferrer" className="inline-flex min-h-[34px] items-center gap-1.5 rounded-full border border-app-line bg-white px-3.5 text-[13px] font-bold text-app-ink no-underline hover:border-app-line-strong">
                        <Icon name="eye" size={14} /> {t("viewOnStore")}<span className="sr-only"> ({page.title})</span>
                      </a>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
        <AssistantNote who="peggy">{t("peggyNote")}</AssistantNote>
      </div>
    </SellerPage>
  );
}
