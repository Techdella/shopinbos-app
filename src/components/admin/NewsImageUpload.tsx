"use client";

import { useEffect, useId, useRef, useState } from "react";
import { TextInput, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { NEWS_IMAGE_ACCEPT, newsImageProblem } from "@/lib/email/news-image";
import { isAllowedNewsImage, type NewsImageHosts } from "@/lib/email/product-news";

// The image field on /admin/product-news: drop an image (or pick one), watch it upload, see it, remove it. The
// server stores it in our public media bucket and the URL goes in the field; pasting a link still works.

interface Uploaded {
  url: string;
  bytes: number;
  width: number | null;
  height: number | null;
  resized: boolean;
}

/** Upload with progress (fetch can't report upload progress). Same-origin, so the session cookie goes along. */
function upload(file: File, onProgress: (pct: number) => void, signal: { abort?: () => void }) {
  return new Promise<Uploaded>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    signal.abort = () => xhr.abort();
    xhr.open("POST", "/api/admin/product-news/image");
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    xhr.onload = () => {
      const body = (xhr.response ?? {}) as { data?: Uploaded; error?: { message?: string } };
      if (xhr.status >= 200 && xhr.status < 300 && body.data?.url) resolve(body.data);
      else reject(new Error(body.error?.message ?? (xhr.status === 413 ? "That image is over 5 MB." : "The upload didn't work. Try again.")));
    };
    xhr.onerror = () => reject(new Error("The upload didn't go through. Check your connection and retry."));
    xhr.onabort = () => reject(new DOMException("Cancelled", "AbortError"));
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

const kb = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export function NewsImageUpload({ value, onChange, hosts, disabled }: { value: string; onChange: (url: string) => void; hosts: NewsImageHosts; disabled?: boolean }) {
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const cancel = useRef<{ abort?: () => void }>({});
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);

  const url = value.trim();
  const allowed = Boolean(url) && isAllowedNewsImage(url, hosts);
  const problem = url && !allowed ? "Use an https image from Shopinbos storage or shopinbos.com. Other links won't show." : null;
  const busy = progress !== null;

  useEffect(() => setBroken(false), [url]);
  useEffect(() => () => cancel.current.abort?.(), []);

  async function take(file: File | null | undefined) {
    if (!file || disabled || busy) return;
    setError(null);
    setInfo(null);
    const local = newsImageProblem({ type: file.type, size: file.size });
    if (local) {
      setError(local);
      return;
    }
    setFileName(file.name);
    setProgress(0);
    try {
      const stored = await upload(file, setProgress, cancel.current);
      setProgress(100);
      onChange(stored.url);
      setInfo(`${kb(stored.bytes)}${stored.width ? ` · ${stored.width}×${stored.height}px` : ""}${stored.resized ? " · scaled down for email" : ""}`);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) setError(e instanceof Error ? e.message : "The upload didn't work. Try again.");
    } finally {
      setProgress(null);
      setFileName(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function remove() {
    onChange("");
    setInfo(null);
    setError(null);
  }

  return (
    <div className="grid gap-2" role="group" aria-label="Image (optional)">
      <span className="block text-[14px] font-bold text-app-ink">Image (optional)</span>

      {allowed && !busy ? (
        <div className="grid gap-2 rounded-[14px] border border-app-line bg-app-canvas p-2.5 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)] sm:items-center">
          {broken ? (
            <div className="grid h-[110px] place-items-center rounded-[10px] bg-white text-[12.5px] text-app-ink-soft">Can&apos;t load the preview</div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- any storage host; next/image would need each one configured
            <img src={url} alt="Image for this email" onError={() => setBroken(true)} className="block max-h-[140px] w-full rounded-[10px] bg-white object-contain" />
          )}
          <div className="grid min-w-0 content-center gap-2">
            <p className="m-0 truncate font-mono text-[12px] text-app-ink-soft" title={url}>{url.split("/").pop()}</p>
            {info ? <p className="m-0 text-[12.5px] text-app-ink-soft">{info}</p> : null}
            {!disabled ? (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-app-line bg-white px-3.5 text-[13px] font-bold text-app-ink transition hover:border-app-ink">
                  <Icon name="refresh" size={14} /> Replace
                </button>
                <button type="button" onClick={remove} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-app-line bg-white px-3.5 text-[13px] font-bold text-app-danger transition hover:border-app-danger">
                  <Icon name="trash" size={14} /> Remove
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled || busy}
          aria-label="Upload an image: drop it here or choose a file"
          onClick={() => !busy && fileRef.current?.click()}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && !busy) {
              e.preventDefault();
              fileRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            if (disabled || busy) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void take(e.dataTransfer.files?.[0]);
          }}
          className={cx(
            "grid min-h-[112px] place-items-center rounded-[14px] border-2 border-dashed px-4 py-4 text-center outline-none transition focus-visible:border-app-ink",
            dragging ? "border-app-ink bg-app-canvas" : "border-app-line bg-white",
            disabled ? "cursor-not-allowed opacity-60" : busy ? "cursor-progress" : "cursor-pointer hover:border-app-ink",
          )}
        >
          {busy ? (
            <div className="grid w-full max-w-[320px] gap-2">
              <p className="m-0 truncate text-[13.5px] font-semibold text-app-ink">Uploading {fileName}…</p>
              <div className="h-2 w-full overflow-hidden rounded-full bg-app-canvas" role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress ?? 0}>
                <div className="h-full rounded-full bg-app-success transition-[width]" style={{ width: `${progress ?? 0}%` }} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[12px] text-app-ink-soft">{progress}%</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    cancel.current.abort?.();
                  }}
                  className="text-[12.5px] font-bold text-app-ink underline"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="grid justify-items-center gap-1.5">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-app-canvas text-app-ink"><Icon name="upload" size={17} /></span>
              <p className="m-0 text-[13.5px] font-semibold text-app-ink">
                Drop an image here or <span className="underline">choose a file</span>
              </p>
              <p className="m-0 text-[12px] text-app-ink-soft">JPG, PNG, WebP or GIF · up to 5 MB · wider than 1200px is scaled down</p>
            </div>
          )}
        </div>
      )}
      <input ref={fileRef} type="file" accept={NEWS_IMAGE_ACCEPT} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void take(e.target.files?.[0])} />

      <div className="grid gap-1">
        <label htmlFor={inputId} className="text-[12.5px] font-semibold text-app-ink-soft">Or paste an image link</label>
        <TextInput id={inputId} value={value} disabled={disabled || busy} onChange={(e) => onChange(e.target.value)} placeholder="https://…/storage/v1/object/public/…" inputMode="url" />
      </div>
      <div aria-live="polite">
        {error ? (
          <p className="m-0 text-[12.5px] font-semibold text-app-danger">{error}</p>
        ) : problem ? (
          <p className="m-0 text-[12.5px] font-semibold text-app-danger">{problem}</p>
        ) : !url ? (
          <p className="m-0 text-[12.5px] text-app-ink-soft">Links must be https, from Shopinbos storage or shopinbos.com.</p>
        ) : null}
      </div>
    </div>
  );
}
