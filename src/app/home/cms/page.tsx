import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, EmptyState, ListCard, ListRow, Pill, PillLink, StatGrid, StatTile } from "@/components/app-kit";
import { Icon, type IconName } from "@/components/ui/Icon";

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

const PAGE_ICONS: Record<string, IconName> = {
  home: "store",
  products: "box",
  about: "info",
  contact: "mail",
  faq: "info",
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
  const store = workspace?.store ?? null;

  const pages = store
    ? await db.storePage.findMany({
        where: { storeId: store.id },
        orderBy: { updatedAt: "desc" },
      })
    : [];

  const blogPage = pages.find((p) => p.slug === "blog");
  const blogPosts = blogPage ? readPosts(blogPage.content) : [];

  const allPublished = pages.filter((p) => p.isPublished).length;
  const publishedPosts = blogPosts.filter((p) => p.status === "published").length;

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="Pages and blog"
      sub="Everything shoppers can read in your store, from About us to blog posts."
      actions={
        <>
          <PillLink href="/home/editor" icon="plus">New page</PillLink>
          <PillLink href="/home/cms/blog" tone="accent" icon="edit">Blog posts</PillLink>
        </>
      }
    >
      <div className="grid gap-5">
        <StatGrid>
          <StatTile tone="card" label="Pages" value={pages.length} />
          <StatTile tone="card" label="Published" value={allPublished} />
          <StatTile tone="card" label="Blog posts" value={blogPosts.length} />
          <StatTile tone="card" label="Posts live" value={publishedPosts} />
        </StatGrid>

        {pages.length > 0 ? (
          <ListCard>
            {pages.map((p) => {
              const posts = p.slug === "blog" ? readPosts(p.content) : [];
              return (
                <ListRow key={p.id}>
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-app-canvas">
                    <Icon name={PAGE_ICONS[p.type] ?? "document"} size={18} />
                  </span>
                  <div className="min-w-0 flex-1 basis-[180px]">
                    <div className="truncate text-[14.5px] font-extrabold">{p.title}</div>
                    <div className="truncate text-[13px] text-app-ink-soft">
                      /{p.slug} · <span className="capitalize">{p.type}</span>
                      {p.slug === "blog" && ` · ${posts.length} posts, ${posts.filter((pt) => pt.status === "published").length} live`}
                    </div>
                  </div>
                  <Pill tone={p.isPublished ? "success" : "muted"} dot>{p.isPublished ? "Live" : "Draft"}</Pill>
                  <span className="hidden w-[110px] shrink-0 text-[13px] text-app-ink-soft md:block">
                    {new Date(p.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                  <div className="flex shrink-0 gap-2">
                    {p.slug === "blog" ? (
                      <PillLink href="/home/cms/blog" size="sm" icon="edit">Manage posts</PillLink>
                    ) : (
                      <PillLink href={`/home/editor?page=${p.id}`} size="sm" icon="edit">Edit</PillLink>
                    )}
                    {store && (
                      <a
                        href={`/s/${store.slug}/${p.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`View ${p.title} in your store`}
                        className="inline-flex min-h-[34px] items-center gap-1.5 rounded-full border border-app-line bg-white px-3.5 text-[13px] font-extrabold text-app-ink no-underline hover:border-app-line-strong"
                      >
                        <Icon name="eye" size={14} /> View
                      </a>
                    )}
                  </div>
                </ListRow>
              );
            })}
          </ListCard>
        ) : (
          <EmptyState icon="document" title="No pages yet">Pages show up here as you build your store.</EmptyState>
        )}

        <AssistantNote who="peggy" action={<PillLink href="/home/peggy?ask=Draft%20a%20blog%20post%20for%20my%20shop%20about%20" size="sm" tone="ink">Write with Peggy</PillLink>}>
          <strong>Peggy writes your blog.</strong> Give her a topic and she drafts the whole post, with a headline, search details and keywords, ready to publish.
        </AssistantNote>
      </div>
    </SellerPage>
  );
}
