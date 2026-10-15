"use client";

// Rows, columns and grids (layout-row sections) on the 2026 themes: the seller's own elements in columns, themed with
// the look tokens. Columns stack on phones unless the seller turns that off. In the builder each element can be
// clicked to edit it and every column has its own "+" to add an element.

import type React from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { mediaKind, youTubeEmbedUrl } from "@/lib/store-templates/section-content";
import {
  LAYOUT_GAPS,
  LAYOUT_PADDING,
  columnTemplate,
  iconListLines,
  layoutElementMeta,
  normaliseLayoutRow,
  type LayoutElement,
  type LayoutRowView,
} from "./layout-logic";
import { BlockProductCard, ItemLink, itemLink, Paragraphs, type BlockContext } from "./shared";
import { isPlaceholderCopy } from "@shared/placeholder-copy";

export interface LayoutRowEditing {
  selectedElementId?: string | null;
  onSelectElement?: (sectionId: string, elementId: string) => void;
  onAddToColumn?: (sectionId: string, columnIndex: number) => void;
}

const ALIGN_ITEMS: Record<LayoutRowView["align"], React.CSSProperties["alignItems"]> = { top: "start", center: "center", bottom: "end", stretch: "stretch" };
const RATIOS: Record<string, string | undefined> = { square: "1 / 1", portrait: "4 / 5", landscape: "16 / 10", auto: undefined };
const ROW_CSS = `.bql-row{display:grid;grid-template-columns:var(--bql-mobile);gap:var(--bql-gap)}@container bq (min-width:760px){.bql-row{grid-template-columns:var(--bql-cols)}}.bql-col{display:flex;flex-direction:column;gap:14px;min-width:0}`;

