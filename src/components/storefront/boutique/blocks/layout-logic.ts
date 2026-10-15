// Rows, columns and grids (the "layout-row" section of the 2026 themes): column presets, the elements a column can
// hold, and the reading/normalising of what a saved section carries. Pure, with no runtime imports, so the builder,
// the storefront and tests/behaviour.test.mjs share it (Node strips the types).
//
// A layout row keeps its look on section.settings (preset, gap, align, stackOnMobile, background, padding) and its
// content on section.items: one entry per column (or grid cell), each `{ id, elements: LayoutElement[] }`.
// Whatever is saved is read through normaliseLayoutRow, so bad or hand-edited data never breaks the live store.

import type { TemplateSectionNode } from "../../../../lib/store-templates/types.ts";

export const LAYOUT_ROW_KIND = "layout-row";

// ─── Column presets ──────────────────────────────────────────────────────────

export type ColumnPresetId = "1" | "50-50" | "33-66" | "66-33" | "3" | "4" | "grid-2x2" | "grid-3x2";

export interface ColumnPreset {
  id: ColumnPresetId;
  label: string;
  hint: string;
  /** Relative widths of the grid tracks on wide screens (fr units). */
  tracks: number[];
  /** Columns or grid cells the content is split into. */
  cells: number;
}

export const COLUMN_PRESETS: ColumnPreset[] = [
  { id: "1", label: "1 column", hint: "One full-width column.", tracks: [1], cells: 1 },
  { id: "50-50", label: "2 columns", hint: "Two equal columns.", tracks: [1, 1], cells: 2 },
  { id: "33-66", label: "2 columns, wide right", hint: "A narrow column beside a wide one.", tracks: [1, 2], cells: 2 },
  { id: "66-33", label: "2 columns, wide left", hint: "A wide column beside a narrow one.", tracks: [2, 1], cells: 2 },
  { id: "3", label: "3 columns", hint: "Three equal columns.", tracks: [1, 1, 1], cells: 3 },
  { id: "4", label: "4 columns", hint: "Four equal columns.", tracks: [1, 1, 1, 1], cells: 4 },
  { id: "grid-2x2", label: "Grid 2 × 2", hint: "Four boxes in two rows.", tracks: [1, 1], cells: 4 },
  { id: "grid-3x2", label: "Grid 3 × 2", hint: "Six boxes in two rows.", tracks: [1, 1, 1], cells: 6 },
];

export const DEFAULT_COLUMN_PRESET: ColumnPresetId = "50-50";
/** Elements one column can hold; more are dropped when the section is read. */
export const MAX_ELEMENTS_PER_COLUMN = 24;

export function columnPreset(id: unknown): ColumnPreset {
  return COLUMN_PRESETS.find((preset) => preset.id === id) ?? COLUMN_PRESETS.find((preset) => preset.id === DEFAULT_COLUMN_PRESET)!;
}

/** Width of each column or cell, in percent of the row (rounded to two decimals), on wide screens. */
export function columnWidths(id: unknown): number[] {
  const preset = columnPreset(id);
  const total = preset.tracks.reduce((sum, track) => sum + track, 0);
  return Array.from({ length: preset.cells }, (_, index) => Math.round((preset.tracks[index % preset.tracks.length]! / total) * 10000) / 100);
}

/** CSS grid-template-columns for wide screens. */
export function columnTemplate(id: unknown): string {
  return columnPreset(id).tracks.map((track) => `minmax(0,${track}fr)`).join(" ");
}

// ─── Row settings ────────────────────────────────────────────────────────────

export type LayoutGap = "none" | "small" | "medium" | "large";
export type LayoutAlign = "top" | "center" | "bottom" | "stretch";
export type LayoutBackground = "none" | "paper" | "card" | "accent" | "dark";
export type LayoutPadding = "none" | "small" | "medium" | "large";

export const LAYOUT_GAPS: Record<LayoutGap, number> = { none: 0, small: 12, medium: 24, large: 40 };
export const LAYOUT_PADDING: Record<LayoutPadding, number> = { none: 0, small: 20, medium: 44, large: 72 };
const GAP_IDS = Object.keys(LAYOUT_GAPS) as LayoutGap[];
const PADDING_IDS = Object.keys(LAYOUT_PADDING) as LayoutPadding[];
const ALIGN_IDS: LayoutAlign[] = ["top", "center", "bottom", "stretch"];
const BACKGROUND_IDS: LayoutBackground[] = ["none", "paper", "card", "accent", "dark"];

