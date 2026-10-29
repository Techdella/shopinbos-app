import { buildStorefrontOrigin } from "@/lib/domains/storefront";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, Card, CardHead, EmptyState, FilterChips, ListCard, ListRow, Pill, PillLink, type Tone } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { Icon, type IconName } from "@/components/ui/Icon";
import { formatDate } from "@shared/i18n";
import { getLocale, getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

const PAGE_ICONS: Record<string, IconName> = {
  home: "store",
  about: "info",
  contact: "mail",
  faq: "info",
  blog: "document",
};

const SYSTEM_PAGE_TYPES = new Set(["product", "product-detail", "cart", "checkout", "wishlist", "categories"]);
const LEGAL_PAGE_TYPES = new Set(["privacy-policy", "terms-and-conditions", "cookie-policy", "refund-policy", "shipping-policy", "return-policy"]);

type StoreT = Awaited<ReturnType<typeof getT<["store", "common"]>>>;

function getPageStatusBadge(t: StoreT, isPublished: boolean, storeIsLive: boolean): { label: string; tone: Tone } {
  if (!storeIsLive) return { label: t("pages.badge.notLive"), tone: "warning" };
  if (isPublished) return { label: t("status.live"), tone: "success" };
  return { label: t("status.draft"), tone: "muted" };
}

export async function generateMetadata() {
  const t = await getT("store");
  return { title: t("pages.title") };
}

type PagesPageProps = { searchParams?: Promise<{ drafts?: string }> };

export default async function PagesPage({ searchParams }: PagesPageProps) {
  const params = await searchParams;
  const showDrafts = params?.drafts === "1";

  const user = await requireRole(["seller"], "/login");
  const t = await getT("store", "common");
  const locale = await getLocale();
  const workspace = await getSellerWorkspace(user.id);
  const store = workspace?.store ?? null;
  const storeIsLive = store?.status === "active" || store?.status === "published";

  const pages = store
    ? await db.storePage.findMany({
        where: {
          storeId: store.id,
          ...(showDrafts ? {} : { isPublished: true }),
        },
        orderBy: { updatedAt: "desc" },
      })
    : [];
  const websitePages = pages.filter((page) => !SYSTEM_PAGE_TYPES.has(page.type) && !LEGAL_PAGE_TYPES.has(page.type));
  const legalPages = pages.filter((page) => LEGAL_PAGE_TYPES.has(page.type));

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("pages.title")}
      sub={t(showDrafts ? "pages.subAll" : "pages.subPublished", { count: websitePages.length })}
      actions={<PillLink href="/seller/store/builder" tone="accent" icon="plus">{t("pages.add")}</PillLink>}
    >
      <div className="grid gap-5">
        <FilterChips
          items={[
            { label: t("pages.published"), href: "/home/pages", active: !showDrafts },
            { label: t("pages.includeDrafts"), href: "/home/pages?drafts=1", active: showDrafts },
          ]}
        />

        {!storeIsLive && <Notice tone="info">{t("pages.notLive")}</Notice>}

        {websitePages.length > 0 ? (
          <ListCard>
            {websitePages.map((p) => {
              const content = (p.content ?? {}) as Record<string, unknown>;
              const seo = (content.seo ?? {}) as Record<string, unknown>;
              const hasSeo = !!(seo.metaTitle || seo.metaDescription);
              const badge = getPageStatusBadge(t, p.isPublished, storeIsLive);
              const previewHref = storeIsLive && p.isPublished && store ? `${buildStorefrontOrigin(store)}/${p.slug}` : `/preview/store/${store?.slug}/${p.id}`;

              return (
                <ListRow key={p.id}>
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-app-canvas">
                    <Icon name={PAGE_ICONS[p.type] ?? "document"} size={18} />
                  </span>
                  <a href={`/home/pages/${p.id}`} className="min-w-0 flex-1 basis-[180px] text-app-ink no-underline hover:underline">
                    <span className="block truncate text-[14.5px] font-extrabold">{p.title}</span>
                    <span className="block truncate text-[13px] text-app-ink-soft">/{p.slug}</span>
                  </a>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    <Pill tone={badge.tone} dot>{badge.label}</Pill>
                    <Pill tone={hasSeo ? "success" : "warning"}>{hasSeo ? t("pages.searchReady") : t("pages.searchMissing")}</Pill>
                  </div>
                  <span className="hidden w-[110px] shrink-0 text-[13px] text-app-ink-soft lg:block">
                    {formatDate(p.updatedAt, locale, { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <PillLink href={`/home/pages/${p.id}`} size="sm" icon="edit">{t("edit")}</PillLink>
                    <a
                      href={previewHref}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-[34px] items-center gap-1.5 rounded-full border border-app-line bg-white px-3.5 text-[13px] font-bold text-app-ink no-underline hover:border-app-line-strong"
                    >
                      <Icon name="eye" size={14} /> {t("pages.preview")}
                    </a>
                  </div>
                </ListRow>
              );
            })}
          </ListCard>
        ) : (
          <EmptyState icon="document" title={showDrafts ? t("pages.noPages") : t("pages.noPublished")} action={<PillLink href="/seller/store/builder" tone="ink" icon="plus">{t("pages.create")}</PillLink>}>
            {showDrafts ? t("pages.createFirst") : t("pages.publishedHere")}
          </EmptyState>
        )}

        {legalPages.length > 0 && (
          <Card className="overflow-hidden">
            <CardHead title={t("pages.legal")} action={<PillLink href="/home/legal" size="sm">{t("pages.manage")}</PillLink>} className="px-5 pb-3 pt-5" />
            <ul className="m-0 list-none divide-y divide-app-line border-t border-app-line p-0">
              {legalPages.map((page) => {
                const badge = getPageStatusBadge(t, page.isPublished, storeIsLive);
                return (
                  <li key={page.id} className="flex items-center gap-3 px-5 py-3">
                    <Icon name="shield" size={16} className="shrink-0 text-app-ink-soft" />
                    <span className="min-w-0 flex-1 truncate text-[14px] font-bold">{page.title}</span>
                    <Pill tone={badge.tone} dot>{badge.label}</Pill>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        <AssistantNote who="peggy">
          <strong>{t("pages.tipLead")}</strong> {t("pages.tip")}
        </AssistantNote>
      </div>
    </SellerPage>
  );
}
