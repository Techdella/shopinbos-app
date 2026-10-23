"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { Notice, PillButton, Segmented, cx } from "@/components/app-ui";
import { Pill } from "@/components/app-kit";
import { SeoTab } from "@/components/seo/SeoTab";
import { MediaLibraryDialog } from "@/components/media/MediaLibraryDialog";
import { mainRichField, slugError, slugify, type CmsField, type RichValue } from "@/lib/cms/fields";
import { docImages, firstParagraphText, plainText, summarize } from "@/lib/cms/richtext";
import { normalizeSeo, type SeoFields } from "@/lib/seo/fields";
import { FieldInput } from "./FieldInput";
import { LayoutPicker } from "../../LayoutPicker";
import { itemLayoutOptions } from "../CollectionSettings";
import { ITEM_LAYOUT_KEY, isItemLayout, type ItemLayout, type ListLayout } from "@/lib/cms/layouts";
import { Modal } from "@/components/cms/pickers";
import { CollectionSetup, type MenuState } from "../../CollectionSetup";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { formatDate } from "@shared/i18n";
import { friendlyError } from "@/lib/errors/report-client";

// The item editor: Content | SEO | Settings tabs, like WordPress. Saves through /api/app/cms; the server
// validates every field and rebuilds rich text HTML.

export interface EditorItem {
  id: string | null;
  title: string;
  slug: string;
  status: "draft" | "published" | "scheduled";
  publishAt: string | null;
  author: string;
  featuredImage: string | null;
  excerpt: string;
  data: Record<string, unknown>;
  seo: unknown;
  sortOrder: number;
  createdBy: string;
}

