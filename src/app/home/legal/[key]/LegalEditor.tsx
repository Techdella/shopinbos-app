"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { Notice, PillButton, Segmented, Toggle, cx } from "@/components/app-ui";
import { Pill } from "@/components/app-kit";
import { RichTextEditor } from "@/components/cms/RichTextEditor";
import { SeoTab } from "@/components/seo/SeoTab";
import { docImages, firstParagraphText, plainText, summarize, wordCount, type RichDoc } from "@/lib/cms/richtext";
import { normalizeSeo, type SeoFields } from "@/lib/seo/fields";
import {
  LAYOUT_PRESETS,
  LEGAL_LAYOUTS,
  isDocEmpty,
  legalPagePath,
  legalTemplate,
  legalToc,
  type LegalLayout,
  type LegalPage,
  type LegalStyle,
  type LegalTemplateContext,
  type LegalWidth,
} from "@/lib/legal/pages";

// The legal page editor, laid out like the CMS item editor: Content | Style | SEO tabs, a sticky save bar
// (Save draft / Publish / Unpublish, Preview) and a guard against leaving with unsaved changes. Saves
// through /api/app/legal/[key]; the server validates and re-sanitises the document.

type Tab = "content" | "style" | "seo";

const input = "min-h-[44px] w-full rounded-[14px] border border-app-line bg-white px-3.5 text-[14.5px] text-app-ink outline-none transition placeholder:text-app-ink-faint focus:border-app-ink";

interface Draft {
  title: string;
  doc: RichDoc;
  style: LegalStyle;
  seo: SeoFields;
}

