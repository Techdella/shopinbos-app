"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/app-kit";
import { useT } from "@/components/i18n/I18nProvider";
import { importSupplierProductsCsv, type SupplierImportResult } from "@/app/actions/supplier";

export function SupplierImportForm() {
  const t = useT("supplier");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<SupplierImportResult | null>(null);

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
