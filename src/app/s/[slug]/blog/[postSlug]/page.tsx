import { notFound } from "next/navigation";
import { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { getStorefrontBasePathForHost } from "@/lib/domains/storefront";

interface Props {
  params: Promise<{ slug: string; postSlug: string }>;
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

function mdToHtml(md: string): string {
  let html = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>");
  html = html.replace(/(?:\r\n|\r|\n){2,}/g, "</p><p>");
  html = html.replace(/(?:\r\n|\r|\n)/g, "<br/>");
  html = "<p>" + html + "</p>";
  html = html.replace(/<p><\/p>/g, "");
  html = html.replace(/<br\/><\/p>/g, "</p>");
  html = html.replace(/<p><br\/>/g, "<p>");

  return html;
}

async function fetchStore(slug: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.shopinbos.com";
  const res = await fetch(`${baseUrl}/api/public/store/${slug}`, { cache: "no-store" });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, postSlug } = await params;
  const store = await fetchStore(slug);
  if (!store) return { title: "Post not found" };

  const blogPage = (store.pages ?? []).find((p: any) => p.slug === "blog");
  const posts = blogPage ? readPosts(blogPage.content) : [];
  const post = posts.find((p) => p.slug === postSlug);

  if (!post) return { title: "Post not found" };

  return {
    title: post.metaTitle || post.title,
    description: post.metaDescription || post.excerpt || "",
  };
}

export default async function StoreBlogPostPage({ params }: Props) {
  const { slug, postSlug } = await params;
  const store = await fetchStore(slug);
  if (!store) notFound();

  const blogPage = (store.pages ?? []).find((p: any) => p.slug === "blog");
  const posts = blogPage ? readPosts(blogPage.content) : [];
  const post = posts.find((p) => p.slug === postSlug);
  if (!post) notFound();

  const requestHeaders = await headers();
  const storeBasePath = getStorefrontBasePathForHost(requestHeaders.get("host"), slug);

  return (
    <div className="store-blog-post">
      <Link href={`${storeBasePath}/blog`} className="store-blog-link store-blog-back">
        ← All posts
      </Link>

      <article>
        <h1 className="store-blog-title">{post.title}</h1>

        <div className="store-blog-meta">
          <span>{new Date(post.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
          <span>·</span>
          <span>{post.wordCount.toLocaleString()} words</span>
        </div>

        {post.excerpt && (
          <p className="store-blog-excerpt">{post.excerpt}</p>
        )}

        <div
          className="store-blog-body"
          dangerouslySetInnerHTML={{ __html: mdToHtml(post.bodyMarkdown) }}
        />

        {(post.keywords ?? []).length > 0 && (
          <div className="store-blog-tags">
            {(post.keywords ?? []).map((kw, i) => (
              <span key={i} className="store-blog-tag">{kw}</span>
            ))}
          </div>
        )}
      </article>

      <div className="store-blog-footer">
        <Link href={`${storeBasePath}`} className="store-blog-link">
          ← Back to {store.name}
        </Link>
      </div>
    </div>
  );
}
