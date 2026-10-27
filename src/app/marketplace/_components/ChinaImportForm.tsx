"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { requestChinaImport } from "@/app/actions/sourcing";
import { Icon } from "@/components/ui/Icon";

/** Phone photos are big; server actions take about 1MB, so send a 1280px JPEG instead. */
async function shrink(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    return blob ? new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

function FindButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="inline-flex min-h-[46px] shrink-0 items-center justify-center rounded-full bg-app-ink px-5 text-[14.5px] font-bold text-white hover:bg-black disabled:opacity-60">
      {pending ? "Sending…" : "Find it"}
    </button>
  );
}

/** China · 1688: paste a link, add a photo, or tap an example. Sends a request to the sourcing partner. */
export function ChinaImportForm({ examples, error, focusPhoto }: { examples: string[]; error?: string; focusPhoto?: boolean }) {
  const [query, setQuery] = useState("");
  const [photo, setPhoto] = useState<{ name: string; url: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusPhoto) fileRef.current?.click();
    // Only on arrival from the camera button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.url);
  }, [photo]);

  return (
    <form action={requestChinaImport} className="rounded-[22px] border border-app-line bg-white p-4 sm:p-5">
      <h2 className="m-0 text-[15.5px] font-extrabold">Paste a 1688 link or search with a photo</h2>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="import-query" className="sr-only">1688 link or what you want</label>
        <input
          ref={inputRef}
          id="import-query"
          name="query"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="https://detail.1688.com/offer/..."
          autoComplete="off"
          className="min-h-[46px] min-w-0 flex-1 rounded-[14px] border border-app-line bg-white px-3.5 text-[14.5px] outline-none placeholder:text-app-ink-soft focus:border-app-ink"
        />
        <div className="flex gap-2">
          <label className="inline-flex min-h-[46px] flex-1 cursor-pointer items-center justify-center gap-2 rounded-full border border-app-line bg-white px-4 text-[14.5px] font-extrabold hover:border-app-line-strong has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-app-ink/30 sm:flex-none">
            <Icon name="image" size={16} /> Photo
            <input
              ref={fileRef}
              type="file"
              name="photo"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={async (event) => {
                const input = event.currentTarget;
                const original = input.files?.[0];
                if (!original) {
                  setPhoto(null);
                  return;
                }
                const file = await shrink(original);
                if (file !== original && typeof DataTransfer !== "undefined") {
                  const transfer = new DataTransfer();
                  transfer.items.add(file);
                  input.files = transfer.files;
                }
                setPhoto({ name: original.name, url: URL.createObjectURL(file) });
              }}
            />
          </label>
          <FindButton />
        </div>
      </div>
      {photo && (
        <div className="mt-3 flex items-center gap-3 rounded-[14px] bg-app-canvas p-2 pr-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.url} alt="" className="h-12 w-12 shrink-0 rounded-[10px] object-cover" />
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold">{photo.name}</span>
          <button
            type="button"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-white"
            aria-label="Remove photo"
            onClick={() => {
              setPhoto(null);
              if (fileRef.current) fileRef.current.value = "";
            }}
          >
            <Icon name="x" size={15} />
          </button>
        </div>
      )}
      {error && <p role="alert" className="mb-0 mt-3 text-[13.5px] font-bold text-app-danger">{error}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-app-ink-soft">Or try:</span>
        {examples.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => {
              setQuery(example);
              inputRef.current?.focus();
            }}
            className="inline-flex min-h-[34px] items-center whitespace-normal rounded-[18px] bg-app-canvas px-3.5 py-1.5 text-left text-[13px] font-extrabold leading-snug hover:bg-app-line"
          >
            {example}
          </button>
        ))}
      </div>
      <input type="hidden" name="shipping" value="air" />
    </form>
  );
}