export function LegalEditor(props: {
  page: LegalPage;
  standard: boolean;
  storeOrigin: string;
  storeSlug: string;
  storeName: string;
  templateContext: LegalTemplateContext;
  theme: { accent: string; ink: string; paper: string; soft: string; serifHeadings: boolean };
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("content");
  const initial: Draft = { title: props.page.title, doc: props.page.doc, style: props.page.style, seo: normalizeSeo(props.page.seo) };
  const [draft, setDraft] = useState<Draft>(initial);
  const [published, setPublished] = useState(props.page.published);
  const [busy, setBusy] = useState<"" | "draft" | "publish" | "unpublish" | "peggy" | "delete">("");
  const [notice, setNotice] = useState<{ tone: "error" | "success" | "info"; text: string } | null>(null);
  const [titleError, setTitleError] = useState("");
  const [asking, setAsking] = useState(false);
  const [brief, setBrief] = useState("");
  const saved = useRef(JSON.stringify(initial));
  const dirty = JSON.stringify(draft) !== saved.current;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  // Closing the tab, reloading, or following a link inside the app with unsaved changes asks first.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
    };
    const click = (event: MouseEvent) => {
      if (!dirtyRef.current || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
      const link = (event.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.closest("[data-legal-editor-body]")) return;
      if (!window.confirm("You have unsaved changes. Leave without saving?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", click, true);
    };
  }, []);

  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));
  const setStyle = (patch: Partial<LegalStyle>) => setDraft((current) => ({ ...current, style: { ...current.style, ...patch } }));

  const empty = isDocEmpty(draft.doc);
  const words = useMemo(() => wordCount(draft.doc), [draft.doc]);
  const toc = useMemo(() => legalToc(draft.doc), [draft.doc]);
  const content = useMemo(() => ({ firstParagraph: firstParagraphText(draft.doc), bodyText: plainText(draft.doc), images: docImages(draft.doc) }), [draft.doc]);
  const path = legalPagePath(props.page.key);
  const previewHref = `/s/${props.storeSlug}${path}${published ? "" : "?preview=1"}`;

  async function save(nextPublished: boolean, kind: "draft" | "publish" | "unpublish") {
    if (!draft.title.trim()) {
      setTab("content");
      setTitleError("Add a title");
      return;
    }
    if (nextPublished && empty) {
      setTab("content");
      setNotice({ tone: "error", text: "Write something before you publish this page." });
      return;
    }
    setBusy(kind);
    setNotice(null);
    setTitleError("");
    try {
      const res = await fetch(`/api/app/legal/${props.page.key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: draft.title.trim(), doc: draft.doc, style: draft.style, seo: draft.seo, published: nextPublished }),
      });
      const json = (await res.json().catch(() => null)) as { data?: LegalPage; error?: { message?: string } } | null;
      if (!res.ok || !json?.data) {
        setNotice({ tone: "error", text: json?.error?.message ?? "Couldn't save. Try again." });
        return;
      }
      // Keep the editor's own document so the cursor doesn't jump; take the cleaned style and SEO back.
      const next: Draft = { ...draft, title: json.data.title, style: json.data.style, seo: normalizeSeo(json.data.seo) };
      setDraft(next);
      setPublished(json.data.published);
      saved.current = JSON.stringify(next);
      setNotice({
        tone: "success",
        text: kind === "publish" ? (published ? "Updated. Shoppers see the new version now." : "Published. It's in your store footer and at checkout now.") : kind === "unpublish" ? "Unpublished. Shoppers can't see it any more." : "Saved as a draft. Shoppers can't see it.",
      });
      router.refresh();
    } catch {
      setNotice({ tone: "error", text: "Couldn't reach the server. Check your connection and try again." });
    } finally {
      setBusy("");
    }
  }

  function applyTemplate() {
    const doc = legalTemplate(props.page.key, props.templateContext);
    if (!doc) return;
    if (!empty && !window.confirm("Replace what you've written with the ready-made page? You can undo this by leaving without saving.")) return;
    set({ doc });
    setNotice({ tone: "info", text: "Ready-made page added. Replace every [Check: …] with your own details before you publish." });
  }

  async function askPeggy() {
    if (!empty && !window.confirm("Replace what you've written with Peggy's draft? You can undo this by leaving without saving.")) return;
    setBusy("peggy");
    setNotice(null);
    try {
      const res = await fetch(`/api/app/legal/${props.page.key}/draft`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: draft.title, brief }) });
      const json = (await res.json().catch(() => null)) as { data?: { doc: RichDoc; source: "ai" | "template" }; error?: { message?: string } } | null;
      if (!res.ok || !json?.data) {
        setNotice({ tone: "error", text: json?.error?.message ?? "Peggy couldn't write this right now. Try again." });
        return;
      }
      set({ doc: json.data.doc });
      setAsking(false);
      setNotice({ tone: "info", text: json.data.source === "ai" ? "Peggy's draft is in. Read it through and fill in every [Check: …] before you publish." : "Peggy isn't available right now, so we started you from the template. Fill in every [Check: …] before you publish." });
    } catch {
      setNotice({ tone: "error", text: "Couldn't reach the server. Check your connection and try again." });
    } finally {
      setBusy("");
    }
  }

  async function remove() {
    if (!window.confirm(`Delete "${draft.title}"? This can't be undone.`)) return;
    setBusy("delete");
    try {
      const res = await fetch(`/api/app/legal/${props.page.key}`, { method: "DELETE" });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setNotice({ tone: "error", text: json?.error?.message ?? "Couldn't delete the page." });
        return;
      }
      saved.current = JSON.stringify(draft);
      dirtyRef.current = false;
      router.push("/home/legal?saved=1");
    } finally {
      setBusy("");
    }
  }

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "content", label: "Content" },
    { key: "style", label: "Style" },
    { key: "seo", label: "SEO" },
  ];

  return (
    <div className="grid gap-5 pb-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Editor sections" className="flex gap-2 overflow-x-auto">
          {tabs.map((entry) => (
            <button
              key={entry.key}
              id={`tab-${entry.key}`}
              type="button"
              role="tab"
              aria-selected={tab === entry.key}
              aria-controls={`panel-${entry.key}`}
              onClick={() => setTab(entry.key)}
              className={cx("inline-flex min-h-[42px] shrink-0 items-center gap-1.5 rounded-full border px-4 text-[14px] font-bold", tab === entry.key ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong")}
            >
              {entry.label}
              {entry.key === "seo" && draft.seo.metaTitle && draft.seo.metaDescription ? <Icon name="check" size={13} /> : null}
            </button>
          ))}
        </div>
        <p className="m-0 text-[13px] text-app-ink-soft">{props.storeOrigin.replace(/^https?:\/\//, "")}{path}</p>
      </div>

      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

      <div id="panel-content" role="tabpanel" aria-labelledby="tab-content" hidden={tab !== "content"} className="grid gap-5" data-legal-editor-body>
        <section className="grid gap-5 rounded-[22px] border border-app-line bg-white p-4 sm:p-6">
          <div>
            <label htmlFor="legal-title" className="mb-1.5 block text-[14px] font-extrabold">Title</label>
            <input
              id="legal-title"
              className={cx(input, "min-h-[52px] text-[20px] font-extrabold")}
              value={draft.title}
              maxLength={120}
              onChange={(e) => set({ title: e.target.value })}
              aria-invalid={Boolean(titleError)}
            />
            {titleError && <p className="m-0 mt-1.5 text-[13px] text-app-danger" role="alert">{titleError}</p>}
          </div>

          <div className="grid gap-3 rounded-[18px] bg-app-canvas p-3 sm:p-4">
            <div className="flex flex-wrap items-center gap-2">
              {props.standard && (
                <PillButton tone="white" size="sm" type="button" onClick={applyTemplate} disabled={Boolean(busy)}>
                  <Icon name="document" size={14} /> Start from a ready-made page
                </PillButton>
              )}
              <PillButton tone="white" size="sm" type="button" onClick={() => setAsking((value) => !value)} disabled={Boolean(busy)} aria-expanded={asking}>
                <Icon name="sparkle" size={14} /> Ask Peggy to draft
              </PillButton>
              <span className="text-[12.5px] text-app-ink-soft">{words.toLocaleString("en-GB")} {words === 1 ? "word" : "words"}{toc.length ? ` · ${toc.length} ${toc.length === 1 ? "section" : "sections"}` : ""}</span>
            </div>
            {props.standard && (
              <p className="m-0 text-[12.5px] text-app-ink-soft">Ready-made pages are written for Nigerian businesses and filled in with your store name, place, contacts and delivery zones. They are a starting point, not legal advice.</p>
            )}
            {asking && (
              <div className="grid gap-2">
                <label htmlFor="legal-brief" className="text-[13.5px] font-bold">Anything Peggy should know? <span className="font-normal text-app-ink-soft">(optional)</span></label>
                <textarea id="legal-brief" rows={2} maxLength={1000} className={cx(input, "resize-y py-2.5")} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="e.g. We accept returns within 14 days, no returns on sale items, we deliver nationwide with GIG." />
                <div>
                  <PillButton tone="accent" size="sm" type="button" busy={busy === "peggy"} disabled={Boolean(busy)} onClick={() => void askPeggy()}>Write my draft</PillButton>
                </div>
              </div>
            )}
          </div>

          <RichTextEditor label={`${draft.title || "Page"} text`} value={draft.doc} onChange={(doc) => set({ doc })} placeholder="Write your page, or start from a ready-made page above. Use Heading 1 and Heading 2 for sections; they become the table of contents." />

          {!props.standard && (
            <div className="flex justify-end">
              <button type="button" onClick={() => void remove()} disabled={Boolean(busy)} className="inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 text-[13.5px] font-bold text-app-danger hover:bg-app-danger-tint">
                <Icon name="trash" size={15} /> Delete this page
              </button>
            </div>
          )}
        </section>
      </div>

      <div id="panel-style" role="tabpanel" aria-labelledby="tab-style" hidden={tab !== "style"}>
        <StylePanel style={draft.style} setStyle={setStyle} theme={props.theme} tocCount={toc.length} />
      </div>

      <div id="panel-seo" role="tabpanel" aria-labelledby="tab-seo" hidden={tab !== "seo"}>
        <SeoTab
          value={draft.seo}
          onChange={(seo) => set({ seo })}
          title={draft.title}
          fallbackDescription={summarize(draft.doc, 155)}
          slug={props.page.key}
          urlPrefix={`${props.storeOrigin}/policies/`}
          siteName={props.storeName}
          content={content}
        />
        <p className="m-0 mt-2 text-[12.5px] text-app-ink-soft">The web address of a legal page is fixed, so links in your footer and payment page keep working.</p>
      </div>

      <div className="sticky bottom-0 z-20 -mx-4 border-t border-app-line bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-[18px] sm:border">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={published ? "success" : empty ? "muted" : "warning"} dot>{published ? "Published" : empty ? "Empty" : "Draft"}</Pill>
          <span className="text-[13px] text-app-ink-soft" aria-live="polite">{busy === "draft" || busy === "publish" || busy === "unpublish" ? "Saving…" : dirty ? "Unsaved changes" : "All changes saved"}</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <a
              href={previewHref}
              target="_blank"
              rel="noreferrer"
              title={dirty ? "Shows the last saved version" : undefined}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-app-line bg-white px-4 text-[14px] font-bold text-app-ink no-underline hover:border-app-line-strong"
            >
              <Icon name="eye" size={15} /> {published ? "View" : "Preview"}
            </a>
            {published ? (
              <>
                <PillButton tone="white" size="md" busy={busy === "unpublish"} disabled={Boolean(busy)} onClick={() => void save(false, "unpublish")}>Unpublish</PillButton>
                <PillButton tone="accent" size="md" busy={busy === "publish"} disabled={Boolean(busy) || !dirty} onClick={() => void save(true, "publish")}>Update</PillButton>
              </>
            ) : (
              <>
                <PillButton tone="white" size="md" busy={busy === "draft"} disabled={Boolean(busy)} onClick={() => void save(false, "draft")}>Save draft</PillButton>
                <PillButton tone="accent" size="md" busy={busy === "publish"} disabled={Boolean(busy) || empty} onClick={() => void save(true, "publish")}>Publish</PillButton>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Style tab ───────────────────────────────────────────────────────────────

function StylePanel({ style, setStyle, theme, tocCount }: { style: LegalStyle; setStyle: (patch: Partial<LegalStyle>) => void; theme: { accent: string; ink: string; paper: string; soft: string; serifHeadings: boolean }; tocCount: number }) {
  const accent = style.accent || theme.accent;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <section className="grid content-start gap-4 rounded-[22px] border border-app-line bg-white p-4 sm:p-6">
        <h2 className="m-0 text-[16px] font-extrabold">Page layout</h2>
        <div role="radiogroup" aria-label="Page layout" className="grid grid-cols-2 gap-3">
          {LEGAL_LAYOUTS.map((layout) => {
            const active = style.layout === layout.id;
            return (
              <button
                key={layout.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setStyle({ layout: layout.id, ...LAYOUT_PRESETS[layout.id] })}
                className={cx("grid gap-2 rounded-[16px] border p-2.5 text-left transition", active ? "border-app-ink ring-2 ring-app-ink/15" : "border-app-line hover:border-app-line-strong")}
              >
                <LayoutThumb layout={layout.id} theme={theme} accent={accent} />
                <span className="text-[14px] font-extrabold">{layout.label}</span>
                <span className="text-[12px] leading-4 text-app-ink-soft">{layout.hint}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid content-start gap-5 rounded-[22px] border border-app-line bg-white p-4 sm:p-6">
        <h2 className="m-0 text-[16px] font-extrabold">Options</h2>
        <div>
          <span className="mb-1.5 block text-[13.5px] font-bold">Text width</span>
          <Segmented<LegalWidth> options={[{ value: "narrow", label: "Narrow" }, { value: "normal", label: "Normal" }, { value: "wide", label: "Wide" }]} value={style.width} onChange={(width) => setStyle({ width })} />
        </div>
        <div className="grid gap-1">
          <Toggle on={style.toc} onChange={(toc) => setStyle({ toc })} label="Show a table of contents" />
          <p className="m-0 text-[12.5px] text-app-ink-soft">{tocCount ? `Built from your ${tocCount} section headings.` : "Add Heading 1 or Heading 2 sections to your text to fill it."}</p>
        </div>
        <Toggle on={style.showUpdated} onChange={(showUpdated) => setStyle({ showUpdated })} label='Show "Last updated" date' />
        <div>
          <span className="mb-1.5 block text-[13.5px] font-bold">Heading font</span>
          <Segmented<LegalStyle["headingFont"]> options={[{ value: "theme", label: "From your shop look" }, { value: "serif", label: "Serif" }, { value: "sans", label: "Sans" }]} value={style.headingFont} onChange={(headingFont) => setStyle({ headingFont })} />
        </div>
        <div>
          <span className="mb-1.5 block text-[13.5px] font-bold">Link and accent colour</span>
          <div className="flex flex-wrap items-center gap-3">
            <Segmented<"theme" | "custom"> options={[{ value: "theme", label: "From your shop look" }, { value: "custom", label: "Custom" }]} value={style.accent ? "custom" : "theme"} onChange={(mode) => setStyle({ accent: mode === "custom" ? (style.accent || theme.accent.toUpperCase()) : "" })} />
            {style.accent ? (
              <label className="inline-flex min-h-[44px] items-center gap-2 text-[13.5px] font-bold">
                <input type="color" value={style.accent} onChange={(e) => setStyle({ accent: e.target.value.toUpperCase() })} className="h-9 w-12 cursor-pointer rounded-[10px] border border-app-line bg-white p-0.5" aria-label="Accent colour" />
                <span className="font-mono text-[12.5px] text-app-ink-soft">{style.accent}</span>
              </label>
            ) : (
              <span className="inline-flex items-center gap-2 text-[13px] text-app-ink-soft"><span className="h-5 w-5 rounded-full border border-app-line" style={{ background: theme.accent }} aria-hidden /> Your shop&apos;s accent colour</span>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

/** A tiny drawing of each layout in the store's own colours. */
function LayoutThumb({ layout, theme, accent }: { layout: LegalLayout; theme: { ink: string; paper: string; soft: string }; accent: string }) {
  const line = (width: string, key: number, strong = false) => <span key={key} className="block h-[5px] rounded-full" style={{ width, background: theme.ink, opacity: strong ? 0.8 : 0.18 }} />;
  const text = (
    <span className="grid gap-[5px]">
      {line("55%", 0, true)}
      {line("100%", 1)}
      {line("92%", 2)}
      {line("96%", 3)}
      {line("70%", 4)}
    </span>
  );
  return (
    <span aria-hidden className="block aspect-[16/10] overflow-hidden rounded-[10px] border border-app-line p-2.5" style={{ background: theme.paper }}>
      {layout === "contents" ? (
        <span className="grid h-full grid-cols-[30%_1fr] gap-2.5">
          <span className="grid content-start gap-[5px] border-r pr-2" style={{ borderColor: `${theme.ink}22` }}>
            <span className="block h-[5px] w-[80%] rounded-full" style={{ background: accent }} />
            <span className="block h-[5px] w-[65%] rounded-full" style={{ background: theme.ink, opacity: 0.18 }} />
            <span className="block h-[5px] w-[75%] rounded-full" style={{ background: theme.ink, opacity: 0.18 }} />
          </span>
          {text}
        </span>
      ) : layout === "centered" ? (
        <span className="grid h-full place-items-center rounded-[8px] px-3" style={{ background: theme.soft }}>
          <span className="block w-[78%] rounded-[6px] p-2" style={{ background: theme.paper }}>{text}</span>
        </span>
      ) : layout === "wide" ? (
        <span className="block px-0.5">{text}</span>
      ) : (
        <span className="mx-auto block w-[64%]">{text}</span>
      )}
    </span>
  );
}
