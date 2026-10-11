"use client";

import { useState, type DragEvent, type KeyboardEvent } from "react";
import { cx } from "@/components/app-ui";
import { Icon, type IconName } from "@/components/ui/Icon";
import type { TemplateSectionNode } from "@/lib/store-templates";
import { GROUP_LABELS, groupSections, sectionBlocks, type SectionBlockRow, type SectionGroup } from "./editor-logic";

const KIND_ICONS: Record<string, IconName> = {
  "announcement-bar": "megaphone",
  header: "list",
  footer: "list",
  "hero-split": "image",
  "payday-countdown": "clock",
  "featured-products": "bag",
  "category-grid": "grid",
  "category-list": "grid",
  testimonials: "star",
  "story-split": "image",
  faq: "info",
  newsletter: "mail",
  "contact-form": "chat",
  "product-detail": "tag",
  "cart-summary": "cart",
  "checkout-form": "card",
  "wishlist-grid": "heart",
};

const BLOCK_ICONS: Record<SectionBlockRow["icon"], IconName> = { text: "edit", button: "link", image: "image", item: "dot" };

export function sectionIcon(kind: string): IconName {
  return KIND_ICONS[kind] ?? "layers";
}

export interface SectionsPanelProps {
  pageTitle: string;
  sections: TemplateSectionNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSelectBlock: (sectionId: string, block: SectionBlockRow) => void;
  onToggleHidden: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onDrop: (id: string, targetId: string, place: "before" | "after") => void;
  onAddSection: (group: SectionGroup, beforeId: string | null) => void;
  onAddBlock: (sectionId: string) => void;
  canAddBlock: (section: TemplateSectionNode) => boolean;
  canAddToHeader: boolean;
}

