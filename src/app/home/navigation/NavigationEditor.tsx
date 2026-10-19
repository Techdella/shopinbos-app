"use client";

import { useId, useMemo, useState } from "react";
import type React from "react";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/app-ui";
import { useT } from "@/components/i18n/I18nProvider";
import { StoreBrandMark } from "@/components/storefront/StoreBrandMark";
import { resolveMenu, type ShownMenuItem } from "@/components/storefront/StoreMenu";
import { CHECKBOX, FIELD_HELP, FIELD_INPUT, FIELD_LABEL, FIELD_SELECT, SUBMIT_ACCENT } from "@/components/seller-settings/fields";
import {
  MAX_MENU_ITEMS,
  MENU_PAGE_LABELS,
  MOBILE_MENU_STYLES,
  addMenuItems,
  canIndentMenuItem,
  countMenuItems,
  indentMenuItem,
  moveMenuItem,
  outdentMenuItem,
  removeMenuItem,
  safeMenuUrl,
  updateMenuItem,
  type MenuItem,
  type MobileMenuStyle,
} from "@/lib/storefront/menu";
import { flattenMenu, type MobileMenuSource, type StoreNavigation } from "@/lib/storefront/store-navigation";

// Home > Navigation: the store's main menu, phone menu and footer links, edited as lists (label + where it goes),
// saved into the builder's header and footer (the form posts the JSON to saveStoreNavigationSettings).

type Category = { slug: string; name: string };
type Product = { id: string; name: string };
type PreviewStore = { name: string; logoUrl: string | null; brandSettings: unknown };

const PAGE_KEYS = {
  home: "nav.page.home",
  products: "nav.page.products",
  categories: "nav.page.categories",
  about: "nav.page.about",
  contact: "nav.page.contact",
  faq: "nav.page.faq",
  blog: "nav.page.blog",
  wishlist: "nav.page.wishlist",
  cart: "nav.page.cart",
  "track-order": "nav.page.trackOrder",
} as const;

const STYLE_KEYS: Record<MobileMenuStyle, "nav.style.drawer" | "nav.style.fullscreen" | "nav.style.sheet"> = {
  drawer: "nav.style.drawer",
  fullscreen: "nav.style.fullscreen",
  sheet: "nav.style.sheet",
};

/** Pages always there (the cart, order tracking) or ones the store has. */
function storePages(pageTypes: string[]) {
  const has = new Set(["home", "cart", "track-order", ...pageTypes.map((page) => (page === "shop" ? "products" : page))]);
  return (Object.keys(PAGE_KEYS) as Array<keyof typeof PAGE_KEYS>).filter((page) => has.has(page));
}

function targetValue(item: MenuItem) {
  return item.kind === "link" ? "link" : `${item.kind}:${item.ref ?? ""}`;
}

/** What is wrong with an item (shown under it; saving waits until it's fixed). */
function itemProblem(item: MenuItem): "url" | "label" | null {
  if (item.kind !== "link") return null;
  if (!safeMenuUrl(item.url)) return "url";
  if (!item.label.trim()) return "label";
  return null;
}

function hasProblems(menu: MenuItem[]): boolean {
  return menu.some((item) => Boolean(itemProblem(item)) || hasProblems(item.children ?? []));
}

