"use client";

import { useState } from "react";
import Link from "next/link";
import { Notice, PillButton } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";
import { ImportPeggyReview, type ImportResult } from "./ImportPeggyReview";
import { uploadToFolder } from "@/components/media/media-client";

// Built here so the download always matches the columns the importer reads.
const SAMPLE_CSV = [
  "name,description,retailPrice,costPrice,stock,sku,category,status,images",
  "Linen shirt,White linen shirt in size M,18500,9000,24,LS-001,Clothing,published,https://example.com/photos/linen-shirt.jpg",
  "Ankara tote bag,Hand-made tote with leather straps,12000,5500,10,AT-002,Bags,draft,ankara-tote-front.jpg | ankara-tote-back.jpg",
].join("\n");

const PHOTO_UPLOADS_AT_ONCE = 3;


/** Uploads the chosen photos to the media library; returns { "file.jpg": url } plus per-file problems. */
async function uploadPhotos(files: File[], onProgress: (done: number) => void) {
  const urls: Record<string, string> = {};
  const failures: { name: string; reason: string }[] = [];
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < files.length) {
      const file = files[next++]!;
      try {
        urls[file.name] = await uploadToFolder(file, "products");
      } catch (error) {
        failures.push({ name: file.name, reason: error instanceof Error ? error.message : "network error" });
      }
      onProgress(++done);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PHOTO_UPLOADS_AT_ONCE, files.length) }, worker));
  return { urls, failures };
}

