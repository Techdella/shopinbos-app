import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, Card, CardHead, EmptyState, FilterChips, ListCard, ListRow, Pill, PillLink, type Tone } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { Icon, type IconName } from "@/components/ui/Icon";

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

function getPageStatusBadge(isPublished: boolean, storeIsLive: boolean): { label: string; tone: Tone } {
  if (!storeIsLive) return { label: "Draft · store not live", tone: "warning" };
  if (isPublished) return { label: "Live", tone: "success" };
  return { label: "Draft", tone: "muted" };
}

type PagesPageProps = { searchParams?: Promise<{ drafts?: string }> };

export default async function PagesPage({ searchParams }: PagesPageProps) {
  const params = await searchParams;
  const showDrafts = params?.drafts === "1";

  const user = await requireRole(["seller"], "/login");
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
      title="Pages"
      sub={`${websitePages.length} ${showDrafts ? "" : "published "}${websitePages.length === 1 ? "page" : "pages"} in your store.`}
      actions={<PillLink href="/home/editor" tone="accent" icon="plus">Add page</PillLink>}
    >
      <div className="grid gap-5">
        <FilterChips
          items={[
            { label: "Published", href: "/home/pages", active: !showDrafts },
            { label: "Include drafts", href: "/home/pages?drafts=1", active: showDrafts },
          ]}
        />

        {!storeIsLive && <Notice tone="info">Your store is not live yet. Shoppers can only see pages after you publish your store.</Notice>}

        {websitePages.length > 0 ? (
          <ListCard>
            {websitePages.map((p) => {
              const content = (p.content ?? {}) as Record<string, unknown>;
              const seo = (content.seo ?? {}) as Record<string, unknown>;
              const hasSeo = !!(seo.metaTitle || seo.metaDescription);
              const badge = getPageStatusBadge(p.isPublished, storeIsLive);
              const previewHref = storeIsLive && p.isPublished ? `/s/${store?.slug}/${p.slug}` : `/preview/store/${store?.slug}/${p.id}`;

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
                    <Pill tone={hasSeo ? "success" : "warning"}>{hasSeo ? "Search ready" : "Search details missing"}</Pill>
                  </div>
                  <span className="hidden w-[110px] shrink-0 text-[13px] text-app-ink-soft lg:block">
                    {new Date(p.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                  <div className="flex shrink-0 gap-2">
                    <PillLink href={`/home/pages/${p.id}`} size="sm" icon="edit">Edit</PillLink>
                    <a
                      href={previewHref}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-[34px] items-center gap-1.5 rounded-full border border-app-line bg-white px-3.5 text-[13px] font-extrabold text-app-ink no-underline hover:border-app-line-strong"
                    >
                      <Icon name="eye" size={14} /> Preview
                    </a>
                  </div>
                </ListRow>
              );
            })}
          </ListCard>
        ) : (
          <EmptyState icon="document" title={showDrafts ? "No pages yet" : "No published pages"} action={<PillLink href="/home/editor" tone="ink" icon="plus">Create a page</PillLink>}>
            {showDrafts ? "Create your first page to get started." : "Published pages show here. Include drafts to see pages you are still working on."}
          </EmptyState>
        )}

        {legalPages.length > 0 && (
          <Card className="overflow-hidden">
            <CardHead title="Legal pages" action={<PillLink href="/home/legal" size="sm">Manage</PillLink>} className="px-5 pb-3 pt-5" />
            <ul className="m-0 list-none divide-y divide-app-line border-t border-app-line p-0">
              {legalPages.map((page) => {
                const badge = getPageStatusBadge(page.isPublished, storeIsLive);
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
          <strong>Peggy&apos;s tip:</strong> open each page to set its search details, menu spot and publishing before you go live.
        </AssistantNote>
      </div>
    </SellerPage>
  );
}