// ─── Elements ────────────────────────────────────────────────────────────────

export type LayoutElementType = "heading" | "text" | "image" | "button" | "video" | "spacer" | "divider" | "icon-list" | "product";

export interface LayoutElement {
  id: string;
  type: LayoutElementType;
  [key: string]: unknown;
}

export interface LayoutCell {
  id: string;
  elements: LayoutElement[];
}

export interface LayoutElementMeta {
  type: LayoutElementType;
  label: string;
  description: string;
  defaults: () => Record<string, unknown>;
}

export const LAYOUT_ELEMENTS: LayoutElementMeta[] = [
  { type: "heading", label: "Heading", description: "A title for this part of the page.", defaults: () => ({ text: "Your heading", level: "h2", align: "left" }) },
  { type: "text", label: "Text", description: "A paragraph of words.", defaults: () => ({ text: "", align: "left" }) },
  { type: "image", label: "Image", description: "One picture.", defaults: () => ({ imageUrl: "", alt: "", ratio: "landscape" }) },
  { type: "button", label: "Button", description: "A button that opens a page, product or link.", defaults: () => ({ label: "Shop now", link: { type: "page", value: "products" }, style: "primary", align: "left" }) },
  { type: "video", label: "Video", description: "A YouTube link or uploaded video.", defaults: () => ({ videoUrl: "" }) },
  { type: "spacer", label: "Spacer", description: "Empty space between elements.", defaults: () => ({ size: 32 }) },
  { type: "divider", label: "Divider", description: "A thin line.", defaults: () => ({ style: "solid" }) },
  { type: "icon-list", label: "Icon list", description: "Short points with an icon each.", defaults: () => ({ lines: "Fast delivery\nPay on delivery\nEasy returns", icon: "check" }) },
  { type: "product", label: "Product card", description: "One of your products with its price.", defaults: () => ({ productId: "" }) },
];

export const LAYOUT_ELEMENT_TYPES = LAYOUT_ELEMENTS.map((element) => element.type);

export const LAYOUT_ICONS = ["check", "star", "truck", "heart", "shield", "leaf", "clock", "package"] as const;
export type LayoutIcon = (typeof LAYOUT_ICONS)[number];

export function layoutElementMeta(type: unknown): LayoutElementMeta | undefined {
  return LAYOUT_ELEMENTS.find((element) => element.type === type);
}

export function newLayoutElement(type: LayoutElementType, id: string): LayoutElement {
  const meta = layoutElementMeta(type) ?? LAYOUT_ELEMENTS[1]!;
  return { id, type: meta.type, ...meta.defaults() };
}

function text(value: unknown, max = 2000) {
  return typeof value === "string" ? value.slice(0, max) : typeof value === "number" ? String(value) : "";
}

function pick<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return typeof value === "string" && (options as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Only web addresses shoppers can safely open. */
export function safeHref(value: unknown): string {
  const url = text(value, 500).trim();
  return /^https?:\/\/[^\s"'<>]+$/i.test(url) ? url : "";
}

/** One element as saved → a clean element, or null when it can't be drawn (unknown type, not an object). */
export function normaliseLayoutElement(raw: unknown, fallbackId: string): LayoutElement | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const entry = raw as Record<string, unknown>;
  const meta = layoutElementMeta(entry.type);
  if (!meta) return null;
  const id = text(entry.id, 80).trim() || fallbackId;
  const align = pick(entry.align, ["left", "center", "right"] as const, "left");
  switch (meta.type) {
    case "heading":
      return { id, type: "heading", text: text(entry.text, 300), level: pick(entry.level, ["h2", "h3", "h4"] as const, "h2"), align };
    case "text":
      return { id, type: "text", text: text(entry.text), align };
    case "image":
      return { id, type: "image", imageUrl: text(entry.imageUrl, 1000).trim(), alt: text(entry.alt, 200), ratio: pick(entry.ratio, ["auto", "square", "portrait", "landscape"] as const, "landscape") };
    case "button": {
      const link = entry.link && typeof entry.link === "object" ? (entry.link as Record<string, unknown>) : {};
      const type = pick(link.type, ["page", "product", "url"] as const, "page");
      const value = text(link.value, 500).trim();
      return { id, type: "button", label: text(entry.label, 80), link: { type, value: type === "page" ? value || "products" : value }, style: pick(entry.style, ["primary", "outline"] as const, "primary"), align };
    }
    case "video":
      return { id, type: "video", videoUrl: text(entry.videoUrl, 1000).trim() };
    case "spacer": {
      const size = Number(entry.size);
      return { id, type: "spacer", size: Number.isFinite(size) ? Math.min(160, Math.max(4, Math.round(size))) : 32 };
    }
    case "divider":
      return { id, type: "divider", style: pick(entry.style, ["solid", "dashed"] as const, "solid") };
    case "icon-list":
      return { id, type: "icon-list", lines: text(entry.lines), icon: pick(entry.icon, LAYOUT_ICONS, "check") };
    case "product":
      return { id, type: "product", productId: text(entry.productId, 120).trim() };
  }
}

/** The lines of an icon list, without blanks. */
export function iconListLines(element: Record<string, unknown>): string[] {
  return text(element.lines).split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 20);
}

