"use client";

import { useEffect, useState } from "react";
import { Btn } from "@/components/ui/Btn";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { MascotAvatar } from "@/components/ui";
import type { Role } from "@/lib/nav";

interface BlogPost {
  id?: string;
  title: string;
  slug: string;
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  bodyMarkdown: string;
  wordCount: number;
  status?: "draft" | "published";
  createdAt?: string;
  updatedAt?: string;
}

interface PortalBlogCmsClientProps {
  role: Role;
  businessName: string;
  category?: string;
  apiEndpoint: string;
  assistantName?: string;
}

const inputStyle = {
  color: "var(--color-navy)",
  background: "white",
  borderColor: "rgb(14 42 56 / 0.12)",
};

const assistantNames: Record<string, string> = {
  seller: "Peggy",
  supplier: "Rex",
  logistics_partner: "Rex",
};

export function PortalBlogCmsClient({
  role,
  businessName,
  category = "general",
  apiEndpoint,
  assistantName,
}: PortalBlogCmsClientProps) {
  const writerName = assistantName ?? assistantNames[role] ?? "Rex";

  const [prompt, setPrompt] = useState("Write a complete buying guide that helps customers choose the right product and leads them naturally toward checkout.");
  const [audience, setAudience] = useState("Customers comparing options before they buy");
  const [keywords, setKeywords] = useState("");
  const [targetWords, setTargetWords] = useState("2500");
  const [conversionGoal, setConversionGoal] = useState("Drive readers to product pages and checkout");
  const [article, setArticle] = useState<BlogPost | null>(null);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    fetch(apiEndpoint)
      .then((res) => res.ok ? res.json() : { data: [] })
      .then((data: { data?: BlogPost[] }) => {
        if (active) setPosts(Array.isArray(data.data) ? data.data : []);
      })
      .catch(() => {
        if (active) setPosts([]);
      });
    return () => { active = false; };
  }, [apiEndpoint]);

  async function generateArticle() {
    if (!prompt.trim() || isGenerating) return;
    setIsGenerating(true);
    setNotice("");
    try {
      const res = await fetch("/api/ai/write-article", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          storeName: businessName,
          category,
          audience,
          keywords,
          targetWords: Number(targetWords),
          conversionGoal,
        }),
      });
      const data = (await res.json()) as { data?: BlogPost; error?: { message?: string }; demo?: boolean };
      if (!res.ok || !data.data) throw new Error(data.error?.message ?? "Article generation failed");
      setArticle(data.data);
      setNotice(data.demo ? "Demo draft created. Connect the AI key for full long-form generation." : `${writerName} finished the article draft.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : `${writerName} could not write the article yet.`);
    } finally {
      setIsGenerating(false);
    }
  }

  async function saveArticle(publish: boolean) {
    if (!article || isSaving) return;
    setIsSaving(true);
    setNotice("");
    try {
      const res = await fetch(apiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...article, publish, status: publish ? "published" : "draft" }),
      });
      const data = (await res.json()) as { data?: BlogPost; error?: { message?: string } };
      if (!res.ok || !data.data) throw new Error(data.error?.message ?? "Could not save article");
      setPosts((prev) => [data.data!, ...prev.filter((post) => post.id !== data.data!.id)]);
      setArticle(data.data);
      setNotice(publish ? "Article published to your blog." : "Article saved as a draft.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save article");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <div className="flex flex-col gap-4">
          <Card dark className="overflow-hidden">
            <div className="flex items-start gap-3">
              <MascotAvatar role={role} size={38} />
              <div>
                <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-mint-soft)]">{writerName}</div>
                <p className="mt-2 text-[14px] leading-6 text-[var(--color-cream)]">
                  Your blog is set up. You can write and publish articles on your profile from this CMS. {writerName} handles the writing and editing.
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-start gap-3">
              <MascotAvatar role={role} size={34} />
              <div>
                <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-teal-deep)]">{writerName} writer</div>
                <h2 className="mt-2 text-[20px] font-semibold tracking-[-0.02em] text-[var(--color-navy)]">Article brief</h2>
              </div>
            </div>

            <div className="mt-5 grid gap-4">
              <label className="grid gap-1.5 text-[12px] font-semibold text-[var(--color-muted)]">
                What should {writerName} write?
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  rows={7}
                  className="resize-none rounded-[14px] border px-4 py-3 text-[14px] leading-6 outline-none"
                  style={inputStyle}
                />
              </label>

              <label className="grid gap-1.5 text-[12px] font-semibold text-[var(--color-muted)]">
                Audience
                <input
                  value={audience}
                  onChange={(event) => setAudience(event.target.value)}
                  className="rounded-[12px] border px-4 py-3 text-[14px] outline-none"
                  style={inputStyle}
                />
              </label>

              <label className="grid gap-1.5 text-[12px] font-semibold text-[var(--color-muted)]">
                SEO keywords
                <input
                  value={keywords}
                  onChange={(event) => setKeywords(event.target.value)}
                  placeholder="keyword one, keyword two, keyword three"
                  className="rounded-[12px] border px-4 py-3 text-[14px] outline-none"
                  style={inputStyle}
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-[12px] font-semibold text-[var(--color-muted)]">
                  Target words
                  <input
                    value={targetWords}
                    onChange={(event) => setTargetWords(event.target.value.replace(/\D/g, "").slice(0, 4))}
                    className="rounded-[12px] border px-4 py-3 font-mono text-[14px] outline-none"
                    style={inputStyle}
                  />
                </label>
                <label className="grid gap-1.5 text-[12px] font-semibold text-[var(--color-muted)]">
                  Conversion goal
                  <input
                    value={conversionGoal}
                    onChange={(event) => setConversionGoal(event.target.value)}
                    className="rounded-[12px] border px-4 py-3 text-[14px] outline-none"
                    style={inputStyle}
                  />
                </label>
              </div>

              <Btn variant="mint" icon="edit" onClick={generateArticle} disabled={isGenerating}>
                {isGenerating ? `${writerName} is writing...` : `Ask ${writerName} to write`}
              </Btn>

              {notice && (
                <div className="rounded-[14px] border px-4 py-3 text-[13px] text-[var(--color-teal-deep)]" style={{ borderColor: "rgb(46 126 120 / 0.18)", background: "rgb(115 216 200 / 0.1)" }}>
                  {notice}
                </div>
              )}
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-teal-deep)]">Published content</div>
                <div className="mt-1 text-[18px] font-semibold text-[var(--color-navy)]">Articles</div>
              </div>
              <Pill>{posts.length} total</Pill>
            </div>
            <div className="mt-4 grid gap-3">
              {posts.length === 0 ? (
                <div className="rounded-[14px] border p-4 text-[13px] text-[var(--color-muted)]" style={{ borderColor: "rgb(14 42 56 / 0.08)" }}>
                  No articles yet. Generate one and publish it here.
                </div>
              ) : posts.slice(0, 6).map((post) => (
                <button
                  key={post.id ?? post.slug}
                  type="button"
                  onClick={() => setArticle(post)}
                  className="rounded-[14px] border p-4 text-left transition-colors hover:border-[var(--color-mint)]"
                  style={{ borderColor: "rgb(14 42 56 / 0.08)", background: "white" }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-semibold text-[var(--color-navy)]">{post.title}</div>
                    <Pill>{post.status ?? "draft"}</Pill>
                  </div>
                  <div className="mt-2 text-[12px] leading-5 text-[var(--color-muted)]">{post.excerpt || `${post.wordCount} words`}</div>
                </button>
              ))}
            </div>
          </Card>
        </div>

        <Card className="min-h-[720px] overflow-hidden">
          {article ? (
            <div className="flex h-full flex-col">
              <div className="flex items-start justify-between gap-4 border-b pb-5" style={{ borderColor: "rgb(14 42 56 / 0.08)" }}>
                <div>
                  <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-teal-deep)]">Article draft</div>
                  <h1 className="mt-2 max-w-3xl text-[30px] font-display font-semibold leading-tight tracking-[-0.03em] text-[var(--color-navy)]">
                    {article.title}
                  </h1>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Pill>{article.wordCount.toLocaleString()} words</Pill>
                    {(article.keywords ?? []).slice(0, 5).map((keyword) => <Pill key={keyword}>{keyword}</Pill>)}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Btn variant="outline" size="sm" onClick={() => saveArticle(false)} disabled={isSaving}>Save draft</Btn>
                  <Btn variant="mint" size="sm" onClick={() => saveArticle(true)} disabled={isSaving}>Publish</Btn>
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <label className="grid gap-1.5 text-[12px] font-semibold text-[var(--color-muted)]">
                  Meta title
                  <input
                    value={article.metaTitle}
                    onChange={(event) => setArticle({ ...article, metaTitle: event.target.value })}
                    className="rounded-[12px] border px-4 py-3 text-[14px] outline-none"
                    style={inputStyle}
                  />
                </label>
                <label className="grid gap-1.5 text-[12px] font-semibold text-[var(--color-muted)]">
                  Meta description
                  <input
                    value={article.metaDescription}
                    onChange={(event) => setArticle({ ...article, metaDescription: event.target.value })}
                    className="rounded-[12px] border px-4 py-3 text-[14px] outline-none"
                    style={inputStyle}
                  />
                </label>
              </div>

              <label className="mt-5 grid flex-1 gap-1.5 text-[12px] font-semibold text-[var(--color-muted)]">
                Article body
                <textarea
                  value={article.bodyMarkdown}
                  onChange={(event) => {
                    const bodyMarkdown = event.target.value;
                    setArticle({
                      ...article,
                      bodyMarkdown,
                      wordCount: bodyMarkdown.split(/\s+/).filter(Boolean).length,
                    });
                  }}
                  className="min-h-[520px] flex-1 resize-none rounded-[16px] border px-5 py-4 font-mono text-[13px] leading-6 outline-none"
                  style={inputStyle}
                />
              </label>
            </div>
          ) : (
            <div className="flex h-full min-h-[640px] flex-col items-center justify-center text-center">
              <MascotAvatar role={role} size={72} />
              <h2 className="mt-5 text-[28px] font-display font-semibold tracking-[-0.03em] text-[var(--color-navy)]">
                {writerName} is ready to write.
              </h2>
              <p className="mt-2 max-w-md text-[14px] leading-6 text-[var(--color-muted)]">
                Give {writerName} a prompt, target audience, keywords, and word count. Produce full SEO articles and publish them to your blog.
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
