"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useRouter } from "next/navigation";
import { Notice, PillButton, Toggle, cx } from "@/components/app-ui";
import { SeoTab } from "@/components/seo/SeoTab";
import { slugError } from "@/lib/cms/fields";
import { normalizeSeo, type SeoFields } from "@/lib/seo/fields";
import { useT } from "@/components/i18n/I18nProvider";
import type { ItemLayout, ListLayout } from "@/lib/cms/layouts";
import type { TFunction } from "@shared/i18n";
import type { KeysOf } from "@shared/i18n/catalog";
import { LayoutPicker } from "../LayoutPicker";

// Name, web address, layout, order, visibility and the list page's SEO; deleting the collection.

const input = "min-h-[44px] w-full rounded-[14px] border border-app-line bg-white px-3.5 text-[14.5px] outline-none focus:border-app-ink";

export function listLayoutOptions(t: TFunction<KeysOf<["cms"]>>) {
  return [
    { value: "grid" as const, label: t("cs.cards"), help: t("cs.cardsHelp") },
    { value: "list" as const, label: t("cs.list"), help: t("cs.listHelp") },
    { value: "magazine" as const, label: t("cs.magazine"), help: t("cs.magazineHelp") },
    { value: "compact" as const, label: t("cs.compact"), help: t("cs.compactHelp") },
  ];
}

export function itemLayoutOptions(t: TFunction<KeysOf<["cms"]>>) {
  return [
    { value: "classic" as const, label: t("lay.classic"), help: t("lay.classicHelp") },
    { value: "wide" as const, label: t("lay.wide"), help: t("lay.wideHelp") },
    { value: "sidebar" as const, label: t("lay.sidebar"), help: t("lay.sidebarHelp") },
    { value: "minimal" as const, label: t("lay.minimal"), help: t("lay.minimalHelp") },
  ];
}

