"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppFrame } from "@/components/shell/AppFrame";
import { Icon } from "@/components/ui/Icon";
import { PageHead, MascotAvatar } from "@/components/ui";

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

interface BlogCmsClientProps {
  storeName: string;
  category: string;
  storeSlug: string;
}

export function BlogCmsClient({ storeName, category, storeSlug }: BlogCmsClientProps) {
  const router = useRouter();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<"all" | "draft" | "published">("all");
  const [editing, setEditing] = useState<BlogPost | null>(null);
  const [notice, setNotice] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/store/blog-posts")
      .then((res) => res.ok ? res.json() : { data: [] })
      .then((data: { data?: BlogPost[] }) => {
        if (active && Array.isArray(data.data)) setPosts(data.data);
      })
      .catch(() => { if (active) setPosts([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const togglePublish = useCallback(async (post: BlogPost) => {
    const newStatus = post.status === "published" ? "draft" : "published";
    try {
      const res = await fetch("/api/store/blog-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...post, status: newStatus, publish: newStatus === "published" }),
      });
      const data = (await res.json()) as { data?: BlogPost; error?: { message?: string } };
      if (data.data) {
        setPosts((prev) => prev.map((p) => p.id === post.id ? data.data! : p));
        setNotice(newStatus === "published" ? "Post published." : "Post saved as draft.");
      }
    } catch {
      setNotice("Could not update post.");
    }
  }, []);

  const deletePost = useCallback(async (post: BlogPost) => {
    if (!confirm(`Delete "${post.title}"?`)) return;
    try {
      const res = await fetch(`/api/store/blog-posts?id=${post.id}`, { method: "DELETE" });
      if (res.ok) {
        setPosts((prev) => prev.filter((p) => p.id !== post.id));
        setEditing((prev) => prev?.id === post.id ? null : prev);
        setNotice("Post deleted.");
      }
    } catch {
      setNotice("Could not delete post.");
    }
  }, []);

  const savePost = useCallback(async (post: BlogPost, publish: boolean) => {
    setSaveLoading(true);
    try {
      const res = await fetch("/api/store/blog-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...post, publish, status: publish ? "published" : "draft" }),
      });
      const data = (await res.json()) as { data?: BlogPost; error?: { message?: string } };
      if (data.data) {
        setPosts((prev) => [data.data!, ...prev.filter((p) => p.id !== data.data!.id)]);
        setEditing(data.data);
        setNotice(publish ? "Post published." : "Post saved as draft.");
      }
    } catch {
      setNotice("Could not save post.");
    } finally {
      setSaveLoading(false);
    }
  }, []);

  const filtered = filterStatus === "all" ? posts : posts.filter((p) => p.status === filterStatus);
  const tabCount = {
    all: posts.length,
    draft: posts.filter((p) => p.status === "draft").length,
    published: posts.filter((p) => p.status === "published").length,
  };

  return (
    <AppFrame role="seller" chipMode="none">
      <div style={{ padding: "28px 36px" }}>
        <PageHead
          title="Blog posts"
          sub={`${posts.length} posts · ${tabCount.published} published · ${tabCount.draft} drafts`}
          actions={
            <div style={{ display: "flex", gap: 8 }}>
              <Link href="/home/cms" className="dbtn dBtn-ghost" style={{ textDecoration: "none" }}><Icon name="arrowLeft" size={14} /> Back to pages</Link>
              <button
                onClick={() => setEditing({
                  id: "", title: "", slug: "", excerpt: "", bodyMarkdown: "",
                  metaTitle: "", metaDescription: "", keywords: [],
                  status: "draft", wordCount: 0, createdAt: "", updatedAt: "",
                })}
                className="dbtn dBtn-mint"
                style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}
              >
                <Icon name="plus" size={14} /> New post
              </button>
            </div>
          }
        />

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {(["all", "published", "draft"] as const).map((tab) => (
            <button key={tab} onClick={() => setFilterStatus(tab)}
              style={{
                background: filterStatus === tab ? "var(--teal-50)" : "var(--bg-tinted)",
                border: "none", padding: "6px 14px", borderRadius: 999, fontSize: 12, fontWeight: filterStatus === tab ? 600 : 500, cursor: "pointer",
                color: filterStatus === tab ? "var(--teal-700)" : "var(--ink-500)",
                fontFamily: "inherit",
              }}
            >{tab === "all" ? "All" : tab === "published" ? "Published" : "Draft"} ({tabCount[tab]})</button>
          ))}
        </div>

        {notice && (
          <div style={{
            marginBottom: 16, padding: "8px 14px", borderRadius: 8, fontSize: 13,
            background: "var(--teal-50)", color: "var(--teal-700)", border: "1px solid var(--teal-200)",
          }}>
            {notice}
            <button onClick={() => setNotice("")} style={{ float: "right", background: "none", border: "none", cursor: "pointer", color: "inherit", fontFamily: "inherit" }}>✕</button>
          </div>
        )}

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--ink-500)" }}>Loading posts...</div>
        ) : filtered.length === 0 && !editing ? (
          <div style={{ padding: 40, textAlign: "center" }}>
            <Icon name="document" size={32} />
            <div style={{ fontSize: 14, color: "var(--ink-500)", marginTop: 10 }}>
              No blog posts yet. Create your first post above.
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: editing ? "1fr 1fr" : "1fr" }}>
            {filtered.length > 0 && (
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Status</th>
                      <th>Words</th>
                      <th>Updated</th>
                      <th style={{ textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((post) => (
                      <tr key={post.id} style={{ cursor: "pointer" }} onClick={() => setEditing(post)}>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{post.title}</div>
                          <div style={{ fontSize: 11.5, color: "var(--ink-500)" }}>/{post.slug}</div>
                        </td>
                        <td>
                          <span className={`ic-${post.status === "published" ? "mint" : "warn"} ic-dot`}>
                            {post.status === "published" ? "Published" : "Draft"}
                          </span>
                        </td>
                        <td style={{ fontSize: 12, color: "var(--ink-500)", fontFamily: "var(--font-mono)" }}>
                          {post.wordCount.toLocaleString()}
                        </td>
                        <td style={{ fontSize: 12, color: "var(--ink-500)" }}>
                          {new Date(post.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                            <button
                              onClick={(e) => { e.stopPropagation(); void togglePublish(post); }}
                              className="dbtn dBtn-ghost dBtn-sm"
                              style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}
                            >
                              {post.status === "published" ? "Unpublish" : "Publish"}
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); void deletePost(post); }}
                              className="dbtn dBtn-ghost dBtn-sm"
                              style={{ border: "none", cursor: "pointer", color: "var(--red-600)", fontFamily: "inherit" }}
                            >
                              Delete
                            </button>
                            {post.status === "published" && storeSlug && (
                              <Link href={`/s/${storeSlug.split(".")[0]}/blog/${post.slug}`} target="_blank"
                                className="dbtn dBtn-ghost dBtn-sm" style={{ textDecoration: "none" }}>
                                View
                              </Link>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {editing && (
              <div className="card" style={{ padding: 20 }}>
                <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
                    {editing.id ? "Edit post" : "New post"}
                  </h3>
                  <button onClick={() => setEditing(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--ink-500)", fontFamily: "inherit" }}>✕</button>
                </div>

                <div style={{ display: "grid", gap: 14 }}>
                  <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--ink-700)" }}>
                    Title
                    <input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                      style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 14, fontFamily: "inherit" }}
                    />
                  </label>

                  <div style={{ display: "grid", gap: 4, gridTemplateColumns: "1fr 1fr" }}>
                    <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--ink-700)" }}>
                      Slug
                      <input value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value })}
                        style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13, fontFamily: "var(--font-mono)" }}
                      />
                    </label>
                    <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--ink-700)" }}>
                      SEO title
                      <input value={editing.metaTitle} onChange={(e) => setEditing({ ...editing, metaTitle: e.target.value })}
                        style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13, fontFamily: "inherit" }}
                      />
                    </label>
                  </div>

                  <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--ink-700)" }}>
                    Excerpt
                    <textarea value={editing.excerpt} onChange={(e) => setEditing({ ...editing, excerpt: e.target.value })}
                      rows={2}
                      style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13, fontFamily: "inherit", resize: "vertical" }}
                    />
                  </label>

                  <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--ink-700)" }}>
                    Body (Markdown)
                    <textarea value={editing.bodyMarkdown} onChange={(e) => {
                      const bodyMarkdown = e.target.value;
                      setEditing({ ...editing, bodyMarkdown, wordCount: bodyMarkdown.split(/\s+/).filter(Boolean).length });
                    }}
                      rows={12}
                      style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13, fontFamily: "var(--font-mono)", resize: "vertical" }}
                    />
                    <div style={{ fontSize: 11, color: "var(--ink-500)", textAlign: "right" }}>{editing.wordCount.toLocaleString()} words</div>
                  </label>

                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <span style={{ display: "flex", gap: 4, flexWrap: "wrap", flex: 1, alignSelf: "center" }}>
                      {(editing.keywords ?? []).map((kw, i) => (
                        <span key={i} className="chip" style={{ fontSize: 11 }}>{kw}</span>
                      ))}
                    </span>
                    <button onClick={() => void savePost(editing, false)} disabled={saveLoading || !editing.title.trim()}
                      className="dbtn dBtn-ghost"
                      style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                      Save draft
                    </button>
                    <button onClick={() => void savePost(editing, true)} disabled={saveLoading || !editing.title.trim()}
                      className="dbtn dBtn-mint"
                      style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                      {saveLoading ? "Saving..." : "Publish"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderRadius: 12, background: "var(--teal-50)", border: "1px solid var(--teal-200)", marginTop: 18 }}>
          <MascotAvatar role="seller" size={44} />
          <div style={{ flex: 1, fontSize: 13, color: "var(--teal-800)", lineHeight: 1.5 }}>
            <strong style={{ fontSize: 14 }}>Peggy writes your blog</strong>
            <div style={{ marginTop: 2 }}>Tell Peggy what to write about and she will draft the post, SEO meta, and keywords. Click <strong>New post</strong> to create from scratch or ask Peggy on the Peggy page.</div>
          </div>
          <Link href="/home/peggy" className="dbtn dBtn-ghost" style={{ textDecoration: "none", whiteSpace: "nowrap", fontFamily: "inherit", fontSize: 12, background: "var(--teal-600)", color: "white", border: "none", padding: "8px 18px", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>
            Ask Peggy →
          </Link>
        </div>
      </div>
    </AppFrame>
  );
}
