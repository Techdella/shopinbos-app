"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cx } from "@/components/app-ui";
import { field } from "@/components/seller-core";

// Selects for the reviews list. Each change keeps the other filters and goes back to page 1.
export function ReviewFilters({
  products,
  sources,
}: {
  products: { id: string; name: string }[];
  sources: { value: string; label: string; count: number }[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  function go(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    const qs = next.toString();
    router.push(`/home/reviews${qs ? `?${qs}` : ""}`);
  }

  const select = cx(field.select, "h-11 rounded-full sm:w-auto");

  return (
    <>
      <select aria-label="Filter by rating" className={cx(select, "sm:min-w-[130px]")} value={params.get("rating") ?? ""} onChange={(e) => go("rating", e.target.value)}>
        <option value="">Any rating</option>
        {[5, 4, 3, 2, 1].map((star) => <option key={star} value={star}>{star} star{star === 1 ? "" : "s"}</option>)}
      </select>
      <select aria-label="Filter by source" className={cx(select, "sm:min-w-[150px]")} value={params.get("source") ?? ""} onChange={(e) => go("source", e.target.value)}>
        <option value="">All sources</option>
        <option value="imported">All imported</option>
        <option value="social">Social and WhatsApp</option>
        <option value="marketplace">Marketplaces</option>
        {sources.map((source) => <option key={source.value} value={source.value}>{source.label} ({source.count})</option>)}
      </select>
      <select aria-label="Filter by status" className={cx(select, "sm:min-w-[140px]")} value={params.get("status") ?? ""} onChange={(e) => go("status", e.target.value)}>
        <option value="">Any status</option>
        <option value="approved">Published</option>
        <option value="pending">Waiting</option>
        <option value="rejected">Hidden</option>
      </select>
      {products.length > 0 ? (
        <select aria-label="Filter by product" className={cx(select, "sm:min-w-[170px] sm:max-w-[240px]")} value={params.get("product") ?? ""} onChange={(e) => go("product", e.target.value)}>
          <option value="">All products</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      ) : null}
    </>
  );
}
