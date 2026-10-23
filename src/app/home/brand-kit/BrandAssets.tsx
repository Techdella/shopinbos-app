"use client";

import { useMediaLibrary } from "@/components/media/useMediaLibrary";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";
import { uploadStudioPhoto } from "@/components/builder/rex/api";
import { BuyCreditsButton, creditsChanged, isCreditsError } from "@/components/credits/CreditsBadge";
import type { BrandAssetKind, BrandAssets } from "@shared/brand-assets";
import { logoTreatmentStyle } from "@shared/logo-variants";
import { friendlyError } from "@/lib/errors/report-client";

const btn = "inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-app-line bg-white px-3.5 text-[13px] font-bold text-app-ink no-underline hover:border-app-line-strong disabled:opacity-50";

async function readError(response: Response, fallback: string) {
  const json = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
  return Object.assign(new Error(json?.error?.message ?? fallback), { code: json?.error?.code });
}

const needsCredits = (error: unknown) => isCreditsError((error as { code?: string } | null)?.code);

/**
 * Brand kit: the logo, the logo icon (square mark for app icons and profile pictures) and the favicon (browser
 * tab), side by side. Each can be uploaded or downloaded; Rex makes the icon and favicon from the logo, and the
 * seller taps "Use it" to keep one.
 */
export function BrandAssetsPanel({ initial, storeName, accent, fileBase }: { initial: BrandAssets; storeName: string; accent: string; fileBase: string }) {
  const t = useT("store");
  const router = useRouter();
  const [assets, setAssets] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [proposal, setProposal] = useState<{ kind: BrandAssetKind; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needCredits, setNeedCredits] = useState(false);
  const files = useRef<Partial<Record<BrandAssetKind, HTMLInputElement | null>>>({});
  const media = useMediaLibrary();

  async function save(kind: BrandAssetKind, url: string | null) {
    setBusy(`save-${kind}`);
    setError(null);
    setNeedCredits(false);
    try {
      const response = await fetch("/api/app/brand-assets", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, url }) });
      if (!response.ok) throw await readError(response, t("ba.failed"));
      setAssets(((await response.json()) as { data: BrandAssets }).data);
      setProposal(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? friendlyError(err) : t("ba.failed"));
    } finally {
      setBusy(null);
    }
  }

  async function upload(kind: BrandAssetKind, file: File | undefined) {
    if (!file) return;
    setBusy(`up-${kind}`);
    setError(null);
    setNeedCredits(false);
    try {
      const url = await uploadStudioPhoto(file);
      await save(kind, url);
    } catch (err) {
      setError(err instanceof Error ? friendlyError(err) : t("ba.failed"));
      setBusy(null);
    } finally {
      const input = files.current[kind];
      if (input) input.value = "";
    }
  }

  async function make(kind: "icon" | "favicon") {
    setBusy(`make-${kind}`);
    setError(null);
    setNeedCredits(false);
    try {
      const response = await fetch("/api/ai/brand-icon", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind }) });
      if (!response.ok) throw await readError(response, t("ba.failed"));
      setProposal({ kind, url: ((await response.json()) as { data: { url: string } }).data.url });
    } catch (err) {
      setError(err instanceof Error ? friendlyError(err) : t("ba.failed"));
      setNeedCredits(needsCredits(err));
    } finally {
      setBusy(null);
      creditsChanged();
    }
  }

  function tile(kind: Exclude<BrandAssetKind, "logoDark">) {
    const own = kind === "logo" ? assets.logo : kind === "icon" ? assets.icon : assets.favicon;
    const shown = kind === "logo" ? assets.logo : kind === "icon" ? assets.shown.icon : assets.shown.favicon;
    const pending = proposal?.kind === kind ? proposal.url : null;
    const picture = pending ?? shown;
    return (
      <div key={kind} className="flex min-w-0 flex-col rounded-[18px] border border-app-line bg-white p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="m-0 text-[15px] font-extrabold">{t(`ba.${kind}`)}</h3>
          {kind !== "logo" && !own && shown ? <span className="text-[11.5px] font-bold text-app-ink-soft">{t("ba.usingLogo")}</span> : null}
        </div>
        <p className="m-0 mt-0.5 text-[12.5px] leading-[1.4] text-app-ink-soft">{t(`ba.${kind}Hint`)}</p>

        <div className={cx("mt-3 grid place-items-center overflow-hidden rounded-[14px] bg-app-canvas", kind === "logo" ? "h-[120px]" : "h-[120px]")}>
          {kind === "favicon" ? (
            <div className="w-full px-3">
              <div className="flex items-center gap-2 rounded-t-[10px] bg-white px-3 py-2 text-[12px] shadow-sm">
                {picture ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={picture} alt="" className="h-4 w-4 rounded-[3px] object-cover" />
                ) : (
                  <span className="h-4 w-4 rounded-[3px]" style={{ background: accent }} />
                )}
                <span className="truncate font-bold">{storeName}</span>
              </div>
              <div className="mt-2 flex items-center justify-center gap-3">
                {picture ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={picture} alt={t("ba.favicon")} className="h-8 w-8 rounded-[6px] object-cover" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={picture} alt="" className="h-14 w-14 rounded-[10px] object-cover" />
                  </>
                ) : (
                  <span className="text-[12.5px] text-app-ink-soft">{t("ba.none")}</span>
                )}
              </div>
            </div>
          ) : picture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={picture} alt={t(`ba.${kind}`)} className={kind === "logo" ? "max-h-[96px] max-w-[90%] object-contain" : "h-[88px] w-[88px] rounded-[20px] object-cover shadow-sm"} />
          ) : (
            <span className="text-[12.5px] text-app-ink-soft">{t("ba.none")}</span>
          )}
        </div>

        {pending ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={cx(btn, "border-app-ink bg-app-ink text-white")} disabled={busy !== null} onClick={() => void save(kind, pending)}>
              {busy === `save-${kind}` ? <Spinner className="h-4 w-4" /> : <Icon name="check" size={14} />} {t("ba.useIt")}
            </button>
            <button type="button" className={btn} disabled={busy !== null} onClick={() => void make(kind as "icon" | "favicon")}>
              {busy === `make-${kind}` ? <Spinner className="h-4 w-4" /> : <Icon name="refresh" size={14} />} {t("ba.again")}
            </button>
            <button type="button" className={btn} disabled={busy !== null} onClick={() => setProposal(null)}>{t("ba.cancel")}</button>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {kind === "logo" ? (
              <Link href="/studio/logo" className={btn}><Icon name="sparkle" size={14} /> {t("ba.makeLogo")}</Link>
            ) : (
              <button type="button" className={btn} disabled={busy !== null || !assets.logo} onClick={() => void make(kind)} title={assets.logo ? undefined : t("ba.needLogo")}>
                {busy === `make-${kind}` ? <Spinner className="h-4 w-4" /> : <Icon name="sparkle" size={14} />} {t("ba.makeRex")}
              </button>
            )}
            <button type="button" className={btn} disabled={busy !== null} onClick={() => void media.open({ accept: "image" }).then(([asset]) => asset && save(kind, asset.url))}>
              {busy === `up-${kind}` ? <Spinner className="h-4 w-4" /> : <Icon name="upload" size={14} />} {own ? t("ba.replace") : t("ba.upload")}
            </button>
            {shown ? (
              <a href={shown} download={`${fileBase}-${kind}`} target="_blank" rel="noopener noreferrer" className={btn}><Icon name="download" size={14} /> {t("ba.download")}</a>
            ) : null}
            {kind !== "logo" && own ? (
              <button type="button" className={btn} disabled={busy !== null} onClick={() => void save(kind, null)}>{t("ba.useLogo")}</button>
            ) : null}
          </div>
        )}
        <input ref={(el) => { files.current[kind] = el; }} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} onChange={(e) => void upload(kind, e.target.files?.[0])} />
        {kind === "logo" && assets.logo ? darkLogo() : null}
      </div>
    );
  }

  /** The logo on dark headers and footers: made automatically, or the seller's own upload. */
  function darkLogo() {
    const onDark = assets.onDark;
    return (
      <div className="mt-4 border-t border-app-line pt-3">
        <div className="flex items-baseline justify-between gap-2">
          <h4 className="m-0 text-[13.5px] font-extrabold">{t("ba.onDark")}</h4>
          <span className="text-[11.5px] font-bold text-app-ink-soft">
            {assets.logoDark ? t("ba.onDarkYours") : onDark && onDark.treatment !== "light-chip" ? t("ba.onDarkAuto") : t("ba.onDarkTile")}
          </span>
        </div>
        <div className="mt-2 grid h-[84px] place-items-center rounded-[14px] bg-[#16141F]">
          {onDark ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={onDark.src} alt={t("ba.onDark")} className="max-h-[64px] max-w-[90%] object-contain" style={logoTreatmentStyle(onDark.treatment)} />
          ) : null}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className={btn} disabled={busy !== null} onClick={() => files.current.logoDark?.click()}>
            {busy === "up-logoDark" ? <Spinner className="h-4 w-4" /> : <Icon name="upload" size={14} />} {t("ba.uploadDark")}
          </button>
          {assets.logoDark ? (
            <button type="button" className={btn} disabled={busy !== null} onClick={() => void save("logoDark", null)}>{t("ba.useAuto")}</button>
          ) : null}
        </div>
        <input ref={(el) => { files.current.logoDark = el; }} type="file" accept="image/png,image/webp,image/svg+xml" className="sr-only" tabIndex={-1} onChange={(e) => void upload("logoDark", e.target.files?.[0])} />
      </div>
    );
  }

  return (
    <section aria-labelledby="brand-assets" className="grid gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="brand-assets" className="m-0 text-[17px] font-extrabold">{t("ba.title")}</h2>
        <p className="m-0 text-[12.5px] text-app-ink-soft">{t("ba.cost")}</p>
      </div>
      {media.dialog}
      <div className="grid gap-3 md:grid-cols-3">{(["logo", "icon", "favicon"] as const).map(tile)}</div>
      {error ? (
        <div className="flex flex-wrap items-center gap-3">
          <p role="alert" className="m-0 text-[13px] font-bold text-app-danger">{error}</p>
          {needCredits ? <BuyCreditsButton /> : null}
        </div>
      ) : null}
    </section>
  );
}