function str(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function textAlign(element: LayoutElement): React.CSSProperties["textAlign"] {
  return element.align === "center" || element.align === "right" ? element.align : "left";
}

function justify(element: LayoutElement) {
  return element.align === "center" ? "center" : element.align === "right" ? "flex-end" : "flex-start";
}

function ElementView({ ctx, element, dark }: { ctx: BlockContext; element: LayoutElement; dark: boolean }) {
  const { look, editor } = ctx;
  const t = look.tokens;
  const muted = dark ? "rgba(255,255,255,.75)" : t.muted;
  const placeholder = (message: string) => (editor ? <div className="rounded-[10px] border border-dashed px-3 py-4 text-center text-[12.5px]" style={{ borderColor: dark ? "rgba(255,255,255,.35)" : t.border, color: muted }}>{message}</div> : null);
  switch (element.type) {
    case "heading": {
      const words = str(element.text);
      if (!words) return placeholder("Type a heading in the panel on the right.");
      const level = element.level === "h3" || element.level === "h4" ? element.level : "h2";
      const size = level === "h2" ? "clamp(24px, 3.4cqi, 38px)" : level === "h3" ? "clamp(20px, 2.6cqi, 28px)" : "18px";
      const Tag = level;
      return <Tag className="bq-h" style={{ ...look.headingStyle, fontSize: size, textAlign: textAlign(element) }}>{words}</Tag>;
    }
    case "text": {
      const words = str(element.text);
      if (!words) return placeholder("Type your text in the panel on the right.");
      // Older rows saved the starter text "Tell shoppers something useful here."; shoppers never see it.
      if (!editor && isPlaceholderCopy(words)) return null;
      return <div className="grid gap-3 text-[15px] leading-7" style={{ color: muted, textAlign: textAlign(element) }}><Paragraphs text={words} className="m-0 whitespace-pre-line" /></div>;
    }
    case "image": {
      const url = str(element.imageUrl);
      if (!url) return editor ? <div className="bq-media grid place-items-center" style={{ aspectRatio: RATIOS[String(element.ratio)] ?? "16 / 10", borderRadius: look.cardRadius, color: t.muted }}><span className="flex items-center gap-1.5 text-[12.5px]"><Icon name="image" size={15} /> Add a picture in the panel</span></div> : null;
      const ratio = RATIOS[String(element.ratio)];
      return ratio
        ? <div className="bq-media" style={{ aspectRatio: ratio, borderRadius: look.cardRadius }}><img src={url} alt={str(element.alt)} loading="lazy" decoding="async" /></div>
        : <img src={url} alt={str(element.alt)} loading="lazy" decoding="async" className="block h-auto w-full" style={{ borderRadius: look.cardRadius }} />;
    }
    case "button": {
      const label = str(element.label);
      if (!label) return placeholder("Type the button words in the panel on the right.");
      const style = element.style === "outline" ? look.secondaryButton : look.primaryButton;
      return (
        <div className="flex" style={{ justifyContent: justify(element) }}>
          <ItemLink ctx={ctx} link={itemLink(element)} className="bq-btn" style={{ ...style, cursor: "pointer" }}>{label}</ItemLink>
        </div>
      );
    }
    case "video": {
      const url = str(element.videoUrl);
      const kind = mediaKind(url);
      if (kind === "youtube") {
        const embed = youTubeEmbedUrl(url);
        if (embed) return <div className="relative aspect-video w-full overflow-hidden bg-black" style={{ borderRadius: look.cardRadius }}><iframe src={embed} title="Video" loading="lazy" allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen className="absolute inset-0 h-full w-full border-0" style={editor ? { pointerEvents: "none" } : undefined} /></div>;
      }
      if (kind === "video") return <video src={url} controls preload="metadata" playsInline className="block aspect-video w-full bg-black object-cover" style={{ borderRadius: look.cardRadius }} />;
      return placeholder("Add a YouTube link or upload a video in the panel on the right.");
    }
    case "spacer":
      return <div aria-hidden style={{ height: typeof element.size === "number" ? element.size : 32, ...(editor ? { background: `repeating-linear-gradient(135deg, transparent 0 6px, ${t.border} 6px 7px)`, opacity: 0.5, borderRadius: 6 } : {}) }} />;
    case "divider":
      return <hr className="m-0 w-full border-0" style={{ borderTop: `1px ${element.style === "dashed" ? "dashed" : "solid"} ${dark ? "rgba(255,255,255,.3)" : t.border}` }} />;
    case "icon-list": {
      const lines = iconListLines(element);
      if (!lines.length) return placeholder("Write one point per line in the panel on the right.");
      return (
        <ul className="m-0 grid list-none gap-2.5 p-0">
          {lines.map((line, index) => (
            <li key={index} className="flex items-start gap-2.5 text-[15px] leading-6">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full" style={{ background: `color-mix(in srgb, ${t.accent} 16%, transparent)`, color: dark ? "#fff" : t.accent }}><Icon name={(String(element.icon) || "check") as IconName} size={13} /></span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      );
    }
    case "product": {
      const id = str(element.productId);
      const product = ctx.products.find((entry) => entry.id === id) ?? (editor && !id ? ctx.products[0] : undefined);
      if (!product) return placeholder(ctx.products.length ? "Pick a product in the panel on the right." : "Add products to your store to show one here.");
      return <div className="w-full max-w-[320px]" style={{ alignSelf: "center" }}><BlockProductCard ctx={ctx} product={product} /></div>;
    }
    default:
      return null;
  }
}

export function LayoutRow({ ctx, editing }: { ctx: BlockContext; editing?: LayoutRowEditing }) {
  const { section, look, editor } = ctx;
  const t = look.tokens;
  const view = normaliseLayoutRow(section);
  const hasContent = view.cells.some((cell) => cell.elements.length > 0);
  if (!hasContent && !editor) return null;
  const dark = view.background === "dark";
  const background =
    view.background === "paper" ? t.paperBg :
    view.background === "card" ? t.cardBg :
    view.background === "accent" ? `color-mix(in srgb, ${t.accent} 12%, ${t.paperBg})` :
    dark ? t.ink : undefined;
  const mobile = view.stackOnMobile ? "minmax(0,1fr)" : view.preset.tracks.length <= 2 ? columnTemplate(view.preset.id) : "repeat(2,minmax(0,1fr))";
  const pad = LAYOUT_PADDING[view.padding];
  const rowStyle = {
    "--bql-cols": columnTemplate(view.preset.id),
    "--bql-mobile": mobile,
    "--bql-gap": `${LAYOUT_GAPS[view.gap]}px`,
    alignItems: ALIGN_ITEMS[view.align],
  } as React.CSSProperties;
  const canEdit = editor && editing?.onSelectElement;

  return (
    <section aria-label={section.name || "Columns"} style={{ background, color: dark ? t.paperBg : t.ink, paddingTop: pad, paddingBottom: pad }}>
      <style>{ROW_CSS}</style>
      <div className="bq-wrap bql-row" style={rowStyle}>
        {view.cells.map((cell, columnIndex) => (
          <div key={cell.id} className="bql-col" style={view.align === "stretch" ? { height: "100%" } : undefined}>
            {cell.elements.map((element) => {
              const body = <ElementView ctx={ctx} element={element} dark={dark} />;
              if (!canEdit) return <div key={element.id} className="min-w-0">{body}</div>;
              const selected = editing?.selectedElementId === element.id;
              return (
                <div
                  key={element.id}
                  data-element-id={element.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Edit ${layoutElementMeta(element.type)?.label ?? "element"}`}
                  aria-pressed={selected}
                  className="relative min-w-0 rounded-[6px]"
                  style={{ outline: selected ? "2px solid #2F66F6" : "1px dashed transparent", outlineOffset: 4, cursor: "pointer" }}
                  onMouseEnter={(event) => { if (!selected) event.currentTarget.style.outline = "1px dashed #2F66F6"; }}
                  onMouseLeave={(event) => { if (!selected) event.currentTarget.style.outline = "1px dashed transparent"; }}
                  onClickCapture={(event) => {
                    // In the builder a click picks the element; buttons and links don't navigate.
                    event.preventDefault();
                    event.stopPropagation();
                    editing?.onSelectElement?.(section.id, element.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      editing?.onSelectElement?.(section.id, element.id);
                    }
                  }}
                >
                  {body}
                </div>
              );
            })}
            {editor && editing?.onAddToColumn ? (
              <button
                type="button"
                data-column-add={`${section.id}:${columnIndex}`}
                aria-label={`Add an element to column ${columnIndex + 1}`}
                title="Add an element"
                onClick={(event) => {
                  event.stopPropagation();
                  editing.onAddToColumn?.(section.id, columnIndex);
                }}
                className="flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-dashed text-[12.5px] font-semibold transition hover:opacity-100"
                style={{ minHeight: cell.elements.length ? 34 : 96, borderColor: dark ? "rgba(255,255,255,.4)" : "#2F66F6", color: dark ? "#fff" : "#2F66F6", background: "transparent", opacity: cell.elements.length ? 0.55 : 0.9, cursor: "pointer" }}
              >
                <Icon name="plus" size={14} /> {cell.elements.length ? "" : "Add element"}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
