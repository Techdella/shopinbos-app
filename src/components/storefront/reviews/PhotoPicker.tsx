"use client";

import { useState } from "react";

// Uploads review photos one by one to /api/public/store/[slug]/reviews/photos with the buyer's proof of order.
export function PhotoPicker({ slug, proof, photos, onChange, max = 4 }: { slug: string; proof: Record<string, string>; photos: string[]; onChange: (photos: string[]) => void; max?: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError("");
    const next = [...photos];
    for (const file of Array.from(files).slice(0, max - photos.length)) {
      const body = new FormData();
      body.set("file", file);
      for (const [key, value] of Object.entries(proof)) body.set(key, value);
      const res = await fetch(`/api/public/store/${encodeURIComponent(slug)}/reviews/photos`, { method: "POST", body }).catch(() => null);
      const json = await res?.json().catch(() => null);
      if (!res?.ok || !json?.data?.url) {
        setError(json?.error?.message ?? "A photo couldn't be added.");
        break;
      }
      next.push(json.data.url);
    }
    onChange(next);
    setBusy(false);
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        {photos.map((src) => (
          <div key={src} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="Your photo" className="h-20 w-20 rounded-[12px] object-cover" />
            <button type="button" onClick={() => onChange(photos.filter((p) => p !== src))} aria-label="Remove photo" className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full bg-black text-[14px] text-white">×</button>
          </div>
        ))}
        {photos.length < max ? (
          <label className="grid h-20 w-20 cursor-pointer place-items-center rounded-[12px] border border-dashed border-current text-center text-[12px] opacity-70 focus-within:outline focus-within:outline-2">
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => add(e.target.files)} disabled={busy} />
            {busy ? "Adding…" : "Add photo"}
          </label>
        ) : null}
      </div>
      {error ? <p role="alert" className="m-0 text-[13px] text-[#B42318]">{error}</p> : null}
    </div>
  );
}
