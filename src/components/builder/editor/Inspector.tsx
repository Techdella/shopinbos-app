"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cx, Toggle } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import type { TemplatePageSeed, TemplateSectionNode } from "@/lib/store-templates";
import { normalizeImage } from "@/lib/store-templates/images";
import { SeoTab } from "@/components/seo/SeoTab";
import { normalizeSeo } from "@/lib/seo/fields";
import { MediaPicker } from "@/components/media/MediaPicker";
import { itemMediaUrl, mediaItemFields, migrateSection, readSlideLink, type SlideLink } from "@/lib/store-templates/section-content";
import { insertLabel, setSectionCopy, setSectionSetting, type RendererKind } from "./editor-logic";
import {
  blockVariationsFor,
  fieldVisible,
  heroDefaultLayout,
  readTarget,
  sectionSchema,
  type FieldTarget,
  type ItemField,
  type SchemaField,
} from "./section-schema";
import type { BuilderProduct } from "./useBuilder";
import { FieldShell, IconButton, inputClass, Menu, MenuItem, PillGroup, textareaClass } from "./ui";
import { useEditorT } from "./i18n";
import { LogoField } from "./LogoField";
import { moveInOrder, toggleInOrder } from "@/components/storefront/boutique/pdp/pdp-logic";
import { LAYOUT_ROW_KIND, type LayoutElementType } from "@/components/storefront/boutique/blocks/layout-logic";
import { LayoutColumnsField } from "./LayoutColumnsField";

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
  /** The seller's collections, for "One collection" product sections. */
  collections?: Array<{ id: string; name: string }>;
  /** Page types the store has, for button links. */
  pageTypes?: string[];
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
  /** Rows and columns: the element picked on the canvas or in the panel. */
  selectedElementId?: string | null;
  onSelectElement?: (elementId: string | null) => void;
  onAddLayoutElement?: (columnIndex: number, type: LayoutElementType) => void;
  onMoveLayoutElement?: (elementId: string, toColumn: number, toIndex: number, options?: { select?: boolean }) => void;
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
  const { tx } = useEditorT();
  const [renaming, setRenaming] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Clicking a block in the sections tree focuses its field here.
  useEffect(() => {
    if (!props.focusField || !section) return;
    const frame = requestAnimationFrame(() => {
      const body = bodyRef.current;
      const target = body?.querySelector<HTMLElement>(`[data-field="${CSS.escape(props.focusField!)}"]`);
      if (body && target) {
        // Up or down only: scrollIntoView would also scroll the panel sideways and cut off every field's left edge.
        const offset = target.getBoundingClientRect().top - body.getBoundingClientRect().top;
        body.scrollTo({ top: body.scrollTop + offset - Math.max(0, (body.clientHeight - target.offsetHeight) / 2), behavior: "smooth" });
        body.scrollLeft = 0;
        target.querySelector<HTMLElement>("input, textarea, select, button")?.focus({ preventScroll: true });
      }
      props.onFocusHandled();
    });
    return () => cancelAnimationFrame(frame);
  }, [props.focusField, section, props]);

  useEffect(() => setRenaming(false), [section?.id]);

  if (!section) return <PageSettings {...props} page={page} />;

  const schema = sectionSchema(section.kind, props.renderer, props.themeId);
  const groups = (props.tab === "settings" ? schema.settings : schema.style)
    .map((group) => ({ ...group, fields: group.fields.filter((field) => fieldVisible(section, field)) }))
    .filter((group) => group.fields.length);
  const key = (field: string) => `${section.id}:${field}`;
  // Every edit goes through the same in-memory upgrade as loading, so switching a hero to slides shows each
  // slide's words straight away (and the canvas draws exactly what the panel shows).
  const heroDefault = heroDefaultLayout(props.renderer, props.themeId);
  const change: InspectorProps["onChange"] = (updater, changeKey) => props.onChange((current) => migrateSection(updater(current), { heroDefault }), changeKey);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="flex items-start gap-2 px-4 pt-4">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium text-app-ink-soft">{tx("Section")}</p>
          {renaming ? (
            <input
              autoFocus
              aria-label={tx("Section name")}
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
            <h2 className="truncate text-[16px] font-bold text-app-ink">{tx(section.name || insertLabel(section.kind))}</h2>
          )}
        </div>
        <Menu
          label="Section actions"
          trigger={({ open, toggle }) => <IconButton icon="moreHorizontal" label="Section actions" aria-expanded={open} onClick={toggle} className="h-9 w-9" />}
        >
          {(close) => (
            <>
              <MenuItem icon="edit" onClick={() => { close(); setRenaming(true); }}>{tx("Rename")}</MenuItem>
              <MenuItem icon="arrowUp" disabled={!props.canMove.up} onClick={() => { close(); props.onAction("up"); }}>{tx("Move up")}</MenuItem>
              <MenuItem icon="arrowDown" disabled={!props.canMove.down} onClick={() => { close(); props.onAction("down"); }}>{tx("Move down")}</MenuItem>
              <MenuItem icon="copy" disabled={!props.canMove.duplicate} onClick={() => { close(); props.onAction("duplicate"); }}>{tx("Duplicate")}</MenuItem>
              <MenuItem icon="eye" onClick={() => { close(); props.onAction("hide"); }}>{section.visible === false ? tx("Show") : tx("Hide")}</MenuItem>
              <MenuItem icon="trash" danger onClick={() => { close(); props.onAction("remove"); }}>{tx("Remove section")}</MenuItem>
            </>
          )}
        </Menu>
        {props.onClose ? <IconButton icon="x" label="Close" onClick={props.onClose} className="h-9 w-9" /> : null}
      </div>
      {!props.compact ? (
        <div role="tablist" aria-label={tx("Section panels")} className="mt-2 flex gap-5 border-b border-app-line px-4">
          {(["settings", "style"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={props.tab === tab}
              onClick={() => props.onTab(tab)}
              className={cx("-mb-px border-b-2 pb-2.5 text-[14px] font-semibold", props.tab === tab ? "border-app-ink text-app-ink" : "border-transparent text-app-ink-soft hover:text-app-ink")}
            >
              {tab === "settings" ? tx("Settings") : tx("Style")}
            </button>
          ))}
        </div>
      ) : null}
      <div ref={bodyRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-4 pt-2">
        {section.visible === false ? (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-[12px] bg-app-canvas px-3 py-2 text-[12.5px] text-app-ink-soft">
            {tx("Hidden from shoppers")}
            <button type="button" onClick={() => props.onAction("hide")} className="font-semibold text-app-ink underline">{tx("Show")}</button>
          </div>
        ) : null}
        {groups.map((group, groupIndex) => (
          <div key={groupIndex} className={cx(groupIndex > 0 && "mt-2 border-t border-app-line pt-2")}>
            {group.title ? <h3 className="pb-1 pt-2 text-[14px] font-bold text-app-ink">{tx(group.title)}</h3> : null}
            {group.fields.map((field) => (
              <div key={field.id} data-field={fieldKeyFor(field)}>
                <Field {...props} onChange={change} field={field} section={section} sectionKey={key} />
              </div>
            ))}
          </div>
        ))}
        {props.tab === "settings" && schema.addable.length && section.kind !== LAYOUT_ROW_KIND ? (
          <div className="mt-2 border-t border-app-line pt-3">
            <h3 className="pb-2 text-[14px] font-bold text-app-ink">{tx("Add block")}</h3>
            <div className="flex flex-wrap gap-2">
              {schema.addable.map((block) => (
                <button key={block.id} type="button" onClick={() => props.onAddBlock(block.id)} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-app-line bg-white px-3 text-[13px] font-semibold text-app-ink hover:border-app-line-strong">
                  <Icon name="plus" size={14} /> {tx(block.label)}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="mt-4 border-t border-app-line pt-1">
          <button type="button" onClick={props.onOpenThemeSettings} className="flex min-h-11 w-full items-center justify-between text-[14px] font-semibold text-app-ink hover:opacity-80">
            {tx("Theme settings")} <Icon name="chevRight" size={15} className="text-app-ink-faint" />
          </button>
          <button type="button" onClick={() => props.onAction("remove")} className="flex min-h-11 items-center gap-2 text-[14px] font-semibold text-app-danger hover:opacity-80">
            <Icon name="trash" size={15} /> {tx("Remove section")}
          </button>
        </div>
      </div>
    </div>
  );
}

function fieldKeyFor(field: SchemaField) {
  if ("target" in field && field.target.scope === "copy") return field.target.key;
  if (field.type === "media" || field.type === "imageBlocks") return "media";
  if (field.type === "faq" || field.type === "items" || field.type === "products" || field.type === "repeater") return "items";
  return field.id;
}

function PageSettings(props: InspectorProps & { page: TemplatePageSeed | null }) {
  const { page } = props;
  const { t, tx } = useEditorT();
  const titleId = useId();
  const [tab, setTab] = useState<"page" | "seo">("page");
  if (!page) {
    return <p className="p-4 text-[13.5px] text-app-ink-soft">{tx("Pick a page to edit.")}</p>;
  }
  const slug = page.slug && page.slug !== "home" ? page.slug : "";
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="flex items-start gap-2 px-4 pt-4">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium text-app-ink-soft">{tx("Page")}</p>
          <h2 className="truncate text-[16px] font-bold text-app-ink">{tx(page.title)}</h2>
        </div>
        {props.onClose ? <IconButton icon="x" label="Close" onClick={props.onClose} className="h-9 w-9" /> : null}
      </div>
      <div role="tablist" aria-label={tx("Page settings")} className="flex gap-1.5 px-4 pt-3">
        {(["page", "seo"] as const).map((key) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`min-h-9 rounded-full border px-3.5 text-[13px] font-bold ${tab === key ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink"}`}>
            {key === "page" ? tx("Page") : tx("SEO")}
          </button>
        ))}
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-4">
        {tab === "page" ? (
          <>
            <p className="mt-2 rounded-[12px] bg-app-canvas px-3 py-2.5 text-[12.5px] leading-5 text-app-ink-soft">{tx("Select a section on the page, or in the list, to edit it.")}</p>
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
              urlPrefix={`${props.storeHost ?? t("edk.yourStore")}/`}
              siteName={props.storeName}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ field, section, sectionKey, ...props }: InspectorProps & { field: SchemaField; section: TemplateSectionNode; sectionKey: (field: string) => string }) {
  const { t, tx } = useEditorT();
  const id = useId();
  const set = (value: unknown) => {
    if (!("target" in field)) return;
    props.onChange((current) => writeTarget(current, field.target, value), sectionKey(field.id));
  };
  switch (field.type) {
    case "text":
    case "textarea": {
      const value = str(readTarget(section, field.target));
      // The header's shop name follows the store name from Settings unless the seller types a different one.
      if (field.id === "logoText") {
        return (
          <FieldShell id={id} label={field.label} help={tx("Leave empty to use your store name.")}>
            <input id={id} className={inputClass} value={value} placeholder={props.storeName} onChange={(event) => set(event.target.value)} />
            {value.trim() && value.trim() !== props.storeName ? (
              <button type="button" onClick={() => set("")} className="mt-1.5 justify-self-start border-0 bg-transparent p-0 text-[12.5px] font-bold text-app-ink underline underline-offset-2">
                {t("edk.useStoreName", { name: props.storeName })}
              </button>
            ) : null}
          </FieldShell>
        );
      }
      return (
        <FieldShell id={id} label={field.label} help={field.help}>
          {field.type === "text"
            ? <input id={id} className={inputClass} value={value} placeholder={tx(field.placeholder)} onChange={(event) => set(event.target.value)} />
            : <textarea id={id} rows={field.label === "Heading" ? 2 : 3} className={textareaClass} value={value} placeholder={tx(field.placeholder)} onChange={(event) => set(event.target.value)} />}
        </FieldShell>
      );
    }
    case "number": {
      const raw = Number(readTarget(section, field.target));
      const value = Number.isFinite(raw) && raw ? raw : field.fallback;
      return (
        <FieldShell id={id} label={field.label} help={field.help}>
          <div className="flex items-center gap-2">
            <button type="button" aria-label={t("edk.less", { label: tx(field.label).toLowerCase() })} onClick={() => set(Math.max(field.min, value - 1))} className="grid h-10 w-10 place-items-center rounded-[10px] border border-app-line"><Icon name="minus" size={14} /></button>
            <input id={id} type="number" inputMode="numeric" min={field.min} max={field.max} className={cx(inputClass, "w-20 text-center")} value={value} onChange={(event) => set(Math.min(field.max, Math.max(field.min, Number(event.target.value) || field.fallback)))} />
            <button type="button" aria-label={t("edk.more", { label: tx(field.label).toLowerCase() })} onClick={() => set(Math.min(field.max, value + 1))} className="grid h-10 w-10 place-items-center rounded-[10px] border border-app-line"><Icon name="plus" size={14} /></button>
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
            {field.options.map((option) => <option key={option.value} value={option.value}>{tx(option.label)}</option>)}
          </select>
        </FieldShell>
      );
    }
    case "cards": {
      const value = str(readTarget(section, field.target)) || field.fallback;
      return (
        <FieldShell label={field.label} help={field.help}>
          <div role="radiogroup" aria-label={tx(field.label)} className="grid grid-cols-2 gap-2">
            {field.options.map((option) => (
              <button key={option.value} type="button" role="radio" aria-checked={value === option.value} onClick={() => set(option.value)} className={cx("rounded-[12px] border p-2.5 text-left", value === option.value ? "border-[#2F66F6] bg-[#EAF0FF]" : "border-app-line hover:border-app-line-strong")}>
                <span className="block text-[13px] font-semibold text-app-ink">{tx(option.label)}</span>
                {option.hint ? <span className="mt-0.5 block text-[11.5px] leading-4 text-app-ink-soft">{tx(option.hint)}</span> : null}
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
          <Toggle on={on} onChange={set} label={tx(field.label)} />
        </FieldShell>
      );
    }
    case "color": {
      const value = str(readTarget(section, field.target));
      return (
        <FieldShell id={id} label={field.label} help={field.help}>
          <div className="flex items-center gap-2">
            <input type="color" aria-label={t("edk.picker", { label: tx(field.label) })} value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff"} onChange={(event) => set(event.target.value)} className="h-10 w-12 shrink-0 cursor-pointer rounded-[10px] border border-app-line bg-white p-1" />
            <input id={id} className={inputClass} value={value} placeholder={tx(field.placeholder)} onChange={(event) => set(event.target.value)} />
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
                  {on ? <Icon name="check" size={13} /> : null}{tx(option.label)}
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
    case "datetime": {
      const value = str(readTarget(section, field.target));
      return (
        <FieldShell id={id} label={field.label} help={field.help}>
          <input id={id} type="datetime-local" className={inputClass} value={toLocalInput(value)} onChange={(event) => set(event.target.value ? new Date(event.target.value).toISOString() : "")} />
        </FieldShell>
      );
    }
    case "collection": {
      const value = str(readTarget(section, field.target));
      const collections = props.collections ?? [];
      return (
        <FieldShell id={id} label={field.label} help={field.help}>
          {collections.length ? (
            <select id={id} className={inputClass} value={value} onChange={(event) => set(event.target.value)}>
              <option value="">{tx("Pick a collection")}</option>
              {collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
            </select>
          ) : (
            <p className="m-0 text-[12.5px] text-app-ink-soft">{tx("Create a collection in Products first. Until then, best sellers show.")}</p>
          )}
        </FieldShell>
      );
    }
    case "image": {
      // One picture or video stored at the field's target (ready-made blocks keep their items for other lists).
      const value = str(readTarget(section, field.target));
      return (
        <div className="py-2">
          <MediaPicker compact label={tx(field.label)} help={tx(field.help)} accept={field.accept === "media" ? "any" : "image"} value={value} onChange={(url) => set(url ?? "")} />
        </div>
      );
    }
    case "repeater":
      return <RepeaterField field={field} section={section} sectionKey={sectionKey} {...props} />;
    case "badge":
      return <BadgeField label={field.label} help={field.help} />;
    case "logo":
      return <LogoField label={field.label} help={field.help} />;
    case "order":
      return <OrderField field={field} value={readTarget(section, field.target)} onChange={set} />;
    case "note":
      return <p className="my-2 rounded-[12px] bg-app-canvas px-3 py-2.5 text-[12.5px] leading-5 text-app-ink-soft">{tx(field.label)}</p>;
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
    case "layoutColumns":
      return (
        <LayoutColumnsField
          section={section}
          onChange={props.onChange}
          products={props.products}
          selectedElementId={props.selectedElementId ?? null}
          onSelectElement={(elementId) => props.onSelectElement?.(elementId)}
          onAddElement={(columnIndex, type) => props.onAddLayoutElement?.(columnIndex, type)}
          onMoveElement={props.onMoveLayoutElement}
          renderLink={(link) => <LinkControl label={link.label} value={link.value} onChange={link.onChange} products={props.products} pageTypes={props.pageTypes} />}
        />
      );
    default:
      return null;
  }
}

/** Ordered on/off list (product page blocks): shown parts first, in order, with up/down; hidden parts below. */
function OrderField({ field, value, onChange }: { field: Extract<SchemaField, { type: "order" }>; value: unknown; onChange: (value: string[]) => void }) {
  const allowed = field.options.map((option) => option.value);
  const shown = Array.isArray(value) ? value.map(String).filter((entry, index, all) => allowed.includes(entry) && all.indexOf(entry) === index) : field.fallback;
  const hidden = allowed.filter((entry) => !shown.includes(entry));
  const { tx } = useEditorT();
  const label = (id: string) => tx(field.options.find((option) => option.value === id)?.label ?? id);
  return (
    <FieldShell label={field.label} help={field.help}>
      <ul className="grid gap-1.5" aria-label={tx(field.label)}>
        {[...shown, ...hidden].map((id) => {
          const on = shown.includes(id);
          const at = shown.indexOf(id);
          return (
            <li key={id} className={cx("flex min-h-10 items-center gap-2 rounded-[10px] border px-2.5", on ? "border-app-line bg-white" : "border-dashed border-app-line bg-app-canvas")}>
              <Toggle on={on} onChange={(next: boolean) => onChange(toggleInOrder(shown, id, next, field.fallback))} label={`Show ${label(id).toLowerCase()}`} />
              <span className={cx("min-w-0 flex-1 truncate text-[13px] font-semibold", on ? "text-app-ink" : "text-app-ink-soft")}>{label(id)}</span>
              {on ? (
                <>
                  <IconButton icon="arrowUp" label={`Move ${label(id).toLowerCase()} up`} disabled={at === 0} onClick={() => onChange(moveInOrder(shown, id, -1))} className="h-8 w-8" size={14} />
                  <IconButton icon="arrowDown" label={`Move ${label(id).toLowerCase()} down`} disabled={at === shown.length - 1} onClick={() => onChange(moveInOrder(shown, id, 1))} className="h-8 w-8" size={14} />
                </>
              ) : null}
            </li>
          );
        })}
      </ul>
    </FieldShell>
  );
}

type FieldProps = InspectorProps & { section: TemplateSectionNode; sectionKey: (field: string) => string };

interface BadgeState { hidden: boolean; shown: boolean; canHide: boolean }

/**
 * "Built with Shopinbos" badge. Every store shows it; paid sellers can turn it off. Free sellers see the switch on
 * and locked, with a line explaining why and an Upgrade link. Saved straight away (store-wide, not part of the draft).
 */
function BadgeField({ label, help }: { label: string; help?: string }) {
  const { tx } = useEditorT();
  const [state, setState] = useState<BadgeState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    fetch("/api/app/store/badge", { cache: "no-store" })
      .then((response) => response.json().catch(() => null) as Promise<{ data?: BadgeState } | null>)
      .then((json) => { if (!cancelled && json?.data) setState(json.data); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  // Until the plan is known, show the default: on and locked.
  const canHide = state?.canHide === true;
  const on = state ? state.shown : true;
  const save = async (show: boolean) => {
    if (!canHide || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/app/store/badge", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hidden: !show }) });
      const json = await response.json().catch(() => null) as { data?: BadgeState; error?: { code?: string } } | null;
      if (json?.data) setState(json.data);
      else if (json?.error?.code === "UPGRADE_REQUIRED") setState({ hidden: false, shown: true, canHide: false });
      else setError(tx("The badge setting couldn't be saved. Try again."));
    } catch {
      setError(tx("The badge setting couldn't be saved. Try again."));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-app-ink">
          {!canHide ? <Icon name="lock" size={13} className="text-app-ink-soft" /> : null}
          {tx(label)}
        </span>
        {canHide ? (
          <Toggle on={on} onChange={(next) => void save(next)} label={tx(label)} />
        ) : (
          // Locked on for free plans: same look as the switch, but disabled.
          <button type="button" role="switch" aria-checked="true" aria-label={tx(label)} disabled className="relative h-[30px] w-[52px] shrink-0 cursor-not-allowed rounded-full bg-app-ink opacity-50">
            <span className="absolute left-[25px] top-[3px] h-[24px] w-[24px] rounded-full bg-white shadow" />
          </button>
        )}
      </div>
      {help ? <p className="mt-1.5 text-[12px] leading-[18px] text-app-ink-soft">{tx(help)}</p> : null}
      {!canHide ? (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[12.5px] leading-5 text-app-ink-soft">
          <span>{tx("Free plans show this badge. Upgrade to turn it off.")}</span>
          <a href="/home/settings?tab=Billing" className="font-semibold text-app-ink underline">{tx("Upgrade")}</a>
        </p>
      ) : null}
      {error ? <p role="alert" className="mt-1.5 text-[12.5px] font-semibold text-app-danger">{error}</p> : null}
    </div>
  );
}

/** Up, down and remove buttons for one entry of a list. */
function ListControls({ index, count, name, onMove, onRemove }: { index: number; count: number; name: string; onMove: (from: number, to: number) => void; onRemove: () => void }) {
  const { t } = useEditorT();
  return (
    <span className="flex shrink-0 items-center">
      <IconButton icon="arrowUp" label={t("edk.moveUp", { name })} className="h-8 w-8" size={14} disabled={index === 0} onClick={(event) => { event.preventDefault(); onMove(index, index - 1); }} />
      <IconButton icon="arrowDown" label={t("edk.moveDown", { name })} className="h-8 w-8" size={14} disabled={index >= count - 1} onClick={(event) => { event.preventDefault(); onMove(index, index + 1); }} />
      <IconButton icon="trash" label={t("edk.removeName", { name })} className="h-8 w-8" size={14} onClick={(event) => { event.preventDefault(); onRemove(); }} />
    </span>
  );
}

function moveItem<T>(list: T[], from: number, to: number) {
  if (to < 0 || to >= list.length || from === to) return list;
  const next = [...list];
  const [entry] = next.splice(from, 1);
  next.splice(to, 0, entry!);
  return next;
}

/** "2026-10-20T17:00:00.000Z" → "2026-10-20T18:00" in the seller's own time, for <input type="datetime-local">. */
function toLocalInput(value: string) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function MediaField({ field, section, ...props }: FieldProps & { field: Extract<SchemaField, { type: "media" }> }) {
  const { t, tx } = useEditorT();
  const [picking, setPicking] = useState<number | null>(null);
  const items = section.items ?? [];
  // Only the pictures this layout uses: switching from slides to a one-picture banner hides the others (they stay saved).
  const images = items.map((item, index) => ({ index, src: itemMediaUrl(item) })).filter((entry) => entry.src).slice(0, field.max);
  const productPhotos = [...new Set(props.products.flatMap((product) => product.images ?? []).filter(Boolean))].slice(0, 24);
  const accept = field.accept === "media" ? "any" : "image";

  const setImage = (slot: number | null, src: string) => {
    props.onChange((current) => {
      const list = [...(current.items ?? [])];
      const value = mediaItemFields(src);
      if (slot === null || slot >= list.length) list.push(value);
      else list[slot] = { ...list[slot], ...value };
      return { ...current, items: list };
    });
  };
  const remove = (slot: number) => props.onChange((current) => ({ ...current, items: (current.items ?? []).filter((_, index) => index !== slot) }));
  const move = (from: number, to: number) => {
    const target = images[to];
    if (!target) return;
    props.onChange((current) => ({ ...current, items: moveItem(current.items ?? [], images[from]!.index, target.index) }));
  };
  const canAdd = images.length < field.max;

  return (
    <FieldShell label={field.label} help={field.help}>
      <div className="grid gap-2">
        {images.map((image, position) => (
          <div key={`${image.index}-${image.src}`} className="flex items-start gap-1 rounded-[14px] border border-app-line p-2">
            <MediaPicker compact accept={accept} value={image.src} onChange={(url) => (url ? setImage(image.index, url) : remove(image.index))} className="min-w-0 flex-1" />
            {field.max > 1 ? <ListControls index={position} count={images.length} name={t("edk.itemN", { name: tx("Image"), n: position + 1 })} onMove={move} onRemove={() => remove(image.index)} /> : null}
          </div>
        ))}
        {canAdd ? (
          <div className="rounded-[14px] border border-dashed border-app-line-strong p-2">
            <MediaPicker compact accept={accept} value="" onChange={(url) => url && setImage(null, url)} />
            {productPhotos.length ? <button type="button" onClick={() => setPicking(picking === -1 ? null : -1)} className="mt-1.5 min-h-8 rounded-full bg-app-canvas px-3 text-[12.5px] font-semibold text-app-ink">{tx("Your photos")}</button> : null}
          </div>
        ) : null}
        {picking !== null ? (
          <div className="rounded-[14px] border border-app-line p-2">
            <p className="px-1 pb-2 text-[12.5px] text-app-ink-soft">{tx("Photos from your products")}</p>
            <div className="grid grid-cols-4 gap-1.5">
              {productPhotos.map((src) => (
                <button key={src} type="button" onClick={() => { setImage(null, src); setPicking(null); }} className="aspect-square overflow-hidden rounded-[8px] border border-app-line focus-visible:outline-2 focus-visible:outline-[#2F66F6]" aria-label={tx("Use this photo")}>
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
  const { t, tx } = useEditorT();
  const id = useId();
  const items = section.items ?? [];
  const max = field.max ?? 24;
  const picked = items
    .map((item, index) => ({ index, product: props.products.find((product) => product.id === item.mappedStoreProductId) }))
    .filter((entry): entry is { index: number; product: BuilderProduct } => Boolean(entry.product))
    .slice(0, max);
  const pickedIds = new Set(picked.map((entry) => entry.product.id));
  const available = props.products.filter((product) => !pickedIds.has(product.id));
  const move = (from: number, to: number) => {
    const target = picked[to];
    if (!target) return;
    props.onChange((current) => ({ ...current, items: moveItem(current.items ?? [], picked[from]!.index, target.index) }));
  };
  return (
    <FieldShell id={id} label={field.label} help={field.help}>
      <div className="grid gap-2">
        {picked.map(({ index, product }, position) => (
          <div key={product.id} className="flex items-center gap-2.5 rounded-[12px] border border-app-line p-2">
            {product.images?.[0]
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={product.images[0]} alt="" className="h-10 w-10 shrink-0 rounded-[8px] object-cover" />
              : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[8px] bg-app-canvas"><Icon name="image" size={15} /></span>}
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-app-ink">{product.name}</span>
            {max > 1
              ? <ListControls index={position} count={picked.length} name={product.name} onMove={move} onRemove={() => props.onChange((current) => ({ ...current, items: (current.items ?? []).filter((_, i) => i !== index) }))} />
              : <IconButton icon="x" label={t("edk.removeName", { name: product.name })} className="h-8 w-8" size={14} onClick={() => props.onChange((current) => ({ ...current, items: (current.items ?? []).filter((_, i) => i !== index) }))} />}
          </div>
        ))}
        {props.products.length === 0 ? (
          <p className="text-[12.5px] text-app-ink-soft">{tx("Add products to your store to pick them here.")}</p>
        ) : available.length && picked.length < max ? (
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
            <option value="">{tx("Add a product…")}</option>
            {available.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
          </select>
        ) : null}
      </div>
    </FieldShell>
  );
}

function FaqField({ field, section, ...props }: FieldProps & { field: Extract<SchemaField, { type: "faq" }> }) {
  const { t, tx } = useEditorT();
  const items = section.items ?? [];
  const update = (index: number, changes: Record<string, unknown>, fieldKey: string) =>
    props.onChange((current) => ({ ...current, items: (current.items ?? []).map((item, i) => (i === index ? { ...item, ...changes } : item)) }), `${section.id}:faq-${index}-${fieldKey}`);
  return (
    <FieldShell label={field.label} help={field.help}>
      <div className="grid gap-2">
        {items.map((item, index) => (
          <div key={index} data-field={`item-${index}`} className="rounded-[14px] border border-app-line p-2.5">
            <div className="flex items-center gap-1">
              <input aria-label={t("edk.question", { n: index + 1 })} className={inputClass} value={str(item.question)} onChange={(event) => update(index, { question: event.target.value }, "q")} />
              <ListControls
                index={index}
                count={items.length}
                name={t("edk.question", { n: index + 1 })}
                onMove={(from, to) => props.onChange((current) => ({ ...current, items: moveItem(current.items ?? [], from, to) }))}
                onRemove={() => props.onChange((current) => ({ ...current, items: (current.items ?? []).filter((_, i) => i !== index) }))}
              />
            </div>
            <textarea
              aria-label={t("edk.answer", { n: index + 1 })}
              rows={2}
              className={cx(textareaClass, "mt-2")}
              value={str(item.answer)}
              placeholder={item.answerSource === "delivery" ? tx("Leave blank to use your delivery settings") : item.answerSource === "payment" ? tx("Leave blank to use your payment settings") : tx("Write the answer")}
              onChange={(event) => update(index, { answer: event.target.value }, "a")}
            />
          </div>
        ))}
        <AddButton label="Add question" onClick={() => props.onChange((current) => ({ ...current, items: [...(current.items ?? []), { question: "New question", answer: "" }] }))} />
      </div>
    </FieldShell>
  );
}

function AddButton({ label, onClick, disabled = false }: { label: string; onClick: () => void; disabled?: boolean }) {
  const { tx } = useEditorT();
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="inline-flex min-h-10 w-fit items-center gap-1.5 rounded-full border border-app-line bg-white px-3.5 text-[13px] font-semibold text-app-ink hover:border-app-line-strong disabled:opacity-40">
      <Icon name="plus" size={14} /> {tx(label)}
    </button>
  );
}

/** Pages a button can open, in the order sellers think of them. Only pages the store has are offered. */
const LINK_PAGES: Array<{ value: string; label: string }> = [
  { value: "home", label: "Home" },
  { value: "products", label: "Shop" },
  { value: "about", label: "About" },
  { value: "contact", label: "Contact" },
  { value: "faq", label: "FAQ" },
  { value: "blog", label: "Blog" },
  { value: "wishlist", label: "Wishlist" },
  { value: "cart", label: "Cart" },
  { value: "checkout", label: "Checkout" },
];
const ALWAYS_THERE = new Set(["home", "products", "cart"]);

function LinkControl({ label, value, onChange, products, pageTypes, help }: { label: string; value: SlideLink; onChange: (link: SlideLink) => void; products: BuilderProduct[]; pageTypes?: string[]; help?: string }) {
  const { tx } = useEditorT();
  const id = useId();
  const pages = LINK_PAGES.filter((page) => !pageTypes?.length || ALWAYS_THERE.has(page.value) || pageTypes.includes(page.value) || page.value === value.value);
  return (
    <FieldShell id={id} label={label} help={help}>
      <div className="grid gap-2">
        <PillGroup
          label={label}
          options={[{ value: "page", label: "Page" }, { value: "product", label: "Product" }, { value: "url", label: "Web address" }]}
          value={value.type}
          onChange={(type) => onChange({ type, value: type === "page" ? "products" : type === "product" ? products[0]?.id ?? "" : "" })}
        />
        {value.type === "page" ? (
          <select id={id} className={inputClass} value={value.value} onChange={(event) => onChange({ type: "page", value: event.target.value })}>
            {pages.map((page) => <option key={page.value} value={page.value}>{tx(page.label)}</option>)}
          </select>
        ) : value.type === "product" ? (
          products.length ? (
            <select id={id} className={inputClass} value={value.value} onChange={(event) => onChange({ type: "product", value: event.target.value })}>
              <option value="">{tx("Pick a product")}</option>
              {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </select>
          ) : <p className="m-0 text-[12.5px] text-app-ink-soft">{tx("Add products to your store to pick them here.")}</p>
        ) : (
          <input id={id} type="url" inputMode="url" className={inputClass} value={value.value} placeholder="https://" onChange={(event) => onChange({ type: "url", value: event.target.value.trim() })} />
        )}
      </div>
    </FieldShell>
  );
}

/** An editable list on section.items: slides, reviews, questions, tiles… Fields follow the item schema and the layout. */
function RepeaterField({ field, section, ...props }: FieldProps & { field: Extract<SchemaField, { type: "repeater" }> }) {
  const { t, tx } = useEditorT();
  const all = section.items ?? [];
  const items = all.slice(0, field.max);
  const [open, setOpen] = useState<number | null>(items.length === 1 ? 0 : null);
  const write = (updater: (list: Array<Record<string, unknown>>) => Array<Record<string, unknown>>, changeKey?: string) =>
    props.onChange((current) => ({ ...current, items: updater([...(current.items ?? [])]) }), changeKey);
  const update = (index: number, changes: Record<string, unknown>, key: string) =>
    write((list) => list.map((item, i) => (i === index ? { ...item, ...changes } : item)), `${section.id}:${field.id}-${index}-${key}`);
  const fields = field.fields.filter((itemField) => fieldVisible(section, itemField));
  const nameOf = (item: Record<string, unknown>, index: number) => {
    const own = field.titleKeys.map((key) => str(item[key])).find(Boolean);
    return own ? own.slice(0, 48) : t("edk.itemN", { name: tx(field.itemName), n: index + 1 });
  };

  const control = (itemField: ItemField, item: Record<string, unknown>, index: number) => {
    const label = tx(itemField.label);
    switch (itemField.type) {
      case "text":
      case "textarea":
        return (
          <FieldShell label={itemField.label} help={itemField.help}>
            {itemField.type === "text"
              ? <input className={inputClass} value={str(item[itemField.key])} placeholder={tx(itemField.placeholder)} onChange={(event) => update(index, { [itemField.key]: event.target.value }, itemField.key)} aria-label={t("edk.blockField", { label, n: index + 1 })} />
              : <textarea rows={2} className={textareaClass} value={str(item[itemField.key])} placeholder={tx(itemField.placeholder)} onChange={(event) => update(index, { [itemField.key]: event.target.value }, itemField.key)} aria-label={t("edk.blockField", { label, n: index + 1 })} />}
          </FieldShell>
        );
      case "media":
        return (
          <div className="py-2">
            <MediaPicker compact label={label} help={tx(itemField.help)} accept={itemField.accept === "media" ? "any" : "image"} value={itemMediaUrl(item)} onChange={(url) => update(index, mediaItemFields(url), itemField.key)} />
          </div>
        );
      case "select":
        return (
          <FieldShell label={itemField.label} help={itemField.help}>
            <select className={inputClass} value={str(item[itemField.key]) || itemField.fallback} onChange={(event) => update(index, { [itemField.key]: event.target.value }, itemField.key)} aria-label={t("edk.blockField", { label, n: index + 1 })}>
              {itemField.options.map((option) => <option key={option.value} value={option.value}>{tx(option.label)}</option>)}
            </select>
          </FieldShell>
        );
      case "segmented":
        return (
          <FieldShell label={itemField.label} help={itemField.help}>
            <PillGroup label={t("edk.blockField", { label, n: index + 1 })} options={itemField.options} value={str(item[itemField.key]) || itemField.fallback} onChange={(value) => update(index, { [itemField.key]: value }, itemField.key)} />
          </FieldShell>
        );
      case "color":
        return (
          <FieldShell label={itemField.label} help={itemField.help}>
            <div className="flex items-center gap-2">
              <input type="color" value={/^#[0-9a-f]{6}$/i.test(str(item[itemField.key])) ? str(item[itemField.key]) : "#0FA493"} onChange={(event) => update(index, { [itemField.key]: event.target.value }, itemField.key)} className="h-10 w-12 shrink-0 rounded-[10px] border border-app-line p-1" aria-label={t("edk.blockField", { label, n: index + 1 })} />
              <input className={inputClass} value={str(item[itemField.key])} placeholder="#0FA493" onChange={(event) => update(index, { [itemField.key]: event.target.value }, itemField.key)} aria-label={t("edk.blockField", { label, n: index + 1 })} />
            </div>
          </FieldShell>
        );
      case "number":
        return (
          <FieldShell label={itemField.label} help={itemField.help}>
            <input type="number" inputMode="decimal" min={itemField.min} max={itemField.max} className={inputClass} value={str(item[itemField.key])} placeholder={itemField.placeholder} onChange={(event) => update(index, { [itemField.key]: event.target.value }, itemField.key)} aria-label={t("edk.blockField", { label, n: index + 1 })} />
          </FieldShell>
        );
      case "link":
        return <LinkControl label={itemField.label} help={itemField.help} value={readSlideLink(item[itemField.key], section.settings)} onChange={(link) => update(index, { [itemField.key]: link }, itemField.key)} products={props.products} pageTypes={props.pageTypes} />;
      default:
        return null;
    }
  };

  return (
    <FieldShell label={field.label} help={field.help}>
      <div className="grid gap-2">
        {items.map((item, index) => {
          const name = nameOf(item, index);
          const expanded = open === index;
          const thumb = field.fields.some((itemField) => itemField.type === "media") ? itemMediaUrl(item) : "";
          return (
            <div key={index} data-field={`item-${index}`} className="rounded-[14px] border border-app-line">
              <div className="flex min-h-12 items-center gap-2 pl-2.5 pr-1">
                <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : index)} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left">
                  {thumb && !/youtu/i.test(thumb) && !/\.(mp4|webm|ogg|mov)(\?|$)/i.test(thumb)
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={thumb} alt="" className="h-8 w-10 shrink-0 rounded-[6px] object-cover" />
                    : null}
                  <span className="truncate text-[13.5px] font-semibold text-app-ink">{name}</span>
                  <Icon name="chevDown" size={14} className={cx("ml-auto shrink-0 text-app-ink-soft transition", expanded && "rotate-180")} />
                </button>
                <ListControls
                  index={index}
                  count={items.length}
                  name={name}
                  onMove={(from, to) => { write((list) => moveItem(list, from, to)); if (open === from) setOpen(to); }}
                  onRemove={() => { write((list) => list.filter((_, i) => i !== index)); setOpen(null); }}
                />
              </div>
              {expanded ? <div className="border-t border-app-line px-2.5 pb-2">{fields.map((itemField) => <div key={itemField.key}>{control(itemField, item, index)}</div>)}</div> : null}
            </div>
          );
        })}
        {items.length < field.max ? (
          <AddButton label={field.addLabel} onClick={() => { write((list) => [...list.slice(0, field.max), JSON.parse(JSON.stringify(field.template)) as Record<string, unknown>]); setOpen(Math.min(all.length, field.max - 1)); }} />
        ) : (
          <p className="m-0 text-[12px] text-app-ink-soft">{t("edk.listFull", { n: field.max })}</p>
        )}
      </div>
    </FieldShell>
  );
}

function ImageBlocksField({ section, ...props }: FieldProps) {
  const { t, tx } = useEditorT();
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
      <h3 className="pb-1 pt-3 text-[14px] font-bold text-app-ink">{tx("Images")}</h3>
      {blocks.map((block, index) => (
        <div key={block.id} data-field={`image:${block.id}`} className="mb-2 rounded-[14px] border border-app-line p-2.5">
          <MediaPicker compact accept="any" label={t("edk.imageLink", { n: index + 1 })} value={str(block.content.originalSrc)} onChange={(url, asset) => {
            update(block.id, "originalSrc", url);
            // A picture from the library brings its alt text along when this block has none yet.
            if (asset?.alt && !str(block.content.alt)) update(block.id, "alt", asset.alt);
          }} />
          <FieldShell label="Alt text" help="Describes the image for people who can't see it.">
            <input className={inputClass} value={str(block.content.alt)} onChange={(event) => update(block.id, "alt", event.target.value)} aria-label={t("edk.imageAlt", { n: index + 1 })} />
          </FieldShell>
          <FieldShell label="Fit">
            <select className={inputClass} value={str(block.content.objectFit) || "cover"} onChange={(event) => update(block.id, "objectFit", event.target.value)} aria-label={t("edk.imageFit", { n: index + 1 })}>
              <option value="cover">{tx("Fill the space")}</option>
              <option value="contain">{tx("Show all of it")}</option>
              <option value="fill">{tx("Stretch")}</option>
              <option value="none">{tx("Original size")}</option>
            </select>
          </FieldShell>
        </div>
      ))}
    </div>
  );
}

function ItemsField({ section, ...props }: FieldProps) {
  const { t, tx } = useEditorT();
  const items = section.items ?? [];
  if (!items.length) return null;
  const update = (index: number, key: string, raw: string) => {
    const value = key === "values" ? raw.split(",").map((entry) => entry.trim()).filter(Boolean) : key === "mappedStoreProductId" && !raw ? null : raw;
    props.onChange((current) => ({ ...current, items: (current.items ?? []).map((item, i) => (i === index ? { ...item, [key]: value } : item)) }), `${section.id}:item-${index}-${key}`);
  };
  const showMedia = (item: Record<string, unknown>) => "imageUrl" in item || ["category-list", "category-grid", "hero-split", "blog-index"].includes(section.kind);
  return (
    <div>
      <h3 className="pb-1 pt-3 text-[14px] font-bold text-app-ink">{tx("Blocks")}</h3>
      {items.map((item, index) => {
        const variations = blockVariationsFor(section.kind, item);
        const input = (key: string, label: string, multiline = false) => (
          <FieldShell label={label}>
            {multiline
              ? <textarea rows={2} className={textareaClass} value={str(item[key])} onChange={(event) => update(index, key, event.target.value)} aria-label={t("edk.blockField", { label: tx(label), n: index + 1 })} />
              : <input className={inputClass} value={str(item[key])} onChange={(event) => update(index, key, event.target.value)} aria-label={t("edk.blockField", { label: tx(label), n: index + 1 })} />}
          </FieldShell>
        );
        return (
          <details key={index} data-field={`item-${index}`} className="group mb-2 rounded-[14px] border border-app-line px-2.5" open={items.length <= 2}>
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-[13.5px] font-semibold text-app-ink">
              <span className="truncate">{str(item.title ?? item.label ?? item.question ?? item.person) || t("edk.block", { n: index + 1 })}</span>
              <span className="flex items-center gap-1">
                <ListControls
                  index={index}
                  count={items.length}
                  name={t("edk.block", { n: index + 1 })}
                  onMove={(from, to) => props.onChange((current) => ({ ...current, items: moveItem(current.items ?? [], from, to) }))}
                  onRemove={() => props.onChange((current) => ({ ...current, items: (current.items ?? []).filter((_, i) => i !== index) }))}
                />
                <Icon name="chevDown" size={14} className="transition group-open:rotate-180" />
              </span>
            </summary>
            <div className="pb-2">
              {variations.length ? (
                <FieldShell label="Block style">
                  <select className={inputClass} value={str(item.variant) || variations[0]!.value} onChange={(event) => update(index, "variant", event.target.value)} aria-label={t("edk.blockStyle", { n: index + 1 })}>
                    {variations.map((variation) => <option key={variation.value} value={variation.value}>{tx(variation.label)}</option>)}
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
                  <input className={inputClass} value={Array.isArray(item.values) ? item.values.join(", ") : str(item.values)} onChange={(event) => update(index, "values", event.target.value)} aria-label={t("edk.blockField", { label: tx("Choices"), n: index + 1 })} />
                </FieldShell>
              ) : null}
              {"priceLabel" in item ? input("priceLabel", "Price") : null}
              {showMedia(item) ? (
                <div className="py-2">
                  <MediaPicker compact accept="any" label={tx("Picture or video")} value={itemMediaUrl(item)} onChange={(url) => props.onChange((current) => ({ ...current, items: (current.items ?? []).map((entry, i) => (i === index ? { ...entry, ...mediaItemFields(url) } : entry)) }))} />
                </div>
              ) : null}
              {"color" in item ? (
                <FieldShell label="Accent colour">
                  <div className="flex items-center gap-2">
                    <input type="color" value={/^#[0-9a-f]{6}$/i.test(str(item.color)) ? str(item.color) : "#0FA493"} onChange={(event) => update(index, "color", event.target.value)} className="h-10 w-12 shrink-0 rounded-[10px] border border-app-line p-1" aria-label={t("edk.blockField", { label: tx("Accent colour"), n: index + 1 })} />
                    <input className={inputClass} value={str(item.color)} onChange={(event) => update(index, "color", event.target.value)} aria-label={t("edk.blockField", { label: tx("Accent colour code"), n: index + 1 })} />
                  </div>
                </FieldShell>
              ) : null}
              {"mappedStoreProductId" in item ? (
                <FieldShell label="Product">
                  <select className={inputClass} value={str(item.mappedStoreProductId)} onChange={(event) => update(index, "mappedStoreProductId", event.target.value)} aria-label={t("edk.blockField", { label: tx("Product"), n: index + 1 })}>
                    <option value="">{tx("Not linked")}</option>
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
