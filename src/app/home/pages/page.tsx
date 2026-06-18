import Link from "next/link";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db/client";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Badge, Icon, MascotAvatar } from "@/components/ui";
import type { IconName } from "@/components/ui/Icon";

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

function getPageStatusBadge(isPublished: boolean, storeIsLive: boolean): { label: string; variant: "mint" | "warn" | "ghost" } {
  if (!storeIsLive) return { label: "Draft · Store Not Live", variant: "warn" };
  if (isPublished) return { label: "Published", variant: "mint" };
  return { label: "Draft", variant: "warn" };
}

export default async function PagesPage() {
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  const storeName = workspace?.store?.name ?? "Your Store";
  const storeSlug = workspace?.store?.slug ? `${workspace.store.slug}.shopinbos.shop` : undefined;
  const storeIsLive = workspace?.store?.status === "active" || workspace?.store?.status === "published";

  const pages = workspace?.store
    ? await db.storePage.findMany({
        where: { storeId: workspace.store.id },
        orderBy: { updatedAt: "desc" },
      })
    : [];
  const websitePages = pages.filter((page) => !SYSTEM_PAGE_TYPES.has(page.type) && !LEGAL_PAGE_TYPES.has(page.type));
  const legalPages = pages.filter((page) => LEGAL_PAGE_TYPES.has(page.type));
  const publishedCount = websitePages.filter((p) => p.isPublished && storeIsLive).length;

  return (
    <AppFrame
      role="seller"
      storeName={storeName}
      storeSlug={storeSlug}
      storeInitial={storeName.charAt(0).toUpperCase()}
      userName={user.name}
      userInitials={user.name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2)}
      avatarUrl={user.avatarUrl}
      userEmail={user.email}
    >
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
        <PageHead
          title="Pages"
          sub={`${websitePages.length} ${websitePages.length === 1 ? "page" : "pages"} · ${publishedCount} published ${storeIsLive ? "" : "(store not live)"}`}
          actions={
            <Link href="/home/editor" className="dbtn dBtn-mint" style={{ textDecoration: "none" }}>
              <Icon name="plus" size={14} /> Add page
            </Link>
          }
        />

        {!storeIsLive && (
          <div style={{
            padding: "10px 16px", borderRadius: 10,
            background: "var(--amber-50)", border: "1px solid var(--amber-200)",
            fontSize: 13, display: "flex", alignItems: "center", gap: 8,
            color: "var(--amber-800)",
          }}>
            <Icon name="info" size={14} />
            Your store is not live yet. Pages will only be visible to customers after publishing.
          </div>
        )}

        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {websitePages.length > 0 ? (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Page</th>
                  <th>Slug</th>
                  <th>Status</th>
                  <th>SEO</th>
                  <th>Last updated</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {websitePages.map((p) => {
                  const content = (p.content ?? {}) as Record<string, unknown>;
                  const seo = (content.seo ?? {}) as Record<string, unknown>;
                  const hasSeo = !!(seo.metaTitle || seo.metaDescription);
                  const badge = getPageStatusBadge(p.isPublished, storeIsLive);

                  return (
                    <tr key={p.id}>
                      <td>
                        <Link href={`/home/pages/${p.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{
                              width: 32, height: 32, borderRadius: 8,
                              background: "var(--teal-100)",
                              color: "var(--teal-700)",
                              display: "grid", placeItems: "center",
                            }}>
                              <Icon name={PAGE_ICONS[p.type] ?? "document"} size={14} />
                            </div>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{p.title}</div>
                          </div>
                        </Link>
                      </td>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-500)" }}>
                        /{p.slug}
                      </td>
                      <td>
                        <Badge variant={badge.variant} dot>{badge.label}</Badge>
                      </td>
                      <td>
                        <Badge variant={hasSeo ? "mint" : "warn"} dot={!hasSeo}>
                          {hasSeo ? "Complete" : "Missing"}
                        </Badge>
                      </td>
                      <td style={{ fontSize: 12.5, color: "var(--ink-500)" }}>
                        {new Date(p.updatedAt).toLocaleDateString("en-GB", {
                          day: "numeric", month: "short", year: "numeric",
                        })}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                          <Link href={`/home/pages/${p.id}`} className="dbtn dBtn-ghost dBtn-sm" style={{ textDecoration: "none" }}>
                            <Icon name="edit" size={12} /> Edit
                          </Link>
                          <Link
                            href={storeIsLive && p.isPublished ? `/s/${workspace?.store?.slug}/${p.slug}` : `/preview/store/${workspace?.store?.slug}/${p.id}`}
                            target="_blank"
                            className="dbtn dBtn-ghost dBtn-sm"
                            style={{ textDecoration: "none" }}
                          >
                            <Icon name="eye" size={12} /> Preview
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: 40, textAlign: "center" }}>
              <Icon name="document" size={32} />
              <div style={{ fontSize: 16, fontWeight: 800, color: "var(--ink-800)", marginTop: 12 }}>
                No pages created yet
              </div>
              <div style={{ fontSize: 13, color: "var(--ink-500)", marginTop: 6, maxWidth: 460, marginInline: "auto", lineHeight: 1.6 }}>
                Create your first page to get started.
              </div>
              <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
                <Link href="/home/editor" className="dbtn dBtn-mint" style={{ textDecoration: "none" }}><Icon name="plus" size={14} /> Create Page</Link>
              </div>
            </div>
          )}
        </div>

        {legalPages.length > 0 && (
          <div className="card" style={{ padding: 18 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 800 }}>Legal Pages</h3>
            <div style={{ display: "grid", gap: 10 }}>
              {legalPages.map((page) => {
                const badge = getPageStatusBadge(page.isPublished, storeIsLive);
                return (
                  <div key={page.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: "1px solid rgba(14,42,56,.06)" }}>
                    <Icon name="document" size={15} />
                    <strong style={{ flex: 1, fontSize: 13 }}>{page.title}</strong>
                    <Badge variant={badge.variant} dot>{badge.label}</Badge>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 12, background: "var(--teal-50)", border: "1px solid var(--teal-200)" }}>
          <MascotAvatar role="seller" size={40} />
          <div style={{ flex: 1, fontSize: 13, color: "var(--teal-800)", lineHeight: 1.5 }}>
            <strong>Peggy's tip:</strong> Edit each page to configure SEO, navigation, and publishing settings before going live.
          </div>
        </div>
      </div>
    </AppFrame>
  );
}