const input = "min-h-[44px] w-full rounded-[14px] border border-app-line bg-white px-3.5 text-[14.5px] text-app-ink outline-none transition placeholder:text-app-ink-faint focus:border-app-ink";

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function ItemEditor(props: {
  collection: { id: string; name: string; slug: string; itemLabel: string; template: string; isPublished: boolean; itemLayout: ItemLayout; layout: ListLayout; description: string; setupDone: boolean };
  /** Where the collection shows in the store's menus. */
  menu: MenuState;
  /** Open the collection set-up (after the first item was saved). */
  setup?: boolean;
  fields: CmsField[];
  item: EditorItem;
  storeOrigin: string;
  storeSlug: string;
  storeName: string;
  authorName: string;
  collections: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const t = useT("cms");
  const locale = useLocale();
  const label = props.collection.itemLabel.toLowerCase();
  const [tab, setTab] = useState<"content" | "seo" | "settings">("content");
  const [item, setItem] = useState<EditorItem>(props.item);
  const [seo, setSeo] = useState<SeoFields>(normalizeSeo(props.item.seo));
  const [slugTouched, setSlugTouched] = useState(Boolean(props.item.id));
  const [busy, setBusy] = useState<"" | "draft" | "publish">("");
  const [notice, setNotice] = useState<{ tone: "error" | "success" | "info"; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(Boolean(props.setup));
  const [rexOpen, setRexOpen] = useState(false);
  const [rexBrief, setRexBrief] = useState("");
  const [rexBusy, setRexBusy] = useState(false);
  const [rexError, setRexError] = useState("");
  const tm = useT("media");
  const saved = useRef(JSON.stringify({ item: props.item, seo: normalizeSeo(props.item.seo) }));
  const dirty = JSON.stringify({ item, seo }) !== saved.current;

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const main = mainRichField(props.fields);
  const mainDoc = main ? (item.data[main.key] as RichValue | undefined)?.json : undefined;
  const content = useMemo(
    () => (mainDoc ? { firstParagraph: firstParagraphText(mainDoc), bodyText: plainText(mainDoc), images: docImages(mainDoc) } : undefined),
    [mainDoc],
  );
  const slug = slugTouched ? item.slug : item.slug || slugify(item.title);
  const slugProblem = slug ? slugError(slug) : null;
  const live = item.status === "published" || (item.status === "scheduled" && item.publishAt && new Date(item.publishAt) <= new Date());
  const viewHref = `${props.storeOrigin}/${props.collection.slug}/${slug}`;

  const set = (patch: Partial<EditorItem>) => setItem((current) => ({ ...current, ...patch }));
  const setValue = (key: string, value: unknown) => setItem((current) => ({ ...current, data: { ...current.data, [key]: value } }));

  async function save(nextStatus: "draft" | "published" | "scheduled") {
    if (!item.title.trim()) {
      setTab("content");
      setErrors({ title: t("ed.addTitle") });
      return;
    }
    if (nextStatus === "scheduled" && !item.publishAt) {
      setTab("settings");
      setErrors({ publishAt: t("ed.pickWhen") });
      return;
    }
    setBusy(nextStatus === "draft" ? "draft" : "publish");
    setNotice(null);
    setErrors({});
    const body = {
      title: item.title.trim(),
      slug,
      status: nextStatus,
      publishAt: nextStatus === "scheduled" && item.publishAt ? new Date(item.publishAt).toISOString() : null,
      author: item.author,
      featuredImage: item.featuredImage,
      excerpt: item.excerpt,
      data: item.data,
      layout: isItemLayout(item.data[ITEM_LAYOUT_KEY]) ? item.data[ITEM_LAYOUT_KEY] : "default",
      seo,
      sortOrder: item.sortOrder,
    };
    try {
      const res = await fetch(item.id ? `/api/app/cms/items/${item.id}` : `/api/app/cms/collections/${props.collection.id}/items`, {
        method: item.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as { data?: { id: string; slug: string; status: EditorItem["status"]; data: Record<string, unknown>; excerpt: string; publishAt: string | null; seo: unknown }; error?: { message?: string; fields?: Record<string, string> } } | null;
      if (!res.ok || !json?.data) {
        setErrors(json?.error?.fields ?? {});
        if (json?.error?.fields && Object.keys(json.error.fields).some((key) => props.fields.some((field) => field.key === key) || key === "title")) setTab("content");
        else if (json?.error?.fields?.slug || json?.error?.fields?.publishAt || json?.error?.fields?.featuredImage) setTab(json.error.fields.slug ? "seo" : "settings");
        setNotice({ tone: "error", text: json?.error?.message ?? t("ed.saveError") });
        return;
      }
      // Keep the local field values (the editor's own document) so the cursor doesn't jump after saving.
      const next: EditorItem = { ...item, id: json.data.id, slug: json.data.slug, status: json.data.status, publishAt: json.data.publishAt };
      const nextSeo = normalizeSeo(json.data.seo);
      setItem(next);
      setSeo(nextSeo);
      setSlugTouched(true);
      saved.current = JSON.stringify({ item: next, seo: nextSeo });
      setNotice({
        tone: "success",
        text: nextStatus === "published" ? t("ed.published") : nextStatus === "scheduled" ? t("ed.scheduledFor", { date: formatDate(item.publishAt!, locale, { dateStyle: "medium", timeStyle: "short" }) }) : t("ed.savedDraft"),
      });
      // The first item in a collection that isn't set up or in a menu yet: offer the set-up (style, menu).
      const offerSetup = !props.collection.setupDone && !props.menu.header && !props.menu.footer;
      if (!item.id) router.replace(`/home/cms/${props.collection.id}/${json.data.id}${offerSetup ? "?setup=1" : ""}`);
      else router.refresh();
    } catch {
      setNotice({ tone: "error", text: t("ed.network") });
    } finally {
      setBusy("");
    }
  }

  async function writeWithRex() {
    setRexBusy(true);
    setRexError("");
    try {
      const res = await fetch(`/api/app/cms/collections/${props.collection.id}/write`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief: rexBrief, ...(item.title.trim() ? { title: item.title.trim() } : {}) }),
      });
      const json = (await res.json().catch(() => null)) as { data?: { title: string; excerpt: string; data: Record<string, unknown>; seo: Partial<SeoFields> }; error?: { message?: string } } | null;
      if (!res.ok || !json?.data) throw new Error(json?.error?.message ?? t("rex.failed"));
      const written = json.data;
      setItem((current) => ({ ...current, title: current.title.trim() || written.title, excerpt: written.excerpt || current.excerpt, data: { ...current.data, ...written.data } }));
      setSeo((current) => ({ ...current, ...Object.fromEntries(Object.entries(written.seo).filter(([, value]) => Boolean(value))) }));
      setRexOpen(false);
      setTab("content");
      setNotice({ tone: "info", text: t("rex.draftIn") });
    } catch (e) {
      setRexError(e instanceof Error ? friendlyError(e) : t("rex.failed"));
    } finally {
      setRexBusy(false);
    }
  }

  const primaryLabel = item.status === "scheduled" ? t("ed.schedule") : item.id && item.status === "published" ? t("ed.update") : t("ia.publish");
  const tabs = [
    { key: "content" as const, label: t("ed.tab.content") },
    { key: "seo" as const, label: t("ed.tab.seo") },
    { key: "settings" as const, label: t("ed.tab.settings") },
  ];

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label={t("ed.sections")} className="flex gap-2 overflow-x-auto">
          {tabs.map((entry) => (
            <button
              key={entry.key}
              id={`tab-${entry.key}`}
              type="button"
              role="tab"
              aria-selected={tab === entry.key}
              aria-controls={`panel-${entry.key}`}
              onClick={() => setTab(entry.key)}
              className={cx("inline-flex min-h-[42px] shrink-0 items-center gap-1.5 rounded-full border px-4 text-[14px] font-bold", tab === entry.key ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong")}
            >
              {entry.label}
              {entry.key === "seo" && seo.metaTitle && seo.metaDescription ? <Icon name="check" size={13} /> : null}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => { setRexBrief(rexBrief || item.title); setRexOpen(true); }} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-app-line bg-white px-4 text-[14px] font-bold text-app-ink hover:border-app-line-strong">
            <Icon name="sparkle" size={15} /> {t("rex.writeWith")}
          </button>
          <Pill tone={live ? "success" : item.status === "scheduled" ? "info" : "muted"} dot>{live ? t("status.live") : item.status === "scheduled" ? t("status.scheduled") : t("status.draft")}</Pill>
          {item.id && live && props.collection.isPublished && (
            <a href={viewHref} target="_blank" rel="noreferrer" className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-app-line bg-white px-4 text-[14px] font-bold text-app-ink no-underline hover:border-app-line-strong"><Icon name="eye" size={15} /> {t("view")}</a>
          )}
          <PillButton tone="white" size="md" busy={busy === "draft"} disabled={Boolean(busy)} onClick={() => void save("draft")}>{item.status === "draft" || !item.id ? t("ed.saveDraft") : t("ed.toDraft")}</PillButton>
          <PillButton tone="accent" size="md" busy={busy === "publish"} disabled={Boolean(busy) || Boolean(slugProblem)} onClick={() => void save(item.status === "scheduled" ? "scheduled" : "published")}>{primaryLabel}</PillButton>
        </div>
      </div>

      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      {dirty && !busy && <p className="m-0 -mt-2 text-[13px] text-app-ink-soft" aria-live="polite">{t("fe.unsaved")}</p>}

      <div id="panel-content" role="tabpanel" aria-labelledby="tab-content" hidden={tab !== "content"} className="grid gap-5">
        <section className="grid gap-5 rounded-[22px] border border-app-line bg-white p-4 sm:p-6">
          <div>
            <label htmlFor="item-title" className="mb-1.5 block text-[14px] font-extrabold">{t("ed.titleLabel")}</label>
            <input
              id="item-title"
              className={cx(input, "min-h-[52px] text-[20px] font-extrabold")}
              value={item.title}
              maxLength={200}
              placeholder={t("ed.titlePh", { label: props.collection.itemLabel })}
              onChange={(e) => set({ title: e.target.value, ...(slugTouched ? {} : { slug: "" }) })}
              aria-invalid={Boolean(errors.title)}
            />
            {errors.title && <p className="m-0 mt-1.5 text-[13px] text-app-danger" role="alert">{errors.title}</p>}
            <p className="m-0 mt-1.5 truncate text-[12.5px] text-app-ink-soft">{props.storeOrigin.replace(/^https?:\/\//, "")}/{props.collection.slug}/{slug || "…"}</p>
          </div>
          {props.fields.length === 0 && <p className="m-0 text-[14px] text-app-ink-soft">{t("ed.noFields")}</p>}
          {props.fields.map((field) => (
            <FieldInput key={field.id} field={field} value={item.data[field.key]} onChange={(value) => setValue(field.key, value)} error={errors[field.key]} collections={props.collections} rex={{ title: item.title, collection: props.collection.name }} />
          ))}
        </section>
      </div>

      <div id="panel-seo" role="tabpanel" aria-labelledby="tab-seo" hidden={tab !== "seo"}>
        <SeoTab
          value={seo}
          onChange={setSeo}
          title={item.title || t("newItem", { label })}
          fallbackDescription={item.excerpt || (mainDoc ? summarize(mainDoc, 155) : "")}
          slug={slug}
          onSlugChange={(next) => { setSlugTouched(true); set({ slug: next }); }}
          urlPrefix={`${props.storeOrigin}/${props.collection.slug}/`}
          siteName={props.storeName}
          fallbackImage={item.featuredImage}
          content={content}
        />
        {(slugProblem || errors.slug) && <p className="m-0 mt-2 text-[13px] text-app-danger" role="alert">{errors.slug ?? slugProblem}</p>}
      </div>

      <div id="panel-settings" role="tabpanel" aria-labelledby="tab-settings" hidden={tab !== "settings"} className="grid gap-5 lg:grid-cols-2">
        <section className="grid content-start gap-4 rounded-[22px] border border-app-line bg-white p-4 sm:p-6">
          <h2 className="m-0 text-[16px] font-extrabold">{t("ed.publishing")}</h2>
          <div>
            <span className="mb-1.5 block text-[13.5px] font-bold">{t("ed.status")}</span>
            <Segmented
              options={[{ value: "draft", label: t("status.draft") }, { value: "published", label: t("status.published") }, { value: "scheduled", label: t("status.scheduled") }]}
              value={item.status}
              onChange={(status) => set({ status })}
            />
            <p className="m-0 mt-1.5 text-[12.5px] text-app-ink-soft">{t("ed.takesEffect", { primary: primaryLabel })}</p>
          </div>
          {item.status === "scheduled" && (
            <div>
              <label htmlFor="item-when" className="mb-1.5 block text-[13.5px] font-bold">{t("ed.publishOn")}</label>
              <input id="item-when" type="datetime-local" className={cx(input, "sm:max-w-[280px]")} value={toLocalInput(item.publishAt)} onChange={(e) => set({ publishAt: e.target.value ? new Date(e.target.value).toISOString() : null })} aria-invalid={Boolean(errors.publishAt)} />
              {errors.publishAt && <p className="m-0 mt-1.5 text-[13px] text-app-danger" role="alert">{errors.publishAt}</p>}
              <p className="m-0 mt-1.5 text-[12.5px] text-app-ink-soft">{t("ed.goesLive")}</p>
            </div>
          )}
          <div>
            <label htmlFor="item-author" className="mb-1.5 block text-[13.5px] font-bold">{t("ed.author")}</label>
            <div className="flex flex-wrap gap-2">
              <input id="item-author" className={cx(input, "min-w-0 flex-1 basis-[200px]")} value={item.author} maxLength={80} placeholder={t("ed.authorPh")} onChange={(e) => set({ author: e.target.value })} />
              {!item.author && props.authorName && <button type="button" onClick={() => set({ author: props.authorName })} className="inline-flex min-h-[44px] items-center rounded-full border border-app-line px-4 text-[13.5px] font-bold">{t("ed.use", { name: props.authorName })}</button>}
            </div>
          </div>
          <div>
            <label htmlFor="item-excerpt" className="mb-1.5 block text-[13.5px] font-bold">{t("ed.summary")} <span className="block text-[12.5px] font-normal text-app-ink-soft">{t("ed.summaryHelp")}</span></label>
            <textarea id="item-excerpt" rows={3} className={cx(input, "resize-y py-2.5")} value={item.excerpt} maxLength={500} onChange={(e) => set({ excerpt: e.target.value })} />
          </div>
          <LayoutPicker
            legend={t("ed.layout")}
            help={t("ed.layoutHelp")}
            value={isItemLayout(item.data[ITEM_LAYOUT_KEY]) ? (item.data[ITEM_LAYOUT_KEY] as ItemLayout | "default") : "default"}
            onChange={(next) => setValue(ITEM_LAYOUT_KEY, next === "default" ? undefined : next)}
            options={[
              { value: "default" as const, label: t("ed.layoutDefault"), help: itemLayoutOptions(t).find((option) => option.value === props.collection.itemLayout)?.label },
              ...itemLayoutOptions(t),
            ]}
          />
          <div>
            <label htmlFor="item-order" className="mb-1.5 block text-[13.5px] font-bold">{t("ed.position")} <span className="block text-[12.5px] font-normal text-app-ink-soft">{t("ed.positionHelp")}</span></label>
            <input id="item-order" type="number" min={0} className={cx(input, "sm:max-w-[160px]")} value={item.sortOrder} onChange={(e) => set({ sortOrder: Math.max(0, Number(e.target.value) || 0) })} />
          </div>
        </section>

        <section className="grid content-start gap-3 rounded-[22px] border border-app-line bg-white p-4 sm:p-6">
          <h2 className="m-0 text-[16px] font-extrabold">{t("ed.featured")}</h2>
          <p className="m-0 text-[13px] text-app-ink-soft">{t("ed.featuredHelp", { label })}</p>
          <button type="button" onClick={() => setLibraryOpen(true)} aria-label={item.featuredImage ? t("ed.replace") : tm("field.choose")} className="block w-full overflow-hidden rounded-[16px] p-0">
            {item.featuredImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.featuredImage} alt="" className="aspect-[16/9] w-full rounded-[16px] border border-app-line object-cover" />
            ) : (
              <span className="grid aspect-[16/9] w-full place-items-center rounded-[16px] border border-dashed border-app-line-strong bg-app-canvas text-[13.5px] text-app-ink-soft">{t("ed.noPicture")}</span>
            )}
          </button>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setLibraryOpen(true)} className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-app-line bg-white px-4 text-[13.5px] font-bold hover:border-app-line-strong">
              <Icon name={item.featuredImage ? "refresh" : "grid"} size={15} /> {item.featuredImage ? t("ed.replace") : tm("field.choose")}
            </button>
            {item.featuredImage && <button type="button" onClick={() => set({ featuredImage: null })} className="inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 text-[13.5px] font-bold text-app-danger hover:bg-app-danger-tint"><Icon name="trash" size={15} /> {t("ed.remove")}</button>}
          </div>
          {errors.featuredImage && <p className="m-0 text-[13px] text-app-danger" role="alert">{errors.featuredImage}</p>}
          <MediaLibraryDialog open={libraryOpen} onClose={() => setLibraryOpen(false)} onSelect={([asset]) => asset && set({ featuredImage: asset.url })} />
          {item.createdBy === "peggy" || item.createdBy === "rex" || item.createdBy === "import" ? (
            <p className="m-0 mt-2 text-[12.5px] text-app-ink-soft">{item.createdBy === "import" ? t("ed.fromOldBlog") : t("ed.draftedBy", { who: item.createdBy === "peggy" ? "Peggy" : "Rex" })}</p>
          ) : null}
        </section>
      </div>
      {rexOpen && (
        <Modal
          title={t("rex.writeWith")}
          wide
          onClose={() => !rexBusy && setRexOpen(false)}
          footer={<PillButton tone="ink" size="sm" busy={rexBusy} disabled={rexBrief.trim().length < 3} onClick={() => void writeWithRex()}>{t("rex.writeDraft")}</PillButton>}
        >
          <label htmlFor="rex-brief" className="mb-1.5 block text-[13.5px] font-bold">{t("rex.briefLabel", { label })} <span className="block text-[12.5px] font-normal text-app-ink-soft">{t("rex.briefHelp")}</span></label>
          <textarea id="rex-brief" rows={5} maxLength={1500} className={cx(input, "resize-y py-2.5")} value={rexBrief} placeholder={t("rex.briefPh")} onChange={(e) => setRexBrief(e.target.value)} />
          {mainDoc && plainText(mainDoc).trim() && <p className="m-0 mt-2 text-[12.5px] text-app-ink-soft">{t("rex.replaces")}</p>}
          {rexError && <p className="m-0 mt-2 text-[13px] text-app-danger" role="alert">{rexError}</p>}
        </Modal>
      )}
      {setupOpen && (
        <CollectionSetup
          collection={{ id: props.collection.id, name: props.collection.name, description: props.collection.description, itemLabel: props.collection.itemLabel, layout: props.collection.layout, itemLayout: props.collection.itemLayout, isPublished: props.collection.isPublished }}
          menu={props.menu}
          onClose={() => {
            setSetupOpen(false);
            router.replace(`/home/cms/${props.collection.id}/${item.id}`);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
