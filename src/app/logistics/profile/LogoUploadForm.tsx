"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/app-ui";
import { broadcastIdentity, useIdentity } from "@/components/shell/useShellCounts";
import { identityImageProblem, initialsOf } from "@shared/identity-images";
import { shrinkImage } from "@/lib/media/shrink-image";
import { useT } from "@/components/i18n/I18nProvider";

// The company logo badge on the profile header. Saves through /api/app/me/images like every other photo and
// logo uploader, so the new logo shows across the app straight away.
export function LogoUploadForm({ currentLogo, displayName }: { currentLogo: string | null; displayName: string }) {
  const router = useRouter();
  const t = useT("logistics");
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { logoUrl } = useIdentity({ logoUrl: currentLogo });

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0];
    event.target.value = "";
    if (!picked) return;
    const file = await shrinkImage(picked, 1024);
    const problem = identityImageProblem(file);
    if (problem) {
      setError(problem);
      return;
    }
    setUploading(true);
    setError(null);
    const body = new FormData();
    body.set("kind", "logo");
    body.set("file", file);
    try {
      const response = await fetch("/api/app/me/images", { method: "POST", body });
      const json = (await response.json().catch(() => null)) as { data?: { logoUrl: string | null }; error?: { message?: string } } | null;
      if (!response.ok || !json?.data) throw new Error(json?.error?.message ?? t("upload.failed"));
      broadcastIdentity({ logoUrl: json.data.logoUrl });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("upload.failed"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="relative shrink-0">
      <div className="grid h-[76px] w-[76px] place-items-center overflow-hidden rounded-[18px] border-[3px] border-white bg-app-canvas text-[26px] font-extrabold text-app-ink-soft shadow-[0_1px_3px_rgba(22,20,31,0.12)]">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={t("upload.logoAlt", { name: displayName })} className="h-full w-full bg-white object-contain" />
        ) : (
          initialsOf(displayName, 1)
        )}
      </div>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        aria-label={logoUrl ? t("upload.changeLogo") : t("upload.addLogo")}
        className="absolute -bottom-1.5 -right-1.5 grid h-9 w-9 place-items-center rounded-full border border-app-line bg-white text-app-ink shadow-sm transition hover:border-app-line-strong disabled:opacity-60"
      >
        {uploading ? <Spinner className="h-4 w-4" /> : <Icon name="upload" size={15} />}
      </button>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => void handleFile(event)} />
      {error && <p role="alert" className="absolute left-0 top-full mt-2 w-[240px] text-[12px] font-semibold text-app-danger">{error}</p>}
    </div>
  );
}
