"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Notice, PillButton, Segmented, Toggle, cx } from "@/components/app-ui";
import { SeoTab } from "@/components/seo/SeoTab";
import { slugError } from "@/lib/cms/fields";
import { normalizeSeo, type SeoFields } from "@/lib/seo/fields";

// Name, web address, layout, order, visibility and the list page's SEO; deleting the collection.

const input = "min-h-[44px] w-full rounded-[14px] border border-app-line bg-white px-3.5 text-[14.5px] outline-none focus:border-app-ink";

export function CollectionSettings(props: {
  collection: { id: string; name: string; slug: string; description: string; itemLabel: string; isPublished: boolean; seo: unknown; layout: "grid" | "list"; sort: "newest" | "oldest" | "title" | "manual" };
  storeOrigin: string;
  storeName: string;
}) {
  const router = useRouter();
  const c = props.collection;
  const [name, setName] = useState(c.name);
  const [slug, setSlug] = useState(c.slug);
  const [description, setDescription] = useState(c.description);
  const [itemLabel, setItemLabel] = useState(c.itemLabel);
  const [layout, setLayout] = useState(c.layout);
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
      body: JSON.stringify({ name, slug, description, itemLabel, layout, sort, isPublished, seo }),
    });
    const json = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) return setNotice({ tone: "error", text: json?.error?.message ?? "Couldn't save" });
    setNotice({ tone: "success", text: slug !== c.slug ? `Saved. The collection is now at /${slug}; old links to /${c.slug} stop working.` : "Saved." });
    router.refresh();
  }

  async function remove() {
    const res = await fetch(`/api/app/cms/collections/${c.id}`, { method: "DELETE" });
    if (res.ok) router.push("/home/cms");
    else setNotice({ tone: "error", text: "Couldn't delete the collection" });
  }

  return (
    <div className="grid gap-5">
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      <section className="grid gap-4 rounded-[22px] border border-app-line bg-white p-4 sm:p-6 lg:grid-cols-2">
        <div>
          <label htmlFor="cs-name" className="mb-1.5 block text-[13.5px] font-bold">Name</label>
          <input id="cs-name" className={input} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="cs-label" className="mb-1.5 block text-[13.5px] font-bold">Each item is a…</label>
          <input id="cs-label" className={input} value={itemLabel} maxLength={40} placeholder="Post, Recipe, Lesson" onChange={(e) => setItemLabel(e.target.value)} />
        </div>
        <div className="lg:col-span-2">
          <label htmlFor="cs-desc" className="mb-1.5 block text-[13.5px] font-bold">Intro shown on the list page</label>
          <textarea id="cs-desc" rows={2} className={cx(input, "py-2.5")} value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <span className="mb-1.5 block text-[13.5px] font-bold">Layout</span>
          <Segmented options={[{ value: "grid", label: "Cards" }, { value: "list", label: "List" }]} value={layout} onChange={setLayout} />
        </div>
        <div>
          <label htmlFor="cs-sort" className="mb-1.5 block text-[13.5px] font-bold">Order</label>
          <select id="cs-sort" className={input} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="title">A to Z</option>
            <option value="manual">Your order (set on each item)</option>
          </select>
        </div>
        <div className="flex items-center justify-between gap-4 rounded-[16px] bg-app-canvas p-4 lg:col-span-2">
          <div>
            <p className="m-0 text-[14px] font-bold">Show in my store</p>
            <p className="m-0 text-[12.5px] text-app-ink-soft">Off hides the whole collection, even published items.</p>
          </div>
          <Toggle on={isPublished} onChange={setPublished} label="Show in my store" />
        </div>
      </section>

      <div>
        <h2 className="mb-3 mt-1 text-[18px] font-extrabold">List page SEO</h2>
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

      <div className="sticky bottom-3 z-10 flex justify-end rounded-full bg-white/90 p-2 backdrop-blur">
        <PillButton tone="ink" size="md" busy={busy} disabled={Boolean(slugProblem) || !name.trim()} onClick={() => void save()}>Save settings</PillButton>
      </div>

      <section className="rounded-[22px] border border-app-danger/30 bg-white p-4 sm:p-6">
        <h2 className="m-0 text-[16px] font-extrabold text-app-danger">Delete this collection</h2>
        <p className="mb-3 mt-1 text-[13.5px] text-app-ink-soft">Deletes the collection and every item in it. Type its name to confirm.</p>
        <div className="flex flex-wrap gap-2">
          <label htmlFor="cs-confirm" className="sr-only">Type {c.name} to confirm</label>
          <input id="cs-confirm" className={cx(input, "min-w-0 flex-1 basis-[220px]")} value={confirmName} placeholder={c.name} onChange={(e) => setConfirmName(e.target.value)} />
          <PillButton tone="white" size="md" className="!border-app-danger !text-app-danger" disabled={confirmName.trim() !== c.name} onClick={() => void remove()}>Delete collection</PillButton>
        </div>
      </section>
    </div>
  );
}
