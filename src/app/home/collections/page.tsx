"use client";

import { useCallback, useEffect, useState } from "react";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Badge, Icon } from "@/components/ui";

interface Collection {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: "manual" | "auto";
  imageUrl: string | null;
  productCount: number;
}

export default function SellerCollectionsPage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "", slug: "", description: "", type: "manual", imageUrl: "",
  });
  const [notice, setNotice] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/store/collections");
        const data = await res.json();
        if (Array.isArray(data.data)) setCollections(data.data);
      } catch {
        setNotice("Could not load collections");
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

  const createCollection = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
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
        setForm({ name: "", slug: "", description: "", type: "manual", imageUrl: "" });
        setNotice("Collection created!");
      }
    } catch {
      setNotice("Could not create collection");
    }
  }, [form]);

  return (
    <AppFrame role="seller" storeName="Your Store">
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
        <PageHead
          title="Collections"
          sub="Group products into collections for better browsing and promotions"
          actions={
            <button onClick={() => setShowForm(!showForm)}
              className="dbtn dBtn-mint" style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}>
              <Icon name="plus" size={14} /> Create Collection
            </button>
          }
        />

        {notice && (
          <div style={{ padding: "8px 14px", borderRadius: 8, fontSize: 13, background: "var(--mint-bg)", color: "var(--mint)", border: "1px solid var(--mint-border)" }}>
            {notice}
            <button onClick={() => setNotice("")} style={{ float: "right", background: "none", border: "none", cursor: "pointer", color: "inherit", fontFamily: "inherit" }}>✕</button>
          </div>
        )}

        {showForm && (
          <form onSubmit={(e) => void createCollection(e)} className="card" style={{ padding: 20 }}>
            <h3 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 700, color: "var(--text)" }}>New collection</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--text-sec)" }}>
                Name
                <input value={form.name} onChange={(e) => handleNameChange(e.target.value)}
                  className="inp" style={{ fontSize: 13 }} required />
              </label>
              <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--text-sec)" }}>
                Slug
                <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  className="inp" style={{ fontSize: 13, fontFamily: "var(--font-mono)" }} required />
              </label>
              <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--text-sec)" }}>
                Type
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="sel" style={{ fontSize: 13 }}>
                  <option value="manual">Manual</option>
                  <option value="auto">Automatic</option>
                </select>
              </label>
              <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--text-sec)" }}>
                Image URL
                <input value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                  className="inp" style={{ fontSize: 13 }} placeholder="https://..." />
              </label>
            </div>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--text-sec)", marginTop: 12 }}>
              Description
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="inp" style={{ fontSize: 13, resize: "vertical", minHeight: 60 }} rows={2} />
            </label>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
              <button type="button" onClick={() => setShowForm(false)}
                className="dbtn dBtn-ghost" style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              <button type="submit"
                className="dbtn dBtn-mint" style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}>Create</button>
            </div>
          </form>
        )}

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-sec)" }}>Loading...</div>
        ) : collections.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-sec)" }}>
            No collections yet. Create your first collection above.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
            {collections.map((c) => (
              <a key={c.id} href={`/home/collections/${c.id}`}
                style={{ textDecoration: "none", color: "inherit" }}>
                <div className="card" style={{ padding: 0, overflow: "hidden", cursor: "pointer", transition: "box-shadow 0.15s" }}>
                  <div style={{ height: 140, background: "var(--mint-bg)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                    {c.imageUrl ? (
                      <img src={c.imageUrl} alt={c.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <Icon name="layers" size={36} color="var(--mint)" />
                    )}
                  </div>
                  <div style={{ padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{c.name}</span>
                      <Badge variant={c.type === "auto" ? "mint" : "soft"}>{c.type}</Badge>
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--text-sec)" }}>
                      {c.productCount} {c.productCount === 1 ? "product" : "products"}
                    </div>
                    {c.description && (
                      <div style={{ fontSize: 12, color: "var(--text-sec)", marginTop: 4, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {c.description}
                      </div>
                    )}
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </AppFrame>
  );
}
