"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cx, Toggle } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import type { TemplatePageSeed, TemplateSectionNode } from "@/lib/store-templates";
import { normalizeImage } from "@/lib/store-templates/images";
import { SeoTab } from "@/components/seo/SeoTab";
import { normalizeSeo } from "@/lib/seo/fields";
import { insertLabel, setSectionCopy, setSectionSetting, type RendererKind } from "./editor-logic";
import {
  blockVariationsFor,
  fieldVisible,
  readTarget,
  sectionSchema,
  type FieldTarget,
  type SchemaField,
} from "./section-schema";
import type { BuilderProduct } from "./useBuilder";
import { FieldShell, IconButton, inputClass, Menu, MenuItem, PillGroup, textareaClass, pickFile } from "./ui";

export type SectionAction = "duplicate" | "up" | "down" | "hide" | "remove";

type SectionUpdater = (section: TemplateSectionNode) => TemplateSectionNode;

export interface InspectorProps {
  section: TemplateSectionNode | null;
  page: TemplatePageSeed | null;
  renderer: RendererKind;
  themeId: string;
  storeName: string;
  storeHost: string | null;
  products: BuilderProduct[];
  tab: "settings" | "style";
  onTab: (tab: "settings" | "style") => void;
  focusField: string | null;
  onFocusHandled: () => void;
  onChange: (updater: SectionUpdater, key?: string) => void;
  onChangePage: (updater: (page: TemplatePageSeed) => TemplatePageSeed, key?: string) => void;
  onAction: (action: SectionAction) => void;
  canMove: { up: boolean; down: boolean; duplicate: boolean };
  onUpload: (file: File) => Promise<string | null>;
  onOpenThemeSettings: () => void;
  onAddBlock: (blockId: string) => void;
  onClose?: () => void;
  compact?: boolean;
}

function writeTarget(section: TemplateSectionNode, target: FieldTarget, value: unknown): TemplateSectionNode {
  if (target.scope === "copy") return setSectionCopy(section, target.key, value);
  if (target.scope === "settings") return setSectionSetting(section, target.key, value);
  if (target.scope === "styles") return { ...section, styles: { ...(section.styles ?? {}), [target.key]: (value as string) || undefined } };
  return { ...section, background: { ...(section.background ?? {}), [target.key]: (value as string) || undefined } };
}

function str(value: unknown) {
  return typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
}

function itemImage(item: Record<string, unknown>) {
  return str(item.imageUrl) || str(item.resolvedSrc) || str(item.originalSrc);
}

