"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/app-ui";
import {
  MAX_MENU_ITEMS,
  MENU_PAGE_LABELS,
  addMenuItems,
  menuTargets,
  canIndentMenuItem,
  contentRefName,
  countMenuItems,
  indentMenuItem,
  moveMenuItem,
  outdentMenuItem,
  placeMenuItem,
  removeMenuItem,
  safeMenuUrl,
  updateMenuItem,
  type MenuItem,
} from "@/lib/storefront/menu";
import { useEditorT } from "./i18n";
import type { BuilderProduct } from "./useBuilder";
import { inputClass } from "./ui";

// The header's menu, edited like a classic WordPress menu: tick pages, categories or products (or type your own link)
// and "Add to menu"; then each item can be renamed, moved up or down, tucked under the item above it as a dropdown
// (→) or taken back out (←), dragged into place, or removed.

type Source = "pages" | "categories" | "products" | "link";

const KIND_LABEL: Record<MenuItem["kind"], string> = { page: "Page", category: "Category", product: "Product", content: "Content", link: "Custom link" };

/** `flat`: one level only (footer links): no dropdowns. */
export function MenuField({ value, onChange, pageTypes, products, flat = false }: { value: MenuItem[]; onChange: (menu: MenuItem[]) => void; pageTypes: string[]; products: BuilderProduct[]; flat?: boolean }) {
  const { tx } = useEditorT();
  const [source, setSource] = useState<Source | null>("pages");
  const [ticked, setTicked] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkText, setLinkText] = useState("");
  const [linkError, setLinkError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const full = countMenuItems(value) >= MAX_MENU_ITEMS;

  const pages = useMemo(() => {
    const has = new Set(["home", ...pageTypes.map((page) => (page === "shop" ? "products" : page))]);
    return Object.keys(MENU_PAGE_LABELS).filter((page) => has.has(page) || page === "cart" || page === "track-order").map((page) => ({ key: page, label: MENU_PAGE_LABELS[page]! }));
  }, [pageTypes]);
  const categories = useMemo(() => {
    const map = new Map<string, string>();
    for (const product of products) if (product.category?.slug) map.set(product.category.slug, product.category.name);
    return [...map.entries()].map(([key, label]) => ({ key, label }));
  }, [products]);
  const productOptions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products.filter((product) => !needle || product.name.toLowerCase().includes(needle)).slice(0, 30).map((product) => ({ key: product.id, label: product.name }));
  }, [products, query]);

  const nameOf = (item: MenuItem) => {
    if (item.label.trim()) return item.label;
    if (item.kind === "page") return MENU_PAGE_LABELS[item.ref ?? ""] ?? item.ref ?? "";
    if (item.kind === "category") return categories.find((entry) => entry.key === item.ref)?.label ?? item.ref ?? "";
    if (item.kind === "product") return products.find((entry) => entry.id === item.ref)?.name ?? tx("Removed product");
    if (item.kind === "content") return contentRefName(item.ref ?? "");
    return item.url ?? "";
  };
  const originalName = (item: MenuItem) => nameOf({ ...item, label: "" });

  const pick = (key: string) => setTicked((list) => (list.includes(key) ? list.filter((entry) => entry !== key) : [...list, key]));
  const openSource = (next: Source) => {
    setSource(source === next ? null : next);
    setTicked([]);
  };
  const addTicked = () => {
    const kind = source === "pages" ? "page" : source === "categories" ? "category" : "product";
    onChange(addMenuItems(value, ticked.map((ref) => ({ kind, ref, label: "" }))));
    setTicked([]);
  };
  const addLink = () => {
    const url = safeMenuUrl(linkUrl);
    if (!url) return setLinkError(tx("Type a web address, like https://instagram.com/yourshop"));
    if (!linkText.trim()) return setLinkError(tx("Give the link a name shoppers will read"));
    onChange(addMenuItems(value, [{ kind: "link", url, label: linkText.trim().slice(0, 60), newTab: !url.startsWith("/") }]));
    setLinkUrl("");
    setLinkText("");
    setLinkError("");
  };

  const options = source === "pages" ? pages : source === "categories" ? categories : source === "products" ? productOptions : [];
  // What's already in the menu shows as added, so it can't be added twice (Select all skips it too).
  const sourceKind = source === "pages" ? "page" : source === "categories" ? "category" : "product";
  const inMenu = useMemo(() => menuTargets(value), [value]);
  const added = (key: string) => inMenu.has(`${sourceKind}:${key}`);
  const addable = options.filter((option) => !added(option.key));
  const sourceTabs: Array<{ id: Source; label: string }> = [
    { id: "pages", label: "Pages" },
    { id: "categories", label: "Categories" },
    { id: "products", label: "Products" },
    { id: "link", label: "Custom link" },
  ];

  const row = (item: MenuItem, depth: 0 | 1, index: number, siblings: MenuItem[], parentId: string | null) => {
    const open = openId === item.id;
    const name = nameOf(item);
    return (
      <li
        key={item.id}
        draggable
        onDragStart={(event) => {
          event.stopPropagation();
          setDragId(item.id);
          event.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => setDragId(null)}
        onDragOver={(event) => {
          if (dragId && dragId !== item.id) event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!dragId || dragId === item.id) return;
          // Dropped on an item: goes just before it, at its level.
          onChange(placeMenuItem(value, dragId, { parentId, index }));
          setDragId(null);
        }}
        className={cx("rounded-[10px] border bg-white", depth ? "ml-6" : "", dragId === item.id ? "opacity-40" : "", "border-app-line")}
      >
        <div className="flex min-h-11 items-center gap-1.5 pl-2 pr-1">
          <span aria-hidden className="cursor-grab text-app-ink-faint" title={tx("Drag to move")}><Icon name="dots" size={14} /></span>
          <button type="button" onClick={() => setOpenId(open ? null : item.id)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left">
            <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-app-ink">{name}</span>
            <span className="shrink-0 text-[11px] text-app-ink-soft">{depth ? tx("Sub-item") : tx(KIND_LABEL[item.kind])}</span>
            <Icon name="chevDown" size={14} className={cx("shrink-0 text-app-ink-soft transition-transform", open && "rotate-180")} />
          </button>
        </div>
        {open ? (
          <div className="grid gap-2.5 border-t border-app-line px-3 pb-3 pt-2.5">
            <label className="grid gap-1 text-[12px] font-semibold text-app-ink-soft">
              {tx("Name in the menu")}
              <input className={inputClass} value={item.label} maxLength={60} placeholder={originalName(item)} onChange={(event) => onChange(updateMenuItem(value, item.id, { label: event.target.value }))} />
            </label>
            {item.kind === "link" ? (
              <>
                <label className="grid gap-1 text-[12px] font-semibold text-app-ink-soft">
                  {tx("Web address")}
                  <input
                    className={inputClass}
                    defaultValue={item.url}
                    onBlur={(event) => {
                      const url = safeMenuUrl(event.target.value);
                      if (url) onChange(updateMenuItem(value, item.id, { url }));
                      else event.target.value = item.url ?? "";
                    }}
                  />
                </label>
                <label className="flex items-center gap-2 text-[12.5px] text-app-ink">
                  <input type="checkbox" checked={Boolean(item.newTab)} onChange={(event) => onChange(updateMenuItem(value, item.id, { newTab: event.target.checked }))} />
                  {tx("Open in a new tab")}
                </label>
              </>
            ) : (
              <p className="m-0 text-[12px] text-app-ink-soft">{tx(KIND_LABEL[item.kind])}: {originalName(item)}</p>
            )}
            <div className="flex flex-wrap gap-1.5">
              <MoveButton icon="arrowUp" label={tx("Move up")} disabled={index === 0} onClick={() => onChange(moveMenuItem(value, item.id, -1))} />
              <MoveButton icon="arrowDown" label={tx("Move down")} disabled={index === siblings.length - 1} onClick={() => onChange(moveMenuItem(value, item.id, 1))} />
              {flat ? null : depth === 0 ? (
                <MoveButton icon="chevRight" label={tx("Under the item above")} disabled={!canIndentMenuItem(value, item.id)} onClick={() => onChange(indentMenuItem(value, item.id))} />
              ) : (
                <MoveButton icon="arrowLeft" label={tx("Out of the dropdown")} onClick={() => onChange(outdentMenuItem(value, item.id))} />
              )}
              <button type="button" onClick={() => onChange(removeMenuItem(value, item.id))} className="ml-auto inline-flex min-h-8 items-center gap-1 rounded-full px-2.5 text-[12.5px] font-semibold text-[#C2412D] hover:bg-[#FDECEA]">
                <Icon name="trash" size={13} /> {tx("Remove")}
              </button>
            </div>
          </div>
        ) : null}
        {depth === 0 && item.children?.length ? (
          <ul className="grid gap-1.5 pb-2 pr-2">{item.children.map((child, childIndex) => row(child, 1, childIndex, item.children!, item.id))}</ul>
        ) : null}
      </li>
    );
  };

  return (
    <div className="grid gap-4 py-2">
      <div>
        <p className="mb-2 text-[12.5px] font-semibold text-app-ink">{tx("Add menu items")}</p>
        <div className="overflow-hidden rounded-[12px] border border-app-line">
          {sourceTabs.map((tab) => {
            const open = source === tab.id;
            return (
              <div key={tab.id} className="border-b border-app-line last:border-b-0">
                <button type="button" aria-expanded={open} onClick={() => openSource(tab.id)} className={cx("flex min-h-10 w-full items-center justify-between px-3 text-left text-[13px] font-semibold", open ? "bg-app-canvas text-app-ink" : "text-app-ink")}>
                  {tx(tab.label)}
                  <Icon name="chevDown" size={14} className={cx("transition-transform", open && "rotate-180")} />
                </button>
                {open ? (
                  tab.id === "link" ? (
                    <div className="grid gap-2 px-3 pb-3 pt-1">
                      <input className={inputClass} value={linkUrl} placeholder="https://" aria-label={tx("Web address")} onChange={(event) => setLinkUrl(event.target.value)} />
                      <input className={inputClass} value={linkText} maxLength={60} placeholder={tx("Link text, e.g. Instagram")} aria-label={tx("Link text")} onChange={(event) => setLinkText(event.target.value)} />
                      {linkError ? <p className="m-0 text-[12px] text-[#C2412D]">{linkError}</p> : null}
                      <button type="button" disabled={full} onClick={addLink} className="justify-self-end rounded-full bg-app-ink px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50">{tx("Add to menu")}</button>
                    </div>
                  ) : (
                    <div className="grid gap-2 px-3 pb-3 pt-1">
                      {tab.id === "products" ? <input className={inputClass} value={query} placeholder={tx("Search products")} aria-label={tx("Search products")} onChange={(event) => setQuery(event.target.value)} /> : null}
                      {options.length ? (
                        <ul className="grid max-h-[220px] gap-0.5 overflow-y-auto">
                          {options.map((option) => (
                            <li key={option.key}>
                              <label className="flex min-h-9 cursor-pointer items-center gap-2 rounded-[8px] px-1.5 text-[13px] text-app-ink hover:bg-app-canvas">
                                <input type="checkbox" checked={added(option.key) || ticked.includes(option.key)} disabled={added(option.key)} onChange={() => pick(option.key)} />
                                <span className={cx("truncate", added(option.key) && "text-app-ink-soft")}>{tx(option.label)}</span>
                                {added(option.key) ? <span className="ml-auto shrink-0 text-[11px] text-app-ink-soft">{tx("In menu")}</span> : null}
                              </label>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="m-0 text-[12.5px] text-app-ink-soft">{tab.id === "categories" ? tx("Give your products categories first.") : tx("Nothing to add yet.")}</p>
                      )}
                      <div className="flex items-center justify-between gap-2">
                        <button type="button" onClick={() => setTicked(ticked.length === addable.length ? [] : addable.map((option) => option.key))} className="text-[12px] font-semibold text-app-ink-soft underline-offset-2 hover:underline" disabled={!addable.length}>
                          {ticked.length && ticked.length === addable.length ? tx("Clear") : tx("Select all")}
                        </button>
                        <button type="button" disabled={!ticked.length || full} onClick={addTicked} className="rounded-full bg-app-ink px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50">{tx("Add to menu")}</button>
                      </div>
                    </div>
                  )
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <p className="mb-1 text-[12.5px] font-semibold text-app-ink">{tx("Menu structure")}</p>
        <p className="mb-2 text-[11.5px] leading-4 text-app-ink-soft">{tx("Drag items to order them. Open an item to rename it or put it under the item above, so it shows in a dropdown.")}</p>
        {value.length ? (
          <ul
            className="grid gap-1.5"
            onDragOver={(event) => dragId && event.preventDefault()}
            onDrop={(event) => {
              // Dropped below the last item: goes to the end, at the top level.
              event.preventDefault();
              if (dragId) onChange(placeMenuItem(value, dragId, { parentId: null, index: value.length }));
              setDragId(null);
            }}
          >
            {value.map((item, index) => row(item, 0, index, value, null))}
          </ul>
        ) : (
          <p className="m-0 rounded-[10px] border border-dashed border-app-line px-3 py-4 text-center text-[12.5px] text-app-ink-soft">{tx("Your menu is empty. Add pages above.")}</p>
        )}
        {full ? <p className="mt-2 text-[12px] text-app-ink-soft">{tx("Menus hold up to 40 items.")}</p> : null}
      </div>
    </div>
  );
}

function MoveButton({ icon, label, onClick, disabled }: { icon: "arrowUp" | "arrowDown" | "chevRight" | "arrowLeft"; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={label} className="inline-flex min-h-8 items-center gap-1 rounded-full border border-app-line px-2.5 text-[12px] font-semibold text-app-ink disabled:opacity-40">
      <Icon name={icon} size={13} /> {label}
    </button>
  );
}
