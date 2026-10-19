"use client";

import { useState } from "react";
import { Spinner, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";
import { StoreBrandMark } from "@/components/storefront/StoreBrandMark";
import { LOGO_SIZES, LOGO_STYLES, type LogoDisplay } from "@shared/store-logo";

/**
 * Brand kit > "On your store": how the store header shows the brand (full logo, logo icon or name, with or
 * without the name, three sizes), with a live header preview. Saves straight to the live store.
 */
export function LogoDisplayPanel({ initial, logoUrl, brandSettings, storeName }: { initial: LogoDisplay; logoUrl: string | null; brandSettings: unknown; storeName: string }) {
  const t = useT("store");
  const [display, setDisplay] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const changed = display.style !== saved.style || display.size !== saved.size;

  async function save() {
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch("/api/app/brand-assets", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ logoDisplay: display }) });
      const json = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!response.ok) throw new Error(json?.error?.message ?? t("ld.failed"));
      setSaved(display);
      setNote({ ok: true, text: t("ld.saved") });
    } catch (error) {
      setNote({ ok: false, text: error instanceof Error ? error.message : t("ld.failed") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="logo-display" aria-labelledby="logo-display-title" className="grid gap-3 rounded-[18px] border border-app-line bg-white p-4 sm:p-5">
      <div>
        <h2 id="logo-display-title" className="m-0 text-[17px] font-extrabold">{t("ld.title")}</h2>
        <p className="m-0 mt-0.5 text-[13px] text-app-ink-soft">{t("ld.hint")}</p>
      </div>

      <div className="overflow-hidden rounded-[14px] border border-app-line bg-app-canvas" aria-label={t("ld.preview")}>
        <div className="flex min-h-[68px] items-center justify-between gap-4 bg-white px-4 py-2">
          <StoreBrandMark store={{ logoUrl, brandSettings }} name={storeName} display={display} nameClassName="text-[20px] font-bold leading-none" />
          <span className="hidden items-center gap-4 text-[13px] text-app-ink-soft sm:flex" aria-hidden>
            <span>{t("ld.navHome")}</span>
            <span>{t("ld.navShop")}</span>
            <span className="rounded-full border border-app-line px-3 py-1.5 font-bold text-app-ink">{t("ld.navBag")}</span>
          </span>
        </div>
      </div>

      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-2 text-[13px] font-bold">{t("ld.style")}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {LOGO_STYLES.map((style) => (
            <button
              key={style}
              type="button"
              aria-pressed={display.style === style}
              onClick={() => setDisplay((current) => ({ ...current, style }))}
              className={cx("min-h-[44px] rounded-[12px] border-2 px-3 py-2 text-left text-[13px] font-bold leading-tight", display.style === style ? "border-app-ink bg-app-canvas" : "border-app-line hover:border-app-line-strong")}
            >
              {t(`ld.${style}`)}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-2 text-[13px] font-bold">{t("ld.size")}</legend>
        <div className="inline-flex rounded-full border border-app-line p-1">
          {LOGO_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              aria-pressed={display.size === size}
              onClick={() => setDisplay((current) => ({ ...current, size }))}
              className={cx("min-h-[36px] rounded-full px-4 text-[13px] font-bold", display.size === size ? "bg-app-ink text-white" : "text-app-ink hover:bg-app-canvas")}
            >
              {t(`ld.${size}`)}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={!changed || busy} onClick={() => void save()} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-app-ink px-5 text-[13.5px] font-bold text-white disabled:opacity-50">
          {busy ? <Spinner className="h-4 w-4" /> : <Icon name="check" size={14} />} {t("ld.save")}
        </button>
        {note ? <p role="status" className={cx("m-0 text-[13px] font-bold", note.ok ? "text-app-success" : "text-app-danger")}>{note.text}</p> : null}
      </div>
    </section>
  );
}