/**
 * Saved columns → exactly `cells` clean columns. Missing columns are added empty; columns past the preset's count
 * (after switching to fewer columns) hand their elements to the last column so nothing the seller made is lost.
 */
export function normaliseLayoutCells(raw: unknown, cells: number): LayoutCell[] {
  const list = Array.isArray(raw) ? raw : [];
  const read = list.map((entry, index): LayoutCell => {
    const cell = entry && typeof entry === "object" && !Array.isArray(entry) ? (entry as Record<string, unknown>) : {};
    const id = text(cell.id, 80).trim() || `col-${index + 1}`;
    const elements = (Array.isArray(cell.elements) ? cell.elements : [])
      .map((element, elementIndex) => normaliseLayoutElement(element, `${id}-el-${elementIndex + 1}`))
      .filter((element): element is LayoutElement => element !== null);
    return { id, elements };
  });
  const out: LayoutCell[] = [];
  for (let index = 0; index < cells; index += 1) out.push(read[index] ?? { id: `col-${index + 1}`, elements: [] });
  if (read.length > cells && cells > 0) {
    const last = out[cells - 1]!;
    out[cells - 1] = { ...last, elements: [...last.elements, ...read.slice(cells).flatMap((cell) => cell.elements)] };
  }
  // Ids must be unique for the editor to select one element.
  const seen = new Set<string>();
  return out.map((cell, index) => {
    let cellId = cell.id;
    if (seen.has(cellId)) cellId = `${cellId}-${index + 1}`;
    seen.add(cellId);
    const elements = cell.elements.slice(0, MAX_ELEMENTS_PER_COLUMN).map((element, elementIndex) => {
      let elementId = element.id;
      if (seen.has(elementId)) elementId = `${cellId}-el-${elementIndex + 1}`;
      while (seen.has(elementId)) elementId = `${elementId}x`;
      seen.add(elementId);
      return elementId === element.id ? element : { ...element, id: elementId };
    });
    return { id: cellId, elements };
  });
}

export interface LayoutRowView {
  preset: ColumnPreset;
  gap: LayoutGap;
  align: LayoutAlign;
  stackOnMobile: boolean;
  background: LayoutBackground;
  padding: LayoutPadding;
  cells: LayoutCell[];
}

/** Everything a layout row draws, from whatever the section holds. */
export function normaliseLayoutRow(section: Pick<TemplateSectionNode, "settings" | "items">): LayoutRowView {
  const settings = section.settings && typeof section.settings === "object" ? section.settings : {};
  const preset = columnPreset(settings.preset);
  return {
    preset,
    gap: pick(settings.gap, GAP_IDS, "medium"),
    align: pick(settings.align, ALIGN_IDS, "top"),
    stackOnMobile: typeof settings.stackOnMobile === "boolean" ? settings.stackOnMobile : true,
    background: pick(settings.background, BACKGROUND_IDS, "none"),
    padding: pick(settings.padding, PADDING_IDS, "medium"),
    cells: normaliseLayoutCells(section.items, preset.cells),
  };
}

