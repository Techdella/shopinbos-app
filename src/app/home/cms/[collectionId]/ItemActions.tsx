"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/app-ui";

// Quick publish/unpublish and delete on an item row. Publishing goes through the same checks as the editor
// (required fields), so a half-written draft shows what's missing instead of going live.

export function ItemActions({ id, title, status, editHref }: { id: string; title: string; status: string; editHref: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"" | "publish" | "delete">("");
  const [error, setError] = useState("");

  async function patch(nextStatus: "draft" | "published") {
    setBusy("publish");
    setError("");
    try {
      const current = await fetch(`/api/app/cms/items/${id}`).then((res) => res.json());
      const item = current.data;
      if (!item) throw new Error("Item not found");
      const res = await fetch(`/api/app/cms/items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: item.title, slug: item.slug, status: nextStatus, author: item.author, featuredImage: item.featuredImage, excerpt: item.excerpt, data: item.data, seo: item.seo }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Couldn't update it");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update it");
    } finally {
      setBusy("");
    }
  }

  async function remove() {
    if (!window.confirm(`Delete "${title}"? This can't be undone.`)) return;
    setBusy("delete");
    const res = await fetch(`/api/app/cms/items/${id}`, { method: "DELETE" });
    setBusy("");
    if (res.ok) router.refresh();
    else setError("Couldn't delete it");
  }

  const live = status !== "draft";
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      {error && (
        <span role="alert" className="w-full text-[12.5px] text-app-danger sm:w-auto">
          {error} <a href={editHref} className="font-bold text-app-danger">Open</a>
        </span>
      )}
      <button type="button" disabled={Boolean(busy)} onClick={() => void patch(live ? "draft" : "published")} className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-app-line bg-white px-3.5 text-[13px] font-bold hover:border-app-line-strong disabled:opacity-60">
        {busy === "publish" ? <Spinner className="h-4 w-4" /> : null}
        {live ? "Unpublish" : "Publish"}
      </button>
      <button type="button" disabled={Boolean(busy)} onClick={() => void remove()} aria-label={`Delete ${title}`} className="grid h-[38px] w-[38px] place-items-center rounded-full text-app-danger hover:bg-app-danger-tint disabled:opacity-60">
        {busy === "delete" ? <Spinner className="h-4 w-4" /> : <Icon name="trash" size={16} />}
      </button>
    </div>
  );
}
