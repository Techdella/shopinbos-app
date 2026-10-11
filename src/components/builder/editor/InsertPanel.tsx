"use client";

import { forwardRef, useState } from "react";
import { cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { SectionPreviewPopover } from "@/components/builder/SectionPreview";
import { insertOptions, type RendererKind, type SectionGroup } from "./editor-logic";
import { PanelHeading, PillGroup } from "./ui";

export interface InsertPanelProps {
  renderer: RendererKind;
  target: SectionGroup;
  existingKinds: string[];
  /** Name of the section new sections go after, for the hint line. */
  placeLabel: string;
  onInsert: (kind: string) => void;
  selectedName: string | null;
  elements: Array<{ id: string; label: string }>;
  onAddElement: (id: string) => void;
  onClose: () => void;
  tab: "section" | "element";
  onTab: (tab: "section" | "element") => void;
}

export const InsertPanel = forwardRef<HTMLInputElement, InsertPanelProps>(function InsertPanel(props, searchRef) {
  const [query, setQuery] = useState("");
  const groups = insertOptions({ renderer: props.renderer, target: props.target, existingKinds: props.existingKinds, query });
  const q = query.trim().toLowerCase();
  const elements = props.elements.filter((element) => !q || element.label.toLowerCase().includes(q));
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeading title={<>Insert <span className="font-normal text-app-ink-soft">on page</span></>} onClose={props.onClose} />
      <div className="px-4">
        <PillGroup
          label="Insert"
          value={props.tab}
          onChange={props.onTab}
          options={[{ value: "section", label: "Section" }, { value: "element", label: "Element" }]}
        />
        <label className="mt-3 flex h-10 items-center gap-2 rounded-[12px] border border-app-line bg-white px-3 focus-within:border-[#2F66F6]">
          <Icon name="search" size={15} className="shrink-0 text-app-ink-faint" />
          <span className="sr-only">Search</span>
          <input ref={searchRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" className="h-full min-w-0 flex-1 bg-transparent text-[13.5px] text-app-ink outline-none placeholder:text-app-ink-faint" />
          <kbd className="hidden shrink-0 rounded-[6px] bg-app-canvas px-1.5 py-0.5 font-sans text-[11px] font-semibold text-app-ink-soft sm:inline">{isMac ? "⌘F" : "Ctrl F"}</kbd>
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4 pt-2">
        {props.tab === "section" ? (
          <>
            <p className="px-2 pb-1 text-[12px] text-app-ink-soft">{props.placeLabel}</p>
            {groups.length === 0 ? (
              <p className="px-2 py-4 text-[13px] text-app-ink-soft">{q ? "Nothing matches that search." : "Nothing else fits here."}</p>
            ) : groups.map((group) => (
              <section key={group.group} aria-label={group.group} className="pt-2">
                <h3 className="px-2 pb-1 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-app-ink-faint">{group.group}</h3>
                <ul className="m-0 list-none p-0">
                  {group.items.map((item) => (
                    <li key={item.kind}>
                      <SectionPreviewPopover section={{ id: item.kind, label: item.label }} position="right">
                        <button type="button" onClick={() => props.onInsert(item.kind)} className="flex min-h-10 w-full items-center gap-3 rounded-[10px] px-2 text-left hover:bg-app-canvas" title={item.hint}>
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] bg-[#EAF0FF] text-[#2F66F6]"><Icon name="plus" size={14} /></span>
                          <span className="min-w-0">
                            <span className="block truncate text-[13.5px] font-medium text-app-ink">{item.label}</span>
                          </span>
                        </button>
                      </SectionPreviewPopover>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </>
        ) : !props.selectedName ? (
          <p className="px-2 py-4 text-[13px] leading-5 text-app-ink-soft">Select a section first. Elements are added inside the selected section.</p>
        ) : elements.length === 0 ? (
          <p className="px-2 py-4 text-[13px] leading-5 text-app-ink-soft">{q ? "Nothing matches that search." : `${props.selectedName} doesn't take extra elements. Edit its content in the panel on the right.`}</p>
        ) : (
          <>
            <p className="px-2 pb-1 text-[12px] text-app-ink-soft">Adds to {props.selectedName}</p>
            <ul className="m-0 list-none p-0">
              {elements.map((element) => (
                <li key={element.id}>
                  <button type="button" onClick={() => props.onAddElement(element.id)} className={cx("flex min-h-10 w-full items-center gap-3 rounded-[10px] px-2 text-left hover:bg-app-canvas")}>
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] bg-[#EAF0FF] text-[#2F66F6]"><Icon name="plus" size={14} /></span>
                    <span className="truncate text-[13.5px] font-medium text-app-ink">{element.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
});
