"use client";

import { forwardRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import type { ColumnPresetId } from "@/components/storefront/boutique/blocks/layout-logic";
import { insertOptions, type RendererKind, type SectionGroup } from "./editor-logic";
import { addableThumb, InsertCardGrid, InsertGroupHeading, layoutCards } from "./InsertCards";
import { PanelHeading, PillGroup } from "./ui";
import { useEditorT } from "./i18n";

export interface InsertPanelProps {
  renderer: RendererKind;
  target: SectionGroup;
  existingKinds: string[];
  /** Name of the section new sections go after, for the hint line. */
  placeLabel: string;
  onInsert: (kind: string) => void;
  /** Rows, columns and grids (2026 themes only). */
  onInsertLayout?: (preset: ColumnPresetId) => void;
  selectedName: string | null;
  elements: Array<{ id: string; label: string }>;
  onAddElement: (id: string) => void;
  onClose: () => void;
  tab: "section" | "element";
  onTab: (tab: "section" | "element") => void;
}

export const InsertPanel = forwardRef<HTMLInputElement, InsertPanelProps>(function InsertPanel(props, searchRef) {
  const { t, tx } = useEditorT();
  const [query, setQuery] = useState("");
  const groups = insertOptions({ renderer: props.renderer, target: props.target, existingKinds: props.existingKinds, query });
  const q = query.trim().toLowerCase();
  const layouts = props.onInsertLayout && props.renderer === "boutique" && props.target === "template" ? layoutCards(query, props.onInsertLayout) : [];
  const elements = props.elements.filter((element) => !q || element.label.toLowerCase().includes(q));
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeading title={<>{tx("Insert")} <span className="font-normal text-app-ink-soft">{tx("on page")}</span></>} onClose={props.onClose} />
      <div className="px-4">
        <PillGroup
          label="Insert"
          value={props.tab}
          onChange={props.onTab}
          options={[{ value: "section", label: "Section" }, { value: "element", label: "Element" }]}
        />
        <label className="mt-3 flex h-10 items-center gap-2 rounded-[12px] border border-app-line bg-white px-3 focus-within:border-[#2F66F6]">
          <Icon name="search" size={15} className="shrink-0 text-app-ink-faint" />
          <span className="sr-only">{tx("Search")}</span>
          <input ref={searchRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tx("Search")} className="h-full min-w-0 flex-1 bg-transparent text-[13.5px] text-app-ink outline-none placeholder:text-app-ink-faint" />
          <kbd className="hidden shrink-0 rounded-[6px] bg-app-canvas px-1.5 py-0.5 font-sans text-[11px] font-semibold text-app-ink-soft sm:inline">{isMac ? "⌘F" : "Ctrl F"}</kbd>
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-2">
        {props.tab === "section" ? (
          <>
            <p className="px-1 pb-1 text-[12px] text-app-ink-soft">{props.placeLabel}</p>
            {groups.length === 0 && layouts.length === 0 ? (
              <p className="px-1 py-4 text-[13px] text-app-ink-soft">{q ? tx("Nothing matches that search.") : tx("Nothing else fits here.")}</p>
            ) : null}
            {layouts.length ? (
              <section aria-label={tx("Layout")} className="pt-2">
                <InsertGroupHeading>{tx("Layout")}</InsertGroupHeading>
                <InsertCardGrid items={layouts} dense />
              </section>
            ) : null}
            {groups.map((group) => (
              <section key={group.group} aria-label={tx(group.group)} className="pt-3">
                <InsertGroupHeading>{tx(group.group)}</InsertGroupHeading>
                <InsertCardGrid items={group.items.map((item) => ({ key: item.kind, thumb: item.kind, label: item.label, hint: item.hint, onPick: () => props.onInsert(item.kind) }))} />
              </section>
            ))}
          </>
        ) : !props.selectedName ? (
          <p className="px-1 py-4 text-[13px] leading-5 text-app-ink-soft">{tx("Select a section first. Elements are added inside the selected section.")}</p>
        ) : elements.length === 0 ? (
          <p className="px-1 py-4 text-[13px] leading-5 text-app-ink-soft">{q ? tx("Nothing matches that search.") : t("edk.noElements", { name: tx(props.selectedName) })}</p>
        ) : (
          <>
            <p className="px-1 pb-2 text-[12px] text-app-ink-soft">{t("edk.addsTo", { name: tx(props.selectedName) })}</p>
            <InsertCardGrid dense items={elements.map((element) => ({ key: element.id, thumb: addableThumb(element.id), label: element.label, onPick: () => props.onAddElement(element.id) }))} />
          </>
        )}
      </div>
    </div>
  );
});