export function CollectionSettings(props: {
  collection: { id: string; name: string; slug: string; description: string; itemLabel: string; isPublished: boolean; seo: unknown; layout: ListLayout; itemLayout: ItemLayout; sort: "newest" | "oldest" | "title" | "manual" };
  storeOrigin: string;
  storeName: string;
}) {
  const router = useRouter();
  const t = useT("cms");
  const c = props.collection;
  const [name, setName] = useState(c.name);
  const [slug, setSlug] = useState(c.slug);
  const [description, setDescription] = useState(c.description);
  const [itemLabel, setItemLabel] = useState(c.itemLabel);
  const [layout, setLayout] = useState(c.layout);
  const [itemLayout, setItemLayout] = useState(c.itemLayout);
  const [sort, setSort] = useState(c.sort);
  const [isPublished, setPublished] = useState(c.isPublished);
  const [seo, setSeo] = useState<SeoFields>(normalizeSeo(c.seo));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const slugProblem = slugError(slug, "collection");

  async function save() {
    setBusy(true);
    setNotice(null);
    const res = await fetch(`/api/app/cms/collections/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, slug, description, itemLabel, layout, itemLayout, sort, isPublished, seo }),
    });
    const json = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) return setNotice({ tone: "error", text: json?.error?.message ?? t("cs.saveError") });
    setNotice({ tone: "success", text: slug !== c.slug ? t("cs.savedMoved", { slug, old: c.slug }) : t("cs.saved") });
    router.refresh();
  }

  async function remove() {
    const res = await fetch(`/api/app/cms/collections/${c.id}`, { method: "DELETE" });
    if (res.ok) router.push("/home/cms");
    else setNotice({ tone: "error", text: t("cs.deleteError") });
  }

  return (
    <div className="grid gap-5">
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      <section className="grid gap-4 rounded-[22px] border border-app-line bg-white p-4 sm:p-6 lg:grid-cols-2">
        <div>
          <label htmlFor="cs-name" className="mb-1.5 block text-[13.5px] font-bold">{t("new.name")}</label>
          <input id="cs-name" className={input} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="cs-label" className="mb-1.5 block text-[13.5px] font-bold">{t("cs.eachItem")}</label>
          <input id="cs-label" className={input} value={itemLabel} maxLength={40} placeholder={t("cs.eachItemPh")} onChange={(e) => setItemLabel(e.target.value)} />
        </div>
        <div className="lg:col-span-2">
          <label htmlFor="cs-desc" className="mb-1.5 block text-[13.5px] font-bold">{t("cs.intro")}</label>
          <textarea id="cs-desc" rows={2} className={cx(input, "py-2.5")} value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="lg:col-span-2">
          <LayoutPicker
            legend={t("cs.layout")}
            help={t("cs.layoutHelp")}
            value={layout}
            onChange={setLayout}
            options={listLayoutOptions(t)}
          />
        </div>
        <div className="lg:col-span-2">
          <LayoutPicker
            legend={t("cs.itemLayout", { label: itemLabel || c.itemLabel })}
            help={t("cs.itemLayoutHelp")}
            value={itemLayout}
            onChange={setItemLayout}
            options={itemLayoutOptions(t)}
          />
        </div>
        <div>
          <label htmlFor="cs-sort" className="mb-1.5 block text-[13.5px] font-bold">{t("cs.order")}</label>
          <select id="cs-sort" className={input} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="newest">{t("cs.newest")}</option>
            <option value="oldest">{t("cs.oldest")}</option>
            <option value="title">{t("cs.az")}</option>
            <option value="manual">{t("cs.manual")}</option>
          </select>
        </div>
        <div className="flex items-center justify-between gap-4 rounded-[16px] bg-app-canvas p-4 lg:col-span-2">
          <div>
            <p className="m-0 text-[14px] font-bold">{t("cs.show")}</p>
            <p className="m-0 text-[12.5px] text-app-ink-soft">{t("cs.showHelp")}</p>
          </div>
          <Toggle on={isPublished} onChange={setPublished} label={t("cs.show")} />
        </div>
      </section>

      <div>
        <h2 className="mb-3 mt-1 text-[18px] font-extrabold">{t("cs.listSeo")}</h2>
        <SeoTab
          value={seo}
          onChange={setSeo}
          title={`${name} | ${props.storeName}`}
          fallbackDescription={description}
          slug={slug}
          onSlugChange={setSlug}
          urlPrefix={`${props.storeOrigin}/`}
          siteName={props.storeName}
        />
        {slugProblem && <p className="m-0 mt-2 text-[13px] text-app-danger" role="alert">{slugProblem}</p>}
      </div>

      <MenuSection collectionId={c.id} name={name || c.name} />

      <div className="sticky bottom-3 z-10 flex justify-end rounded-full bg-white/90 p-2 backdrop-blur">
        <PillButton tone="ink" size="md" busy={busy} disabled={Boolean(slugProblem) || !name.trim()} onClick={() => void save()}>{t("cs.save")}</PillButton>
      </div>

      <section className="rounded-[22px] border border-app-danger/30 bg-white p-4 sm:p-6">
        <h2 className="m-0 text-[16px] font-extrabold text-app-danger">{t("cs.deleteTitle")}</h2>
        <p className="mb-3 mt-1 text-[13.5px] text-app-ink-soft">{t("cs.deleteHelp")}</p>
        <div className="flex flex-wrap gap-2">
          <label htmlFor="cs-confirm" className="sr-only">{t("cs.typeToConfirm", { name: c.name })}</label>
          <input id="cs-confirm" className={cx(input, "min-w-0 flex-1 basis-[220px]")} value={confirmName} placeholder={c.name} onChange={(e) => setConfirmName(e.target.value)} />
          <PillButton tone="white" size="md" className="!border-app-danger !text-app-danger" disabled={confirmName.trim() !== c.name} onClick={() => void remove()}>{t("cs.deleteBtn")}</PillButton>
        </div>
      </section>
    </div>
  );
}

/** Where the collection shows in the store's menus, with buttons to add it to the header or footer. */
function MenuSection({ collectionId, name }: { collectionId: string; name: string }) {
  const t = useT("cms");
  const [menu, setMenu] = useState<{ header: boolean; footer: boolean } | null>(null);
  const [busy, setBusy] = useState<"" | "header" | "footer">("");
  const [error, setError] = useState("");
  useEffect(() => {
    fetch(`/api/app/cms/collections/${collectionId}/menu`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => json?.data && setMenu(json.data))
      .catch(() => {});
  }, [collectionId]);
  async function add(placement: "header" | "footer") {
    setBusy(placement);
    setError("");
    const res = await fetch(`/api/app/cms/collections/${collectionId}/menu`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ placement }) });
    const json = await res.json().catch(() => null);
    setBusy("");
    if (!res.ok) return setError(json?.error?.message ?? t("setup.menuError"));
    setMenu(json.data);
  }
  return (
    <section className="grid gap-3 rounded-[22px] border border-app-line bg-white p-4 sm:p-6">
      <div>
        <h2 className="m-0 text-[16px] font-extrabold">{t("setup.step.menu")}</h2>
        <p className="m-0 mt-1 text-[13px] text-app-ink-soft">{t("setup.whereMenu", { name })}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {(["header", "footer"] as const).map((placement) =>
          menu?.[placement] ? (
            <span key={placement} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-app-canvas px-4 text-[13.5px] font-bold"><Icon name="check" size={14} /> {placement === "header" ? t("setup.inHeader") : t("setup.inFooter")}</span>
          ) : (
            <PillButton key={placement} tone="white" size="sm" busy={busy === placement} disabled={!menu || Boolean(busy)} onClick={() => void add(placement)}>{t(`setup.add.${placement}`)}</PillButton>
          ),
        )}
        <a href="/home/navigation" className="ml-auto text-[13.5px] font-bold text-app-ink underline">{t("setup.editMenus")}</a>
      </div>
      {error && <p className="m-0 text-[13px] text-app-danger" role="alert">{error}</p>}
    </section>
  );
}
