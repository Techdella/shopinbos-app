"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { FieldLabel, Mascot, Notice, PillButton, TextInput, cx } from "@/components/app-ui";

const pageTypes: Array<{ id: string; name: string; icon: IconName; desc: string }> = [
  { id: "home", name: "Home", icon: "home", desc: "Your front page. Rex writes a strong banner and brand intro." },
  { id: "product", name: "Products", icon: "box", desc: "Show your products with filters and categories." },
  { id: "collection", name: "Collection", icon: "layers", desc: "Group products into collections." },
  { id: "about", name: "About", icon: "info", desc: "Tell your story and what makes you different." },
  { id: "contact", name: "Contact", icon: "mail", desc: "A contact form and your business details." },
  { id: "faq", name: "Questions", icon: "chat", desc: "Common questions, with answers." },
  { id: "blog", name: "Blog", icon: "book", desc: "Articles, updates and stories from your brand." },
  { id: "custom", name: "Custom page", icon: "code", desc: "A blank page you shape section by section." },
];

// The pages API keys pages by type, so creating a type that already exists would overwrite it.
export function NewPageForm({ existing }: { existing: Array<{ id: string; slug: string; title: string }> }) {
  const router = useRouter();
  const [type, setType] = useState<string>("");
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const existingFor = (id: string) => existing.find((page) => page.slug === id);

  function pick(id: string) {
    setType(id);
    const preset = pageTypes.find((pt) => pt.id === id);
    if (preset && (!title || pageTypes.some((pt) => pt.name === title))) setTitle(preset.name);
  }

  async function create() {
    if (!type || !title.trim()) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/store/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pages: [{ type, title: title.trim(), userContent: brief.trim() || undefined }] }),
      });
      const json = (await res.json().catch(() => null)) as { data?: Array<{ id: string }>; error?: { message?: string } } | null;
      const created = json?.data?.[0];
      if (!res.ok || !created) throw new Error(json?.error?.message ?? "Could not create the page.");
      router.push(`/home/pages/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the page.");
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="min-w-0 rounded-[22px] border border-app-line bg-white p-5">
        <h2 className="m-0 text-[17px] font-extrabold">Page type</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" role="radiogroup" aria-label="Page type">
          {pageTypes.map((pt) => {
            const already = existingFor(pt.id);
            const on = type === pt.id;
            if (already) {
              return (
                <a
                  key={pt.id}
                  href={`/home/pages/${already.id}`}
                  className="flex min-w-0 flex-col gap-2 rounded-[18px] border-2 border-dashed border-app-line p-4 text-app-ink no-underline hover:border-app-line-strong"
                >
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-app-canvas"><Icon name={pt.icon} size={18} /></span>
                  <span className="text-[14.5px] font-extrabold">{pt.name}</span>
                  <span className="text-[13px] text-app-ink-soft">You already have this page. Open it to edit.</span>
                </a>
              );
            }
            return (
              <button
                key={pt.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => pick(pt.id)}
                className={cx("flex min-w-0 flex-col items-start gap-2 rounded-[18px] border-2 p-4 text-left transition", on ? "border-app-ink bg-app-canvas" : "border-app-line hover:border-app-line-strong")}
              >
                <span className={cx("grid h-10 w-10 place-items-center rounded-full", on ? "bg-app-ink text-white" : "bg-app-canvas")}><Icon name={pt.icon} size={18} /></span>
                <span className="text-[14.5px] font-extrabold">{pt.name}</span>
                <span className="text-[13px] leading-[1.45] text-app-ink-soft">{pt.desc}</span>
              </button>
            );
          })}
        </div>
      </section>

      <aside className="grid min-w-0 content-start gap-5">
        <section className="rounded-[22px] border border-app-line bg-white p-5">
          <h2 className="m-0 text-[17px] font-extrabold">Page details</h2>
          <div className="mt-4 grid gap-4">
            <div>
              <FieldLabel htmlFor="page-title">Page name</FieldLabel>
              <TextInput id="page-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. About us" maxLength={200} />
            </div>
            <div>
              <FieldLabel htmlFor="page-brief">What should it say? (optional)</FieldLabel>
              <textarea
                id="page-brief"
                rows={4}
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="A sentence or two for Rex, like: we started in Aba in 2019 making leather slides by hand."
                className="w-full resize-y rounded-[16px] border border-app-line bg-white px-4 py-3 text-[15px] text-app-ink outline-none placeholder:text-app-ink-faint focus:border-app-ink"
              />
            </div>
            {error && <Notice>{error}</Notice>}
            <PillButton tone="accent" size="md" onClick={() => void create()} busy={busy} disabled={!type || !title.trim()} className="w-full">
              Create page
            </PillButton>
            {!type && <p className="m-0 text-center text-[13px] text-app-ink-soft">Pick a page type first.</p>}
          </div>
        </section>
        <div className="flex items-start gap-3 rounded-[18px] bg-app-peach px-4 py-3">
          <Mascot name="rex" className="h-9 w-9 shrink-0" />
          <p className="m-0 text-[14px] leading-[1.5]">Rex drafts the words, picks the sections and writes the search details. It takes a few seconds.</p>
        </div>
      </aside>
    </div>
  );
}
