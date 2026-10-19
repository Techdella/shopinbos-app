"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/app-ui";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/components/i18n/I18nProvider";

export function CoverImageUpload({ currentBanner, displayName, city }: { currentBanner: string | null; displayName: string; city: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();
  const t = useT("logistics");

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.set("banner", file);
    try {
      const res = await fetch("/api/logistics/upload-banner", { method: "POST", body: formData });
      if (res.ok) {
        toast(t("upload.coverUpdated"), "success");
        window.location.reload();
      } else {
        toast(t("upload.failed"), "error");
      }
    } catch {
      toast(t("upload.failed"), "error");
    } finally {
      setUploading(false);
    }
  }

  async function generateWithRex() {
    setGenerating(true);
    try {
      const res = await fetch("/api/logistics/generate-banner", { method: "POST" });
      if (res.ok) {
        toast(t("upload.coverByRex"), "success");
        window.location.reload();
      } else {
        const data = await res.json().catch(() => ({}));
        toast(data.error || t("upload.rexFailed"), "error");
      }
    } catch {
      toast(t("upload.rexFailed"), "error");
    } finally {
      setGenerating(false);
    }
  }

  const button = "inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-white/95 px-3.5 text-[15px] font-bold text-app-ink shadow-sm transition hover:bg-white disabled:opacity-60";

  return (
    <div
      className="relative h-[150px] bg-app-ink bg-cover bg-center sm:h-[180px]"
      style={currentBanner ? { backgroundImage: `url(${currentBanner})` } : undefined}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" aria-hidden />
      {/* Sits above the strip the logo overlaps from below. */}
      <div className="absolute bottom-12 left-4 right-4 min-w-0 text-white">
        <div className="truncate text-[20px] font-extrabold">{displayName}</div>
        <div className="truncate text-[15px] opacity-90">{t("upload.cityPartner", { city })}</div>
      </div>
      <div className="absolute right-3 top-3 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={generateWithRex} disabled={generating} className={button}>
          {generating ? <Spinner className="h-4 w-4" /> : <Icon name="sparkle" size={14} />} {t("upload.rexCover")}
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className={button}>
          {uploading ? <Spinner className="h-4 w-4" /> : <Icon name="upload" size={14} />} {t("upload.change")}
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} aria-label={t("upload.coverAria")} />
    </div>
  );
}
