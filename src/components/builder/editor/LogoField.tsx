"use client";

import { useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { uploadStudioPhoto } from "@/components/builder/rex/api";
import { logoTreatmentStyle } from "@shared/logo-variants";
import type { BrandAssets } from "@shared/brand-assets";
import { BRAND_ASSETS_EVENT } from "./useBuilder";
import { useEditorT } from "./i18n";

const btn = "inline-flex min-h-9 items-center gap-1.5 rounded-full border border-app-line bg-white px-3 text-[12.5px] font-bold text-app-ink hover:border-app-line-strong disabled:opacity-50";

/**
 * Header and footer settings: the store's logo on light and on dark backgrounds, side by side. The seller can
 * upload their own logo for dark backgrounds or go back to the automatic one (store-wide, like Brand kit).
 */
export function LogoField({ label, help }: { label: string; help?: string }) {
  const { tx } = useEditorT();
  const [assets, setAssets] = useState<BrandAssets | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/app/brand-assets", { cache: "no-store" })
      .then((response) => response.json().catch(() => null) as Promise<{ data?: BrandAssets } | null>)
      .then((json) => { if (!cancelled && json?.data) setAssets(json.data); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  async function save(url: string | null) {
    const response = await fetch("/api/app/brand-assets", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "logoDark", url }) });
    const json = await response.json().catch(() => null) as { data?: BrandAssets; error?: { message?: string } } | null;
    if (!response.ok || !json?.data) throw new Error(json?.error?.message ?? tx("The logo couldn't be saved. Try again."));
    setAssets(json.data);
    // The preview's header and footer switch to it straight away.
    window.dispatchEvent(new CustomEvent(BRAND_ASSETS_EVENT, { detail: json.data }));
  }

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : tx("The logo couldn't be saved. Try again."));
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  }

  const onDark = assets?.onDark ?? null;
  return (
    <div className="py-2">
      <span className="text-[13px] font-semibold text-app-ink">{tx(label)}</span>
      {help ? <p className="mt-1 text-[12px] leading-[18px] text-app-ink-soft">{tx(help)}</p> : null}
      {!assets ? (
        <div className="mt-2 flex h-[72px] items-center justify-center rounded-[12px] bg-app-canvas"><Spinner className="h-4 w-4" /></div>
      ) : !assets.logo ? (
        <p className="mt-2 rounded-[12px] bg-app-canvas px-3 py-2.5 text-[12.5px] leading-5 text-app-ink-soft">
          {tx("No logo yet. Add one in Brand kit, or click the logo spot in the header.")}{" "}
          <a href="/home/brand-kit" target="_blank" rel="noopener noreferrer" className="font-bold underline">{tx("Brand kit")}</a>
        </p>
      ) : (
        <>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <figure className="m-0">
              <div className="grid h-[72px] place-items-center rounded-[12px] border border-app-line bg-white p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={assets.logo} alt="" className="max-h-[52px] max-w-full object-contain" />
              </div>
              <figcaption className="mt-1 text-[11.5px] text-app-ink-soft">{tx("Light backgrounds")}</figcaption>
            </figure>
            <figure className="m-0">
              <div className="grid h-[72px] place-items-center rounded-[12px] bg-[#16141F] p-2">
                {onDark ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={onDark.src} alt="" className="max-h-[52px] max-w-full object-contain" style={logoTreatmentStyle(onDark.treatment)} />
                ) : null}
              </div>
              <figcaption className="mt-1 text-[11.5px] text-app-ink-soft">
                {assets.logoDark ? tx("Dark backgrounds (yours)") : tx("Dark backgrounds (automatic)")}
              </figcaption>
            </figure>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={btn} disabled={busy} onClick={() => file.current?.click()}>
              {busy ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="upload" size={13} />} {assets.logoDark ? tx("Replace dark logo") : tx("Upload logo for dark backgrounds")}
            </button>
            {assets.logoDark ? (
              <button type="button" className={btn} disabled={busy} onClick={() => void run(() => save(null))}>{tx("Use automatic")}</button>
            ) : null}
          </div>
        </>
      )}
      {error ? <p role="alert" className="mt-1.5 text-[12.5px] font-bold text-app-danger">{error}</p> : null}
      <input
        ref={file}
        type="file"
        accept="image/png,image/webp,image/svg+xml"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const picked = event.target.files?.[0];
          if (picked) void run(async () => save(await uploadStudioPhoto(picked)));
        }}
      />
    </div>
  );
}
