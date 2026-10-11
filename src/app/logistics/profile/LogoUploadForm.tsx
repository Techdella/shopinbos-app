"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/app-ui";
import { useToast } from "@/components/ui/Toast";

export function LogoUploadForm({ currentLogo, displayName }: { currentLogo: string | null; displayName: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  // The upload route answers with JSON, so post it with fetch instead of navigating to it.
  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.set("logo", file);
    try {
      const res = await fetch("/api/logistics/upload-logo", { method: "POST", body: formData });
      if (!res.ok) throw new Error();
      toast("Logo updated", "success");
      window.location.reload();
    } catch {
      toast("Upload failed", "error");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="relative shrink-0">
      <div className="grid h-[76px] w-[76px] place-items-center overflow-hidden rounded-[18px] border-[3px] border-white bg-app-canvas text-[26px] font-extrabold text-app-ink-soft shadow-[0_1px_3px_rgba(22,20,31,0.12)]">
        {currentLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={currentLogo} alt={`${displayName} logo`} className="h-full w-full object-cover" />
        ) : (
          displayName.charAt(0).toUpperCase()
        )}
      </div>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        aria-label="Change logo"
        className="absolute -bottom-1.5 -right-1.5 grid h-9 w-9 place-items-center rounded-full border border-app-line bg-white text-app-ink shadow-sm transition hover:border-app-line-strong disabled:opacity-60"
      >
        {uploading ? <Spinner className="h-4 w-4" /> : <Icon name="upload" size={15} />}
      </button>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}
