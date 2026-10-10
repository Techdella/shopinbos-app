import Link from "next/link";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db/client";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Icon, MascotAvatar } from "@/components/ui";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  bodyMarkdown: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  status: "draft" | "published";
  wordCount: number;
  createdAt: string;
  updatedAt: string;
}

const PAGE_ICONS: Record<string, string> = {
  home: "store",
  products: "box",
  about: "info",
  contact: "mail",
  faq: "help",
  blog: "document",
};

function readPosts(value: unknown): BlogPost[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.posts)) return [];
  return record.posts.filter((post): post is BlogPost => {
    return !!post && typeof post === "object" && typeof (post as BlogPost).title === "string";
  });
}

export default async function CmsPage() {
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  const storeName = workspace?.store?.name ?? "Your Store";
  const storeSlug = workspace?.store?.slug ? `${workspace.store.slug}.shopinbos.shop` : undefined;

  const pages = workspace?.store
    ? await db.storePage.findMany({
        where: { storeId: workspace.store.id },
        orderBy: { updatedAt: "desc" },
      })
    : [];

  const blogPage = pages.find((p) => p.slug === "blog");
  const blogPosts = blogPage ? readPosts(blogPage.content) : [];

  const allPublished = pages.filter((p) => p.isPublished).length;
  const publishedPosts = blogPosts.filter((p) => p.status === "published").length;

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
          title="Pages & blog"
          sub={`${pages.length} pages · ${allPublished} published · ${blogPosts.length} posts (${publishedPosts} live)`}
          actions={
            <div style={{ display: "flex", gap: 8 }}>
              <Link href="/home/editor" className="dbtn dBtn-ghost" style={{ textDecoration: "none" }}><Icon name="plus" size={14} /> New page</Link>
              <Link href="/home/cms/blog" className="dbtn dBtn-mint" style={{ textDecoration: "none" }}><Icon name="edit" size={14} /> Blog posts</Link>
            </div>
          }
        />

        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {pages.length > 0 ? (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Page</th>
                  <th>Type</th>
                  <th>Slug</th>
                  <th>Status</th>
                  <th>Posts</th>
                  <th>Last updated</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pages.map((p) => {
                  const posts = p.slug === "blog" ? readPosts(p.content) : [];
                  return (
                    <tr key={p.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: 8,
                            background: "var(--teal-100)",
                            color: "var(--teal-700)",
                            display: "grid", placeItems: "center",
                          }}>
                            <Icon name={PAGE_ICONS[p.type] as any || "document"} size={14} />
                          </div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{p.title}</div>
                        </div>
                      </td>
                      <td>
                        <span className="chip" style={{ fontSize: 11, textTransform: "capitalize" }}>{p.type}</span>
                      </td>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-500)" }}>
                        /{p.slug}
                      </td>
                      <td>
                        <span className={`ic-${p.isPublished ? "mint" : "warn"} ic-dot`}>
                          {p.isPublished ? "Published" : "Draft"}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: "var(--ink-500)" }}>
                        {p.slug === "blog" ? `${posts.length} posts (${posts.filter((pt) => pt.status === "published").length} live)` : "—"}
                      </td>
                      <td style={{ fontSize: 12.5, color: "var(--ink-500)" }}>
                        {new Date(p.updatedAt).toLocaleDateString("en-GB", {
                          day: "numeric", month: "short", year: "numeric",
                        })}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                          {p.slug === "blog" ? (
                            <Link href="/home/cms/blog" className="dbtn dBtn-ghost dBtn-sm" style={{ textDecoration: "none" }}><Icon name="edit" size={12} /> Manage posts</Link>
                          ) : (
                            <Link href={`/home/editor?page=${p.id}`} className="dbtn dBtn-ghost dBtn-sm" style={{ textDecoration: "none" }}><Icon name="edit" size={12} /> Edit</Link>
                          )}
                          <Link href={`/s/${workspace?.store?.slug}/${p.slug}`} target="_blank" className="dbtn dBtn-ghost dBtn-sm" style={{ textDecoration: "none" }}><Icon name="eye" size={12} /> View</Link>
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
              <div style={{ fontSize: 14, color: "var(--ink-500)", marginTop: 10 }}>
                No pages yet. Pages will appear here as you build your store.
              </div>
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderRadius: 12, background: "var(--teal-50)", border: "1px solid var(--teal-200)" }}>
          <MascotAvatar role="seller" size={44} />
          <div style={{ flex: 1, fontSize: 13, color: "var(--teal-800)", lineHeight: 1.5 }}>
            <strong style={{ fontSize: 14 }}>Peggy writes your blog</strong>
            <div style={{ marginTop: 2 }}>Tell Peggy your topic and she will draft a complete blog post — headlines, SEO meta, keywords, and body — ready to publish.</div>
          </div>
          <Link href="/home/cms/blog" className="dbtn dBtn-ghost" style={{ textDecoration: "none", whiteSpace: "nowrap", fontFamily: "inherit", fontSize: 12, background: "var(--teal-600)", color: "white", border: "none", padding: "8px 18px", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>
            Write with Peggy →
          </Link>
        </div>
      </div>
    </AppFrame>
  );
}
