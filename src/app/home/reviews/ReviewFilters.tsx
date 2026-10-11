"use client";

import { useRouter } from "next/navigation";
import { cx } from "@/components/app-ui";
import { field } from "@/components/seller-core";

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

  const select = cx(field.select, "h-11 rounded-full sm:w-auto");

  return (
    <>
      <select aria-label="Filter by status" className={cx(select, "sm:min-w-[150px]")} value={status}
        onChange={(e) => router.push(buildUrl("status", e.target.value))}>
        <option value="">All statuses</option>
        <option value="approved">Approved</option>
        <option value="pending">Pending</option>
        <option value="rejected">Rejected</option>
      </select>
      {products.length > 0 ? (
        <select aria-label="Filter by product" className={cx(select, "sm:min-w-[180px] sm:max-w-[260px]")} value={product}
          onChange={(e) => router.push(buildUrl("product", e.target.value))}>
          <option value="">All products</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      ) : null}
    </>
  );
}