/** Columns on phones: one when stacking, else the preset's (up to two, so boxes never get too thin). */
export function mobileColumns(view: Pick<LayoutRowView, "preset" | "stackOnMobile">) {
  return view.stackOnMobile ? 1 : Math.min(2, view.preset.tracks.length);
}

// ─── Editing (the builder) ───────────────────────────────────────────────────

function cellsOf(section: TemplateSectionNode) {
  return normaliseLayoutRow(section).cells;
}

function withCells(section: TemplateSectionNode, cells: LayoutCell[]): TemplateSectionNode {
  return { ...section, items: cells.map((cell) => ({ id: cell.id, elements: cell.elements.map((element) => ({ ...element })) })) };
}

/** A new row with the preset's empty columns (and one element in the first column, when given). */
export function newLayoutRowSection(id: string, presetId: ColumnPresetId = DEFAULT_COLUMN_PRESET, first?: LayoutElement): TemplateSectionNode {
  const preset = columnPreset(presetId);
  const cells: LayoutCell[] = Array.from({ length: preset.cells }, (_, index) => ({ id: `${id}-col-${index + 1}`, elements: index === 0 && first ? [first] : [] }));
  return {
    id,
    kind: LAYOUT_ROW_KIND,
    name: preset.cells === 1 && first ? layoutElementMeta(first.type)?.label ?? "Columns" : preset.label,
    visible: true,
    blocks: [],
    settings: { preset: preset.id, gap: "medium", align: "top", stackOnMobile: true, background: "none", padding: "medium" },
    items: cells.map((cell) => ({ ...cell })),
  };
}

/** Switching preset keeps every element: extra columns fold into the last one, new columns start empty. */
export function setLayoutPreset(section: TemplateSectionNode, presetId: string): TemplateSectionNode {
  const preset = columnPreset(presetId);
  return withCells({ ...section, settings: { ...(section.settings ?? {}), preset: preset.id } }, normaliseLayoutCells(section.items, preset.cells));
}

export function findLayoutElement(section: TemplateSectionNode, elementId: string) {
  const cells = cellsOf(section);
  for (let cellIndex = 0; cellIndex < cells.length; cellIndex += 1) {
    const index = cells[cellIndex]!.elements.findIndex((element) => element.id === elementId);
    if (index !== -1) return { cellIndex, index, element: cells[cellIndex]!.elements[index]!, count: cells[cellIndex]!.elements.length };
  }
  return null;
}

export function addLayoutElement(section: TemplateSectionNode, cellIndex: number, element: LayoutElement): TemplateSectionNode {
  const cells = cellsOf(section);
  const target = Math.min(Math.max(0, cellIndex), cells.length - 1);
  if (target < 0 || cells[target]!.elements.length >= MAX_ELEMENTS_PER_COLUMN) return section;
  return withCells(section, cells.map((cell, index) => (index === target ? { ...cell, elements: [...cell.elements, element] } : cell)));
}

export function updateLayoutElement(section: TemplateSectionNode, elementId: string, changes: Record<string, unknown>): TemplateSectionNode {
  const cells = cellsOf(section);
  return withCells(section, cells.map((cell) => ({ ...cell, elements: cell.elements.map((element) => (element.id === elementId ? normaliseLayoutElement({ ...element, ...changes, id: element.id, type: element.type }, element.id) ?? element : element)) })));
}

/**
 * Moves an element one step up or down inside its column, or (with a column and an index) to any spot in any column:
 * `toIndex` is the gap in the target column as it is now drawn (0 = above the first element, `length` = at the end),
 * which is what a drop line between elements points at. Within one column, dropping just above or below the element
 * itself changes nothing. Out-of-range columns and indexes are clamped; an unknown id, a full target column or a move
 * that changes nothing returns the same section object, so callers can skip the commit.
 */
