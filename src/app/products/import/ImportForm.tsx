"use client";

import { useState } from "react";
import Link from "next/link";
import { Notice, PillButton } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";

// Built here so the download always matches the columns the importer reads.
const SAMPLE_CSV = [
  "name,description,retailPrice,costPrice,status",
  "Linen shirt,White linen shirt in size M,18500,9000,active",
  "Ankara tote bag,Hand-made tote with leather straps,12000,5500,draft",
].join("\n");

export function ImportForm() {
  const t = useT("products", "common");
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ imported: number; errors: string[] } | null>(null);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");

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

    const formData = new FormData();
    formData.append("csv", file);

    try {
      const res = await fetch("/api/products/import", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setResult(data.data ?? data);
        fileInput.value = "";
        setFileName("");
      } else {
        setError(data?.error?.message ?? (typeof data?.error === "string" ? data.error : t("import.failed")));
      }
    } catch {
      setError(t("import.uploadError"));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="grid gap-4">
      {error && <Notice>{error}</Notice>}

      {result && (
        <div className="grid gap-3 rounded-[22px] bg-app-success-tint p-5" role="status">
          <div className="text-[16px] font-extrabold text-app-success">
            {t("import.complete", { count: result.imported })}
          </div>
          {result.errors.length > 0 && (
            <div className="text-[13.5px] text-app-danger">
              {t("import.rowErrors", { count: result.errors.length })}
              <ul className="m-0 mt-1 grid gap-0.5 pl-5">
                {result.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
          <div>
            <Link href="/products" className="inline-flex min-h-[44px] items-center rounded-full bg-app-ink px-5 text-[14px] font-extrabold text-white no-underline hover:bg-black">
              {t("import.view")}
            </Link>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid gap-4 rounded-[22px] border border-app-line bg-white p-5 sm:p-6">
        <div>
          <h2 className="m-0 text-[17px] font-extrabold">{t("import.csvFile")}</h2>
          <p className="m-0 mt-1 max-w-[640px] text-[14px] leading-[1.55] text-app-ink-soft">
            {t("import.useColumns")} <code className="rounded bg-app-canvas px-1.5 py-0.5 text-[13px]">name, description, retailPrice, costPrice, status</code>{t("import.headerRow")}
          </p>
        </div>
        <label className="grid cursor-pointer place-items-center gap-2 rounded-[18px] border-2 border-dashed border-app-line px-4 py-10 text-center hover:border-app-line-strong focus-within:border-app-ink">
          <Icon name="upload" size={26} />
          <span className="text-[15px] font-bold">{fileName || t("import.choose")}</span>
          <span className="text-[13px] text-app-ink-soft">{t("import.from")}</span>
          <input type="file" name="csv" accept=".csv" required className="sr-only" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")} />
        </label>
        <div className="flex flex-wrap gap-2">
          <PillButton type="submit" tone="accent" size="md" busy={uploading}>{t("import.upload")}</PillButton>
          <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE_CSV)}`} download="sample-products.csv" className="inline-flex min-h-[48px] items-center gap-2 rounded-full border border-app-line bg-white px-5 text-[15px] font-bold text-app-ink no-underline hover:border-app-line-strong">
            <Icon name="download" size={16} /> {t("import.sample")}
          </a>
        </div>
      </form>
    </div>
  );
}
