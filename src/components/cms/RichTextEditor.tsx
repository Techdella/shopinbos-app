"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { Node, mergeAttributes, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Image from "@tiptap/extension-image";
import Youtube from "@tiptap/extension-youtube";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import { Icon, type IconName } from "@/components/ui/Icon";
import { PillButton, Spinner, cx } from "@/components/app-ui";
import { CMS_PROSE_CSS } from "@/components/cms/prose-css";
import { Modal, RecordPicker, uploadCmsFile } from "@/components/cms/pickers";
import { MediaLibraryDialog } from "@/components/media/MediaLibraryDialog";
import { markdownToDoc } from "@/lib/cms/markdown";
import { youtubeEmbedUrl, type RichDoc } from "@/lib/cms/richtext";
import { useT } from "@/components/i18n/I18nProvider";

// Rich text editor for CMS fields, laid out like the WordPress classic editor: a wrapping toolbar, Visual and
// HTML tabs, a word count and a full-screen mode. Headings, marks, links, lists, quotes, code, alignment, images
// (uploaded to the store's media), YouTube, tables, info boxes, dividers, buttons and product cards. It hands
// back Tiptap JSON; the server keeps only known nodes and builds the HTML itself.

const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return {
      tone: {
        default: "info",
        parseHTML: (element: HTMLElement) => element.getAttribute("data-tone") || "info",
        renderHTML: (attrs: Record<string, unknown>) => ({ "data-tone": attrs.tone, class: `cms-callout cms-callout-${String(attrs.tone)}` }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "aside[data-tone]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["aside", HTMLAttributes, 0];
  },
});

const CmsButton = Node.create({
  name: "button",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return { href: { default: "" }, label: { default: "" }, variant: { default: "solid" } };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="cms-button"]', getAttrs: (element: HTMLElement) => ({ href: element.getAttribute("data-href") ?? "", label: element.textContent ?? "", variant: element.getAttribute("data-variant") ?? "solid" }) }];
  },
  renderHTML({ node }) {
    return ["div", { "data-type": "cms-button", "data-href": node.attrs.href, "data-variant": node.attrs.variant, class: "cms-button-row" }, ["span", { class: "cms-ed-button", "data-variant": node.attrs.variant }, node.attrs.label || "Button"]];
  },
});

const ProductCard = Node.create({
  name: "productCard",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return { productId: { default: "" }, name: { default: "" }, image: { default: null } };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="cms-product"]', getAttrs: (element: HTMLElement) => ({ productId: element.getAttribute("data-product-id") ?? "", name: element.getAttribute("data-name") ?? "" }) }];
  },
  renderHTML({ node, HTMLAttributes }) {
    const children: unknown[] = [];
    if (node.attrs.image) children.push(["img", { src: node.attrs.image, alt: "" }]);
    children.push(["span", {}, ["strong", {}, node.attrs.name || "Product"], ["small", {}, "Product card · shows the live price"]]);
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "cms-product", "data-product-id": node.attrs.productId, "data-name": node.attrs.name, class: "cms-ed-product" }), ...children] as never;
  },
});

type DialogState =
  | { kind: "link"; href: string; newTab: boolean }
  | { kind: "youtube"; url: string }
  | { kind: "image"; src: string; alt: string; caption: string; editing: boolean }
  | { kind: "button"; href: string; label: string; variant: "solid" | "outline"; editing: boolean }
  | { kind: "product" }
  | { kind: "markdown"; text: string }
  | null;

const field = "min-h-[44px] w-full rounded-[14px] border border-app-line bg-white px-3.5 text-[14.5px] outline-none focus:border-app-ink";

function ToolButton({ icon, label, onClick, active, disabled, children }: { icon?: IconName; label: string; onClick: () => void; active?: boolean; disabled?: boolean; children?: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cx(
        "inline-flex h-9 min-w-9 shrink-0 items-center justify-center gap-1 rounded-[10px] px-2 text-[13.5px] font-bold transition disabled:opacity-40",
        active ? "bg-app-ink text-white" : "text-app-ink hover:bg-app-canvas",
      )}
    >
      {icon ? <Icon name={icon} size={16} /> : null}
      {children}
    </button>
  );
}