export function moveLayoutElement(section: TemplateSectionNode, elementId: string, direction: "up" | "down"): TemplateSectionNode;
export function moveLayoutElement(section: TemplateSectionNode, elementId: string, toColumn: number, toIndex: number): TemplateSectionNode;
export function moveLayoutElement(section: TemplateSectionNode, elementId: string, target: "up" | "down" | number, toIndex?: number): TemplateSectionNode {
  const found = findLayoutElement(section, elementId);
  if (!found) return section;
  if (target === "up" || target === "down") {
    const to = found.index + (target === "up" ? -1 : 1);
    if (to < 0 || to >= found.count) return section;
    // One step down is the gap below the next element.
    return moveLayoutElement(section, elementId, found.cellIndex, target === "up" ? to : to + 1);
  }
  if (typeof target !== "number" || typeof toIndex !== "number" || !Number.isFinite(target) || !Number.isFinite(toIndex)) return section;
  const cells = cellsOf(section);
  const column = Math.min(Math.max(0, Math.trunc(target)), cells.length - 1);
  const destination = cells[column]!.elements;
  let index = Math.min(Math.max(0, Math.trunc(toIndex)), destination.length);
  if (column === found.cellIndex) {
    // The element leaves its own spot first, so every gap below it moves up by one.
    if (index > found.index) index -= 1;
    if (index === found.index) return section;
  } else if (destination.length >= MAX_ELEMENTS_PER_COLUMN) {
    return section;
  }
  const next = cells.map((cell) => ({ ...cell, elements: cell.elements.filter((element) => element.id !== found.element.id) }));
  next[column]!.elements.splice(index, 0, found.element);
  return withCells(section, next);
}

/** Can `elementId` go to `toColumn` at all (false when it's unknown or that column is full)? */
export function canMoveLayoutElementTo(section: TemplateSectionNode, elementId: string, toColumn: number): boolean {
  const found = findLayoutElement(section, elementId);
  if (!found || !Number.isFinite(toColumn)) return false;
  const cells = cellsOf(section);
  const column = Math.min(Math.max(0, Math.trunc(toColumn)), cells.length - 1);
  return column === found.cellIndex || cells[column]!.elements.length < MAX_ELEMENTS_PER_COLUMN;
}

// ─── Drag and drop geometry (the builder) ────────────────────────────────────

export interface DropRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * The column under (or nearest to) a pointer: columns side by side, stacked on phones, or in a grid. Columns whose
 * width spans the pointer win (a short column still takes a drop below its last element); among them, and when the
 * pointer is in a gap between columns, the nearest one. -1: none.
 */
export function nearestDropColumn(rects: DropRect[], x: number, y: number): number {
  let best = -1;
  let bestDistance = Infinity;
  const spanning = rects.some((rect) => x >= rect.left && x <= rect.right);
  rects.forEach((rect, index) => {
    if (spanning && (x < rect.left || x > rect.right)) return;
    const dx = Math.max(rect.left - x, 0, x - rect.right);
    const dy = Math.max(rect.top - y, 0, y - rect.bottom);
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

/** The gap a pointer points at in a column, from the vertical middles of its elements (top to bottom). */
export function dropIndexAt(middles: number[], y: number): number {
  const index = middles.findIndex((middle) => y < middle);
  return index === -1 ? middles.length : index;
}

export function removeLayoutElement(section: TemplateSectionNode, elementId: string): TemplateSectionNode {
  const cells = cellsOf(section);
  return withCells(section, cells.map((cell) => ({ ...cell, elements: cell.elements.filter((element) => element.id !== elementId) })));
}

/** A copy of an element right below it, with a new id. */
export function duplicateLayoutElement(section: TemplateSectionNode, elementId: string, newId: string): TemplateSectionNode {
  const found = findLayoutElement(section, elementId);
  if (!found || found.count >= MAX_ELEMENTS_PER_COLUMN) return section;
  const cells = cellsOf(section);
  const elements = [...cells[found.cellIndex]!.elements];
  elements.splice(found.index + 1, 0, { ...JSON.parse(JSON.stringify(found.element)), id: newId });
  return withCells(section, cells.map((cell, index) => (index === found.cellIndex ? { ...cell, elements } : cell)));
}

/** Short name of an element for lists (sections tree, inspector). */
export function layoutElementLabel(element: LayoutElement): string {
  const own = element.type === "heading" || element.type === "text" ? text(element.text).trim() : element.type === "button" ? text(element.label).trim() : "";
  const label = layoutElementMeta(element.type)?.label ?? "Element";
  if (!own) return label;
  return own.length > 32 ? `${own.slice(0, 30)}…` : own;
}
