"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Notice, PillButton, Spinner } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { field } from "@/components/seller-core";

interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  productCount?: number;
}

export function CategoriesClient({ startOpen }: { startOpen: boolean }) {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(startOpen);
  const [form, setForm] = useState({ name: "", slug: "", description: "" });
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => setShowForm(startOpen), [startOpen]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/store/categories");
        const data = await res.json();
        setCategories(data.data ?? []);
      } catch {} finally { setLoading(false); }
    }
    load();
  }, []);

  function close() {
    setShowForm(false);
    if (startOpen) router.replace("/home/categories", { scroll: false });
  }

  const handleCreate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.slug.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/store/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setShowForm(false);
        if (startOpen) router.replace("/home/categories", { scroll: false });
        setForm({ name: "", slug: "", description: "" });
        setNotice({ tone: "success", text: "Category created" });
        const reload = await fetch("/api/store/categories");
        const data = await reload.json();
        setCategories(data.data ?? []);
      } else {
        const err = await res.json();
        setNotice({ tone: "error", text: err.error?.message ?? "Failed to create" });
      }
    } catch { setNotice({ tone: "error", text: "Network error" }); }
    setSaving(false);
    setTimeout(() => setNotice(null), 3000);
  }, [form, router, startOpen]);

  return (
    <div className="grid gap-4">
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

      {showForm && (
        <form onSubmit={handleCreate} className="grid gap-4 rounded-[22px] border border-app-line bg-white p-5 sm:p-6">
          <h2 className="m-0 text-[17px] font-extrabold">New category</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="category-name" className={field.label}>Name</label>
              <input id="category-name" className={field.input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label htmlFor="category-slug" className={field.label}>Web address</label>
              <input id="category-slug" className={field.input} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} required placeholder="e.g. skincare" />
            </div>
          </div>
          <div>
            <label htmlFor="category-description" className={field.label}>Description</label>
            <textarea id="category-description" className={field.textarea} rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="flex flex-wrap gap-2">
            <PillButton type="submit" tone="accent" size="md" busy={saving}>Create category</PillButton>
            <PillButton tone="white" size="md" onClick={close}>Cancel</PillButton>
          </div>
        </form>
      )}

      <section className="overflow-hidden rounded-[22px] border border-app-line bg-white">
        {loading ? (
          <div className="flex items-center justify-center gap-2 px-6 py-12 text-[14px] text-app-ink-soft"><Spinner /> Loading categories…</div>
        ) : categories.length > 0 ? (
          <ul className="m-0 list-none divide-y divide-app-line p-0">
            {categories.map((cat) => (
              <li key={cat.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3.5 sm:flex-nowrap sm:px-5">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] border border-app-line bg-app-canvas"><Icon name="grid" size={18} /></span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-extrabold">{cat.name}</div>
                  <div className="truncate text-[13px] text-app-ink-soft">/{cat.slug}{cat.description ? ` · ${cat.description}` : ""}</div>
                </div>
                <div className="w-full pl-[60px] text-[14px] font-bold sm:w-auto sm:pl-0 sm:text-right">
                  {cat.productCount ?? 0} <span className="font-normal text-app-ink-soft">{(cat.productCount ?? 0) === 1 ? "product" : "products"}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-app-peach text-app-accent-ink"><Icon name="grid" size={22} /></span>
            <h2 className="mb-0 mt-4 text-[18px] font-extrabold">No categories yet</h2>
            <p className="mb-0 mt-1.5 max-w-[460px] text-[14.5px] leading-[1.55] text-app-ink-soft">Categories help organise your products and let customers browse by type.</p>
            {!showForm && (
              <div className="mt-5"><PillButton tone="ink" size="md" onClick={() => setShowForm(true)}><Icon name="plus" size={16} /> Add category</PillButton></div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
