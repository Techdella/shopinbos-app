"use client";

// Rows, columns and grids (layout-row sections) on the 2026 themes: the seller's own elements in columns, themed with
// the look tokens. Columns stack on phones unless the seller turns that off. In the builder each element can be
// clicked to edit it and every column has its own "+" to add an element; its grip (top-left, on hover or when picked)
// drags it to another spot in its column or into another column. Columns are drop targets in their own order, so
// dragging works the same when they stack on phones. An element can also be dragged into any other rows / columns
// section on the page: while one is dragged, every row outlines its columns, and a small copy of it follows the pointer.
// Hidden rows aren't drawn, except as a slim labelled strip (HiddenLayoutRowDrop) while a drag is in progress, so they
// can take drops too; the element stays hidden with its row. The strip floats over the boundary between sections
// (HiddenLayoutRowDrops: a zero-height anchor in the row's place), so nothing on the page moves when a drag starts.
// Storefront code has no builder catalog: the builder passes its words in (`text`, English with {placeholders} in,
// the seller's language out); without it the canvas hints stay English.

import { useRef } from "react";
import type React from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import type { TemplateSectionNode } from "@/lib/store-templates";
import { mediaKind, youTubeEmbedUrl } from "@/lib/store-templates/section-content";
import {
  LAYOUT_GAPS,
  LAYOUT_PADDING,
  MAX_ELEMENTS_PER_COLUMN,
  columnTemplate,
  iconListLines,
  layoutElementLabel,
  layoutElementMeta,
  normaliseLayoutRow,
  type LayoutElement,
  type LayoutRowView,
} from "./layout-logic";
import { BlockProductCard, ItemLink, itemLink, Paragraphs, type BlockContext } from "./shared";
import { DragGhost } from "./DragGhost";
import { useColumnDrag, usePageColumnDrag } from "./useColumnDrag";
import { isPlaceholderCopy } from "@shared/placeholder-copy";

export interface LayoutRowEditing {
  selectedElementId?: string | null;
  onSelectElement?: (sectionId: string, elementId: string) => void;
  onAddToColumn?: (sectionId: string, columnIndex: number) => void;
  /**
   * Drag and drop: the element, its new column and the gap in that column it was dropped in (as drawn), and when it
   * was dropped into another rows / columns section on the page, that section's id.
   */
  onMoveElement?: (sectionId: string, elementId: string, toColumn: number, toIndex: number, toSectionId?: string) => void;
  /** The builder's words for the canvas hints and labels (see LayoutRowText). */
  text?: LayoutRowText;
}

/** English text (with {placeholders}) → the builder's language, placeholders filled. */
export type LayoutRowText = (english: string, vars?: Record<string, string | number>) => string;

/** Without the builder's words: the English itself, placeholders filled. */
export const englishText: LayoutRowText = (english, vars) => (vars ? english.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match)) : english);

const EDIT_BLUE = "#2F66F6";
const FULL_RED = "#E5484D";

const ELEMENT_ICONS: Record<string, IconName> = { heading: "edit", text: "document", image: "image", button: "link", video: "play", spacer: "layers", divider: "minus", "icon-list": "list", product: "tag" };

/** The picture on the floating drag card: the element's own image, else its icon. */
function GhostThumb({ element }: { element: LayoutElement }) {
  const url = element.type === "image" ? str(element.imageUrl) : "";
  if (url) return <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />;
  return <Icon name={ELEMENT_ICONS[element.type] ?? "layers"} size={16} />;
}

const ALIGN_ITEMS: Record<LayoutRowView["align"], React.CSSProperties["alignItems"]> = { top: "start", center: "center", bottom: "end", stretch: "stretch" };
const RATIOS: Record<string, string | undefined> = { square: "1 / 1", portrait: "4 / 5", landscape: "16 / 10", auto: undefined };
const ROW_CSS = `.bql-row{display:grid;grid-template-columns:var(--bql-mobile);gap:var(--bql-gap)}@container bq (min-width:760px){.bql-row{grid-template-columns:var(--bql-cols)}}.bql-col{display:flex;flex-direction:column;gap:14px;min-width:0}`;
// The grip shows on hover and on the picked element (phones have no hover: only the picked one), and can't be grabbed
// while hidden.
const GRIP_CSS = `.bql-grip{opacity:0;pointer-events:none;transition:opacity .12s}.bql-el:hover>.bql-grip,.bql-el[aria-pressed="true"]>.bql-grip{opacity:1;pointer-events:auto}`;