export function ImportForm() {
  const t = useT("products", "common");
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [photoCount, setPhotoCount] = useState(0);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [review, setReview] = useState<{ file: File; imageMap: Record<string, string>; photoErrors: string[] } | null>(null);
  const [checking, setChecking] = useState(false);

  /** "Let Peggy check and fill in": uploads the photos, then hands the file to the review step. */
  const handleCheck = async (form: HTMLFormElement | null) => {
    if (!form) return;
    const fileInput = form.elements.namedItem("csv") as HTMLInputElement;
    const file = fileInput.files?.[0];
    setError("");
    setResult(null);
    if (!file) {
      setError(t("import.selectFile"));
      return;
    }
    const photoInput = form.elements.namedItem("photos") as HTMLInputElement;
    const photos = Array.from(photoInput.files ?? []);
    setChecking(true);
    try {
      let imageMap: Record<string, string> = {};
      let photoErrors: string[] = [];
      if (photos.length) {
        setProgress({ done: 0, total: photos.length });
        const uploaded = await uploadPhotos(photos, (done) => setProgress({ done, total: photos.length }));
        imageMap = uploaded.urls;
        photoErrors = uploaded.failures.map((f) => t("import.photoFailed", { name: f.name, reason: f.reason }));
      }
      setReview({ file, imageMap, photoErrors });
    } catch {
      setError(t("import.uploadError"));
    } finally {
      setProgress(null);
      setChecking(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setUploading(true);
    setError("");
    setResult(null);

    const form = e.currentTarget;
    const fileInput = form.elements.namedItem("csv") as HTMLInputElement;
    const file = fileInput.files?.[0];
    if (!file) {
      setError(t("import.selectFile"));
      setUploading(false);
      return;
    }

    const photoInput = form.elements.namedItem("photos") as HTMLInputElement;
    const photos = Array.from(photoInput.files ?? []);

    try {
      let photoErrors: string[] = [];
      let imageMap: Record<string, string> = {};
      if (photos.length) {
        setProgress({ done: 0, total: photos.length });
        const uploaded = await uploadPhotos(photos, (done) => setProgress({ done, total: photos.length }));
        imageMap = uploaded.urls;
        photoErrors = uploaded.failures.map((f) => t("import.photoFailed", { name: f.name, reason: f.reason }));
        setProgress(null);
      }

      const formData = new FormData();
      formData.append("csv", file);
      if (Object.keys(imageMap).length) formData.append("imageMap", JSON.stringify(imageMap));

      const res = await fetch("/api/products/import", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        const out: ImportResult = data.data ?? data;
        setResult({ ...out, errors: [...photoErrors, ...(out.errors ?? [])] });
        fileInput.value = "";
        photoInput.value = "";
        setFileName("");
        setPhotoCount(0);
      } else {
        setError(data?.error?.message ?? (typeof data?.error === "string" ? data.error : t("import.failed")));
      }
    } catch {
      setError(t("import.uploadError"));
    } finally {
      setProgress(null);
      setUploading(false);
    }
  };

  if (review) {
    return (
      <ImportPeggyReview
        file={review.file}
        imageMap={review.imageMap}
        photoErrors={review.photoErrors}
        onBack={() => {
          // The form comes back empty, so the chosen file is shown as not chosen.
          setReview(null);
          setFileName("");
          setPhotoCount(0);
        }}
        onDone={(out) => {
          setReview(null);
          setResult(out);
          setFileName("");
          setPhotoCount(0);
        }}
      />
    );
  }

  return (
    <div className="grid gap-4">
      {error && <Notice>{error}</Notice>}

      {result && (
        <div className="grid gap-3 rounded-[22px] bg-app-success-tint p-5" role="status">
          <div className="text-[16px] font-extrabold text-app-success">
            {t("import.complete", { count: result.imported })}
          </div>
          {result.notices?.map((notice, i) => (
            <div key={i} className="text-[13.5px] font-bold text-app-ink">{notice}</div>
          ))}
          {!!result.enhanced && (
            <div className="text-[13.5px] text-app-success">{t("importAi.enhanced", { count: result.enhanced })}</div>
          )}
          {!!result.withImages && (
            <div className="text-[13.5px] text-app-success">{t("import.withImages", { count: result.withImages })}</div>
          )}
          {result.errors.length > 0 && (
            <div className="text-[13.5px] text-app-danger">
              {t("import.rowErrors", { count: result.errors.length })}
              <ul className="m-0 mt-1 grid gap-0.5 pl-5">
                {result.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
          <div>
            <Link href="/products" className="inline-flex min-h-[44px] items-center rounded-full bg-app-ink px-5 text-[14px] font-bold text-white no-underline hover:bg-black">
              {t("import.view")}
            </Link>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid gap-4 rounded-[22px] border border-app-line bg-white p-5 sm:p-6">
        <div>
          <h2 className="m-0 text-[17px] font-extrabold">{t("import.csvFile")}</h2>
          <p className="m-0 mt-1 max-w-[640px] text-[14px] leading-[1.55] text-app-ink-soft">
            {t("import.useColumns")} <code className="rounded bg-app-canvas px-1.5 py-0.5 text-[13px]">name, price</code>{t("import.headerRow")} {t("import.optionalColumns")}
          </p>
        </div>
        <label className="grid cursor-pointer place-items-center gap-2 rounded-[18px] border-2 border-dashed border-app-line px-4 py-10 text-center hover:border-app-line-strong focus-within:border-app-ink">
          <Icon name="upload" size={26} />
          <span className="text-[15px] font-bold">{fileName || t("import.choose")}</span>
          <span className="text-[13px] text-app-ink-soft">{t("import.from")}</span>
          <input type="file" name="csv" accept=".csv" required className="sr-only" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")} />
        </label>
        <div className="grid gap-2">
          <h3 className="m-0 text-[15px] font-extrabold">{t("import.photos")}</h3>
          <p className="m-0 max-w-[640px] text-[13.5px] leading-[1.55] text-app-ink-soft">{t("import.photosHelp")}</p>
          <label className="grid cursor-pointer place-items-center gap-2 rounded-[18px] border-2 border-dashed border-app-line px-4 py-6 text-center hover:border-app-line-strong focus-within:border-app-ink">
            <Icon name="image" size={22} />
            <span className="text-[14.5px] font-bold">{photoCount ? t("import.photosChosen", { count: photoCount }) : t("import.choosePhotos")}</span>
            <span className="text-[13px] text-app-ink-soft">{t("import.photosFrom")}</span>
            <input type="file" name="photos" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="sr-only" onChange={(e) => setPhotoCount(e.target.files?.length ?? 0)} />
          </label>
        </div>
        <p className="m-0 max-w-[640px] text-[13.5px] leading-[1.55] text-app-ink-soft">{t("importAi.checkHelp")}</p>
        {progress && (
          <div className="text-[13.5px] font-bold text-app-ink-soft" role="status">{t("import.uploadingPhotos", { done: progress.done, total: progress.total })}</div>
        )}
        <div className="flex flex-wrap gap-2">
          <PillButton tone="accent" size="md" busy={checking} disabled={uploading} onClick={(e) => handleCheck(e.currentTarget.form)}>{t("importAi.check")}</PillButton>
          <PillButton type="submit" tone="white" size="md" busy={uploading} disabled={checking}>{t("import.upload")}</PillButton>
          <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE_CSV)}`} download="sample-products.csv" className="inline-flex min-h-[48px] items-center gap-2 rounded-full border border-app-line bg-white px-5 text-[15px] font-bold text-app-ink no-underline hover:border-app-line-strong">
            <Icon name="download" size={16} /> {t("import.sample")}
          </a>
        </div>
      </form>
    </div>
  );
}
