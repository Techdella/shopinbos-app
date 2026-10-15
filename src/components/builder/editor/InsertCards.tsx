"use client";

// The thumbnail cards shared by the Insert panel and the canvas "+" inserter: a two-column grid of a wireframe
// picture (insert-thumbnails.tsx) with the name under it and the description as a second line and tooltip.

import type React from "react";
import { cx } from "@/components/app-ui";
import { COLUMN_PRESETS, LAYOUT_ELEMENTS, type ColumnPresetId, type LayoutElementType } from "@/components/storefront/boutique/blocks/layout-logic";
import { InsertThumb } from "./insert-thumbnails";
import { useEditorT } from "./i18n";

export interface InsertCardItem {
  key: string;
  /** insert-thumbnails.tsx key: a section kind, "layout:<preset>" or "element:<type>". */
  thumb: string;
  label: string;
  hint?: string;
  onPick: () => void;
}

export function InsertCardGrid({ items, label, dense = false }: { items: InsertCardItem[]; label?: string; dense?: boolean }) {
  const { tx } = useEditorT();
  return (
    <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0" aria-label={label ? tx(label) : undefined}>
      {items.map((item) => (
        <li key={item.key} className="min-w-0">
          <button
            type="button"
            onClick={item.onPick}
            title={item.hint ? tx(item.hint) : tx(item.label)}
            className={cx(
              "group flex h-full w-full flex-col gap-1.5 rounded-[12px] border border-app-line bg-white p-1.5 text-left transition hover:border-[#2F66F6] hover:shadow-[0_4px_14px_rgba(47,102,246,.12)] focus-visible:border-[#2F66F6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F66F6]/30",
            )}
          >
            <span className="block rounded-[8px] bg-app-canvas px-1.5 py-1 text-app-ink-soft transition group-hover:bg-[#EAF0FF] group-hover:text-[#2F66F6] group-focus-visible:bg-[#EAF0FF] group-focus-visible:text-[#2F66F6]">
              <InsertThumb kind={item.thumb} className="block aspect-[8/5] w-full" />
            </span>
            <span className="min-w-0 px-0.5 pb-0.5">
              <span className="block truncate text-[12.5px] font-semibold leading-4 text-app-ink">{tx(item.label)}</span>
              {item.hint && !dense ? <span className="mt-0.5 line-clamp-2 block text-[11px] leading-[14px] text-app-ink-soft">{tx(item.hint)}</span> : null}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function InsertGroupHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="px-0.5 pb-1.5 pt-1 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-app-ink-faint">{children}</h3>;
}

function matches(query: string, ...words: Array<string | undefined>) {
  const q = query.trim().toLowerCase();
  return !q || words.filter(Boolean).join(" ").toLowerCase().includes(q);
}

/** Rows and grids, as cards. Searching matches the English words (like the section catalogue). */
export function layoutCards(query: string, onPick: (preset: ColumnPresetId) => void): InsertCardItem[] {
  return COLUMN_PRESETS.filter((preset) => matches(query, preset.label, preset.hint, "layout columns row grid")).map((preset) => ({
    key: `layout:${preset.id}`,
    thumb: `layout:${preset.id}`,
    label: preset.label,
    hint: preset.hint,
    onPick: () => onPick(preset.id),
  }));
}

/** The elements a column can hold, as cards. */
export function elementCards(query: string, onPick: (type: LayoutElementType) => void): InsertCardItem[] {
  return LAYOUT_ELEMENTS.filter((element) => matches(query, element.label, element.description, "element")).map((element) => ({
    key: `element:${element.type}`,
    thumb: `element:${element.type}`,
    label: element.label,
    hint: element.description,
    onPick: () => onPick(element.type),
  }));
}

/** Picture for an "Add block" entry of a theme section (the Insert panel's Element tab). */
export function addableThumb(id: string) {
  if (id.startsWith("element:")) return id;
  const map: Record<string, string> = {
    image: "element:image",
    "image-tile": "element:image",
    cta: "element:button",
    "whatsapp-cta": "element:button",
    question: "faq",
    faq: "faq",
    review: "testimonials",
    product: "element:product",
    "product-card": "element:product",
    "text-point": "element:text",
    filter: "element:icon-list",
    option: "element:icon-list",
  };
  return map[id] ?? "element:text";
}