export function NavigationEditor({
  initial,
  live,
  pageTypes,
  categories,
  products,
  store,
  logoText,
}: {
  initial: StoreNavigation;
  /** The menus shoppers see now (the published version). */
  live: StoreNavigation;
  pageTypes: string[];
  categories: Category[];
  products: Product[];
  store: PreviewStore;
  logoText: string;
}) {
  const t = useT("store");
  const [nav, setNav] = useState<StoreNavigation>(initial);
  const pages = useMemo(() => storePages(pageTypes), [pageTypes]);
  const set = (patch: Partial<StoreNavigation>) => setNav((current) => ({ ...current, ...patch }));
  const dirty = JSON.stringify(nav) !== JSON.stringify(initial);
  const invalid = hasProblems(nav.main) || hasProblems(nav.footer) || (nav.mobileSource === "custom" && hasProblems(nav.mobile));
  const mobileHelpId = useId();

  const nameOf = (item: MenuItem) => {
    if (item.kind === "page") return MENU_PAGE_LABELS[item.ref ?? ""] ?? item.ref ?? "";
    if (item.kind === "category") return categories.find((entry) => entry.slug === item.ref)?.name ?? item.ref ?? "";
    if (item.kind === "product") return products.find((entry) => entry.id === item.ref)?.name ?? t("nav.removed");
    return "";
  };
  const listProps = { pages, categories, products, nameOf };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <input type="hidden" name="navigation" value={JSON.stringify(nav)} />
      <div className="grid min-w-0 content-start gap-5">
        <EditorCard title={t("nav.main")} sub={t("nav.mainSub")}>
          <MenuList id="main" items={nav.main} onChange={(main) => set({ main })} nested {...listProps} />
        </EditorCard>

        <EditorCard title={t("nav.mobile")} sub={t("nav.mobileSub")}>
          <fieldset className="m-0 grid gap-2 border-0 p-0" aria-describedby={mobileHelpId}>
            <legend className={FIELD_LABEL}>{t("nav.mobileItems")}</legend>
            {(["main", "custom"] as MobileMenuSource[]).map((source) => (
              <label key={source} className={cx("flex cursor-pointer items-start gap-3 rounded-[16px] border px-4 py-3", nav.mobileSource === source ? "border-app-ink bg-app-canvas" : "border-app-line bg-white")}>
                <input
                  type="radio"
                  name="mobileSourceChoice"
                  className={cx(CHECKBOX, "mt-0.5")}
                  checked={nav.mobileSource === source}
                  onChange={() => set({ mobileSource: source, mobile: source === "custom" && !nav.mobile.length ? nav.main.map((item) => ({ ...item, children: item.children?.map((child) => ({ ...child })) })) : nav.mobile })}
                />
                <span className="min-w-0">
                  <span className="block text-[14px] font-bold text-app-ink">{source === "main" ? t("nav.mobileUseMain") : t("nav.mobileCustom")}</span>
                  <span className="block text-[12.5px] text-app-ink-soft">{source === "main" ? t("nav.mobileUseMainHelp") : t("nav.mobileCustomHelp")}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <p id={mobileHelpId} className={FIELD_HELP}>{t("nav.mobileNote")}</p>
          {nav.mobileSource === "custom" ? (
            <div className="mt-4">
              <MenuList id="mobile" items={nav.mobile} onChange={(mobile) => set({ mobile })} nested {...listProps} />
            </div>
          ) : null}
          <div className="mt-4">
            <label htmlFor="mobileStyle" className={FIELD_LABEL}>{t("nav.mobileStyle")}</label>
            <select id="mobileStyle" className={FIELD_SELECT} value={nav.mobileStyle} onChange={(event) => set({ mobileStyle: event.target.value as MobileMenuStyle })}>
              {MOBILE_MENU_STYLES.map((style) => <option key={style.value} value={style.value}>{t(STYLE_KEYS[style.value])}</option>)}
            </select>
          </div>
        </EditorCard>

        <EditorCard title={t("nav.footer")} sub={t("nav.footerSub")}>
          <MenuList id="footer" items={nav.footer} onChange={(footer) => set({ footer: flattenMenu(footer) })} nested={false} {...listProps} />
          <p className={FIELD_HELP}>{t("nav.footerFlat")}</p>
        </EditorCard>

        <div className="flex flex-wrap items-center gap-3">
          <button className={SUBMIT_ACCENT} type="submit" disabled={invalid}>{t("nav.save")}</button>
          {invalid ? <span className="text-[13px] font-semibold text-[#C2412D]">{t("nav.fixFirst")}</span> : null}
        </div>
      </div>

      <aside className="min-w-0">
        <div className="xl:sticky xl:top-5">
          <Preview nav={live} pages={pages} categories={categories} products={products} store={store} logoText={logoText} dirty={dirty} />
        </div>
      </aside>
    </div>
  );
}

function EditorCard({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[22px] border border-app-line bg-white p-5">
      <h2 className="m-0 text-[17px] font-extrabold">{title}</h2>
      {sub ? <p className="mb-0 mt-0.5 text-[13px] text-app-ink-soft">{sub}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

type ListProps = {
  id: string;
  items: MenuItem[];
  onChange: (items: MenuItem[]) => void;
  /** Dropdowns (one level) allowed. */
  nested: boolean;
  pages: Array<keyof typeof PAGE_KEYS>;
  categories: Category[];
  products: Product[];
  nameOf: (item: MenuItem) => string;
};

function MenuList(props: ListProps) {
  const t = useT("store");
  const { items, onChange } = props;
  const full = countMenuItems(items) >= MAX_MENU_ITEMS;
  const add = () => {
    const used = new Set(items.flatMap((item) => [item, ...(item.children ?? [])]).filter((item) => item.kind === "page").map((item) => item.ref));
    const ref = props.pages.find((page) => !used.has(page)) ?? "home";
    onChange(addMenuItems(items, [{ kind: "page", ref, label: "" }]));
  };
  return (
    <div className="grid gap-3">
      {items.length ? (
        <ol className="m-0 grid list-none gap-2.5 p-0">
          {items.map((item, index) => (
            <li key={item.id} className="grid gap-2">
              <ItemRow {...props} item={item} depth={0} index={index} count={items.length} />
              {item.children?.length ? (
                <ol className="m-0 ml-5 grid list-none gap-2 border-l-2 border-app-line p-0 pl-3" aria-label={t("nav.item.dropdownOf", { name: item.label.trim() || props.nameOf(item) })}>
                  {item.children.map((child, childIndex) => (
                    <li key={child.id}>
                      <ItemRow {...props} item={child} depth={1} index={childIndex} count={item.children!.length} />
                    </li>
                  ))}
                </ol>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="m-0 rounded-[16px] border border-dashed border-app-line px-4 py-5 text-center text-[13px] text-app-ink-soft">{t("nav.empty")}</p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={add} disabled={full} className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-app-line bg-white px-4 text-[13.5px] font-extrabold text-app-ink hover:border-app-line-strong disabled:opacity-50">
          <Icon name="plus" size={15} /> {t("nav.add")}
        </button>
        {full ? <span className="text-[12.5px] text-app-ink-soft">{t("nav.full")}</span> : null}
      </div>
    </div>
  );
}

function ItemRow({ id, item, depth, index, count, items, onChange, nested, pages, categories, products, nameOf }: ListProps & { item: MenuItem; depth: 0 | 1; index: number; count: number }) {
  const t = useT("store");
  const base = `${id}-${item.id}`;
  const shownName = item.label.trim() || nameOf(item) || t("nav.item.untitled");
  const problem = itemProblem(item);
  const [urlDraft, setUrlDraft] = useState(item.url ?? "");

  const setTarget = (value: string) => {
    if (value === "link") {
      onChange(updateMenuItem(items, item.id, { kind: "link", ref: undefined, url: "", newTab: false }));
      setUrlDraft("");
      return;
    }
    const [kind, ...rest] = value.split(":");
    onChange(updateMenuItem(items, item.id, { kind: kind as MenuItem["kind"], ref: rest.join(":"), url: undefined, newTab: undefined }));
  };
  const iconButton = (icon: "arrowUp" | "arrowDown" | "chevRight" | "arrowLeft" | "trash", label: string, action: () => void, disabled = false, danger = false) => (
    <button
      type="button"
      onClick={action}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cx("grid h-9 w-9 place-items-center rounded-full border border-app-line bg-white disabled:opacity-35", danger ? "text-[#C2412D] hover:bg-[#FDECEA]" : "text-app-ink hover:border-app-line-strong")}
    >
      <Icon name={icon} size={15} />
    </button>
  );

  return (
    <div className="rounded-[16px] border border-app-line bg-white p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <label htmlFor={`${base}-label`} className="mb-1 block text-[12.5px] font-bold text-app-ink">{t("nav.item.label")}</label>
          <input id={`${base}-label`} className={FIELD_INPUT} value={item.label} maxLength={60} placeholder={nameOf(item)} onChange={(event) => onChange(updateMenuItem(items, item.id, { label: event.target.value }))} />
        </div>
        <div className="min-w-0">
          <label htmlFor={`${base}-target`} className="mb-1 block text-[12.5px] font-bold text-app-ink">{t("nav.item.target")}</label>
          <select id={`${base}-target`} className={FIELD_SELECT} value={targetValue(item)} onChange={(event) => setTarget(event.target.value)}>
            <optgroup label={t("nav.group.pages")}>
              {pages.map((page) => <option key={page} value={`page:${page}`}>{t(PAGE_KEYS[page])}</option>)}
              {item.kind === "page" && item.ref && !pages.includes(item.ref as keyof typeof PAGE_KEYS) ? <option value={`page:${item.ref}`}>{nameOf(item) || item.ref}</option> : null}
            </optgroup>
            {categories.length ? (
              <optgroup label={t("nav.group.categories")}>
                {categories.map((category) => <option key={category.slug} value={`category:${category.slug}`}>{category.name}</option>)}
              </optgroup>
            ) : null}
            {item.kind === "category" && !categories.some((category) => category.slug === item.ref) ? <option value={targetValue(item)}>{nameOf(item)}</option> : null}
            {products.length ? (
              <optgroup label={t("nav.group.products")}>
                {products.map((product) => <option key={product.id} value={`product:${product.id}`}>{product.name}</option>)}
              </optgroup>
            ) : null}
            {item.kind === "product" && !products.some((product) => product.id === item.ref) ? <option value={targetValue(item)}>{nameOf(item)}</option> : null}
            <optgroup label={t("nav.group.custom")}>
              <option value="link">{t("nav.customUrl")}</option>
            </optgroup>
          </select>
        </div>
      </div>

      {item.kind === "link" ? (
        <div className="mt-3 grid gap-2">
          <div>
            <label htmlFor={`${base}-url`} className="mb-1 block text-[12.5px] font-bold text-app-ink">{t("nav.item.url")}</label>
            <input
              id={`${base}-url`}
              className={FIELD_INPUT}
              value={urlDraft}
              inputMode="url"
              placeholder="https://"
              aria-invalid={problem === "url"}
              aria-describedby={problem ? `${base}-problem` : undefined}
              onChange={(event) => {
                setUrlDraft(event.target.value);
                onChange(updateMenuItem(items, item.id, { url: safeMenuUrl(event.target.value) ?? event.target.value }));
              }}
              onBlur={() => {
                const url = safeMenuUrl(urlDraft);
                if (url) setUrlDraft(url);
              }}
            />
          </div>
          <label className="flex items-center gap-2 text-[13px] text-app-ink">
            <input type="checkbox" className={CHECKBOX} checked={Boolean(item.newTab)} onChange={(event) => onChange(updateMenuItem(items, item.id, { newTab: event.target.checked }))} />
            {t("nav.item.newTab")}
          </label>
        </div>
      ) : null}
      {problem ? <p id={`${base}-problem`} className="mb-0 mt-2 text-[12.5px] font-semibold text-[#C2412D]">{problem === "url" ? t("nav.urlError") : t("nav.labelNeeded")}</p> : null}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {depth ? <span className="mr-1 font-mono text-[11px] uppercase tracking-[0.12em] text-app-ink-soft">{t("nav.item.sub")}</span> : null}
        {iconButton("arrowUp", t("nav.item.up", { name: shownName }), () => onChange(moveMenuItem(items, item.id, -1)), index === 0)}
        {iconButton("arrowDown", t("nav.item.down", { name: shownName }), () => onChange(moveMenuItem(items, item.id, 1)), index === count - 1)}
        {nested && depth === 0 ? iconButton("chevRight", t("nav.item.indent", { name: shownName }), () => onChange(indentMenuItem(items, item.id)), !canIndentMenuItem(items, item.id)) : null}
        {nested && depth === 1 ? iconButton("arrowLeft", t("nav.item.outdent", { name: shownName }), () => onChange(outdentMenuItem(items, item.id))) : null}
        <span className="ml-auto" />
        {iconButton("trash", t("nav.item.remove", { name: shownName }), () => onChange(removeMenuItem(items, item.id)), false, true)}
      </div>
    </div>
  );
}

// ─── Preview ─────────────────────────────────────────────────────────────────

function Preview({ nav, pages, categories, products, store, logoText, dirty }: { nav: StoreNavigation; pages: string[]; categories: Category[]; products: Product[]; store: PreviewStore; logoText: string; dirty: boolean }) {
  const t = useT("store");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const resolve = (menu: MenuItem[], underShop: boolean) => resolveMenu(menu, {
    hasPage: (page) => pages.includes(page),
    goPage: () => undefined,
    categories,
    goCategory: () => undefined,
    products,
    categoriesUnderShop: underShop,
  });
  const main = resolve(nav.main, true);
  const mobile = nav.mobileSource === "custom" ? resolve(nav.mobile, true) : main;
  const footer = resolve(nav.footer, false);
  const brand = <StoreBrandMark store={store} name={logoText} background="#ffffff" nameClassName="text-[14px] font-extrabold" />;

  return (
    <section className="rounded-[22px] border border-app-line bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-[17px] font-extrabold">{t("nav.preview")}</h2>
        <div className="inline-flex rounded-full border border-app-line p-0.5" role="group" aria-label={t("nav.previewDevice")}>
          {(["desktop", "mobile"] as const).map((entry) => (
            <button key={entry} type="button" aria-pressed={device === entry} onClick={() => setDevice(entry)} className={cx("inline-flex min-h-[34px] items-center gap-1.5 rounded-full px-3 text-[13px] font-bold", device === entry ? "bg-app-ink text-white" : "text-app-ink")}>
              <Icon name={entry === "desktop" ? "monitor" : "phone"} size={14} />
              {entry === "desktop" ? t("nav.previewDesktop") : t("nav.previewMobile")}
            </button>
          ))}
        </div>
      </div>

      {device === "desktop" ? (
        <div className="mt-4 overflow-hidden rounded-[16px] border border-app-line">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-app-line bg-app-canvas px-4 py-3">
            <span className="mr-auto min-w-0">{brand}</span>
            {main.length ? main.map((item) => (
              <span key={item.id} className="inline-flex items-center gap-0.5 text-[13px] font-bold">
                {item.label}{item.children.length ? <Icon name="chevDown" size={12} /> : null}
              </span>
            )) : <span className="text-[12.5px] text-app-ink-soft">{t("nav.previewEmpty")}</span>}
          </div>
          <div className="h-20" aria-hidden />
          <FooterPreview items={footer} empty={t("nav.previewEmpty")} />
        </div>
      ) : (
        <div className="mx-auto mt-4 w-full max-w-[260px] overflow-hidden rounded-[28px] border-[6px] border-app-ink bg-white">
          <div className="flex items-center gap-2 border-b border-app-line px-3 py-2.5">
            <Icon name="menu" size={18} />
            <span className="min-w-0 flex-1">{brand}</span>
            <Icon name="bag" size={16} />
          </div>
          <div className="border-b border-app-line bg-app-canvas px-3 py-3">
            <p className="m-0 mb-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-app-ink-soft">{t("nav.previewOpened", { style: t(STYLE_KEYS[nav.mobileStyle]) })}</p>
            <div className="mb-2">{brand}</div>
            {mobile.length ? (
              <ul className="m-0 list-none p-0">
                {mobile.map((item) => (
                  <li key={item.id} className="border-b border-app-line py-2 text-[13.5px] font-semibold last:border-b-0">
                    <span className="flex items-center justify-between">{item.label}<Icon name={item.children.length ? "chevDown" : "chevRight"} size={13} /></span>
                    {item.children.length ? <span className="mt-1 block pl-3 text-[12px] font-normal text-app-ink-soft">{item.children.map((child) => child.label).join(" · ")}</span> : null}
                  </li>
                ))}
              </ul>
            ) : <p className="m-0 text-[12.5px] text-app-ink-soft">{t("nav.previewEmpty")}</p>}
          </div>
          <FooterPreview items={footer} empty={t("nav.previewEmpty")} stacked />
        </div>
      )}
      <p className={FIELD_HELP}>{dirty ? t("nav.unsaved") : t("nav.previewNote")}</p>
    </section>
  );
}

function FooterPreview({ items, empty, stacked = false }: { items: ShownMenuItem[]; empty: string; stacked?: boolean }) {
  return (
    <div className={cx("border-t border-app-line px-4 py-3", stacked ? "grid gap-1" : "flex flex-wrap gap-x-4 gap-y-1")}>
      {items.length ? items.map((item) => <span key={item.id} className="text-[12.5px] text-app-ink-soft">{item.label}</span>) : <span className="text-[12.5px] text-app-ink-soft">{empty}</span>}
    </div>
  );
}
