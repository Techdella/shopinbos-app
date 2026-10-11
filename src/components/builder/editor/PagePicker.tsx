"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { searchPageList, type PageEntry } from "./editor-logic";

export interface PagePickerProps {
  entries: PageEntry[];
  currentId: string;
  currentLabel: string;
  onPick: (entry: PageEntry) => void;
  onAddPage: (title: string) => void;
  onAddPolicyPages: (() => void) | null;
  className?: string;
}

/** "Home page ▾" in the top bar: search the store, drill into products, collections and pages. */
export function PagePicker(props: PagePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<PageEntry | null>(null);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const onDown = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setGroup(null);
      setAdding(false);
      setNewTitle("");
    }
  }, [open]);

  const pick = (entry: PageEntry) => {
    props.onPick(entry);
    setOpen(false);
  };

  const rows = query.trim() ? searchPageList(props.entries, query) : group ? group.children ?? [] : props.entries;

  return (
    <div ref={ref} className={cx("relative min-w-0", props.className)}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex h-10 w-full min-w-0 items-center gap-2 rounded-[12px] border border-app-line bg-white px-3 text-left text-[14px] font-semibold text-app-ink hover:border-app-line-strong"
      >
        <Icon name="home" size={15} className="shrink-0 text-app-ink-soft" />
        <span className="min-w-0 flex-1 truncate">{props.currentLabel}</span>
        <Icon name="chevDown" size={14} className="shrink-0" />
      </button>
      {open ? (
        <div role="dialog" aria-label="Choose a page to edit" className="absolute left-1/2 top-full z-50 mt-2 w-[min(320px,calc(100vw-24px))] -translate-x-1/2 rounded-[18px] border border-app-line bg-white p-2 shadow-[0_18px_50px_rgba(22,20,31,.18)]">
          <label className="flex h-10 items-center gap-2 rounded-[12px] border border-app-line px-3 focus-within:border-[#2F66F6]">
            <Icon name="search" size={15} className="shrink-0 text-app-ink-faint" />
            <span className="sr-only">Search online store</span>
            <input ref={searchRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search online store" className="h-full min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-app-ink-faint" />
          </label>
          {group && !query.trim() ? (
            <button type="button" onClick={() => setGroup(null)} className="mt-1 flex min-h-9 w-full items-center gap-2 rounded-[10px] px-2 text-[13px] font-semibold text-app-ink-soft hover:bg-app-canvas">
              <Icon name="arrowLeft" size={14} /> {group.label}
            </button>
          ) : null}
          <ul className="m-0 mt-1 max-h-[min(360px,60vh)] list-none overflow-y-auto p-0">
            {rows.length === 0 ? <li className="px-3 py-3 text-[13px] text-app-ink-soft">{query.trim() ? "Nothing matches." : "Nothing here yet."}</li> : null}
            {rows.map((entry) => {
              const current = entry.id === props.currentId;
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    aria-current={current ? "page" : undefined}
                    onClick={() => (entry.children ? setGroup(entry) : pick(entry))}
                    className={cx("flex min-h-10 w-full items-center gap-2 rounded-[10px] px-3 text-left text-[14px] text-app-ink", current ? "bg-app-canvas font-semibold" : "hover:bg-app-canvas")}
                  >
                    <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                    {entry.children ? <Icon name="chevRight" size={14} className="shrink-0 text-app-ink-faint" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
          {!group && !query.trim() ? (
            <div className="mt-1 border-t border-app-line pt-1">
              {adding ? (
                <form className="flex items-center gap-2 p-1" onSubmit={(event) => { event.preventDefault(); const title = newTitle.trim(); if (title) { props.onAddPage(title); setOpen(false); } }}>
                  <label className="sr-only" htmlFor="builder-new-page">Page name</label>
                  <input id="builder-new-page" autoFocus value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="Page name, e.g. Size guide" className="h-9 min-w-0 flex-1 rounded-[10px] border border-app-line px-3 text-[13.5px] outline-none focus:border-[#2F66F6]" />
                  <button type="submit" disabled={!newTitle.trim()} className="min-h-9 rounded-full bg-app-ink px-3 text-[13px] font-semibold text-white disabled:opacity-40">Add</button>
                </form>
              ) : (
                <button type="button" onClick={() => setAdding(true)} className="flex min-h-9 w-full items-center gap-2 rounded-[10px] px-3 text-[13.5px] font-semibold text-[#2F66F6] hover:bg-[#EAF0FF]">
                  <Icon name="plus" size={14} /> New page
                </button>
              )}
              {props.onAddPolicyPages ? (
                <button type="button" onClick={() => { props.onAddPolicyPages?.(); setOpen(false); }} className="flex min-h-9 w-full items-center gap-2 rounded-[10px] px-3 text-[13.5px] font-medium text-app-ink hover:bg-app-canvas">
                  <Icon name="shield" size={14} /> Add policy pages
                </button>
              ) : null}
              <a href="/home/cms" className="flex min-h-9 w-full items-center gap-2 rounded-[10px] px-3 text-[13.5px] font-medium text-app-ink hover:bg-app-canvas">
                <Icon name="book" size={14} /> Blog posts
              </a>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
