"use client";

import { useId, useRef, useState } from "react";
import { cx } from "@/components/app-ui";
import { useT } from "@/components/i18n/I18nProvider";

// A picture field for Settings → SEO (favicon, link preview): pick an image, it uploads to the store's media
// (/api/upload, folder "brand") and its link goes in a hidden input named `name` for the form to save.

export function SeoImageField({
  name,
  label,
  help,
  initialUrl,
  shape = "wide",
}: {
  name: string;
  label: string;
  help: string;
  initialUrl: string;
  shape?: "square" | "wide";
}) {
  const t = useT("store");
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("folder", "brand");
      const response = await fetch("/api/upload", { method: "POST", body: form });
      const json = (await response.json().catch(() => null)) as { data?: { publicUrl?: string }; error?: { message?: string } } | null;
      if (!response.ok || !json?.data?.publicUrl) throw new Error(json?.error?.message || t("seo.uploadFailed"));
      setUrl(json.data.publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("seo.uploadFailed"));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[14px] font-extrabold text-app-ink">{label}</label>
      <input type="hidden" name={name} value={url} />
      <div className="flex flex-wrap items-center gap-3">
        <div
          className={cx(
            "grid shrink-0 place-items-center overflow-hidden border border-app-line bg-app-canvas",
            shape === "square" ? "h-16 w-16 rounded-[14px]" : "h-[84px] w-[160px] rounded-[14px]",
          )}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-[12px] font-semibold text-app-ink-soft">{t("seo.noImage")}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            id={id}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="sr-only"
            onChange={(event) => void pick(event.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="inline-flex min-h-[44px] items-center rounded-full border border-app-line bg-white px-4 text-[14px] font-bold text-app-ink hover:border-app-line-strong disabled:opacity-60"
          >
            {busy ? t("seo.uploading") : url ? t("seo.change") : t("seo.upload")}
          </button>
          {url && !busy && (
            <button type="button" onClick={() => setUrl("")} className="min-h-[44px] px-2 text-[14px] font-semibold text-app-ink-soft hover:text-app-ink">
              {t("seo.remove")}
            </button>
          )}
        </div>
      </div>
      <p className="m-0 mt-2 text-[13px] leading-[1.5] text-app-ink-soft">{help}</p>
      {error && <p className="m-0 mt-1 text-[13px] font-semibold text-app-danger" role="alert">{error}</p>}
    </div>
  );
}