export function SectionsPanel(props: SectionsPanelProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<{ id: string; place: "before" | "after" } | null>(null);
  const groups = groupSections(props.sections);
  const dragGroup = dragId ? groups.find((entry) => entry.sections.some((section) => section.id === dragId))?.group : null;

  const isOpen = (id: string) => expanded[id] ?? id === props.selectedId;

  const onRowKey = (event: KeyboardEvent, section: TemplateSectionNode) => {
    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      props.onMove(section.id, event.key === "ArrowUp" ? "up" : "down");
    }
  };

  const onDragOver = (event: DragEvent, section: TemplateSectionNode, group: SectionGroup) => {
    if (!dragId || dragGroup !== group || dragId === section.id) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    setDropHint({ id: section.id, place: event.clientY < rect.top + rect.height / 2 ? "before" : "after" });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <h2 className="truncate px-4 pb-1 pt-4 text-[16px] font-bold text-app-ink">{props.pageTitle}</h2>
      <p className="sr-only">Drag sections to reorder them, or select one and press Alt with the arrow keys.</p>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {groups.map(({ group, sections }) => (
          <section key={group} aria-label={GROUP_LABELS[group]} className="pt-3">
            <h3 className="px-2 pb-1 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-app-ink-faint">{GROUP_LABELS[group]}</h3>
            <ul className="m-0 list-none p-0">
              {sections.map((section) => {
                const blocks = sectionBlocks(section);
                const open = isOpen(section.id) && blocks.length > 0;
                const selected = props.selectedId === section.id;
                const hidden = section.visible === false;
                return (
                  <li
                    key={section.id}
                    className="relative"
                    onDragOver={(event) => onDragOver(event, section, group)}
                    onDragLeave={() => setDropHint((hint) => (hint?.id === section.id ? null : hint))}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (dragId && dropHint) props.onDrop(dragId, dropHint.id, dropHint.place);
                      setDragId(null);
                      setDropHint(null);
                    }}
                  >
                    {dropHint?.id === section.id ? <span aria-hidden className={cx("absolute inset-x-2 z-10 h-0.5 rounded-full bg-[#2F66F6]", dropHint.place === "before" ? "top-0" : "bottom-0")} /> : null}
                    <div
                      draggable
                      onDragStart={(event) => { setDragId(section.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", section.id); }}
                      onDragEnd={() => { setDragId(null); setDropHint(null); }}
                      className={cx(
                        "group flex min-h-10 items-center gap-1 rounded-[10px] pr-1 transition",
                        selected ? "bg-[#EAF0FF]" : "hover:bg-app-canvas",
                        dragId === section.id && "opacity-50",
                      )}
                    >
                      <button
                        type="button"
                        aria-label={open ? `Collapse ${section.name}` : `Expand ${section.name}`}
                        aria-expanded={open}
                        disabled={!blocks.length}
                        onClick={() => setExpanded((prev) => ({ ...prev, [section.id]: !open }))}
                        className="grid h-8 w-6 shrink-0 place-items-center text-app-ink-faint disabled:invisible"
                      >
                        <Icon name="chevRight" size={13} className={cx("transition", open && "rotate-90")} />
                      </button>
                      <button
                        type="button"
                        onClick={() => props.onSelect(section.id)}
                        onKeyDown={(event) => onRowKey(event, section)}
                        aria-current={selected ? "true" : undefined}
                        className={cx("flex min-h-10 min-w-0 flex-1 items-center gap-2.5 text-left text-[13.5px]", selected ? "font-semibold text-[#2F66F6]" : "font-medium text-app-ink", hidden && "opacity-50")}
                      >
                        <Icon name={sectionIcon(section.kind)} size={15} className="shrink-0" />
                        <span className="truncate">{section.name}</span>
                      </button>
                      <button
                        type="button"
                        aria-label={hidden ? `Show ${section.name}` : `Hide ${section.name}`}
                        title={hidden ? "Show" : "Hide"}
                        aria-pressed={hidden}
                        onClick={() => props.onToggleHidden(section.id)}
                        className={cx(
                          "relative grid h-8 w-8 shrink-0 place-items-center rounded-[8px] text-app-ink-soft hover:bg-white hover:text-app-ink focus-visible:opacity-100",
                          hidden ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                        )}
                      >
                        <Icon name="eye" size={15} />
                        {hidden ? <span aria-hidden className="absolute h-[1.5px] w-4 rotate-45 bg-current" /> : null}
                      </button>
                    </div>
                    {open ? (
                      <ul className="m-0 list-none py-0.5 pl-9 pr-1">
                        {blocks.map((block) => (
                          <li key={block.id}>
                            <button type="button" onClick={() => props.onSelectBlock(section.id, block)} className="flex min-h-8 w-full items-center gap-2 rounded-[8px] px-2 text-left text-[13px] text-app-ink-soft hover:bg-app-canvas hover:text-app-ink">
                              <Icon name={BLOCK_ICONS[block.icon]} size={13} className="shrink-0" />
                              <span className="truncate">{block.label}</span>
                            </button>
                          </li>
                        ))}
                        {props.canAddBlock(section) ? (
                          <li>
                            <button type="button" onClick={() => props.onAddBlock(section.id)} className="flex min-h-8 items-center gap-2 rounded-[8px] px-2 text-[13px] font-semibold text-[#2F66F6] hover:bg-[#EAF0FF]">
                              <Icon name="plus" size={13} /> Add block
                            </button>
                          </li>
                        ) : null}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {group === "template" || (group === "header" && props.canAddToHeader) ? (
              <button
                type="button"
                onClick={() => props.onAddSection(group, null)}
                className="ml-1 mt-0.5 flex min-h-9 items-center gap-2 rounded-[8px] px-2 text-[13.5px] font-semibold text-[#2F66F6] hover:bg-[#EAF0FF]"
              >
                <Icon name="plus" size={14} /> Add section
              </button>
            ) : null}
            {group === "template" && sections.length === 0 ? <p className="px-2 py-1 text-[12.5px] text-app-ink-soft">No sections on this page yet.</p> : null}
          </section>
        ))}
      </div>
    </div>
  );
}
