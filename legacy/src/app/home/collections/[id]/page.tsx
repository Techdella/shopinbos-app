"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Badge, Icon } from "@/components/ui";

interface Product {
  id: string;
  name: string;
  image: string | null;
  price: number;
}

interface CollectionDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: "manual" | "auto";
  imageUrl: string | null;
  productCount: number;
  products: Product[];
}

export default function CollectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [collection, setCollection] = useState<CollectionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/store/collections/${id}`);
        const data = await res.json();
        if (data.data) setCollection(data.data);
      } catch {
        setNotice("Could not load collection");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [id]);

  const searchProducts = useCallback(async (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/store/products?search=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (Array.isArray(data.data)) setSearchResults(data.data);
    } catch {
      setNotice("Search failed");
    } finally {
      setSearching(false);
    }
  }, []);

  const addProducts = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/store/collections/${id}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (data.data) {
        setCollection(data.data);
        setShowAddModal(false);
        setSearchQuery("");
        setSearchResults([]);
        setSelectedIds(new Set());
        setNotice("Products added!");
      }
    } catch {
      setNotice("Could not add products");
    } finally {
      setAdding(false);
    }
  }, [id, selectedIds]);

  const removeProduct = useCallback(async (productId: string) => {
    try {
      const res = await fetch(`/api/store/collections/${id}/products`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: [productId] }),
      });
      const data = await res.json();
      if (data.data) {
        setCollection(data.data);
        setNotice("Product removed");
      }
    } catch {
      setNotice("Could not remove product");
    }
  }, [id]);

  const toggleSelected = useCallback((productId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }, []);

  if (loading) {
    return (
      <AppFrame role="seller" storeName="Your Store">
        <div style={{ padding: "24px 28px 40px", textAlign: "center", color: "var(--text-sec)" }}>Loading...</div>
      </AppFrame>
    );
  }

  if (!collection) {
    return (
      <AppFrame role="seller" storeName="Your Store">
        <div style={{ padding: "24px 28px 40px", textAlign: "center", color: "var(--text-sec)" }}>
          Collection not found.
        </div>
      </AppFrame>
    );
  }

  return (
    <AppFrame role="seller" storeName="Your Store">
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
        <PageHead
          title={collection.name}
          sub={`${collection.productCount} ${collection.productCount === 1 ? "product" : "products"} · ${collection.type === "auto" ? "Automatic" : "Manual"} collection`}
          crumbs={["Collections", collection.name]}
          actions={
            <button onClick={() => router.push("/home/collections")}
              className="dbtn dBtn-ghost" style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}>
              <Icon name="arrowLeft" size={14} /> Back
            </button>
          }
        />

        {notice && (
          <div style={{ padding: "8px 14px", borderRadius: 8, fontSize: 13, background: "var(--mint-bg)", color: "var(--mint)", border: "1px solid var(--mint-border)" }}>
            {notice}
            <button onClick={() => setNotice("")} style={{ float: "right", background: "none", border: "none", cursor: "pointer", color: "inherit", fontFamily: "inherit" }}>✕</button>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          {collection.imageUrl && (
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <img src={collection.imageUrl} alt={collection.name}
                style={{ width: "100%", height: 200, objectFit: "cover", display: "block" }} />
            </div>
          )}
          {collection.description && (
            <div className="card" style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--text-sec)" }}>
              {collection.description}
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
            Products ({collection.products.length})
          </h3>
          <button onClick={() => setShowAddModal(true)}
            className="dbtn dBtn-mint" style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}>
            <Icon name="plus" size={14} /> Add Products
          </button>
        </div>

        {collection.products.length === 0 ? (
          <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--text-sec)", fontSize: 13 }}>
            No products in this collection yet. Click "Add Products" to add some.
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Price</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {collection.products.map((p) => (
                  <tr key={p.id}>
                    <td style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--mint-bg)", overflow: "hidden", flexShrink: 0 }}>
                        {p.image ? (
                          <img src={p.image} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Icon name="box" size={16} color="var(--mint)" />
                          </div>
                        )}
                      </div>
                      <span style={{ fontWeight: 600, fontSize: 13.5 }}>{p.name}</span>
                    </td>
                    <td style={{ fontSize: 13 }}>₦{p.price?.toLocaleString() ?? "—"}</td>
                    <td>
                      <button onClick={() => void removeProduct(p.id)}
                        className="dbtn dBtn-ghost dBtn-sm"
                        style={{ border: "none", cursor: "pointer", fontFamily: "inherit", color: "var(--danger, #E53E3E)" }}>
                        <Icon name="x" size={12} /> Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {showAddModal && (
          <div style={{
            position: "fixed", inset: 0, zIndex: 1000,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.4)",
          }}>
            <div className="card" style={{ width: "90%", maxWidth: 520, maxHeight: "80vh", display: "flex", flexDirection: "column", padding: 0 }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border, rgba(0,0,0,0.06))", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Add Products</h3>
                <button onClick={() => { setShowAddModal(false); setSearchQuery(""); setSearchResults([]); setSelectedIds(new Set()); }}
                  className="dbtn dBtn-ghost" style={{ border: "none", cursor: "pointer", fontFamily: "inherit", padding: "4px 8px" }}>
                  <Icon name="x" size={16} />
                </button>
              </div>
              <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border, rgba(0,0,0,0.06))" }}>
                <input value={searchQuery} onChange={(e) => searchProducts(e.target.value)}
                  className="inp" placeholder="Search products..." style={{ width: "100%", fontSize: 13 }} autoFocus />
              </div>
              <div style={{ flex: 1, overflow: "auto", padding: 8, minHeight: 200 }}>
                {searching ? (
                  <div style={{ padding: 24, textAlign: "center", color: "var(--text-sec)", fontSize: 13 }}>Searching...</div>
                ) : searchResults.length === 0 ? (
                  <div style={{ padding: 24, textAlign: "center", color: "var(--text-sec)", fontSize: 13 }}>
                    {searchQuery ? "No products found" : "Type to search for products"}
                  </div>
                ) : (
                  searchResults.map((p) => {
                    const alreadyIn = collection.products.some((cp) => cp.id === p.id);
                    const selected = selectedIds.has(p.id);
                    return (
                      <div key={p.id} onClick={() => { if (!alreadyIn) toggleSelected(p.id); }}
                        style={{
                          display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8,
                          cursor: alreadyIn ? "not-allowed" : "pointer", opacity: alreadyIn ? 0.5 : 1,
                          background: selected ? "var(--mint-bg)" : "transparent",
                        }}>
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--mint-bg)", overflow: "hidden", flexShrink: 0 }}>
                          {p.image ? (
                            <img src={p.image} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <Icon name="box" size={16} color="var(--mint)" />
                            </div>
                          )}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                          <div style={{ fontSize: 12, color: "var(--text-sec)" }}>₦{p.price?.toLocaleString() ?? "—"}</div>
                        </div>
                        {alreadyIn ? (
                          <Badge variant="soft">Added</Badge>
                        ) : selected ? (
                          <Icon name="checkCircle" size={18} color="var(--mint)" />
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
              <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border, rgba(0,0,0,0.06))", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => { setShowAddModal(false); setSearchQuery(""); setSearchResults([]); setSelectedIds(new Set()); }}
                  className="dbtn dBtn-ghost" style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                <button onClick={() => void addProducts()} disabled={selectedIds.size === 0 || adding}
                  className="dbtn dBtn-mint" style={{ border: "none", cursor: "pointer", fontFamily: "inherit", opacity: selectedIds.size === 0 || adding ? 0.6 : 1 }}>
                  {adding ? "Adding..." : `Add (${selectedIds.size})`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppFrame>
  );
}
