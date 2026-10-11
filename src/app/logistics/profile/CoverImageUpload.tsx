"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/app-ui";
import { useToast } from "@/components/ui/Toast";

export function CoverImageUpload({ currentBanner, displayName, city }: { currentBanner: string | null; displayName: string; city: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.set("banner", file);
    try {
      const res = await fetch("/api/logistics/upload-banner", { method: "POST", body: formData });
      if (res.ok) {
        toast("Cover image updated", "success");
        window.location.reload();
      } else {
        toast("Upload failed", "error");
      }
    } catch {
      toast("Upload failed", "error");
    } finally {
      setUploading(false);
    }
  }

  async function generateWithRex() {
    setGenerating(true);
    try {
      const res = await fetch("/api/logistics/generate-banner", { method: "POST" });
      if (res.ok) {
        toast("Cover made by Rex", "success");
        window.location.reload();
      } else {
        const data = await res.json().catch(() => ({}));
        toast(data.error || "Generation failed", "error");
      }
    } catch {
      toast("Generation failed", "error");
    } finally {
      setGenerating(false);
    }
  }

  const button = "inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-white/95 px-3.5 text-[13px] font-bold text-app-ink shadow-sm transition hover:bg-white disabled:opacity-60";

  return (
    <div
      className="relative h-[150px] bg-app-ink bg-cover bg-center sm:h-[180px]"
      style={currentBanner ? { backgroundImage: `url(${currentBanner})` } : undefined}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" aria-hidden />
      <div className="absolute bottom-3 left-4 right-4 min-w-0 text-white">
        <div className="truncate text-[20px] font-extrabold">{displayName}</div>
        <div className="truncate text-[13px] opacity-90">{city} · delivery partner</div>
      </div>
      <div className="absolute right-3 top-3 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={generateWithRex} disabled={generating} className={button}>
          {generating ? <Spinner className="h-4 w-4" /> : <Icon name="sparkle" size={14} />} Rex cover
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className={button}>
          {uploading ? <Spinner className="h-4 w-4" /> : <Icon name="upload" size={14} />} Change
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} aria-label="Cover image" />
    </div>
  );
}
