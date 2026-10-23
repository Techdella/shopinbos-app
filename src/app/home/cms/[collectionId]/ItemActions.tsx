"use client";

import { confirmDialog } from "@/components/ui/dialogs";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/app-ui";
import { useT } from "@/components/i18n/I18nProvider";
import { friendlyError } from "@/lib/errors/report-client";

// Quick publish/unpublish and delete on an item row. Publishing goes through the same checks as the editor
// (required fields), so a half-written draft shows what's missing instead of going live.

export function ItemActions({ id, title, status, editHref }: { id: string; title: string; status: string; editHref: string }) {
  const router = useRouter();
  const t = useT("cms");
  const [busy, setBusy] = useState<"" | "publish" | "delete">("");
  const [error, setError] = useState("");

  async function patch(nextStatus: "draft" | "published") {
    setBusy("publish");
    setError("");
    try {
      const current = await fetch(`/api/app/cms/items/${id}`).then((res) => res.json());
      const item = current.data;
      if (!item) throw new Error(t("ia.notFound"));
      const res = await fetch(`/api/app/cms/items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: item.title, slug: item.slug, status: nextStatus, author: item.author, featuredImage: item.featuredImage, excerpt: item.excerpt, data: item.data, seo: item.seo }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? t("ia.updateError"));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? friendlyError(e) : t("ia.updateError"));
    } finally {
      setBusy("");
    }
  }

  async function remove() {
    if (!(await confirmDialog(t("ia.confirmDelete", { title })))) return;
    setBusy("delete");
    const res = await fetch(`/api/app/cms/items/${id}`, { method: "DELETE" });
    setBusy("");
    if (res.ok) router.refresh();
    else setError(t("ia.deleteError"));
  }

  const live = status !== "draft";
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      {error && (
        <span role="alert" className="w-full text-[12.5px] text-app-danger sm:w-auto">
          {error} <a href={editHref} className="font-bold text-app-danger">{t("ia.open")}</a>
        </span>
      )}
      <button type="button" disabled={Boolean(busy)} onClick={() => void patch(live ? "draft" : "published")} className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-app-line bg-white px-3.5 text-[13px] font-bold hover:border-app-line-strong disabled:opacity-60">
        {busy === "publish" ? <Spinner className="h-4 w-4" /> : null}
        {live ? t("ia.unpublish") : t("ia.publish")}
      </button>
      <button type="button" disabled={Boolean(busy)} onClick={() => void remove()} aria-label={t("ia.deleteLabel", { title })} className="grid h-[38px] w-[38px] place-items-center rounded-full text-app-danger hover:bg-app-danger-tint disabled:opacity-60">
        {busy === "delete" ? <Spinner className="h-4 w-4" /> : <Icon name="trash" size={16} />}
      </button>
    </div>
  );
}
