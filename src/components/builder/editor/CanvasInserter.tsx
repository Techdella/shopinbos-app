"use client";

// The canvas "+" inserter (Elementor style): opens where the seller clicked "+" between two sections (or in a
// column) with Sections, Layout and Elements tabs. Whatever is picked goes in at that spot.

import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import type { ColumnPresetId, LayoutElementType } from "@/components/storefront/boutique/blocks/layout-logic";
import { insertOptions, type RendererKind } from "./editor-logic";
import { elementCards, InsertCardGrid, InsertGroupHeading, layoutCards } from "./InsertCards";
import { IconButton } from "./ui";
import { useEditorT } from "./i18n";

export type InserterTab = "sections" | "layout" | "elements";

export interface CanvasInserterProps {
  renderer: RendererKind;
  existingKinds: string[];
  /** "column" adds an element into one column of a row: only the Elements tab. */
  mode: "slot" | "column";
  /** Shown under the tabs: where the pick goes. */
  placeLabel: string;
  onInsertSection: (kind: string) => void;
  onInsertLayout: (preset: ColumnPresetId) => void;
  onInsertElement: (type: LayoutElementType) => void;
  onClose: () => void;
}

const TABS: Array<{ id: InserterTab; label: string }> = [
  { id: "sections", label: "Sections" },
  { id: "layout", label: "Layout" },
  { id: "elements", label: "Elements" },
];

export function CanvasInserter(props: CanvasInserterProps) {
  const { tx } = useEditorT();
  const [tab, setTab] = useState<InserterTab>(props.mode === "column" ? "elements" : "sections");
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const { onClose } = props;

  useEffect(() => {
    searchRef.current?.focus({ preventScroll: true });
  }, [tab]);

  // Escape or a click anywhere else closes it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    const onDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, [onClose]);

  const tabs = props.mode === "column" ? TABS.filter((entry) => entry.id === "elements") : props.renderer === "boutique" ? TABS : TABS.filter((entry) => entry.id === "sections");
  const groups = tab === "sections" ? insertOptions({ renderer: props.renderer, target: "template", existingKinds: props.existingKinds, query }) : [];
  const layouts = tab === "layout" ? layoutCards(query, props.onInsertLayout) : [];
  const elements = tab === "elements" ? elementCards(query, props.onInsertElement) : [];
  const empty = tab === "sections" ? groups.length === 0 : tab === "layout" ? layouts.length === 0 : elements.length === 0;

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label={tx("Add to the page")}
      className="flex max-h-[min(460px,70vh)] w-full flex-col overflow-hidden rounded-[16px] border border-app-line bg-white font-app text-app-ink shadow-[0_18px_50px_rgba(22,20,31,.22)]"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-2 px-3 pt-3">
        {tabs.length > 1 ? (
          <div role="tablist" aria-label={tx("Add to the page")} className="flex min-w-0 flex-1 gap-1 rounded-full bg-app-canvas p-1">
            {tabs.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={tab === entry.id}
                onClick={() => setTab(entry.id)}
                className={cx("min-h-8 flex-1 rounded-full px-2 text-[13px] font-semibold", tab === entry.id ? "bg-white text-app-ink shadow-[0_1px_3px_rgba(22,20,31,.12)]" : "text-app-ink-soft hover:text-app-ink")}
              >
                {tx(entry.label)}
              </button>
            ))}
          </div>
        ) : (
          <p className="min-w-0 flex-1 text-[14px] font-bold">{tx("Add an element")}</p>
        )}
        <IconButton icon="x" label="Close" onClick={props.onClose} className="h-8 w-8" />
      </div>
      <label className="mx-3 mt-2 flex h-9 items-center gap-2 rounded-[10px] border border-app-line bg-white px-3 focus-within:border-[#2F66F6]">
        <Icon name="search" size={14} className="shrink-0 text-app-ink-faint" />
        <span className="sr-only">{tx("Search")}</span>
        <input ref={searchRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tx("Search")} className="h-full min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-app-ink-faint" />
      </label>
      <p className="px-3 pt-1.5 text-[11.5px] text-app-ink-soft">{props.placeLabel}</p>
      <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-1">
        {empty ? <p className="py-4 text-[13px] text-app-ink-soft">{query.trim() ? tx("Nothing matches that search.") : tx("Nothing else fits here.")}</p> : null}
        {groups.map((group) => (
          <section key={group.group} aria-label={tx(group.group)} className="pt-2">
            <InsertGroupHeading>{tx(group.group)}</InsertGroupHeading>
            <InsertCardGrid items={group.items.map((item) => ({ key: item.kind, thumb: item.kind, label: item.label, hint: item.hint, onPick: () => props.onInsertSection(item.kind) }))} />
          </section>
        ))}
        {layouts.length ? <div className="pt-2"><InsertCardGrid label="Layout" items={layouts} /></div> : null}
        {elements.length ? (
          <div className="pt-2">
            {props.mode === "slot" ? <p className="pb-2 text-[11.5px] leading-4 text-app-ink-soft">{tx("Each element goes in its own one-column row, so you can add more beside it later.")}</p> : null}
            <InsertCardGrid label="Elements" items={elements} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
