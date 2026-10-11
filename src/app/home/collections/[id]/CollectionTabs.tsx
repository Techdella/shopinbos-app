"use client";

import { useState } from "react";
import { cx } from "@/components/app-ui";
import { ResourceSeoPanel } from "@/components/seo/ResourceSeoPanel";
import { CollectionDetailClient } from "./CollectionDetailClient";

// Products | SEO tabs on a product collection.
export function CollectionTabs(props: { id: string; name: string; slug: string; description: string | null; imageUrl: string | null; storeOrigin: string; storeName: string }) {
  const [tab, setTab] = useState<"products" | "seo">("products");
  return (
    <div className="grid gap-5">
      <div role="tablist" aria-label="Collection sections" className="flex gap-2">
        {(["products", "seo"] as const).map((key) => (
          <button key={key} id={`ctab-${key}`} type="button" role="tab" aria-selected={tab === key} aria-controls={`cpanel-${key}`} onClick={() => setTab(key)} className={cx("inline-flex min-h-[42px] items-center rounded-full border px-4 text-[14px] font-bold", tab === key ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong")}>
            {key === "products" ? "Products" : "SEO"}
          </button>
        ))}
      </div>
      <div id="cpanel-products" role="tabpanel" aria-labelledby="ctab-products" hidden={tab !== "products"}>
        <CollectionDetailClient id={props.id} />
      </div>
      {tab === "seo" && (
        <div id="cpanel-seo" role="tabpanel" aria-labelledby="ctab-seo">
          <ResourceSeoPanel
            resourceType="collection"
            resourceId={props.id}
            title={`${props.name} | ${props.storeName}`}
            fallbackDescription={props.description ?? ""}
            slug={props.slug}
            urlPrefix={`${props.storeOrigin}/collections/`}
            siteName={props.storeName}
            fallbackImage={props.imageUrl}
          />
        </div>
      )}
    </div>
  );
}
