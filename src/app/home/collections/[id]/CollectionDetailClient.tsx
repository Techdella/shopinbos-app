"use client";

import { useCallback, useEffect, useState } from "react";
import { Notice, PillButton, Spinner, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { field } from "@/components/seller-core";

interface Product {
  id: string;
  name: string;
  image: string | null;
  price: number | null;
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

type RawProduct = { id?: string; name?: string; image?: string | null; images?: string[]; price?: number | null; retailPrice?: number | null };

// The collection API returns CollectionProduct rows ({ product: {...} }) and the products API returns
// store products (images[], retailPrice); both are flattened to one shape here.
function toProduct(raw: RawProduct & { product?: RawProduct }): Product {
  const p = raw.product ?? raw;
  return { id: String(p.id ?? ""), name: String(p.name ?? "Product"), image: p.image ?? p.images?.[0] ?? null, price: p.price ?? p.retailPrice ?? null };
}

function toCollection(raw: Record<string, unknown>): CollectionDetail {
  const products = Array.isArray(raw.products) ? (raw.products as Array<RawProduct & { product?: RawProduct }>).map(toProduct) : [];
  const count = (raw._count as { products?: number } | undefined)?.products;
  return {
    id: String(raw.id),
    name: String(raw.name ?? ""),
    slug: String(raw.slug ?? ""),
    description: (raw.description as string | null) ?? null,
    type: raw.type === "auto" ? "auto" : "manual",
    imageUrl: (raw.imageUrl as string | null) ?? null,
    productCount: Number(raw.productCount ?? count ?? products.length) || 0,
    products,
  };
}

function Thumb({ product }: { product: Product }) {
  return product.image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={product.image} alt="" className="h-12 w-12 shrink-0 rounded-[12px] border border-app-line object-cover" />
  ) : (
    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[12px] border border-app-line bg-app-canvas text-[14px] font-extrabold">
      {product.name.charAt(0).toUpperCase()}
    </span>
  );
}

const money = (price: number | null) => (price == null ? "—" : `₦${Math.round(price).toLocaleString("en-NG")}`);

export function CollectionDetailClient({ id }: { id: string }) {
  const [collection, setCollection] = useState<CollectionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/store/collections/${id}`);
      const data = await res.json();
      if (data.data) setCollection(toCollection(data.data));
    } catch {
      setNotice({ tone: "error", text: "Could not load collection" });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const closeModal = useCallback(() => {
    setShowAddModal(false);
    setSearchQuery("");
    setSearchResults([]);
    setSelectedIds(new Set());
  }, []);

  useEffect(() => {
    if (!showAddModal) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showAddModal, closeModal]);

  const searchProducts = useCallback(async (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/store/products?q=${encodeURIComponent(q)}&limit=50`);
      const data = await res.json();
      if (Array.isArray(data.data)) setSearchResults(data.data.map(toProduct));
    } catch {
      setNotice({ tone: "error", text: "Search failed" });
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
      if (res.ok) {
        await load();
        closeModal();
        setNotice({ tone: "success", text: "Products added" });
      } else {
        const data = await res.json().catch(() => null);
        setNotice({ tone: "error", text: data?.error?.message ?? "Could not add products" });
      }
    } catch {
      setNotice({ tone: "error", text: "Could not add products" });
    } finally {
      setAdding(false);
    }
  }, [id, selectedIds, load, closeModal]);

  const removeProduct = useCallback(async (productId: string) => {
    setRemoving(productId);
    try {
      const res = await fetch(`/api/store/collections/${id}/products`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: [productId] }),
      });
      if (res.ok) {
        await load();
        setNotice({ tone: "success", text: "Product removed" });
      } else {
        const data = await res.json().catch(() => null);
        setNotice({ tone: "error", text: data?.error?.message ?? "Could not remove product" });
      }
    } catch {
      setNotice({ tone: "error", text: "Could not remove product" });
    } finally {
      setRemoving(null);
    }
  }, [id, load]);

  const toggleSelected = useCallback((productId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center gap-2 rounded-[22px] border border-app-line bg-white px-6 py-12 text-[14px] text-app-ink-soft"><Spinner /> Loading collection…</div>;
  }

  if (!collection) {
    return <Notice>Collection not found.</Notice>;
  }

  return (
    <div className="grid gap-5">
      {notice && (
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1"><Notice tone={notice.tone}>{notice.text}</Notice></div>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message" className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-black/[0.04]">
            <Icon name="x" size={16} />
          </button>
        </div>
      )}

      {(collection.imageUrl || collection.description) && (
        <div className="grid gap-5 md:grid-cols-2">
          {collection.imageUrl && (
            <div className="overflow-hidden rounded-[22px] border border-app-line bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={collection.imageUrl} alt={collection.name} className="block h-[200px] w-full object-cover" />
            </div>
          )}
          {collection.description && (
            <div className="rounded-[22px] border border-app-line bg-white p-5 text-[14.5px] leading-[1.6] text-app-ink-soft">
              {collection.description}
            </div>
          )}
        </div>
      )}

      <section className="overflow-hidden rounded-[22px] border border-app-line bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-app-line px-4 py-3.5 sm:px-5">
          <h2 className="m-0 text-[17px] font-extrabold">Products · {collection.products.length}</h2>
          <PillButton tone="ink" size="sm" onClick={() => setShowAddModal(true)}>
            <Icon name="plus" size={14} /> Add products
          </PillButton>
        </div>
        {collection.products.length === 0 ? (
          <p className="m-0 px-5 py-10 text-center text-[14px] text-app-ink-soft">
            No products in this collection yet. Use &ldquo;Add products&rdquo; to pick some.
          </p>
        ) : (
          <ul className="m-0 list-none divide-y divide-app-line p-0">
            {collection.products.map((p) => (
              <li key={p.id} className="flex items-center gap-3.5 px-4 py-3 sm:px-5">
                <Thumb product={p} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-extrabold">{p.name}</div>
                  <div className="text-[13px] text-app-ink-soft">{money(p.price)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => void removeProduct(p.id)}
                  disabled={removing === p.id}
                  aria-label={`Remove ${p.name} from this collection`}
                  className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full border border-app-line bg-white px-3.5 text-[13px] font-bold text-app-danger hover:border-app-danger disabled:opacity-55"
                >
                  {removing === p.id ? <Spinner className="h-4 w-4" /> : <Icon name="x" size={14} />}
                  <span className="hidden sm:inline">Remove</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {showAddModal && (
        <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={closeModal}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-products-title"
            onClick={(event) => event.stopPropagation()}
            className="flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-[22px] bg-white font-app text-app-ink sm:max-h-[80vh] sm:max-w-[560px] sm:rounded-[22px]"
          >
            <div className="flex items-center justify-between gap-3 border-b border-app-line px-5 py-4">
              <h2 id="add-products-title" className="m-0 text-[17px] font-extrabold">Add products</h2>
              <button type="button" onClick={closeModal} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-full hover:bg-app-canvas">
                <Icon name="x" size={18} />
              </button>
            </div>
            <div className="border-b border-app-line px-5 py-3">
              <input
                value={searchQuery}
                onChange={(e) => searchProducts(e.target.value)}
                className={field.input}
                placeholder="Search your products"
                aria-label="Search your products"
                autoFocus
              />
            </div>
            <div className="min-h-[200px] flex-1 overflow-auto p-2">
              {searching ? (
                <div className="flex items-center justify-center gap-2 p-6 text-[14px] text-app-ink-soft"><Spinner /> Searching…</div>
              ) : searchResults.length === 0 ? (
                <p className="m-0 p-6 text-center text-[14px] text-app-ink-soft">
                  {searchQuery ? "No products found" : "Type to search for products"}
                </p>
              ) : (
                <ul className="m-0 grid list-none gap-1 p-0">
                  {searchResults.map((p) => {
                    const alreadyIn = collection.products.some((cp) => cp.id === p.id);
                    const selected = selectedIds.has(p.id);
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          disabled={alreadyIn}
                          aria-pressed={alreadyIn ? undefined : selected}
                          onClick={() => toggleSelected(p.id)}
                          className={cx(
                            "flex w-full items-center gap-3 rounded-[14px] px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-50",
                            selected ? "bg-app-mint" : "hover:bg-app-canvas",
                          )}
                        >
                          <Thumb product={p} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[14.5px] font-bold">{p.name}</span>
                            <span className="block text-[13px] text-app-ink-soft">{money(p.price)}</span>
                          </span>
                          {alreadyIn ? (
                            <span className="rounded-full bg-app-canvas px-2.5 py-1 text-[12px] font-bold text-app-ink-soft">Added</span>
                          ) : selected ? (
                            <Icon name="checkCircle" size={20} className="text-app-forest" />
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-app-line px-5 py-3">
              <PillButton tone="white" size="md" onClick={closeModal}>Cancel</PillButton>
              <PillButton tone="accent" size="md" onClick={() => void addProducts()} disabled={selectedIds.size === 0} busy={adding}>
                Add {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
              </PillButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
