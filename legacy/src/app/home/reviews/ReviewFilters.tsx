"use client";

import { useRouter } from "next/navigation";

export function ReviewFilters({
  status, product, products, rating,
}: {
  status: string;
  product: string;
  products: { id: string; name: string }[];
  rating: number;
}) {
  const router = useRouter();

  function buildUrl(key: string, val: string) {
    const p = new URLSearchParams();
    if (rating > 0 && key !== "rating") p.set("rating", String(rating));
    if (status && key !== "status") p.set("status", status);
    if (product && key !== "product") p.set("product", product);
    if (val) p.set(key, val);
    const qs = p.toString();
    return `/home/reviews${qs ? `?${qs}` : ""}`;
  }

  return (
    <>
      <select className="sel" style={{ minWidth: 120, fontSize: 12.5 }} value={status}
        onChange={(e) => router.push(buildUrl("status", e.target.value))}>
        <option value="">All statuses</option>
        <option value="approved">Approved</option>
        <option value="pending">Pending</option>
        <option value="rejected">Rejected</option>
      </select>
      {products.length > 0 ? (
        <select className="sel" style={{ minWidth: 160, fontSize: 12.5 }} value={product}
          onChange={(e) => router.push(buildUrl("product", e.target.value))}>
          <option value="">All products</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      ) : null}
    </>
  );
}
