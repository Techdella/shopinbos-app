"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";
import { confirmDialog } from "@/components/ui/dialogs";
import { cx } from "@/components/app-ui";

export interface HubDesign {
  id: string;
  kind: "packaging" | "label";
  format: string | null;
  title: string;
  previewUrl: string | null;
  source: string;
  href: string;
  updatedAt: string;
}

const TILES: Array<{ href: string; icon: IconName; title: string; sub: string; dark?: boolean }> = [
  { href: "/home/labels/packaging", icon: "package", title: "hub.packaging", sub: "hub.packagingSub" },
  { href: "/home/labels/studio", icon: "tag", title: "hub.labels", sub: "hub.labelsSub" },
  { href: "/studio/images?creative=1", icon: "image", title: "hub.creatives", sub: "hub.creativesSub" },
  { href: "/home/labels/request", icon: "sparkle", title: "hub.custom", sub: "hub.customSub", dark: true },
];

/** Labels and print: make something new, and everything saved here (by the seller or by Rex). */
export function DesignsHub({ designs, migrationNeeded }: { designs: HubDesign[]; migrationNeeded: boolean }) {
  const t = useT("packaging");
  const [rows, setRows] = useState(designs);
  const [error, setError] = useState<string | null>(null);

  async function remove(design: HubDesign) {
    if (!(await confirmDialog({ title: t("hub.deleteTitle", { name: design.title }), message: t("hub.deleteBody"), confirmLabel: t("hub.delete"), tone: "danger" }))) return;
    setError(null);
    const response = await fetch(`/api/app/print-designs/${design.id}`, { method: "DELETE" }).catch(() => null);
    if (!response?.ok) {
      setError(t("hub.deleteFailed"));
      return;
    }
    setRows((current) => current.filter((row) => row.id !== design.id));
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {TILES.map((tile) => (
          <Link key={tile.href} href={tile.href} className={cx("grid gap-2 rounded-[20px] border p-4 no-underline transition hover:-translate-y-0.5", tile.dark ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink")}>
            <span className={cx("grid h-10 w-10 place-items-center rounded-[12px]", tile.dark ? "bg-white/10" : "bg-app-canvas")}>
              <Icon name={tile.icon} size={18} />
            </span>
            <span className="text-[15px] font-extrabold">{t(tile.title as "hub.packaging")}</span>
            <span className={cx("text-[13px]", tile.dark ? "text-white/75" : "text-app-ink-soft")}>{t(tile.sub as "hub.packagingSub")}</span>
          </Link>
        ))}
      </div>

      <section className="grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="m-0 text-[18px] font-extrabold">{t("hub.saved")}</h2>
            <p className="m-0 mt-0.5 text-[13.5px] text-app-ink-soft">{t("hub.savedSub")}</p>
          </div>
          <Link href="/studio?prompt=Design%20packaging%20for%20my%20best%20seller" className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-app-line bg-white px-4 text-[13px] font-bold text-app-ink no-underline">
            <Icon name="sparkle" size={14} /> {t("hub.askRex")}
          </Link>
        </div>
        {migrationNeeded ? <p className="m-0 rounded-[14px] bg-app-canvas p-3 text-[13px]">{t("hub.migration")}</p> : null}
        {error ? <p role="alert" className="m-0 text-[13px] font-bold text-app-danger">{error}</p> : null}
        {rows.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {rows.map((design) => (
              <div key={design.id} className="group relative grid gap-2 rounded-[18px] border border-app-line bg-white p-2.5">
                <Link href={design.href} className="grid aspect-square place-items-center overflow-hidden rounded-[12px] bg-app-canvas no-underline">
                  {design.previewUrl ? <img src={design.previewUrl} alt="" className="max-h-full max-w-full object-contain" /> : <Icon name={design.kind === "packaging" ? "package" : "tag"} size={28} />}
                </Link>
                <div className="min-w-0 px-0.5">
                  <Link href={design.href} className="block truncate text-[13.5px] font-extrabold text-app-ink no-underline">{design.title}</Link>
                  <p className="m-0 mt-0.5 flex items-center gap-1.5 text-[12px] text-app-ink-soft">
                    {design.kind === "packaging" ? t("hub.kindPackaging") : t("hub.kindLabels")}
                    {design.source === "rex" ? <span className="rounded-full bg-app-canvas px-1.5 py-0.5 text-[10.5px] font-bold">{t("hub.byRex")}</span> : null}
                  </p>
                </div>
                <button type="button" onClick={() => void remove(design)} aria-label={t("hub.delete")} className="absolute right-3.5 top-3.5 grid h-8 w-8 place-items-center rounded-full bg-white/95 text-app-ink-soft opacity-0 shadow transition group-hover:opacity-100 focus:opacity-100">
                  <Icon name="trash" size={14} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-[18px] border border-dashed border-app-line bg-white p-6 text-center text-[14px] text-app-ink-soft">{t("hub.empty")}</div>
        )}
      </section>
    </div>
  );
}
