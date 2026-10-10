import { notFound } from "next/navigation";
import { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { getStorefrontBasePathForHost } from "@/lib/domains/storefront";

interface Props {
  params: Promise<{ slug: string }>;
}

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  bodyMarkdown: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  status: string;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
}

function readPosts(value: unknown): BlogPost[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.posts)) return [];
  return record.posts.filter((p): p is BlogPost => !!p && typeof p === "object" && typeof (p as BlogPost).title === "string" && (p as BlogPost).status === "published");
}

async function fetchStore(slug: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.shopinbos.com";
  const res = await fetch(`${baseUrl}/api/public/store/${slug}`, { cache: "no-store" });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const store = await fetchStore(slug);
  if (!store) return { title: "Blog not found" };
  return {
    title: `Blog | ${store.name}`,
    description: `Read the latest articles from ${store.name}`,
  };
}

export default async function StoreBlogPage({ params }: Props) {
  const { slug } = await params;
  const store = await fetchStore(slug);
  if (!store) notFound();

  const blogPage = (store.pages ?? []).find((p: any) => p.slug === "blog" && p.isPublished !== false);
  const posts = blogPage ? readPosts(blogPage.content) : [];

  const requestHeaders = await headers();
  const storeBasePath = getStorefrontBasePathForHost(requestHeaders.get("host"), slug);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px", fontFamily: "'DM Sans',system-ui,sans-serif" }}>
      <Link href={`${storeBasePath}`} style={{ color: "var(--teal-600)", fontSize: 14, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 24 }}>
        ← Back to {store.name}
      </Link>
      <h1 style={{ fontSize: 36, fontWeight: 700, letterSpacing: "-0.03em", margin: "0 0 8px" }}>Blog</h1>
      <p style={{ fontSize: 15, color: "var(--ink-500)", margin: "0 0 32px" }}>
        Latest articles from {store.name}
      </p>

      {posts.length === 0 ? (
        <div style={{ padding: 60, textAlign: "center", color: "var(--ink-500)" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📝</div>
          <h2 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 6px" }}>No posts yet</h2>
          <p style={{ fontSize: 14 }}>Check back soon for new articles.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 20 }}>
          {posts.map((post) => (
            <Link
              key={post.id}
              href={`${storeBasePath}/blog/${post.slug}`}
              style={{ textDecoration: "none", color: "inherit", display: "block" }}
            >
              <div style={{
                padding: "20px 24px", borderRadius: 12, border: "1px solid var(--line)",
                transition: "box-shadow .2s, border-color .2s",
              }}
                onMouseOver={(e) => { e.currentTarget.style.borderColor = "var(--teal-300)"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,.06)"; }}
                onMouseOut={(e) => { e.currentTarget.style.borderColor = "var(--line)"; e.currentTarget.style.boxShadow = "none"; }}
              >
                <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 6px", color: "var(--ink)" }}>{post.title}</h2>
                {post.excerpt && (
                  <p style={{ fontSize: 14, color: "var(--ink-500)", margin: "0 0 8px", lineHeight: 1.5 }}>{post.excerpt}</p>
                )}
                <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--ink-400)" }}>
                  <span>{new Date(post.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                  <span>·</span>
                  <span>{post.wordCount.toLocaleString()} words</span>
                  {(post.keywords ?? []).length > 0 && (
                    <>
                      <span>·</span>
                      <span>{(post.keywords ?? []).slice(0, 3).join(", ")}</span>
                    </>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
