"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { requestChinaImport } from "@/app/actions/imports";
import { cx } from "@/components/app-ui/cx";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";
import { IMPORT_PARTNER, looksLikeLink, parseImportLink } from "@/lib/imports/pure";

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

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useT("marketplace");
  return (
    <button type="submit" disabled={pending} className="inline-flex min-h-[48px] w-full shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-app-ink px-6 text-[15px] font-bold text-white hover:bg-black disabled:opacity-60 sm:w-auto">
      <Icon name="send" size={16} /> {pending ? t("find.china.sending") : t("find.china.submit")}
    </button>
  );
}

/** From China: paste a ShopKonfam or 1688 link, add a photo, or describe it. Sends a request to the sourcing partner. */
export function ChinaImportForm({ examples, error, focusPhoto }: { examples: string[]; error?: string; focusPhoto?: boolean }) {
  const t = useT("marketplace");
  const [query, setQuery] = useState("");
  const [shipping, setShipping] = useState<"air" | "sea">("air");
  const [photo, setPhoto] = useState<{ name: string; url: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const link = looksLikeLink(query) ? parseImportLink(query) : null;
  const unsupported = looksLikeLink(query) && !link;

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
      <h2 className="m-0 text-[15.5px] font-extrabold">{t("find.china.formTitle")}</h2>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="import-query" className="sr-only">{t("find.china.linkLabel")}</label>
        <input
          ref={inputRef}
          id="import-query"
          name="query"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("find.china.placeholder")}
          autoComplete="off"
          aria-describedby="import-link-kind"
          className={cx(
            "min-h-[48px] min-w-0 flex-1 rounded-[14px] border bg-white px-3.5 text-[14.5px] outline-none placeholder:text-app-ink-soft focus:border-app-ink",
            unsupported ? "border-app-danger" : "border-app-line",
          )}
        />
        <label className="inline-flex min-h-[48px] cursor-pointer items-center justify-center gap-2 rounded-full border border-app-line bg-white px-4 text-[14.5px] font-bold hover:border-app-line-strong has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-app-ink/30">
          <Icon name="image" size={16} /> {t("find.china.photo")}
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
      </div>
      <div id="import-link-kind" aria-live="polite" className="min-h-0">
        {link ? (
          <p className="mb-0 mt-2 inline-flex items-center gap-1.5 rounded-full bg-app-success-tint px-3 py-1 text-[12.5px] font-extrabold text-app-success">
            <Icon name="check" size={13} /> {link.source === "shopkonfam" ? t("find.china.isKonfam") : t("find.china.is1688")}
            {link.productRef ? <span className="font-mono font-bold opacity-80">· {link.productRef.slice(0, 32)}</span> : null}
          </p>
        ) : unsupported ? (
          <p className="mb-0 mt-2 text-[13px] font-bold text-app-danger">{t("find.china.notSupported")}</p>
        ) : null}
      </div>
      {photo && (
        <div className="mt-3 flex items-center gap-3 rounded-[14px] bg-app-canvas p-2 pr-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.url} alt="" className="h-12 w-12 shrink-0 rounded-[10px] object-cover" />
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold">{photo.name}</span>
          <button
            type="button"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-white"
            aria-label={t("find.china.removePhoto")}
            onClick={() => {
              setPhoto(null);
              if (fileRef.current) fileRef.current.value = "";
            }}
          >
            <Icon name="x" size={15} />
          </button>
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)]">
        <label className="grid gap-1.5 text-[13px] font-extrabold">
          {t("find.china.quantity")}
          <span className="flex min-h-[48px] items-center rounded-[14px] border border-app-line bg-white pr-3 focus-within:border-app-ink">
            <input name="quantity" type="number" inputMode="numeric" min={1} max={100000} required defaultValue={50} className="min-w-0 flex-1 border-0 bg-transparent px-3.5 text-[15px] font-bold outline-none" />
            <span className="text-[13px] font-bold text-app-ink-soft">{t("find.china.units")}</span>
          </span>
        </label>
        <fieldset className="m-0 grid min-w-0 gap-1.5 border-0 p-0">
          <legend className="mb-1.5 p-0 text-[13px] font-extrabold">{t("find.china.shipping")}</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["air", "sea"] as const).map((value) => (
              <label key={value} className={cx("flex min-h-[48px] cursor-pointer items-center gap-2 rounded-[14px] border px-3 text-[13.5px] font-bold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-app-ink/30", shipping === value ? "border-app-ink bg-app-canvas" : "border-app-line bg-white")}>
                <input type="radio" name="shipping" value={value} checked={shipping === value} onChange={() => setShipping(value)} className="sr-only" />
                <Icon name={value === "air" ? "rocket" : "truck"} size={15} />
                <span className="min-w-0">{value === "air" ? t("find.china.air") : t("find.china.sea")}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <label className="mt-3 grid gap-1.5 text-[13px] font-extrabold">
        {t("find.china.notes")}
        <textarea name="notes" rows={2} maxLength={600} placeholder={t("find.china.notesPlaceholder")} className="rounded-[14px] border border-app-line px-3.5 py-2.5 text-[14.5px] font-normal outline-none placeholder:text-app-ink-soft focus:border-app-ink" />
      </label>

      {error && <p role="alert" className="mb-0 mt-3 text-[13.5px] font-bold text-app-danger">{error}</p>}
      <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="m-0 flex items-start gap-2 text-[13px] leading-[1.45] text-app-ink-soft">
          <Icon name="shield" size={15} className="mt-0.5 shrink-0" />
          <span>
            <span className="font-bold text-app-ink">{t("find.china.poweredBy", { partner: IMPORT_PARTNER.name })}.</span> {t("find.china.escrow")}
          </span>
        </p>
        <SubmitButton />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-app-line pt-4">
        <span className="text-[13px] text-app-ink-soft">{t("find.china.tryThese")}</span>
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
    </form>
  );
}