/** The ⋮⋮ drag grip (canvas and the builder panel's column lists). */
export function GripDots() {
  return (
    <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden focusable="false" fill="currentColor">
      {[3, 7, 11].flatMap((y) => [3, 9].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.4" />))}
    </svg>
  );
}

function str(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function textAlign(element: LayoutElement): React.CSSProperties["textAlign"] {
  return element.align === "center" || element.align === "right" ? element.align : "left";
}

function justify(element: LayoutElement) {
  return element.align === "center" ? "center" : element.align === "right" ? "flex-end" : "flex-start";
}

function ElementView({ ctx, element, dark, say }: { ctx: BlockContext; element: LayoutElement; dark: boolean; say: LayoutRowText }) {
  const { look, editor } = ctx;
  const t = look.tokens;
  const muted = dark ? "rgba(255,255,255,.75)" : t.muted;
  const placeholder = (message: string) => (editor ? <div className="rounded-[10px] border border-dashed px-3 py-4 text-center text-[12.5px]" style={{ borderColor: dark ? "rgba(255,255,255,.35)" : t.border, color: muted }}>{say(message)}</div> : null);
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
      if (!url) return editor ? <div className="bq-media grid place-items-center" style={{ aspectRatio: RATIOS[String(element.ratio)] ?? "16 / 10", borderRadius: look.cardRadius, color: t.muted }}><span className="flex items-center gap-1.5 text-[12.5px]"><Icon name="image" size={15} /> {say("Add a picture in the panel")}</span></div> : null;
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
  const rowRef = useRef<HTMLDivElement>(null);
  const drag = useColumnDrag({
    containerRef: rowRef,
    acrossRows: true,
    onDrop: (elementId, column, index, row) => editing?.onMoveElement?.(section.id, elementId, column, index, row && row !== section.id ? row : undefined),
  });
  // The drag on this page, from this row or another one.
  const pageDrag = usePageColumnDrag();
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
  const canDrag = Boolean(canEdit && editing?.onMoveElement);
  const dragging = canDrag && pageDrag?.moved ? pageDrag : null;
  const dragged = canDrag && drag.state?.moved ? view.cells.flatMap((cell) => cell.elements).find((element) => element.id === drag.state?.id) : undefined;
  // Only the builder passes its words; shoppers get the store's own text.
  const say = (editor && editing?.text) || englishText;

  return (
    <section aria-label={section.name || say("Columns")} data-drop-row={canDrag ? section.id : undefined} style={{ background, color: dark ? t.paperBg : t.ink, paddingTop: pad, paddingBottom: pad }}>
      <style>{canDrag ? ROW_CSS + GRIP_CSS : ROW_CSS}</style>
      <div ref={rowRef} className="bq-wrap bql-row" style={rowStyle}>
        {view.cells.map((cell, columnIndex) => {
          const target = dragging?.target?.row === section.id && dragging.target.column === columnIndex ? dragging.target : null;
          // Another row's element can't come into a full column: it shows red, with no drop line.
          const full = Boolean(dragging && dragging.from !== section.id && cell.elements.length >= MAX_ELEMENTS_PER_COLUMN);
          return (
          <div
            key={cell.id}
            className="bql-col"
            data-drop-column={canDrag ? columnIndex : undefined}
            style={{
              ...(view.align === "stretch" ? { height: "100%" } : {}),
              ...(canDrag ? { position: "relative" } : {}),
              // While dragging every column (even an empty one) is a visible target; the one under the pointer lights up.
              ...(dragging ? {
                minHeight: 56,
                borderRadius: 10,
                outline: target ? `2px solid ${full ? FULL_RED : EDIT_BLUE}` : `1px dashed ${dark ? "rgba(255,255,255,.45)" : "rgba(47,102,246,.45)"}`,
                outlineOffset: 6,
                background: target ? (full ? "rgba(229,72,77,.07)" : "rgba(47,102,246,.07)") : undefined,
                cursor: target && full ? "not-allowed" : undefined,
              } : {}),
            }}
          >
            {target && !full ? <div aria-hidden className="pointer-events-none absolute inset-x-0 z-20 h-[3px] rounded-full" style={{ top: target.top - 1.5, background: EDIT_BLUE, boxShadow: "0 0 0 2px rgba(255,255,255,.85)" }} /> : null}
            {cell.elements.map((element) => {
              const body = <ElementView ctx={ctx} element={element} dark={dark} say={say} />;
              if (!canEdit) return <div key={element.id} className="min-w-0">{body}</div>;
              const selected = editing?.selectedElementId === element.id;
              return (
                <div
                  key={element.id}
                  data-element-id={element.id}
                  data-drop-item={canDrag ? "" : undefined}
                  role="button"
                  tabIndex={0}
                  aria-label={say("Edit {name}", { name: say(layoutElementMeta(element.type)?.label ?? "Element") })}
                  aria-pressed={selected}
                  className="bql-el relative min-w-0 rounded-[6px]"
                  style={{ outline: selected ? "2px solid #2F66F6" : "1px dashed transparent", outlineOffset: 4, cursor: "pointer", opacity: dragging && dragging.from === section.id && dragging.id === element.id ? 0.35 : undefined }}
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
                  {canDrag ? (
                    <span
                      aria-hidden
                      title={say("Drag to move")}
                      className="bql-grip absolute z-10 grid h-6 w-6 place-items-center rounded-[7px] text-white shadow-[0_2px_8px_rgba(22,20,31,.25)]"
                      style={{ top: -14, left: -14, background: EDIT_BLUE, cursor: dragging ? "grabbing" : "grab", touchAction: "none" }}
                      onPointerDown={(event) => drag.start(event, element.id)}
                    >
                      <GripDots />
                    </span>
                  ) : null}
                  {body}
                </div>
              );
            })}
            {editor && editing?.onAddToColumn ? (
              <button
                type="button"
                data-column-add={`${section.id}:${columnIndex}`}
                aria-label={say("Add an element to column {n}", { n: columnIndex + 1 })}
                title={say("Add an element")}
                onClick={(event) => {
                  event.stopPropagation();
                  editing.onAddToColumn?.(section.id, columnIndex);
                }}
                className="flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-dashed text-[12.5px] font-semibold transition hover:opacity-100"
                style={{ minHeight: cell.elements.length ? 34 : 96, borderColor: dark ? "rgba(255,255,255,.4)" : "#2F66F6", color: dark ? "#fff" : "#2F66F6", background: "transparent", opacity: cell.elements.length ? 0.55 : 0.9, cursor: "pointer" }}
              >
                <Icon name="plus" size={14} /> {cell.elements.length ? "" : say("Add element")}
              </button>
            ) : null}
          </div>
          );
        })}
      </div>
      {dragged ? <DragGhost previewRef={drag.previewRef} label={say(layoutElementLabel(dragged))} thumb={<GhostThumb element={dragged} />} /> : null}
    </section>
  );
}

// Darker than the outlines, so the strip's small words read clearly on white (WCAG AA).
const STRIP_INK = "#4A4857";
const STRIP_BLUE = "#2453D4";
const STRIP_RED = "#C42F35";

/**
 * Hidden rows / columns sections on the builder's canvas (one, or several in a row of the page): nothing, except while
 * an element is being dragged. Then each one shows as a strip ("Hidden row: <name> — drop here") with its columns as
 * compact drop targets (full ones red). The strips float over the boundary between the sections around them, from a
 * zero-height anchor in their place, so nothing on the page moves when a drag starts; their box is data-drop-overlay,
 * so the drag measures them as drawn and prefers them when the pointer is right over them. The drop itself is handled
 * by the dragged element's own row, like any other row's.
 */
export function HiddenLayoutRowDrops({ sections, text }: { sections: TemplateSectionNode[]; text?: LayoutRowText }) {
  const drag = usePageColumnDrag();
  if (!drag?.moved || !sections.length) return null;
  return (
    <div data-hidden-rows="" style={{ position: "relative", height: 0 }}>
      <div data-drop-overlay="" style={{ position: "absolute", left: 0, right: 0, top: 0, transform: "translateY(-50%)", zIndex: 40, display: "grid", gap: 6 }}>
        {sections.map((section) => <HiddenLayoutRowDrop key={section.id} section={section} text={text} />)}
      </div>
    </div>
  );
}

/** One hidden row's strip, inside HiddenLayoutRowDrops. */
export function HiddenLayoutRowDrop({ section, text }: { section: TemplateSectionNode; text?: LayoutRowText }) {
  const drag = usePageColumnDrag();
  if (!drag?.moved) return null;
  const say = text ?? englishText;
  const view = normaliseLayoutRow(section);
  const name = section.name || say("Columns");
  const grid = view.preset.id.startsWith("grid");
  return (
    <section
      aria-label={say("Hidden row: {name}", { name })}
      data-drop-row={section.id}
      data-hidden-row=""
      style={{ padding: "8px 0", background: "rgba(255,255,255,.97)", borderTop: "1px dashed rgba(22,20,31,.3)", borderBottom: "1px dashed rgba(22,20,31,.3)", boxShadow: "0 6px 20px rgba(22,20,31,.16)" }}
    >
      <div className="bq-wrap">
        <p className="m-0 mb-1.5 flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: STRIP_INK }}>
          <Icon name="eye" size={14} /> <span className="truncate">{say("Hidden row: {name} — drop here", { name })}</span>
        </p>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(view.cells.length, 6)}, minmax(0, 1fr))`, gap: 8 }}>
          {view.cells.map((cell, columnIndex) => {
            const target = drag.target?.row === section.id && drag.target.column === columnIndex;
            const full = cell.elements.length >= MAX_ELEMENTS_PER_COLUMN;
            const column = grid ? say("Box {n}", { n: columnIndex + 1 }) : say("Column {n}", { n: columnIndex + 1 });
            return (
              <div
                key={cell.id}
                data-drop-column={columnIndex}
                data-drop-append=""
                className="grid min-w-0 place-items-center truncate rounded-[8px] px-2 text-[12px] font-semibold"
                style={{
                  minHeight: 32,
                  border: target ? `2px solid ${full ? FULL_RED : EDIT_BLUE}` : `1px dashed ${full ? FULL_RED : "rgba(47,102,246,.6)"}`,
                  background: target ? (full ? "#FDEDED" : "#EDF2FF") : "#fff",
                  color: full ? STRIP_RED : STRIP_BLUE,
                  cursor: target && full ? "not-allowed" : undefined,
                }}
              >
                {full ? say("{column} · full", { column }) : column}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