const Sep = () => <span aria-hidden className="mx-0.5 h-6 w-px shrink-0 bg-app-line" />;

export function RichTextEditor({ value, onChange, label, placeholder: placeholderProp }: { value: RichDoc | null; onChange: (doc: RichDoc) => void; label: string; placeholder?: string }) {
  const t = useT("cms");
  const placeholder = placeholderProp ?? t("rte.placeholder");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [uploading, setUploading] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const tm = useT("media");
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const labelId = useId();
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const emitted = useRef<RichDoc | null>(null);
  const [mode, setMode] = useState<"visual" | "html">("visual");
  const [html, setHtml] = useState("");
  const [fullscreen, setFullscreen] = useState(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4] }, link: { openOnClick: false, autolink: true, defaultProtocol: "https" } }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Image.configure({ allowBase64: false }),
      Youtube.configure({ nocookie: true, controls: true, modestBranding: true }),
      TableKit.configure({ table: { resizable: false } }),
      Placeholder.configure({ placeholder }),
      Callout,
      CmsButton,
      ProductCard,
    ],
    content: (value as JSONContent | null) ?? undefined,
    editorProps: { attributes: { class: "cms-prose cms-editor-surface", "aria-labelledby": labelId, role: "textbox", "aria-multiline": "true" } },
    onUpdate: ({ editor: current }) => {
      const doc = current.getJSON() as RichDoc;
      emitted.current = doc;
      changeRef.current(doc);
    },
  });

  const state = useEditorState({
    editor,
    // The snapshot's editor stays null until the first transaction, and nothing transacts until the editor is
    // on screen, so fall back to the editor from useEditor (otherwise the field sits on "Loading editor").
    selector: ({ editor: snapshot }: { editor: Editor | null }) => {
      const e = snapshot ?? editor;
      if (!e) return null;
      return {
        block: e.isActive("heading", { level: 1 }) ? "h1" : e.isActive("heading", { level: 2 }) ? "h2" : e.isActive("heading", { level: 3 }) ? "h3" : e.isActive("heading", { level: 4 }) ? "h4" : "p",
        bold: e.isActive("bold"),
        italic: e.isActive("italic"),
        underline: e.isActive("underline"),
        strike: e.isActive("strike"),
        code: e.isActive("code"),
        link: e.isActive("link"),
        bullet: e.isActive("bulletList"),
        ordered: e.isActive("orderedList"),
        quote: e.isActive("blockquote"),
        codeBlock: e.isActive("codeBlock"),
        center: e.isActive({ textAlign: "center" }),
        right: e.isActive({ textAlign: "right" }),
        justify: e.isActive({ textAlign: "justify" }),
        table: e.isActive("table"),
        callout: e.isActive("callout"),
        calloutTone: (e.getAttributes("callout").tone as string) ?? "info",
        image: e.isActive("image"),
        button: e.isActive("button"),
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
        words: e.state.doc.textContent.trim() ? e.state.doc.textContent.trim().split(/\s+/).length : 0,
      };
    },
  });

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setFullscreen(false);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [fullscreen]);

  // Replace the document when a different item is loaded (not on every keystroke).
  const loaded = useRef(value);
  useEffect(() => {
    if (!editor || value === loaded.current || value === emitted.current) return;
    loaded.current = value;
    const current = JSON.stringify(editor.getJSON());
    if (value && JSON.stringify(value) !== current) editor.commands.setContent(value as JSONContent, { emitUpdate: false });
  }, [editor, value]);

  if (!editor || !state) {
    return (
      <div className="rounded-[18px] border border-app-line bg-white">
        <p id={labelId} className="sr-only">{label}</p>
        <div className="flex min-h-[220px] items-center justify-center gap-2 text-[14px] text-app-ink-soft"><Spinner /> {t("rte.loading")}</div>
      </div>
    );
  }

  const chain = () => editor.chain().focus();

  function switchMode(next: "visual" | "html") {
    if (next === mode || !editor) return;
    if (next === "html") setHtml(prettyHtml(editor.getHTML()));
    // Back to Visual: the HTML is parsed into the editor, which drops anything it doesn't support.
    else editor.commands.setContent(html.trim() || "<p></p>", { emitUpdate: true });
    setMode(next);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const uploaded = await uploadCmsFile(file);
      if (!uploaded.type.startsWith("image/")) throw new Error(t("rte.pickPicture"));
      setDialog({ kind: "image", src: uploaded.url, alt: file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " "), caption: "", editing: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("rte.uploadFailed"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function applyDialog() {
    if (!dialog || !editor) return;
    switch (dialog.kind) {
      case "link": {
        const href = dialog.href.trim();
        if (!href) chain().extendMarkRange("link").unsetLink().run();
        else chain().extendMarkRange("link").setLink({ href: /^(https?:|mailto:|tel:|\/|#)/.test(href) ? href : `https://${href}`, target: dialog.newTab ? "_blank" : null }).run();
        break;
      }
      case "youtube":
        if (!youtubeEmbedUrl(dialog.url)) {
          setError(t("rte.notYoutube"));
          return;
        }
        chain().setYoutubeVideo({ src: dialog.url.trim() }).run();
        break;
      case "image":
        if (dialog.editing) chain().updateAttributes("image", { alt: dialog.alt, title: dialog.caption || null }).run();
        else chain().setImage({ src: dialog.src, alt: dialog.alt, title: dialog.caption || undefined }).run();
        break;
      case "button": {
        const href = dialog.href.trim();
        if (!href || !dialog.label.trim()) {
          setError(t("rte.buttonNeeds"));
          return;
        }
        const attrs = { href: /^(https?:|mailto:|tel:|\/|#)/.test(href) ? href : `https://${href}`, label: dialog.label.trim(), variant: dialog.variant };
        if (dialog.editing) chain().updateAttributes("button", attrs).run();
        else chain().insertContent({ type: "button", attrs }).run();
        break;
      }
      case "markdown": {
        const doc = markdownToDoc(dialog.text);
        chain().insertContent(doc.content as JSONContent[]).run();
        break;
      }
    }
    setError("");
    setDialog(null);
  }

  return (
    <div className={cx("flex flex-col overflow-hidden border border-app-line bg-white focus-within:border-app-ink", fullscreen ? "fixed inset-0 z-[70] rounded-none" : "rounded-[18px]")}>
      <style>{CMS_PROSE_CSS + EDITOR_CSS}</style>
      <p id={labelId} className="sr-only">{label}</p>
      <div className="flex items-end justify-between gap-2 border-b border-app-line bg-app-canvas px-2 pt-1.5">
        <div role="tablist" aria-label={t("rte.mode")} className="flex gap-1">
          {(["visual", "html"] as const).map((entry) => (
            <button
              key={entry}
              type="button"
              role="tab"
              aria-selected={mode === entry}
              onClick={() => switchMode(entry)}
              className={cx("-mb-px min-h-[36px] rounded-t-[10px] border px-3.5 text-[13px] font-bold", mode === entry ? "border-app-line border-b-white bg-white text-app-ink" : "border-transparent text-app-ink-soft hover:text-app-ink")}
            >
              {entry === "visual" ? t("rte.visual") : t("rte.html")}
            </button>
          ))}
        </div>
        <ToolButton label={fullscreen ? t("rte.exitFullscreen") : t("rte.fullscreen")} active={fullscreen} onClick={() => setFullscreen((on) => !on)}><FullscreenGlyph on={fullscreen} /></ToolButton>
      </div>
      <div role="toolbar" aria-label={t("rte.formatting", { label })} hidden={mode !== "visual"} className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b border-app-line bg-white px-2 py-1.5">
        <label className="sr-only" htmlFor={`${labelId}-block`}>{t("rte.textStyle")}</label>
        <select
          id={`${labelId}-block`}
          value={state.block}
          onChange={(event) => {
            const next = event.target.value;
            if (next === "p") chain().setParagraph().run();
            else chain().toggleHeading({ level: Number(next.slice(1)) as 1 | 2 | 3 | 4 }).run();
          }}
          className="h-9 shrink-0 rounded-[10px] border border-app-line bg-white px-2 text-[13.5px] font-bold"
        >
          <option value="p">{t("rte.paragraph")}</option>
          <option value="h2">{t("rte.heading")}</option>
          <option value="h3">{t("rte.subheading")}</option>
          <option value="h4">{t("rte.smallHeading")}</option>
          <option value="h1">{t("rte.largeHeading")}</option>
        </select>
        <Sep />
        <ToolButton label={t("rte.bold")} active={state.bold} onClick={() => chain().toggleBold().run()}><strong>B</strong></ToolButton>
        <ToolButton label={t("rte.italic")} active={state.italic} onClick={() => chain().toggleItalic().run()}><em className="font-serif">I</em></ToolButton>
        <ToolButton label={t("rte.underline")} active={state.underline} onClick={() => chain().toggleUnderline().run()}><span className="underline">U</span></ToolButton>
        <ToolButton label={t("rte.strike")} active={state.strike} onClick={() => chain().toggleStrike().run()}><span className="line-through">S</span></ToolButton>
        <ToolButton label={t("rte.inlineCode")} icon="code" active={state.code} onClick={() => chain().toggleCode().run()} />
        <ToolButton label={t("rte.link")} icon="link" active={state.link} onClick={() => setDialog({ kind: "link", href: (editor.getAttributes("link").href as string) ?? "", newTab: editor.getAttributes("link").target === "_blank" })} />
        <Sep />
        <ToolButton label={t("rte.bullets")} icon="list" active={state.bullet} onClick={() => chain().toggleBulletList().run()} />
        <ToolButton label={t("rte.numbered")} active={state.ordered} onClick={() => chain().toggleOrderedList().run()}><span className="text-[12px]">1.</span></ToolButton>
        <ToolButton label={t("rte.quote")} active={state.quote} onClick={() => chain().toggleBlockquote().run()}><span className="text-[17px] leading-none">&ldquo;</span></ToolButton>
        <ToolButton label={t("rte.codeBlock")} active={state.codeBlock} onClick={() => chain().toggleCodeBlock().run()}><span className="font-mono text-[12px]">{"{}"}</span></ToolButton>
        <Sep />
        <ToolButton label={t("rte.alignLeft")} active={!state.center && !state.right && !state.justify} onClick={() => chain().setTextAlign("left").run()}><AlignGlyph align="left" /></ToolButton>
        <ToolButton label={t("rte.alignCentre")} active={state.center} onClick={() => chain().setTextAlign("center").run()}><AlignGlyph align="center" /></ToolButton>
        <ToolButton label={t("rte.alignRight")} active={state.right} onClick={() => chain().setTextAlign("right").run()}><AlignGlyph align="right" /></ToolButton>
        <Sep />
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" tabIndex={-1} aria-hidden onChange={(event) => void onFile(event.target.files?.[0])} />
        <ToolButton label={uploading ? t("rte.uploadingPicture") : t("rte.addPicture")} icon="image" disabled={uploading} onClick={() => fileRef.current?.click()} />
        <ToolButton label={tm("field.choose")} icon="layers" disabled={uploading} onClick={() => setLibraryOpen(true)} />
        <MediaLibraryDialog
          open={libraryOpen}
          onClose={() => setLibraryOpen(false)}
          onSelect={([asset]) => asset && setDialog({ kind: "image", src: asset.url, alt: asset.alt ?? asset.name ?? "", caption: "", editing: false })}
        />
        <ToolButton label={t("rte.addYoutube")} icon="play" onClick={() => setDialog({ kind: "youtube", url: "" })} />
        <ToolButton label={t("rte.addTable")} icon="grid" active={state.table} onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
        <ToolButton label={t("rte.addInfo")} icon="info" active={state.callout} onClick={() => (state.callout ? chain().lift("callout").run() : chain().wrapIn("callout", { tone: "info" }).run())} />
        <ToolButton label={t("rte.addDivider")} icon="minus" onClick={() => chain().setHorizontalRule().run()} />
        <ToolButton label={t("rte.addButton")} icon="arrow" onClick={() => setDialog({ kind: "button", href: "", label: "", variant: "solid", editing: false })} />
        <ToolButton label={t("rte.addProduct")} icon="bag" onClick={() => setDialog({ kind: "product" })} />
        <Sep />
        <ToolButton label={t("rte.importMd")} icon="download" onClick={() => setDialog({ kind: "markdown", text: "" })} />
        <ToolButton label={t("rte.undo")} icon="undo" disabled={!state.canUndo} onClick={() => chain().undo().run()} />
        <ToolButton label={t("rte.redo")} icon="refresh" disabled={!state.canRedo} onClick={() => chain().redo().run()} />
      </div>

      {mode === "visual" && (state.table || state.callout || state.image || state.button) && (
        <div className="flex flex-wrap items-center gap-1 border-b border-app-line bg-app-canvas px-2 py-1.5 text-[13px]">
          {state.table && (
            <>
              <span className="px-1.5 font-bold text-app-ink-soft">{t("rte.table")}</span>
              <ToolButton label={t("rte.addRow")} onClick={() => chain().addRowAfter().run()}>{t("rte.plusRow")}</ToolButton>
              <ToolButton label={t("rte.addCol")} onClick={() => chain().addColumnAfter().run()}>{t("rte.plusCol")}</ToolButton>
              <ToolButton label={t("rte.delRow")} onClick={() => chain().deleteRow().run()}>{t("rte.minusRow")}</ToolButton>
              <ToolButton label={t("rte.delCol")} onClick={() => chain().deleteColumn().run()}>{t("rte.minusCol")}</ToolButton>
              <ToolButton label={t("rte.headerToggle")} onClick={() => chain().toggleHeaderRow().run()}>{t("rte.header")}</ToolButton>
              <ToolButton label={t("rte.delTable")} icon="trash" onClick={() => chain().deleteTable().run()} />
            </>
          )}
          {state.callout && (
            <>
              <span className="px-1.5 font-bold text-app-ink-soft">{t("rte.infoBox")}</span>
              {(["info", "tip", "success", "warning"] as const).map((tone) => (
                <ToolButton key={tone} label={t("rte.toneStyle", { tone: t(`rte.tone.${tone}`) })} active={state.calloutTone === tone} onClick={() => chain().updateAttributes("callout", { tone }).run()}>
                  <span className="capitalize">{t(`rte.tone.${tone}`)}</span>
                </ToolButton>
              ))}
              <ToolButton label={t("rte.removeInfo")} onClick={() => chain().lift("callout").run()}>{t("rte.remove")}</ToolButton>
            </>
          )}
          {state.image && (
            <>
              <span className="px-1.5 font-bold text-app-ink-soft">{t("rte.picture")}</span>
              <ToolButton label={t("rte.editDesc")} onClick={() => setDialog({ kind: "image", src: editor.getAttributes("image").src as string, alt: (editor.getAttributes("image").alt as string) ?? "", caption: (editor.getAttributes("image").title as string) ?? "", editing: true })}>{t("rte.description")}</ToolButton>
              <ToolButton label={t("rte.removePicture")} icon="trash" onClick={() => chain().deleteSelection().run()} />
            </>
          )}
          {state.button && (
            <>
              <span className="px-1.5 font-bold text-app-ink-soft">{t("rte.button")}</span>
              <ToolButton label={t("rte.editButton")} onClick={() => { const attrs = editor.getAttributes("button"); setDialog({ kind: "button", href: attrs.href ?? "", label: attrs.label ?? "", variant: attrs.variant === "outline" ? "outline" : "solid", editing: true }); }}>{t("rte.edit")}</ToolButton>
              <ToolButton label={t("rte.removeButton")} icon="trash" onClick={() => chain().deleteSelection().run()} />
            </>
          )}
        </div>
      )}

      {error && <p className="m-0 bg-app-danger-tint px-4 py-2 text-[13.5px] text-app-danger" role="alert">{error}</p>}
      <EditorContent editor={editor} hidden={mode !== "visual"} className={cx("px-4 py-4 sm:px-6 sm:py-5", fullscreen && "flex-1 overflow-y-auto")} />
      {mode === "html" && (
        <>
          <label htmlFor={`${labelId}-html`} className="sr-only">{t("rte.htmlLabel", { label })}</label>
          <textarea
            id={`${labelId}-html`}
            spellCheck={false}
            value={html}
            onChange={(event) => setHtml(event.target.value)}
            onBlur={() => editor.commands.setContent(html.trim() || "<p></p>", { emitUpdate: true })}
            className={cx("block w-full resize-y border-0 bg-white px-4 py-4 font-mono text-[13.5px] leading-6 text-app-ink outline-none sm:px-6", fullscreen ? "flex-1" : "min-h-[320px]")}
          />
          <p className="m-0 border-t border-app-line px-4 py-1.5 text-[12px] text-app-ink-soft">{t("rte.htmlHelp")}</p>
        </>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-app-line bg-app-canvas px-4 py-1.5 text-[12px] text-app-ink-soft">
        <span aria-live="polite">{t("rte.words", { count: state.words })}</span>
        <span>{mode === "visual" ? t("rte.visual") : t("rte.html")}</span>
      </div>

      {dialog?.kind === "link" && (
        <Modal title={t("rte.link")} onClose={() => setDialog(null)} footer={<><PillButton tone="white" size="sm" onClick={() => { chain().extendMarkRange("link").unsetLink().run(); setDialog(null); }}>{t("rte.removeLink")}</PillButton><PillButton tone="ink" size="sm" onClick={applyDialog}>{t("rte.saveLink")}</PillButton></>}>
          <label className="mb-1.5 block text-[13.5px] font-bold" htmlFor={`${labelId}-href`}>{t("rte.webAddress")}</label>
          <input id={`${labelId}-href`} className={field} value={dialog.href} placeholder={t("rte.hrefPh")} onChange={(e) => setDialog({ ...dialog, href: e.target.value })} onKeyDown={(e) => e.key === "Enter" && applyDialog()} />
          <label className="mt-3 flex items-center gap-2 text-[14px]"><input type="checkbox" checked={dialog.newTab} onChange={(e) => setDialog({ ...dialog, newTab: e.target.checked })} /> {t("rte.newTab")}</label>
        </Modal>
      )}
      {dialog?.kind === "youtube" && (
        <Modal title={t("rte.ytTitle")} onClose={() => setDialog(null)} footer={<PillButton tone="ink" size="sm" onClick={applyDialog}>{t("rte.addVideo")}</PillButton>}>
          <label className="mb-1.5 block text-[13.5px] font-bold" htmlFor={`${labelId}-yt`}>{t("rte.ytLink")}</label>
          <input id={`${labelId}-yt`} className={field} value={dialog.url} placeholder="https://youtu.be/…" onChange={(e) => setDialog({ ...dialog, url: e.target.value })} onKeyDown={(e) => e.key === "Enter" && applyDialog()} />
        </Modal>
      )}
      {dialog?.kind === "image" && (
        <Modal title={t("rte.picture")} onClose={() => setDialog(null)} footer={<PillButton tone="ink" size="sm" onClick={applyDialog}>{dialog.editing ? t("rte.save") : t("rte.addPictureBtn")}</PillButton>}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={dialog.src} alt="" className="mb-3 max-h-[220px] w-full rounded-[14px] object-contain bg-app-canvas" />
          <label className="mb-1.5 block text-[13.5px] font-bold" htmlFor={`${labelId}-alt`}>{t("rte.describe")} <span className="block text-[12.5px] font-normal text-app-ink-soft">{t("rte.describeHelp")}</span></label>
          <input id={`${labelId}-alt`} className={field} value={dialog.alt} onChange={(e) => setDialog({ ...dialog, alt: e.target.value })} />
          <label className="mb-1.5 mt-3 block text-[13.5px] font-bold" htmlFor={`${labelId}-cap`}>{t("rte.caption")}</label>
          <input id={`${labelId}-cap`} className={field} value={dialog.caption} onChange={(e) => setDialog({ ...dialog, caption: e.target.value })} />
        </Modal>
      )}
      {dialog?.kind === "button" && (
        <Modal title={t("rte.button")} onClose={() => setDialog(null)} footer={<PillButton tone="ink" size="sm" onClick={applyDialog}>{dialog.editing ? t("rte.save") : t("rte.addButtonBtn")}</PillButton>}>
          <label className="mb-1.5 block text-[13.5px] font-bold" htmlFor={`${labelId}-bl`}>{t("rte.buttonWords")}</label>
          <input id={`${labelId}-bl`} className={field} value={dialog.label} maxLength={80} placeholder={t("rte.buttonWordsPh")} onChange={(e) => setDialog({ ...dialog, label: e.target.value })} />
          <label className="mb-1.5 mt-3 block text-[13.5px] font-bold" htmlFor={`${labelId}-bh`}>{t("rte.link")}</label>
          <input id={`${labelId}-bh`} className={field} value={dialog.href} placeholder={t("rte.hrefPh")} onChange={(e) => setDialog({ ...dialog, href: e.target.value })} />
          <fieldset className="m-0 mt-3 flex gap-4 border-0 p-0">
            <legend className="mb-1.5 text-[13.5px] font-bold">{t("rte.style")}</legend>
            {(["solid", "outline"] as const).map((variant) => (
              <label key={variant} className="flex items-center gap-2 text-[14px] capitalize"><input type="radio" name={`${labelId}-variant`} checked={dialog.variant === variant} onChange={() => setDialog({ ...dialog, variant })} /> {variant === "solid" ? t("rte.filled") : t("rte.outline")}</label>
            ))}
          </fieldset>
        </Modal>
      )}
      {dialog?.kind === "product" && (
        <RecordPicker
          kind="products"
          multiple={false}
          selected={[]}
          title={t("rte.addProduct")}
          onClose={() => setDialog(null)}
          onPick={([row]) => row && chain().insertContent({ type: "productCard", attrs: { productId: row.id, name: row.name, image: row.image } }).run()}
        />
      )}
      {dialog?.kind === "markdown" && (
        <Modal title={t("rte.importMd")} wide onClose={() => setDialog(null)} footer={<PillButton tone="ink" size="sm" disabled={!dialog.text.trim()} onClick={applyDialog}>{t("rte.insert")}</PillButton>}>
          <label className="mb-1.5 block text-[13.5px] font-bold" htmlFor={`${labelId}-md`}>{t("rte.pasteMd")} <span className="block text-[12.5px] font-normal text-app-ink-soft">{t("rte.pasteMdHelp")}</span></label>
          <textarea id={`${labelId}-md`} rows={12} className="w-full rounded-[14px] border border-app-line p-3 font-mono text-[13.5px] outline-none focus:border-app-ink" value={dialog.text} onChange={(e) => setDialog({ ...dialog, text: e.target.value })} />
        </Modal>
      )}
    </div>
  );
}

function FullscreenGlyph({ on }: { on: boolean }) {
  const d = on ? ["M9 3v6H3", "M15 3v6h6", "M9 21v-6H3", "M15 21v-6h6"] : ["M3 9V3h6", "M21 9V3h-6", "M3 15v6h6", "M21 15v6h-6"];
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {d.map((path) => <path key={path} d={path} />)}
    </svg>
  );
}

/** Puts block tags on their own lines so the HTML tab reads like WordPress's Text tab. */
function prettyHtml(source: string) {
  return source.replace(/<\/(p|h[1-6]|ul|ol|li|blockquote|pre|table|thead|tbody|tr|aside|figure|div)>/g, "</$1>\n").replace(/<(ul|ol|table|thead|tbody|tr|blockquote|aside)(\s[^>]*)?>/g, "<$1$2>\n").replace(/<hr[^>]*>/g, "$&\n").replace(/\n{2,}/g, "\n").trim();
}

function AlignGlyph({ align }: { align: "left" | "center" | "right" }) {
  const lines = align === "left" ? ["M3 6h18", "M3 10h12", "M3 14h18", "M3 18h10"] : align === "center" ? ["M3 6h18", "M6 10h12", "M3 14h18", "M7 18h10"] : ["M3 6h18", "M9 10h12", "M3 14h18", "M11 18h10"];
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      {lines.map((d) => <path key={d} d={d} />)}
    </svg>
  );
}

const EDITOR_CSS = `
.cms-editor-surface{min-height:320px;outline:none}
.cms-editor-surface p.is-editor-empty:first-child::before{content:attr(data-placeholder);color:#9A97A8;float:left;height:0;pointer-events:none}
.cms-editor-surface .selectedCell{background:rgba(232,89,12,.08)}
.cms-editor-surface .ProseMirror-selectednode{outline:2px solid #E8590C;outline-offset:2px;border-radius:12px}
.cms-editor-surface img.ProseMirror-selectednode{outline-offset:3px}
.cms-editor-surface .cms-ed-product small{color:#5D5A6B;font-size:12px}
.cms-editor-surface div[data-youtube-video]{pointer-events:none}
`;
