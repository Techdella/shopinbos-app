"use client";

import { useCallback, useEffect, useState } from "react";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Badge, Icon } from "@/components/ui";

interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  productCount?: number;
}

export default function SellerCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "", description: "" });
  const [notice, setNotice] = useState("");

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

  const handleCreate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.slug.trim()) return;
    try {
      const res = await fetch("/api/store/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setShowForm(false);
        setForm({ name: "", slug: "", description: "" });
        setNotice("Category created");
        const reload = await fetch("/api/store/categories");
        const data = await reload.json();
        setCategories(data.data ?? []);
      } else {
        const err = await res.json();
        setNotice(err.error?.message ?? "Failed to create");
      }
    } catch { setNotice("Network error"); }
    setTimeout(() => setNotice(""), 3000);
  }, [form]);

  return (
    <AppFrame role="seller">
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
        <PageHead
          title="Categories"
          sub={`${categories.length} categories — products organized by category appear in your storefront`}
          actions={
            <button onClick={() => setShowForm(!showForm)} className="dbtn dBtn-mint" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name="plus" size={14} /> {showForm ? "Cancel" : "Add Category"}
            </button>
          }
        />

        {notice && (
          <div style={{ padding: "10px 14px", borderRadius: 8, background: "var(--teal-50)", color: "var(--teal-800)", fontSize: 13, border: "1px solid var(--teal-200)" }}>
            {notice}
          </div>
        )}

        {showForm && (
          <form onSubmit={handleCreate} className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="field"><label className="label">Name</label><input className="inp" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
            <div className="field"><label className="label">Slug</label><input className="inp" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} required placeholder="e.g. skincare" /></div>
            <div className="field"><label className="label">Description</label><textarea className="ta" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <button type="submit" className="dbtn dBtn-mint" style={{ alignSelf: "flex-start" }}>Create Category</button>
          </form>
        )}

        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--ink-500)", fontSize: 13 }}>Loading...</div>
          ) : categories.length > 0 ? (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Slug</th>
                  <th>Description</th>
                  <th style={{ textAlign: "right" }}>Products</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((cat) => (
                  <tr key={cat.id}>
                    <td><strong style={{ fontSize: 13 }}>{cat.name}</strong></td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-500)" }}>{cat.slug}</td>
                    <td style={{ fontSize: 12, color: "var(--ink-500)" }}>{cat.description || "—"}</td>
                    <td style={{ textAlign: "right", fontSize: 13 }}>{cat.productCount ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: 40, textAlign: "center" }}>
              <Icon name="grid" size={28} />
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink-700)", marginTop: 10 }}>No categories yet</div>
              <div style={{ fontSize: 13, color: "var(--ink-500)", marginTop: 6 }}>Categories help organize your products and allow customers to browse by topic.</div>
            </div>
          )}
        </div>
      </div>
    </AppFrame>
  );
}