export function Inspector(props: InspectorProps) {
  const { section, page } = props;
  const [renaming, setRenaming] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Clicking a block in the sections tree focuses its field here.
  useEffect(() => {
    if (!props.focusField || !section) return;
    const frame = requestAnimationFrame(() => {
      const target = bodyRef.current?.querySelector<HTMLElement>(`[data-field="${CSS.escape(props.focusField!)}"]`);
      if (target) {
        target.scrollIntoView({ block: "center", behavior: "smooth" });
        target.querySelector<HTMLElement>("input, textarea, select, button")?.focus({ preventScroll: true });
      }
      props.onFocusHandled();
    });
    return () => cancelAnimationFrame(frame);
  }, [props.focusField, section, props]);

  useEffect(() => setRenaming(false), [section?.id]);

  if (!section) return <PageSettings {...props} page={page} />;

  const schema = sectionSchema(section.kind, props.renderer, props.themeId);
  const groups = props.tab === "settings" ? schema.settings : schema.style;
  const key = (field: string) => `${section.id}:${field}`;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start gap-2 px-4 pt-4">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium text-app-ink-soft">Section</p>
          {renaming ? (
            <input
              autoFocus
              aria-label="Section name"
              defaultValue={section.name}
              className={cx(inputClass, "mt-1 h-9 text-[15px] font-bold")}
              onBlur={(event) => {
                const name = event.currentTarget.value.trim();
                if (name && name !== section.name) props.onChange((current) => ({ ...current, name }), key("name"));
                setRenaming(false);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") setRenaming(false);
              }}
            />
          ) : (
            <h2 className="truncate text-[16px] font-bold text-app-ink">{section.name || insertLabel(section.kind)}</h2>
          )}
        </div>
        <Menu
          label="Section actions"
          trigger={({ open, toggle }) => <IconButton icon="moreHorizontal" label="Section actions" aria-expanded={open} onClick={toggle} className="h-9 w-9" />}
        >
          {(close) => (
            <>
              <MenuItem icon="edit" onClick={() => { close(); setRenaming(true); }}>Rename</MenuItem>
              <MenuItem icon="arrowUp" disabled={!props.canMove.up} onClick={() => { close(); props.onAction("up"); }}>Move up</MenuItem>
              <MenuItem icon="arrowDown" disabled={!props.canMove.down} onClick={() => { close(); props.onAction("down"); }}>Move down</MenuItem>
              <MenuItem icon="copy" disabled={!props.canMove.duplicate} onClick={() => { close(); props.onAction("duplicate"); }}>Duplicate</MenuItem>
              <MenuItem icon="eye" onClick={() => { close(); props.onAction("hide"); }}>{section.visible === false ? "Show" : "Hide"}</MenuItem>
              <MenuItem icon="trash" danger onClick={() => { close(); props.onAction("remove"); }}>Remove section</MenuItem>
            </>
          )}
        </Menu>
        {props.onClose ? <IconButton icon="x" label="Close" onClick={props.onClose} className="h-9 w-9" /> : null}
      </div>
      {!props.compact ? (
        <div role="tablist" aria-label="Section panels" className="mt-2 flex gap-5 border-b border-app-line px-4">
          {(["settings", "style"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={props.tab === tab}
              onClick={() => props.onTab(tab)}
              className={cx("-mb-px border-b-2 pb-2.5 text-[14px] font-semibold", props.tab === tab ? "border-app-ink text-app-ink" : "border-transparent text-app-ink-soft hover:text-app-ink")}
            >
              {tab === "settings" ? "Settings" : "Style"}
            </button>
          ))}
        </div>
      ) : null}
      <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-2">
        {section.visible === false ? (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-[12px] bg-app-canvas px-3 py-2 text-[12.5px] text-app-ink-soft">
            Hidden from shoppers
            <button type="button" onClick={() => props.onAction("hide")} className="font-semibold text-app-ink underline">Show</button>
          </div>
        ) : null}
        {groups.map((group, groupIndex) => (
          <div key={groupIndex} className={cx(groupIndex > 0 && "mt-2 border-t border-app-line pt-2")}>
            {group.title ? <h3 className="pb-1 pt-2 text-[14px] font-bold text-app-ink">{group.title}</h3> : null}
            {group.fields.filter((field) => fieldVisible(section, field)).map((field) => (
              <div key={field.id} data-field={fieldKeyFor(field)}>
                <Field {...props} field={field} section={section} sectionKey={key} />
              </div>
            ))}
          </div>
        ))}
        {props.tab === "settings" && schema.addable.length ? (
          <div className="mt-2 border-t border-app-line pt-3">
            <h3 className="pb-2 text-[14px] font-bold text-app-ink">Add block</h3>
            <div className="flex flex-wrap gap-2">
              {schema.addable.map((block) => (
                <button key={block.id} type="button" onClick={() => props.onAddBlock(block.id)} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-app-line bg-white px-3 text-[13px] font-semibold text-app-ink hover:border-app-line-strong">
                  <Icon name="plus" size={14} /> {block.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="mt-4 border-t border-app-line pt-1">
          <button type="button" onClick={props.onOpenThemeSettings} className="flex min-h-11 w-full items-center justify-between text-[14px] font-semibold text-app-ink hover:opacity-80">
            Theme settings <Icon name="chevRight" size={15} className="text-app-ink-faint" />
          </button>
          <button type="button" onClick={() => props.onAction("remove")} className="flex min-h-11 items-center gap-2 text-[14px] font-semibold text-app-danger hover:opacity-80">
            <Icon name="trash" size={15} /> Remove section
          </button>
        </div>
      </div>
    </div>
  );
}

function fieldKeyFor(field: SchemaField) {
  if ("target" in field && field.target.scope === "copy") return field.target.key;
  if (field.type === "media" || field.type === "imageBlocks") return "media";
  if (field.type === "faq" || field.type === "items" || field.type === "products") return "items";
  return field.id;
}

function PageSettings(props: InspectorProps & { page: TemplatePageSeed | null }) {
  const { page } = props;
  const titleId = useId();
  const [tab, setTab] = useState<"page" | "seo">("page");
  if (!page) {
    return <p className="p-4 text-[13.5px] text-app-ink-soft">Pick a page to edit.</p>;
  }
  const slug = page.slug && page.slug !== "home" ? page.slug : "";
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start gap-2 px-4 pt-4">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium text-app-ink-soft">Page</p>
          <h2 className="truncate text-[16px] font-bold text-app-ink">{page.title}</h2>
        </div>
        {props.onClose ? <IconButton icon="x" label="Close" onClick={props.onClose} className="h-9 w-9" /> : null}
      </div>
      <div role="tablist" aria-label="Page settings" className="flex gap-1.5 px-4 pt-3">
        {(["page", "seo"] as const).map((key) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`min-h-9 rounded-full border px-3.5 text-[13px] font-bold ${tab === key ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink"}`}>
            {key === "page" ? "Page" : "SEO"}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {tab === "page" ? (
          <>
            <p className="mt-2 rounded-[12px] bg-app-canvas px-3 py-2.5 text-[12.5px] leading-5 text-app-ink-soft">Select a section on the page, or in the list, to edit it.</p>
            <FieldShell id={titleId} label="Page name">
              <input id={titleId} className={inputClass} value={page.title} onChange={(event) => props.onChangePage((current) => ({ ...current, title: event.target.value }), "page:title")} />
            </FieldShell>
          </>
        ) : (
          <div className="pt-3">
            <SeoTab
              compact
              value={normalizeSeo(page.seo ?? {})}
              onChange={(next) => props.onChangePage((current) => ({ ...current, seo: { ...next } }), "page:seo")}
              title={`${page.title} | ${props.storeName}`}
              slug={slug}
              urlPrefix={`${props.storeHost ?? "your store"}/`}
              siteName={props.storeName}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ field, section, sectionKey, ...props }: InspectorProps & { field: SchemaField; section: TemplateSectionNode; sectionKey: (field: string) => string }) {
  const id = useId();
  const set = (value: unknown) => {
    if (!("target" in field)) return;
    props.onChange((current) => writeTarget(current, field.target, value), sectionKey(field.id));
  };
  switch (field.type) {
    case "text":
    case "textarea": {
      const value = str(readTarget(section, field.target));
      return (
        <FieldShell id={id} label={field.label} help={field.help}>
          {field.type === "text"
            ? <input id={id} className={inputClass} value={value} placeholder={field.placeholder} onChange={(event) => set(event.target.value)} />
            : <textarea id={id} rows={field.label === "Heading" ? 2 : 3} className={textareaClass} value={value} placeholder={field.placeholder} onChange={(event) => set(event.target.value)} />}
        </FieldShell>
      );
    }
    case "number": {
      const raw = Number(readTarget(section, field.target));
      const value = Number.isFinite(raw) && raw ? raw : field.fallback;
      return (
        <FieldShell id={id} label={field.label} help={field.help}>
          <div className="flex items-center gap-2">
            <button type="button" aria-label={`Less ${field.label.toLowerCase()}`} onClick={() => set(Math.max(field.min, value - 1))} className="grid h-10 w-10 place-items-center rounded-[10px] border border-app-line"><Icon name="minus" size={14} /></button>
            <input id={id} type="number" inputMode="numeric" min={field.min} max={field.max} className={cx(inputClass, "w-20 text-center")} value={value} onChange={(event) => set(Math.min(field.max, Math.max(field.min, Number(event.target.value) || field.fallback)))} />
            <button type="button" aria-label={`More ${field.label.toLowerCase()}`} onClick={() => set(Math.min(field.max, value + 1))} className="grid h-10 w-10 place-items-center rounded-[10px] border border-app-line"><Icon name="plus" size={14} /></button>
          </div>
        </FieldShell>
      );
    }
    case "segmented": {
      const value = str(readTarget(section, field.target)) || field.fallback;
      return (
        <FieldShell label={field.label} help={field.help}>
          <PillGroup label={field.label} options={field.options} value={value} onChange={set} />
        </FieldShell>
      );
    }
    case "select": {
      const value = str(readTarget(section, field.target)) || field.fallback;
      return (
        <FieldShell id={id} label={field.label} help={field.help}>
          <select id={id} className={inputClass} value={value} onChange={(event) => set(event.target.value)}>
            {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </FieldShell>
      );
    }
    case "cards": {
      const value = str(readTarget(section, field.target)) || field.fallback;
      return (
        <FieldShell label={field.label} help={field.help}>
          <div role="radiogroup" aria-label={field.label} className="grid grid-cols-2 gap-2">
            {field.options.map((option) => (
              <button key={option.value} type="button" role="radio" aria-checked={value === option.value} onClick={() => set(option.value)} className={cx("rounded-[12px] border p-2.5 text-left", value === option.value ? "border-[#2F66F6] bg-[#EAF0FF]" : "border-app-line hover:border-app-line-strong")}>
                <span className="block text-[13px] font-semibold text-app-ink">{option.label}</span>
                {option.hint ? <span className="mt-0.5 block text-[11.5px] leading-4 text-app-ink-soft">{option.hint}</span> : null}
              </button>
            ))}
          </div>
        </FieldShell>
      );
    }
    case "toggle": {
      const raw = readTarget(section, field.target);
      const on = typeof raw === "boolean" ? raw : field.fallback;
      return (
        <FieldShell label={field.label} help={field.help} inline>
          <Toggle on={on} onChange={set} label={field.label} />
        </FieldShell>
      );
    }
    case "color": {
      const value = str(readTarget(section, field.target));
      return (
        <FieldShell id={id} label={field.label} help={field.help}>
          <div className="flex items-center gap-2">
            <input type="color" aria-label={`${field.label} picker`} value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff"} onChange={(event) => set(event.target.value)} className="h-10 w-12 shrink-0 cursor-pointer rounded-[10px] border border-app-line bg-white p-1" />
            <input id={id} className={inputClass} value={value} placeholder={field.placeholder} onChange={(event) => set(event.target.value)} />
          </div>
        </FieldShell>
      );
    }
    case "pages": {
      const raw = readTarget(section, field.target);
      const value = Array.isArray(raw) ? raw.map(String) : field.fallback;
      return (
        <FieldShell label={field.label} help={field.help}>
          <div className="flex flex-wrap gap-2">
            {field.options.map((option) => {
              const on = value.includes(option.value);
              return (
                <button key={option.value} type="button" aria-pressed={on} onClick={() => set(on ? value.filter((entry) => entry !== option.value) : [...value, option.value])} className={cx("inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold", on ? "border-app-ink bg-app-ink text-white" : "border-app-line text-app-ink")}>
                  {on ? <Icon name="check" size={13} /> : null}{option.label}
                </button>
              );
            })}
          </div>
        </FieldShell>
      );
    }
    case "list": {
      const raw = readTarget(section, field.target);
      const value = Array.isArray(raw) ? raw.map(String).join(", ") : field.fallback.join(", ");
      return (
        <FieldShell id={id} label={field.label} help={field.help}>
          <input id={id} className={inputClass} value={value} onChange={(event) => set(event.target.value.split(",").map((entry) => entry.trim()).filter(Boolean))} />
        </FieldShell>
      );
    }
    case "note":
      return <p className="my-2 rounded-[12px] bg-app-canvas px-3 py-2.5 text-[12.5px] leading-5 text-app-ink-soft">{field.label}</p>;
    case "media":
      return <MediaField field={field} section={section} sectionKey={sectionKey} {...props} />;
    case "products":
      return <ProductsField field={field} section={section} sectionKey={sectionKey} {...props} />;
    case "faq":
      return <FaqField field={field} section={section} sectionKey={sectionKey} {...props} />;
    case "imageBlocks":
      return <ImageBlocksField section={section} sectionKey={sectionKey} {...props} />;
    case "items":
      return <ItemsField section={section} sectionKey={sectionKey} {...props} />;
    default:
      return null;
  }
}

type FieldProps = InspectorProps & { section: TemplateSectionNode; sectionKey: (field: string) => string };

function MediaField({ field, section, ...props }: FieldProps & { field: Extract<SchemaField, { type: "media" }> }) {
  const [picking, setPicking] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const items = section.items ?? [];
  const images = items.map((item, index) => ({ index, src: itemImage(item) })).filter((entry) => entry.src);
  const productPhotos = [...new Set(props.products.flatMap((product) => product.images ?? []).filter(Boolean))].slice(0, 24);

  const setImage = (slot: number | null, src: string) => {
    props.onChange((current) => {
      const list = [...(current.items ?? [])];
      const value = { imageUrl: src, originalSrc: src, resolvedSrc: src };
      if (slot === null || slot >= list.length) list.push(value);
      else list[slot] = { ...list[slot], ...value };
      return { ...current, items: list };
    });
  };
  const upload = async (slot: number | null) => {
    const file = await pickFile("image/*");
    if (!file) return;
    setBusy(slot ?? -1);
    const url = await props.onUpload(file);
    setBusy(null);
    if (url) setImage(slot, url);
  };
  const remove = (slot: number) => props.onChange((current) => ({ ...current, items: (current.items ?? []).filter((_, index) => index !== slot) }));
  const canAdd = images.length < field.max;

  return (
    <FieldShell label={field.label} help={field.help}>
      <div className="grid gap-2">
        {images.map((image) => (
          <div key={`${image.index}-${image.src}`} className="flex items-center gap-3 rounded-[14px] border border-app-line p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.src} alt="" className="h-14 w-20 shrink-0 rounded-[10px] object-cover" />
            <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
              <button type="button" onClick={() => void upload(image.index)} className="min-h-8 rounded-full bg-app-canvas px-3 text-[12.5px] font-semibold text-app-ink">{busy === image.index ? "Uploading…" : "Change"}</button>
              {productPhotos.length ? <button type="button" onClick={() => setPicking(picking === image.index ? null : image.index)} className="min-h-8 rounded-full bg-app-canvas px-3 text-[12.5px] font-semibold text-app-ink">Your photos</button> : null}
            </div>
            <IconButton icon="trash" label="Remove image" onClick={() => remove(image.index)} className="h-9 w-9" size={15} />
          </div>
        ))}
        {canAdd ? (
          <div className="grid place-items-center gap-2 rounded-[14px] border border-dashed border-app-line-strong px-3 py-4 text-center">
            <div className="flex flex-wrap justify-center gap-1.5">
              <button type="button" onClick={() => void upload(null)} className="min-h-9 rounded-full bg-app-ink px-4 text-[13px] font-semibold text-white">{busy === -1 ? "Uploading…" : "Upload"}</button>
              {productPhotos.length ? <button type="button" onClick={() => setPicking(picking === -1 ? null : -1)} className="min-h-9 rounded-full border border-app-line bg-white px-4 text-[13px] font-semibold text-app-ink">Your photos</button> : null}
            </div>
          </div>
        ) : null}
        {picking !== null ? (
          <div className="rounded-[14px] border border-app-line p-2">
            <p className="px-1 pb-2 text-[12.5px] text-app-ink-soft">Photos from your products</p>
            <div className="grid grid-cols-4 gap-1.5">
              {productPhotos.map((src) => (
                <button key={src} type="button" onClick={() => { setImage(picking === -1 ? null : picking, src); setPicking(null); }} className="aspect-square overflow-hidden rounded-[8px] border border-app-line focus-visible:outline-2 focus-visible:outline-[#2F66F6]" aria-label="Use this photo">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </FieldShell>
  );
}

function ProductsField({ field, section, ...props }: FieldProps & { field: Extract<SchemaField, { type: "products" }> }) {
  const id = useId();
  const items = section.items ?? [];
  const picked = items
    .map((item, index) => ({ index, product: props.products.find((product) => product.id === item.mappedStoreProductId) }))
    .filter((entry): entry is { index: number; product: BuilderProduct } => Boolean(entry.product));
  const pickedIds = new Set(picked.map((entry) => entry.product.id));
  const available = props.products.filter((product) => !pickedIds.has(product.id));
  return (
    <FieldShell id={id} label={field.label} help={field.help}>
      <div className="grid gap-2">
        {picked.map(({ index, product }) => (
          <div key={product.id} className="flex items-center gap-2.5 rounded-[12px] border border-app-line p-2">
            {product.images?.[0]
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={product.images[0]} alt="" className="h-10 w-10 shrink-0 rounded-[8px] object-cover" />
              : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[8px] bg-app-canvas"><Icon name="image" size={15} /></span>}
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-app-ink">{product.name}</span>
            <IconButton icon="x" label={`Remove ${product.name}`} className="h-8 w-8" size={14} onClick={() => props.onChange((current) => ({ ...current, items: (current.items ?? []).filter((_, i) => i !== index) }))} />
          </div>
        ))}
        {props.products.length === 0 ? (
          <p className="text-[12.5px] text-app-ink-soft">Add products to your store to pick them here.</p>
        ) : available.length ? (
          <select
            id={id}
            className={inputClass}
            value=""
            onChange={(event) => {
              const productId = event.target.value;
              if (!productId) return;
              props.onChange((current) => ({ ...current, items: [...(current.items ?? []), { mappedStoreProductId: productId }] }));
            }}
          >
            <option value="">Add a product…</option>
            {available.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
          </select>
        ) : null}
      </div>
    </FieldShell>
  );
}

function FaqField({ field, section, ...props }: FieldProps & { field: Extract<SchemaField, { type: "faq" }> }) {
  const items = section.items ?? [];
  const update = (index: number, changes: Record<string, unknown>, fieldKey: string) =>
    props.onChange((current) => ({ ...current, items: (current.items ?? []).map((item, i) => (i === index ? { ...item, ...changes } : item)) }), `${section.id}:faq-${index}-${fieldKey}`);
  return (
    <FieldShell label={field.label} help={field.help}>
      <div className="grid gap-2">
        {items.map((item, index) => (
          <div key={index} className="rounded-[14px] border border-app-line p-2.5">
            <div className="flex items-center gap-2">
              <input aria-label={`Question ${index + 1}`} className={inputClass} value={str(item.question)} onChange={(event) => update(index, { question: event.target.value }, "q")} />
              <IconButton icon="trash" label={`Remove question ${index + 1}`} className="h-9 w-9" size={15} onClick={() => props.onChange((current) => ({ ...current, items: (current.items ?? []).filter((_, i) => i !== index) }))} />
            </div>
            <textarea
              aria-label={`Answer ${index + 1}`}
              rows={2}
              className={cx(textareaClass, "mt-2")}
              value={str(item.answer)}
              placeholder={item.answerSource === "delivery" ? "Leave blank to use your delivery settings" : item.answerSource === "payment" ? "Leave blank to use your payment settings" : "Write the answer"}
              onChange={(event) => update(index, { answer: event.target.value }, "a")}
            />
          </div>
        ))}
      </div>
    </FieldShell>
  );
}

function ImageBlocksField({ section, ...props }: FieldProps) {
  const blocks = section.blocks.filter((block) => block.type === "image");
  if (!blocks.length) return null;
  const update = (blockId: string, key: string, value: string) =>
    props.onChange((current) => ({
      ...current,
      blocks: current.blocks.map((block) => {
        if (block.id !== blockId) return block;
        const resolved = key === "originalSrc" && value ? normalizeImage(value, str(block.content.alt)) : null;
        return { ...block, content: { ...block.content, [key]: value, ...(resolved ? { resolvedSrc: resolved.resolvedSrc, placeholder: resolved.placeholder } : {}) } };
      }),
    }), `${section.id}:img-${blockId}-${key}`);
  return (
    <div>
      <h3 className="pb-1 pt-3 text-[14px] font-bold text-app-ink">Images</h3>
      {blocks.map((block, index) => (
        <div key={block.id} data-field={`image:${block.id}`} className="mb-2 rounded-[14px] border border-app-line p-2.5">
          <FieldShell label={`Image ${index + 1} link`}>
            <input className={inputClass} value={str(block.content.originalSrc)} placeholder="https://" onChange={(event) => update(block.id, "originalSrc", event.target.value)} aria-label={`Image ${index + 1} link`} />
          </FieldShell>
          <button type="button" onClick={async () => { const file = await pickFile("image/*,video/mp4,video/webm,video/ogg"); if (!file) return; const url = await props.onUpload(file); if (url) update(block.id, "originalSrc", url); }} className="min-h-9 rounded-full bg-app-canvas px-3 text-[13px] font-semibold text-app-ink">Upload image or video</button>
          <FieldShell label="Alt text" help="Describes the image for people who can't see it.">
            <input className={inputClass} value={str(block.content.alt)} onChange={(event) => update(block.id, "alt", event.target.value)} aria-label={`Image ${index + 1} alt text`} />
          </FieldShell>
          <FieldShell label="Fit">
            <select className={inputClass} value={str(block.content.objectFit) || "cover"} onChange={(event) => update(block.id, "objectFit", event.target.value)} aria-label={`Image ${index + 1} fit`}>
              <option value="cover">Fill the space</option>
              <option value="contain">Show all of it</option>
              <option value="fill">Stretch</option>
              <option value="none">Original size</option>
            </select>
          </FieldShell>
        </div>
      ))}
    </div>
  );
}

function ItemsField({ section, ...props }: FieldProps) {
  const items = section.items ?? [];
  if (!items.length) return null;
  const update = (index: number, key: string, raw: string) => {
    const value = key === "values" ? raw.split(",").map((entry) => entry.trim()).filter(Boolean) : key === "mappedStoreProductId" && !raw ? null : raw;
    props.onChange((current) => ({ ...current, items: (current.items ?? []).map((item, i) => (i === index ? { ...item, [key]: value } : item)) }), `${section.id}:item-${index}-${key}`);
  };
  const upload = async (index: number) => {
    const file = await pickFile("image/*,video/mp4,video/webm,video/ogg");
    if (!file) return;
    const url = await props.onUpload(file);
    if (!url) return;
    props.onChange((current) => ({
      ...current,
      items: (current.items ?? []).map((item, i) => (i === index ? { ...item, imageUrl: url, originalSrc: url, resolvedSrc: url, ...(file.type.startsWith("video/") ? { videoUrl: url } : {}) } : item)),
    }));
  };
  const showMedia = (item: Record<string, unknown>) => "imageUrl" in item || ["category-list", "category-grid", "hero-split", "blog-index"].includes(section.kind);
  return (
    <div>
      <h3 className="pb-1 pt-3 text-[14px] font-bold text-app-ink">Blocks</h3>
      {items.map((item, index) => {
        const variations = blockVariationsFor(section.kind, item);
        const input = (key: string, label: string, multiline = false) => (
          <FieldShell label={label}>
            {multiline
              ? <textarea rows={2} className={textareaClass} value={str(item[key])} onChange={(event) => update(index, key, event.target.value)} aria-label={`${label}, block ${index + 1}`} />
              : <input className={inputClass} value={str(item[key])} onChange={(event) => update(index, key, event.target.value)} aria-label={`${label}, block ${index + 1}`} />}
          </FieldShell>
        );
        return (
          <details key={index} data-field={`item-${index}`} className="group mb-2 rounded-[14px] border border-app-line px-2.5" open={items.length <= 2}>
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-[13.5px] font-semibold text-app-ink">
              <span className="truncate">{str(item.title ?? item.label ?? item.question ?? item.person) || `Block ${index + 1}`}</span>
              <span className="flex items-center gap-1">
                <IconButton icon="trash" label={`Remove block ${index + 1}`} className="h-8 w-8" size={14} onClick={(event) => { event.preventDefault(); props.onChange((current) => ({ ...current, items: (current.items ?? []).filter((_, i) => i !== index) })); }} />
                <Icon name="chevDown" size={14} className="transition group-open:rotate-180" />
              </span>
            </summary>
            <div className="pb-2">
              {variations.length ? (
                <FieldShell label="Block style">
                  <select className={inputClass} value={str(item.variant) || variations[0]!.value} onChange={(event) => update(index, "variant", event.target.value)} aria-label={`Block ${index + 1} style`}>
                    {variations.map((variation) => <option key={variation.value} value={variation.value}>{variation.label}</option>)}
                  </select>
                </FieldShell>
              ) : null}
              {"title" in item ? input("title", "Title") : "label" in item ? input("label", "Title") : null}
              {"subtitle" in item ? input("subtitle", "Text", true) : "body" in item ? input("body", "Text", true) : "value" in item ? input("value", "Text") : null}
              {"quote" in item ? input("quote", "Quote", true) : null}
              {"person" in item ? input("person", "Customer") : null}
              {"question" in item ? input("question", "Question") : null}
              {"answer" in item ? input("answer", "Answer", true) : null}
              {"values" in item ? (
                <FieldShell label="Choices">
                  <input className={inputClass} value={Array.isArray(item.values) ? item.values.join(", ") : str(item.values)} onChange={(event) => update(index, "values", event.target.value)} aria-label={`Choices, block ${index + 1}`} />
                </FieldShell>
              ) : null}
              {"priceLabel" in item ? input("priceLabel", "Price") : null}
              {showMedia(item) ? (
                <>
                  <FieldShell label="Image or video link">
                    <input className={inputClass} value={str(item.imageUrl ?? item.videoUrl)} onChange={(event) => update(index, "imageUrl", event.target.value)} aria-label={`Image link, block ${index + 1}`} />
                  </FieldShell>
                  <button type="button" onClick={() => void upload(index)} className="min-h-9 rounded-full bg-app-canvas px-3 text-[13px] font-semibold text-app-ink">Upload image or video</button>
                </>
              ) : null}
              {"color" in item ? (
                <FieldShell label="Accent colour">
                  <div className="flex items-center gap-2">
                    <input type="color" value={/^#[0-9a-f]{6}$/i.test(str(item.color)) ? str(item.color) : "#0FA493"} onChange={(event) => update(index, "color", event.target.value)} className="h-10 w-12 shrink-0 rounded-[10px] border border-app-line p-1" aria-label={`Accent colour, block ${index + 1}`} />
                    <input className={inputClass} value={str(item.color)} onChange={(event) => update(index, "color", event.target.value)} aria-label={`Accent colour code, block ${index + 1}`} />
                  </div>
                </FieldShell>
              ) : null}
              {"mappedStoreProductId" in item ? (
                <FieldShell label="Product">
                  <select className={inputClass} value={str(item.mappedStoreProductId)} onChange={(event) => update(index, "mappedStoreProductId", event.target.value)} aria-label={`Product, block ${index + 1}`}>
                    <option value="">Not linked</option>
                    {props.products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                  </select>
                </FieldShell>
              ) : null}
            </div>
          </details>
        );
      })}
    </div>
  );
}
