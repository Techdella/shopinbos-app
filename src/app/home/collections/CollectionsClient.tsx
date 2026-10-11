"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Notice, PillButton, Spinner, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { field } from "@/components/seller-core";

interface Collection {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: "manual" | "auto";
  imageUrl: string | null;
  productCount: number;
}

export function CollectionsClient({ startOpen }: { startOpen: boolean }) {
  const router = useRouter();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(startOpen);
  const [form, setForm] = useState({
    name: "", slug: "", description: "", type: "manual", imageUrl: "",
  });
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => setShowForm(startOpen), [startOpen]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/store/collections");
        const data = await res.json();
        if (Array.isArray(data.data)) setCollections(data.data);
      } catch {
        setNotice({ tone: "error", text: "Could not load collections" });
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const autoSlug = useCallback((name: string) => {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }, []);

  const handleNameChange = useCallback((name: string) => {
    setForm((prev) => ({
      ...prev, name,
      slug: prev.slug === autoSlug(prev.name) ? autoSlug(name) : prev.slug,
    }));
  }, [autoSlug]);

  function close() {
    setShowForm(false);
    if (startOpen) router.replace("/home/collections", { scroll: false });
  }

  const createCollection = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/store/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.data) {
        setCollections((prev) => [data.data, ...prev]);
        setShowForm(false);
        if (startOpen) router.replace("/home/collections", { scroll: false });
        setForm({ name: "", slug: "", description: "", type: "manual", imageUrl: "" });
        setNotice({ tone: "success", text: "Collection created" });
      } else {
        setNotice({ tone: "error", text: data?.error?.message ?? "Could not create collection" });
      }
    } catch {
      setNotice({ tone: "error", text: "Could not create collection" });
    } finally {
      setSaving(false);
    }
  }, [form, router, startOpen]);

  return (
    <div className="grid gap-4">
      {notice && (
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1"><Notice tone={notice.tone}>{notice.text}</Notice></div>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message" className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-black/[0.04]">
            <Icon name="x" size={16} />
          </button>
        </div>
      )}

      {showForm && (
        <form onSubmit={(e) => void createCollection(e)} className="grid gap-4 rounded-[22px] border border-app-line bg-white p-5 sm:p-6">
          <h2 className="m-0 text-[17px] font-extrabold">New collection</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="collection-name" className={field.label}>Name</label>
              <input id="collection-name" value={form.name} onChange={(e) => handleNameChange(e.target.value)} className={field.input} required />
            </div>
            <div>
              <label htmlFor="collection-slug" className={field.label}>Web address</label>
              <input id="collection-slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className={field.input} required />
            </div>
            <div>
              <label htmlFor="collection-type" className={field.label}>Type</label>
              <select id="collection-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={field.select}>
                <option value="manual">Manual: I pick the products</option>
                <option value="auto">Automatic</option>
              </select>
            </div>
            <div>
              <label htmlFor="collection-image" className={field.label}>Cover image link</label>
              <input id="collection-image" value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} className={field.input} placeholder="https://..." />
            </div>
          </div>
          <div>
            <label htmlFor="collection-description" className={field.label}>Description</label>
            <textarea id="collection-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={field.textarea} rows={2} />
          </div>
          <div className="flex flex-wrap gap-2">
            <PillButton type="submit" tone="accent" size="md" busy={saving}>Create collection</PillButton>
            <PillButton tone="white" size="md" onClick={close}>Cancel</PillButton>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-[22px] border border-app-line bg-white px-6 py-12 text-[14px] text-app-ink-soft"><Spinner /> Loading collections…</div>
      ) : collections.length === 0 ? (
        <div className="flex flex-col items-center rounded-[22px] border border-app-line bg-white px-6 py-12 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-app-peach text-app-accent-ink"><Icon name="layers" size={22} /></span>
          <h2 className="mb-0 mt-4 text-[18px] font-extrabold">No collections yet</h2>
          <p className="mb-0 mt-1.5 max-w-[460px] text-[14.5px] leading-[1.55] text-app-ink-soft">Group products for a sale, a season or a gift guide, and share the collection as one link.</p>
          {!showForm && (
            <div className="mt-5"><PillButton tone="ink" size="md" onClick={() => setShowForm(true)}><Icon name="plus" size={16} /> Create collection</PillButton></div>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 min-[2200px]:grid-cols-5">
          {collections.map((c) => (
            <Link key={c.id} href={`/home/collections/${c.id}`} className="group overflow-hidden rounded-[22px] border border-app-line bg-white text-app-ink no-underline transition hover:border-app-line-strong">
              <div className="grid aspect-[16/9] place-items-center overflow-hidden bg-app-mint">
                {c.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.imageUrl} alt="" className="h-full w-full object-cover transition group-hover:scale-[1.02]" />
                ) : (
                  <Icon name="layers" size={34} className="text-app-forest" />
                )}
              </div>
              <div className="p-4">
                <div className="flex min-w-0 items-center gap-2">
                  <h2 className="m-0 truncate text-[16px] font-extrabold">{c.name}</h2>
                  <span className={cx("shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-bold", c.type === "auto" ? "bg-app-mint text-app-forest" : "bg-app-canvas text-app-ink-soft")}>
                    {c.type === "auto" ? "Automatic" : "Manual"}
                  </span>
                </div>
                <div className="mt-0.5 text-[13px] text-app-ink-soft">
                  {c.productCount} {c.productCount === 1 ? "product" : "products"}
                </div>
                {c.description && <p className="m-0 mt-1.5 line-clamp-2 text-[13px] leading-[1.45] text-app-ink-soft">{c.description}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
