"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/app-kit";
import { useT } from "@/components/i18n/I18nProvider";
import { importSupplierProductsCsv, importSupplierProductsSheet, type SupplierImportResult } from "@/app/actions/supplier";
import { SUPPLIER_IMPORT_COLUMNS } from "@shared/supplier-import";

export function SupplierImportForm() {
  const t = useT("supplier");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<SupplierImportResult | null>(null);
  const [sheet, setSheet] = useState("");
  // A blank template with the right columns, to fill in Excel, Google Sheets or Numbers.
  const template = `data:text/csv;charset=utf-8,${encodeURIComponent(`${SUPPLIER_IMPORT_COLUMNS.join(",")}\n`)}`;

  function upload(file: File | undefined) {
    if (!file) return;
    start(async () => setResult(await importSupplierProductsCsv(await file.text())));
  }

  return (
    <Card className="grid gap-3 p-5">
      <label className="grid gap-2 text-[15px] font-bold">
        {t("imp.choose")}
        <input type="file" accept=".csv,text/csv" disabled={pending} onChange={(event) => upload(event.target.files?.[0])} className="text-[14px]" />
      </label>
      <a href={template} download="shopinbos-products-template.csv" className="w-fit text-[14px] font-bold text-app-ink underline underline-offset-2">{t("imp.template")}</a>
      <form
        className="grid gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (sheet.trim()) start(async () => setResult(await importSupplierProductsSheet(sheet)));
        }}
      >
        <label htmlFor="sheet-link" className="text-[15px] font-bold">{t("imp.sheet")}</label>
        <div className="flex flex-wrap gap-2">
          <input id="sheet-link" type="url" value={sheet} onChange={(event) => setSheet(event.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" className="min-h-[44px] min-w-0 flex-1 rounded-full border border-app-line bg-white px-4 text-[14px]" />
          <button type="submit" disabled={pending || !sheet.trim()} className="min-h-[44px] rounded-full bg-app-ink px-5 text-[14px] font-bold text-white disabled:opacity-50">{t("imp.sheetGo")}</button>
        </div>
        <p className="m-0 text-[13px] text-app-ink-soft">{t("imp.sheetHint")}</p>
      </form>
      {pending ? <p role="status" className="m-0 text-[14px] text-app-ink-soft">{t("imp.working")}</p> : null}
      {result ? (
        <div role="status" className="grid gap-2 text-[14px]">
          {result.message ? <p className="m-0 font-bold text-app-danger">{result.message}</p> : <p className="m-0 font-bold">{t("imp.done", { count: result.created })}</p>}
          {result.errors.length ? (
            <ul className="m-0 grid list-none gap-1 p-0 text-[13px] text-app-ink-soft">
              {result.errors.map((error) => <li key={`${error.row}-${error.message}`}>{t("imp.rowError", { row: error.row, message: error.message })}</li>)}
            </ul>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
