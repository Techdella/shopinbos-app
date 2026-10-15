"use client";

// Inspector part of a rows / columns / grid section: the column preset (as pictures) and each column's elements,
// which can be added, picked, edited, moved (up / down, "Move to" another column or another rows / columns section of
// the page, or dragged by their grip within and between the column lists, like on the canvas), copied and removed.
// Selection is shared with the canvas.
// Everything here shrinks to the panel's width (min-w-0, one minmax(0,1fr) track): a long product name in a select
// must never widen the panel, or the panel scrolls sideways and every field after this one is cut off on the left.

import { useId, useRef, useState, type ReactNode } from "react";
import { cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { MediaPicker } from "@/components/media/MediaPicker";
import type { TemplateSectionNode } from "@/lib/store-templates";
import type { SlideLink } from "@/lib/store-templates/section-content";
import {
  COLUMN_PRESETS,
  LAYOUT_ROW_KIND,
  LAYOUT_ICONS,
  LAYOUT_ELEMENTS,
  MAX_ELEMENTS_PER_COLUMN,
  duplicateLayoutElement,
  layoutElementLabel,
  moveLayoutElement,
  normaliseLayoutRow,
  removeLayoutElement,
  setLayoutPreset,
  updateLayoutElement,
  type LayoutElement,
  type LayoutElementType,
} from "@/components/storefront/boutique/blocks/layout-logic";
import { useColumnDrag } from "@/components/storefront/boutique/blocks/useColumnDrag";
import { DragGhost } from "@/components/storefront/boutique/blocks/DragGhost";
import { GripDots } from "@/components/storefront/boutique/blocks/LayoutRow";
import { InsertThumb } from "./insert-thumbnails";
import type { BuilderProduct } from "./useBuilder";
import { FieldShell, IconButton, inputClass, PillGroup, textareaClass } from "./ui";
import { useEditorT } from "./i18n";

type SectionUpdater = (section: TemplateSectionNode) => TemplateSectionNode;

export interface LayoutColumnsFieldProps {
  section: TemplateSectionNode;
  onChange: (updater: SectionUpdater, key?: string) => void;
  products: BuilderProduct[];
  selectedElementId: string | null;
  onSelectElement: (elementId: string | null) => void;
  onAddElement: (columnIndex: number, type: LayoutElementType) => void;
  /**
   * Moves an element (one undoable change, announced to screen readers), with `toSectionId` into another rows /
   * columns section of the page. Without it the move is a plain onChange, inside this section only.
   */
  onMoveElement?: (elementId: string, toColumn: number, toIndex: number, options?: { select?: boolean; toSectionId?: string }) => void;
  /** The page's sections, so "Move to" can offer the other rows / columns sections. */
  pageSections?: TemplateSectionNode[];
  renderLink: (props: { label: string; value: SlideLink; onChange: (link: SlideLink) => void }) => ReactNode;
}

const ALIGN_OPTIONS = [{ value: "left", label: "Left" }, { value: "center", label: "Centre" }, { value: "right", label: "Right" }] as const;

function newElementId() {
  return `el-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export function LayoutColumnsField(props: LayoutColumnsFieldProps) {
  const { t, tx } = useEditorT();
  const { section } = props;
  const view = normaliseLayoutRow(section);
  const [adding, setAdding] = useState<number | null>(null);
  const placeName = (presetId: string, index: number) => (presetId.startsWith("grid") ? t("edk.boxN", { n: index + 1 }) : t("edk.columnN", { n: index + 1 }));
  const columnName = (index: number) => placeName(view.preset.id, index);
  // The other rows / columns sections on this page ("Row 2: Features"), numbered from the top like the canvas.
  const rows = props.onMoveElement ? (props.pageSections ?? []).filter((entry) => entry.kind === LAYOUT_ROW_KIND) : [];
  const otherRows = rows
    .map((entry, at) => ({ section: entry, n: at + 1, view: normaliseLayoutRow(entry) }))
    .filter((row) => row.section.id !== section.id);
  const moveId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const move = (elementId: string, column: number, index: number, options?: { select?: boolean }) => {
    if (props.onMoveElement) props.onMoveElement(elementId, column, index, options);
    else props.onChange((current) => moveLayoutElement(current, elementId, column, index));
  };
  const drag = useColumnDrag({ containerRef: listRef, onDrop: (elementId, column, index) => move(elementId, column, index) });
  const dragging = drag.state?.moved ? drag.state : null;
  const dragged = dragging ? view.cells.flatMap((cell) => cell.elements).find((element) => element.id === dragging.id) : undefined;

  return (
    <div className="min-w-0 py-2">
      <div role="radiogroup" aria-label={tx("Columns")} className="grid min-w-0 grid-cols-4 gap-1.5">
        {COLUMN_PRESETS.map((preset) => {
          const on = preset.id === view.preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={on}
              title={tx(preset.label)}
              aria-label={tx(preset.label)}
              onClick={() => props.onChange((current) => setLayoutPreset(current, preset.id))}
              className={cx("min-w-0 overflow-hidden rounded-[10px] border p-1", on ? "border-[#2F66F6] bg-[#EAF0FF] text-[#2F66F6]" : "border-app-line text-app-ink-soft hover:border-app-line-strong")}
            >
              <InsertThumb kind={`layout:${preset.id}`} className="block aspect-[8/5] w-full" />
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 min-w-0 break-words text-[12px] leading-[18px] text-app-ink-soft">{tx(view.preset.label)} · {tx("Fewer columns keep every element: they move into the last column.")}</p>

      <div ref={listRef} className="mt-3 grid min-w-0 grid-cols-1 gap-3">
        {view.cells.map((cell, columnIndex) => {
          const target = dragging?.target?.column === columnIndex ? dragging.target : null;
          return (
          <div
            key={cell.id}
            data-drop-column={columnIndex}
            className={cx("relative min-w-0 rounded-[12px] border", target ? "border-[#2F66F6] bg-[#F5F8FF] ring-1 ring-[#2F66F6]" : dragging ? "border-dashed border-[#2F66F6]/50" : "border-app-line")}
          >
            {target ? <div aria-hidden className="pointer-events-none absolute inset-x-1 z-10 h-[3px] rounded-full bg-[#2F66F6]" style={{ top: target.top - 1.5 }} /> : null}
            <div className="flex min-w-0 items-center justify-between gap-2 border-b border-app-line px-3 py-1.5">
              <h4 className="m-0 min-w-0 truncate text-[13px] font-bold text-app-ink">{columnName(columnIndex)}</h4>
              <button
                type="button"
                aria-expanded={adding === columnIndex}
                disabled={cell.elements.length >= MAX_ELEMENTS_PER_COLUMN}
                onClick={() => setAdding(adding === columnIndex ? null : columnIndex)}
                className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full px-2 text-[12.5px] font-semibold text-[#2F66F6] hover:bg-[#EAF0FF] disabled:opacity-40"
              >
                <Icon name="plus" size={13} /> {tx("Add element")}
              </button>
            </div>
            {adding === columnIndex ? (
              <ul className="m-0 grid min-w-0 list-none grid-cols-3 gap-1.5 border-b border-app-line p-2" aria-label={t("edk.addTo", { name: columnName(columnIndex) })}>
                {LAYOUT_ELEMENTS.map((element) => (
                  <li key={element.type} className="min-w-0">
                    <button
                      type="button"
                      title={tx(element.description)}
                      onClick={() => { setAdding(null); props.onAddElement(columnIndex, element.type); }}
                      className="flex w-full min-w-0 flex-col items-center gap-1 rounded-[10px] border border-app-line p-1 text-app-ink-soft hover:border-[#2F66F6] hover:text-[#2F66F6]"
                    >
                      <InsertThumb kind={`element:${element.type}`} className="block aspect-[8/5] w-full" />
                      <span className="w-full truncate text-center text-[11.5px] font-semibold text-app-ink">{tx(element.label)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {cell.elements.length === 0 ? (
              <p className="m-0 px-3 py-2.5 text-[12.5px] text-app-ink-soft">{tx("Empty. Add an element, or leave it as space.")}</p>
            ) : (
              <ul className="m-0 min-w-0 list-none p-1">
                {cell.elements.map((element, index) => {
                  const open = props.selectedElementId === element.id;
                  const name = tx(layoutElementLabel(element));
                  return (
                    <li
                      key={element.id}
                      data-field={`element:${element.id}`}
                      data-drop-item=""
                      className={cx("min-w-0 rounded-[10px]", open && "bg-[#F5F8FF] ring-1 ring-[#2F66F6]/40", dragging?.id === element.id && "opacity-40")}
                    >
                      <div className="flex min-w-0 items-center gap-1">
                        <span
                          aria-hidden
                          title={tx("Drag to move")}
                          onPointerDown={(event) => drag.start(event, element.id)}
                          className={cx("grid h-8 w-5 shrink-0 touch-none place-items-center rounded-[6px] text-app-ink-faint hover:bg-app-canvas hover:text-app-ink", drag.state ? "cursor-grabbing" : "cursor-grab")}
                        >
                          <GripDots />
                        </span>
                        <button
                          type="button"
                          aria-expanded={open}
                          onClick={() => props.onSelectElement(open ? null : element.id)}
                          className="flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-[8px] px-2 text-left text-[13px] font-medium text-app-ink hover:bg-app-canvas"
                        >
                          <span className="w-8 shrink-0 text-app-ink-soft"><InsertThumb kind={`element:${element.type}`} className="block aspect-[8/5] w-full" /></span>
                          <span className="min-w-0 truncate">{name}</span>
                        </button>
                        <IconButton icon="arrowUp" label={t("edk.moveUp", { name })} className="h-8 w-8" size={14} disabled={index === 0} onClick={() => move(element.id, columnIndex, index - 1)} />
                        <IconButton icon="arrowDown" label={t("edk.moveDown", { name })} className="h-8 w-8" size={14} disabled={index >= cell.elements.length - 1} onClick={() => move(element.id, columnIndex, index + 2)} />
                        <IconButton icon="copy" label={t("edk.duplicateName", { name })} className="h-8 w-8" size={14} disabled={cell.elements.length >= MAX_ELEMENTS_PER_COLUMN} onClick={() => { const id = newElementId(); props.onChange((current) => duplicateLayoutElement(current, element.id, id)); props.onSelectElement(id); }} />
                        <IconButton icon="trash" label={t("edk.removeName", { name })} className="h-8 w-8" size={14} onClick={() => { props.onChange((current) => removeLayoutElement(current, element.id)); if (open) props.onSelectElement(null); }} />
                      </div>
                      {open && (view.cells.length > 1 || otherRows.length > 0) ? (
                        // Keyboard-friendly alternative to dragging: it goes to the end of that column, in this row or
                        // another rows / columns section of the page (full columns can't be picked).
                        <div className="flex min-w-0 items-center gap-2 px-2 pt-1">
                          <label htmlFor={`${moveId}-${element.id}`} className="shrink-0 text-[13px] font-semibold text-app-ink">{tx("Move to")}</label>
                          <select
                            id={`${moveId}-${element.id}`}
                            aria-label={t("edk.moveToColumn", { name })}
                            className={cx(inputClass, "h-9")}
                            value={`${section.id}:${columnIndex}`}
                            onChange={(event) => {
                              const value = event.target.value;
                              const split = value.lastIndexOf(":");
                              const toSectionId = value.slice(0, split);
                              const column = Number(value.slice(split + 1));
                              if (toSectionId === section.id) move(element.id, column, MAX_ELEMENTS_PER_COLUMN, { select: true });
                              else props.onMoveElement?.(element.id, column, MAX_ELEMENTS_PER_COLUMN, { select: true, toSectionId });
                            }}
                          >
                            {otherRows.length ? (
                              <>
                                <optgroup label={tx("This row")}>
                                  {view.cells.map((other, otherIndex) => (
                                    <option key={other.id} value={`${section.id}:${otherIndex}`} disabled={otherIndex !== columnIndex && other.elements.length >= MAX_ELEMENTS_PER_COLUMN}>{columnName(otherIndex)}</option>
                                  ))}
                                </optgroup>
                                {otherRows.map((row) => (
                                  <optgroup key={row.section.id} label={t("edk.rowNamed", { n: row.n, name: tx(row.section.name || "Columns") })}>
                                    {row.view.cells.map((cell, cellIndex) => (
                                      <option key={cell.id} value={`${row.section.id}:${cellIndex}`} disabled={cell.elements.length >= MAX_ELEMENTS_PER_COLUMN}>
                                        {t("edk.rowColumn", { row: t("edk.rowN", { n: row.n }), column: placeName(row.view.preset.id, cellIndex) })}
                                      </option>
                                    ))}
                                  </optgroup>
                                ))}
                              </>
                            ) : view.cells.map((other, otherIndex) => (
                              <option key={other.id} value={`${section.id}:${otherIndex}`} disabled={otherIndex !== columnIndex && other.elements.length >= MAX_ELEMENTS_PER_COLUMN}>{columnName(otherIndex)}</option>
                            ))}
                          </select>
                        </div>
                      ) : null}
                      {open ? <div className="min-w-0 px-2 pb-2"><ElementFields {...props} element={element} /></div> : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          );
        })}
      </div>
      {dragged ? <DragGhost previewRef={drag.previewRef} label={tx(layoutElementLabel(dragged))} thumb={<InsertThumb kind={`element:${dragged.type}`} className="block h-full w-full" />} /> : null}
    </div>
  );
}

function ElementFields({ element, section, onChange, products, renderLink }: LayoutColumnsFieldProps & { element: LayoutElement }) {
  const { tx } = useEditorT();
  const id = useId();
  const set = (key: string, value: unknown) => onChange((current) => updateLayoutElement(current, element.id, { [key]: value }), `${section.id}:el:${element.id}:${key}`);
  const str = (key: string) => (typeof element[key] === "string" ? (element[key] as string) : "");
  const align = (
    <FieldShell label="Alignment">
      <PillGroup label="Alignment" options={[...ALIGN_OPTIONS]} value={(str("align") || "left") as "left" | "center" | "right"} onChange={(value) => set("align", value)} />
    </FieldShell>
  );
  switch (element.type) {
    case "heading":
      return (
        <>
          <FieldShell id={id} label="Heading"><textarea id={id} rows={2} className={textareaClass} value={str("text")} onChange={(event) => set("text", event.target.value)} /></FieldShell>
          <FieldShell label="Size">
            <PillGroup label="Size" options={[{ value: "h2", label: "Large" }, { value: "h3", label: "Medium" }, { value: "h4", label: "Small" }]} value={(str("level") || "h2") as "h2" | "h3" | "h4"} onChange={(value) => set("level", value)} />
          </FieldShell>
          {align}
        </>
      );
    case "text":
      return (
        <>
          <FieldShell id={id} label="Text" help="Leave a blank line to start a new paragraph."><textarea id={id} rows={5} className={textareaClass} value={str("text")} onChange={(event) => set("text", event.target.value)} /></FieldShell>
          {align}
        </>
      );
    case "image":
      return (
        <>
          <div className="py-2"><MediaPicker compact label={tx("Picture")} value={str("imageUrl")} onChange={(url) => set("imageUrl", url ?? "")} /></div>
          <FieldShell id={id} label="Describe the picture" help="Read aloud to shoppers who can't see it."><input id={id} className={inputClass} value={str("alt")} onChange={(event) => set("alt", event.target.value)} /></FieldShell>
          <FieldShell id={`${id}-ratio`} label="Shape">
            <select id={`${id}-ratio`} className={inputClass} value={str("ratio") || "landscape"} onChange={(event) => set("ratio", event.target.value)}>
              {[["landscape", "Wide"], ["square", "Square"], ["portrait", "Tall"], ["auto", "Picture's own shape"]].map(([value, label]) => <option key={value} value={value}>{tx(label)}</option>)}
            </select>
          </FieldShell>
        </>
      );
    case "button": {
      const raw = element.link && typeof element.link === "object" ? (element.link as Record<string, unknown>) : {};
      const link: SlideLink = { type: raw.type === "product" || raw.type === "url" ? raw.type : "page", value: typeof raw.value === "string" ? raw.value : "products" };
      return (
        <>
          <FieldShell id={id} label="Button label"><input id={id} className={inputClass} value={str("label")} onChange={(event) => set("label", event.target.value)} /></FieldShell>
          {renderLink({ label: "Button opens", value: link, onChange: (next) => set("link", next) })}
          <FieldShell label="Style">
            <PillGroup label="Style" options={[{ value: "primary", label: "Filled" }, { value: "outline", label: "Outline" }]} value={(str("style") || "primary") as "primary" | "outline"} onChange={(value) => set("style", value)} />
          </FieldShell>
          {align}
        </>
      );
    }
    case "video":
      return <div className="py-2"><MediaPicker compact accept="any" label={tx("Video")} help={tx("Paste a YouTube link or upload a video.")} value={str("videoUrl")} onChange={(url) => set("videoUrl", url ?? "")} /></div>;
    case "spacer": {
      const size = typeof element.size === "number" ? element.size : 32;
      return (
        <FieldShell id={id} label="Height" help={`${size}px`}>
          <input id={id} type="range" min={4} max={160} step={4} value={size} onChange={(event) => set("size", Number(event.target.value))} className="w-full accent-[#2F66F6]" />
        </FieldShell>
      );
    }
    case "divider":
      return (
        <FieldShell label="Line">
          <PillGroup label="Line" options={[{ value: "solid", label: "Solid" }, { value: "dashed", label: "Dashed" }]} value={(str("style") || "solid") as "solid" | "dashed"} onChange={(value) => set("style", value)} />
        </FieldShell>
      );
    case "icon-list":
      return (
        <>
          <FieldShell id={id} label="Points" help="One point per line."><textarea id={id} rows={4} className={textareaClass} value={str("lines")} onChange={(event) => set("lines", event.target.value)} /></FieldShell>
          <FieldShell id={`${id}-icon`} label="Icon">
            <select id={`${id}-icon`} className={inputClass} value={str("icon") || "check"} onChange={(event) => set("icon", event.target.value)}>
              {LAYOUT_ICONS.map((icon) => <option key={icon} value={icon}>{tx(ICON_LABELS[icon])}</option>)}
            </select>
          </FieldShell>
        </>
      );
    case "product":
      return (
        <FieldShell id={id} label="Product">
          {products.length ? (
            <select id={id} className={inputClass} value={str("productId")} onChange={(event) => set("productId", event.target.value)}>
              <option value="">{tx("Pick a product")}</option>
              {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </select>
          ) : <p className="m-0 text-[12.5px] text-app-ink-soft">{tx("Add products to your store to pick them here.")}</p>}
        </FieldShell>
      );
    default:
      return null;
  }
}

const ICON_LABELS: Record<(typeof LAYOUT_ICONS)[number], string> = {
  check: "Tick",
  star: "Star",
  truck: "Delivery",
  heart: "Heart",
  shield: "Shield",
  leaf: "Natural",
  clock: "Clock",
  package: "Package",
};
