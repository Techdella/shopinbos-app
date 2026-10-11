"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { FieldLabel, Notice, PillButton, Spinner, TextInput, cx } from "@/components/app-ui";
import { AssistantNote, PillLink, Pill } from "@/components/app-kit";

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

// storeName and category stay in the props for callers; the page header shows the store.
export function BlogCmsClient({ storeSlug }: BlogCmsClientProps) {
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

  const newPost = () =>
    setEditing({
      id: "", title: "", slug: "", excerpt: "", bodyMarkdown: "",
      metaTitle: "", metaDescription: "", keywords: [],
      status: "draft", wordCount: 0, createdAt: "", updatedAt: "",
    });

  const textArea = "w-full rounded-[16px] border border-app-line bg-white px-4 py-3 text-[15px] text-app-ink outline-none transition placeholder:text-app-ink-faint focus:border-app-ink";

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter posts">
          {(["all", "published", "draft"] as const).map((tab) => {
            const on = filterStatus === tab;
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setFilterStatus(tab)}
                className={cx(
                  "inline-flex min-h-[40px] items-center rounded-full border px-4 text-[14px] font-bold",
                  on ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong",
                )}
              >
                {tab === "all" ? "All" : tab === "published" ? "Live" : "Drafts"}
                <span className={cx("ml-1", on ? "text-white" : "text-app-ink-soft")}>· {tabCount[tab]}</span>
              </button>
            );
          })}
        </div>
        <PillButton tone="accent" size="md" onClick={newPost}>
          <Icon name="plus" size={16} /> New post
        </PillButton>
      </div>

      {notice && (
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1"><Notice tone="info">{notice}</Notice></div>
          <button type="button" onClick={() => setNotice("")} aria-label="Dismiss message" className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-white">
            <Icon name="x" size={16} />
          </button>
        </div>
      )}

      {loading ? (
        <div role="status" className="flex items-center justify-center gap-3 rounded-[22px] border border-app-line bg-white py-14 text-[14px] text-app-ink-soft">
          <Spinner /> Loading posts
        </div>
      ) : filtered.length === 0 && !editing ? (
        <div className="flex flex-col items-center rounded-[22px] border border-app-line bg-white px-6 py-12 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-app-peach text-app-accent-ink"><Icon name="document" size={22} /></span>
          <h2 className="mb-0 mt-4 text-[18px] font-extrabold">No blog posts yet</h2>
          <p className="mb-0 mt-1.5 text-[14.5px] text-app-ink-soft">Write your first post, or ask Peggy to draft one.</p>
        </div>
      ) : (
        <div className={cx("grid gap-5", editing && "xl:grid-cols-2")}>
          {filtered.length > 0 && (
            <section className="min-w-0 self-start overflow-hidden rounded-[22px] border border-app-line bg-white">
              <ul className="m-0 list-none divide-y divide-app-line p-0">
                {filtered.map((post) => (
                  <li key={post.id} className={cx("flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:flex-nowrap sm:px-5", editing?.id === post.id && "bg-app-canvas")}>
                    <button type="button" onClick={() => setEditing(post)} className="min-w-0 flex-1 basis-[200px] text-left">
                      <span className="block truncate text-[14.5px] font-extrabold">{post.title}</span>
                      <span className="block truncate text-[13px] text-app-ink-soft">
                        /{post.slug} · {post.wordCount.toLocaleString()} words · {new Date(post.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      </span>
                    </button>
                    <Pill tone={post.status === "published" ? "success" : "muted"} dot>{post.status === "published" ? "Live" : "Draft"}</Pill>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <PillButton size="sm" tone="white" onClick={() => void togglePublish(post)}>
                        {post.status === "published" ? "Unpublish" : "Publish"}
                      </PillButton>
                      {post.status === "published" && storeSlug && (
                        <a
                          href={`/s/${storeSlug.split(".")[0]}/blog/${post.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-[38px] items-center rounded-full border border-app-line bg-white px-4 text-[13px] font-bold text-app-ink no-underline hover:border-app-line-strong"
                        >
                          View
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => void deletePost(post)}
                        aria-label={`Delete ${post.title}`}
                        className="grid h-[38px] w-[38px] place-items-center rounded-full text-app-danger hover:bg-app-danger-tint"
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {editing && (
            <section className="min-w-0 rounded-[22px] border border-app-line bg-white p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="m-0 text-[18px] font-extrabold">{editing.id ? "Edit post" : "New post"}</h2>
                <button type="button" onClick={() => setEditing(null)} aria-label="Close editor" className="grid h-10 w-10 place-items-center rounded-full hover:bg-app-canvas">
                  <Icon name="x" size={18} />
                </button>
              </div>

              <div className="grid gap-4">
                <div>
                  <FieldLabel htmlFor="post-title">Title</FieldLabel>
                  <TextInput id="post-title" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="min-w-0">
                    <FieldLabel htmlFor="post-slug">Web address</FieldLabel>
                    <TextInput id="post-slug" value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} />
                  </div>
                  <div className="min-w-0">
                    <FieldLabel htmlFor="post-meta">Search title</FieldLabel>
                    <TextInput id="post-meta" value={editing.metaTitle} onChange={(e) => setEditing({ ...editing, metaTitle: e.target.value })} />
                  </div>
                </div>

                <div>
                  <FieldLabel htmlFor="post-excerpt">Short summary</FieldLabel>
                  <textarea id="post-excerpt" value={editing.excerpt} onChange={(e) => setEditing({ ...editing, excerpt: e.target.value })} rows={2} className={cx(textArea, "resize-y")} />
                </div>

                <div>
                  <FieldLabel htmlFor="post-body">Post (Markdown)</FieldLabel>
                  <textarea
                    id="post-body"
                    value={editing.bodyMarkdown}
                    onChange={(e) => {
                      const bodyMarkdown = e.target.value;
                      setEditing({ ...editing, bodyMarkdown, wordCount: bodyMarkdown.split(/\s+/).filter(Boolean).length });
                    }}
                    rows={12}
                    className={cx(textArea, "resize-y font-mono text-[14px]")}
                  />
                  <div className="mt-1 text-right text-[12.5px] text-app-ink-soft">{editing.wordCount.toLocaleString()} words</div>
                </div>

                {(editing.keywords ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {editing.keywords.map((kw, i) => <Pill key={i}>{kw}</Pill>)}
                  </div>
                )}

                <div className="flex flex-wrap justify-end gap-2">
                  <PillButton tone="white" size="md" onClick={() => void savePost(editing, false)} disabled={saveLoading || !editing.title.trim()}>
                    Save draft
                  </PillButton>
                  <PillButton tone="ink" size="md" onClick={() => void savePost(editing, true)} busy={saveLoading} disabled={!editing.title.trim()}>
                    Publish
                  </PillButton>
                </div>
              </div>
            </section>
          )}
        </div>
      )}

      <AssistantNote who="peggy" action={<PillLink href="/home/peggy?ask=Draft%20a%20blog%20post%20for%20my%20shop%20about%20" size="sm" tone="ink">Ask Peggy</PillLink>}>
        <strong>Peggy writes your blog.</strong> Tell her what to write about and she drafts the post, search details and keywords. Tap New post to write it yourself.
      </AssistantNote>
    </div>
  );
}
