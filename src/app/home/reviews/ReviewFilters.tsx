"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cx } from "@/components/app-ui";
import { field } from "@/components/seller-core";
import { useT } from "@/components/i18n/I18nProvider";

// Selects for the reviews list. Each change keeps the other filters and goes back to page 1.
export function ReviewFilters({
  products,
  sources,
}: {
  products: { id: string; name: string }[];
  sources: { value: string; label: string; count: number }[];
}) {
  const router = useRouter();
  const t = useT("reviews");
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
      <select aria-label={t("filter.rating")} className={cx(select, "sm:min-w-[130px]")} value={params.get("rating") ?? ""} onChange={(e) => go("rating", e.target.value)}>
        <option value="">{t("filter.anyRating")}</option>
        {[5, 4, 3, 2, 1].map((star) => <option key={star} value={star}>{t("filter.stars", { count: star })}</option>)}
      </select>
      <select aria-label={t("filter.source")} className={cx(select, "sm:min-w-[150px]")} value={params.get("source") ?? ""} onChange={(e) => go("source", e.target.value)}>
        <option value="">{t("filter.allSources")}</option>
        <option value="imported">{t("filter.allImported")}</option>
        <option value="social">{t("filter.social")}</option>
        <option value="marketplace">{t("filter.marketplaces")}</option>
        {sources.map((source) => <option key={source.value} value={source.value}>{source.label} ({source.count})</option>)}
      </select>
      <select aria-label={t("filter.status")} className={cx(select, "sm:min-w-[140px]")} value={params.get("status") ?? ""} onChange={(e) => go("status", e.target.value)}>
        <option value="">{t("filter.anyStatus")}</option>
        <option value="approved">{t("status.approved")}</option>
        <option value="pending">{t("status.pending")}</option>
        <option value="rejected">{t("status.rejected")}</option>
      </select>
      {products.length > 0 ? (
        <select aria-label={t("filter.product")} className={cx(select, "sm:min-w-[170px] sm:max-w-[240px]")} value={params.get("product") ?? ""} onChange={(e) => go("product", e.target.value)}>
          <option value="">{t("filter.allProducts")}</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      ) : null}
    </>
  );
}
