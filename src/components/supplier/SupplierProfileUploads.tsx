"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { uploadSupplierCover, uploadSupplierLogo, uploadSupplierPhoto } from "@/app/actions/supplier";
import { Spinner } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";

// Each picker uploads as soon as a file is chosen; the server action redirects back with ?saved or ?error.
// No <form> wrappers, so these can sit next to (or inside) the profile form without nesting forms.

function useUpload(field: string, action: (formData: FormData) => Promise<void>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.set(field, file);
    setBusy(true);
    try {
      await action(formData);
    } finally {
      setBusy(false);
    }
  }

  return { inputRef, busy, onChange, open: () => inputRef.current?.click() };
}

export function SupplierCoverUpload({ bannerUrl }: { bannerUrl: string | null }) {
  const { inputRef, busy, onChange, open } = useUpload("cover", uploadSupplierCover);

  return (
    <div
      className="relative h-[140px] overflow-hidden rounded-[18px] bg-app-canvas bg-cover bg-center sm:h-[180px]"
      style={bannerUrl ? { backgroundImage: `url(${bannerUrl})` } : undefined}
    >
      {!bannerUrl && <div className="grid h-full place-items-center text-[13.5px] text-app-ink-soft">No cover photo yet</div>}
      <button
        type="button"
        onClick={open}
        disabled={busy}
        className="absolute right-3 top-3 inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-app-line bg-white px-4 text-[13px] font-extrabold text-app-ink shadow-sm transition hover:border-app-line-strong disabled:opacity-60"
      >
        {busy ? <Spinner /> : <Icon name="upload" size={14} />} {bannerUrl ? "Change cover" : "Add cover"}
      </button>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={onChange} aria-label="Cover photo" />
    </div>
  );
}

export function SupplierLogoUpload({ logoUrl, displayName }: { logoUrl: string | null; displayName: string }) {
  const { inputRef, busy, onChange, open } = useUpload("logo", uploadSupplierLogo);
  const letters = displayName.split(/\s+/).filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase();

  return (
    <>
      <button
        type="button"
        onClick={open}
        disabled={busy}
        aria-label={logoUrl ? "Change logo" : "Add logo"}
        className="group relative grid h-[96px] w-[96px] shrink-0 place-items-center overflow-hidden rounded-[22px] border border-app-line bg-app-canvas bg-cover bg-center text-[30px] font-extrabold text-app-ink"
        style={logoUrl ? { backgroundImage: `url(${logoUrl})` } : undefined}
      >
        {!logoUrl && letters}
        <span className="absolute inset-x-0 bottom-0 flex h-7 items-center justify-center bg-app-ink/75 text-[11.5px] font-bold text-white">
          {busy ? <Spinner /> : logoUrl ? "Change" : "Add logo"}
        </span>
      </button>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={onChange} aria-label="Logo" />
    </>
  );
}

export function SupplierPhotoUpload() {
  const { inputRef, busy, onChange, open } = useUpload("photo", uploadSupplierPhoto);

  return (
    <>
      <button
        type="button"
        onClick={open}
        disabled={busy}
        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-app-line bg-white px-4 text-[13px] font-extrabold text-app-ink transition hover:border-app-line-strong disabled:opacity-60"
      >
        {busy ? <Spinner /> : <Icon name="upload" size={14} />} Add photo
      </button>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={onChange} aria-label="Workshop photo" />
    </>
  );
}
