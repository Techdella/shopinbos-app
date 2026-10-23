"use client";

import { useRef, useState } from "react";
import { Notice, PillButton, cx } from "@/components/app-ui";
import { PackRender } from "@/components/packaging/PackRender";
import { downloadPrintPdf } from "@/components/packaging/export";
import { PACK_FORMAT_INFO, type PackDesign, type PackFormat } from "@shared/packaging";
import { DELIVERY_ZONES, PRINT_ORDER_STATUSES, PRINT_ORDER_STATUS_LABEL, type PrintOrderStatus } from "@shared/print-orders";
import { friendlyError } from "@/lib/errors/report-client";

export interface PrintOrderRow {
  id: string;
  title: string;
  format: string;
  design: PackDesign;
  quantity: number;
  material: string;
  finish: string;
  unitPrice: number;
  setupFee: number;
  deliveryFee: number;
  total: number;
  days: number;
  zone: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
  status: string;
  tracking: string | null;
  adminNotes: string | null;
  paidAt: string | null;
  createdAt: string;
  store: { id: string; name: string; slug: string } | null;
}

const FILTERS = ["open", "unpaid", "all"] as const;
const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;

/** The print team's queue: paid orders first, the print file one tap away, and the status the seller sees. */
export function PrintOrdersManager({ initial, migrationNeeded }: { initial: PrintOrderRow[]; migrationNeeded: boolean }) {
  const [rows, setRows] = useState(initial);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("open");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<PrintOrderRow | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  if (migrationNeeded) return <Notice tone="info">Print orders need a database update first. Run docs/migrations/2026-11-02-print-orders.sql, then reload.</Notice>;

  const shown = rows.filter((row) => (filter === "all" ? true : filter === "unpaid" ? row.status === "awaiting_payment" : ["paid", "printing", "shipped"].includes(row.status)));

  async function update(id: string, body: { status?: string; tracking?: string | null; adminNotes?: string | null }) {
    setBusy(id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/print-orders/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = (await response.json().catch(() => null)) as { data?: Partial<PrintOrderRow>; error?: { message?: string } } | null;
      if (!response.ok || !json?.data) throw new Error(json?.error?.message ?? "Couldn't save.");
      setRows((current) => current.map((row) => (row.id === id ? { ...row, status: json.data!.status ?? row.status, tracking: json.data!.tracking ?? null, adminNotes: json.data!.adminNotes ?? null } : row)));
    } catch (err) {
      setError(err instanceof Error ? friendlyError(err) : "Couldn't save.");
    } finally {
      setBusy(null);
    }
  }

  async function printFile(row: PrintOrderRow) {
    setBusy(`pdf:${row.id}`);
    setError(null);
    setExporting(row);
    try {
      // Let the hidden full-size render mount, then make the PDF from it.
      await new Promise((resolve) => window.setTimeout(resolve, 150));
      if (!exportRef.current) throw new Error("Couldn't draw the design.");
      await downloadPrintPdf(exportRef.current, row.design, `${row.title} x${row.quantity}`);
    } catch (err) {
      setError(err instanceof Error ? friendlyError(err) : "Couldn't make the PDF.");
    } finally {
      setBusy(null);
      setExporting(null);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((key) => (
          <button key={key} type="button" onClick={() => setFilter(key)} className={cx("min-h-[38px] rounded-full border px-4 text-[13.5px] font-bold", filter === key ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white")}>
            {key === "open" ? "To do" : key === "unpaid" ? "Not paid yet" : "All"}
          </button>
        ))}
      </div>
      {error ? <Notice>{error}</Notice> : null}
      {shown.length === 0 ? <p className="m-0 rounded-[16px] bg-white p-6 text-center text-[14px] text-app-ink-soft">Nothing here.</p> : null}
      {shown.map((row) => (
        <article key={row.id} className="grid gap-3 rounded-[20px] border border-app-line bg-white p-5">
          <div className="flex flex-wrap items-start gap-4">
            <div className="grid h-28 w-24 shrink-0 place-items-center rounded-[12px] bg-app-canvas p-1.5">
              <PackRender design={row.design} view="front" className="max-h-full max-w-full" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="m-0 text-[12px] font-bold uppercase tracking-[0.12em] text-app-ink-soft">
                {PACK_FORMAT_INFO[row.format as PackFormat]?.name ?? row.format} · {row.design.size.w}×{row.design.size.h}{row.design.size.d ? `×${row.design.size.d}` : ""} mm · {row.paidAt ? `paid ${new Date(row.paidAt).toLocaleDateString("en-NG")}` : "not paid"}
              </p>
              <h2 className="m-0 mt-1 text-[18px] font-extrabold">
                {row.quantity.toLocaleString("en-NG")} × {row.title}
                {row.store ? <span className="font-normal text-app-ink-soft"> · {row.store.name} ({row.store.slug})</span> : null}
              </h2>
              <p className="m-0 mt-1 text-[14px]">{row.material} · {row.finish} · {naira(row.total)} ({naira(row.unitPrice)} each + {naira(row.setupFee)} setup + {naira(row.deliveryFee)} delivery)</p>
              <p className="m-0 mt-1 text-[14px]">
                {DELIVERY_ZONES.find((zone) => zone.id === row.zone)?.name ?? row.zone}: {row.contactName} · <a href={`https://wa.me/${row.contactPhone.replace(/\D/g, "")}`}>{row.contactPhone}</a>
                {row.address ? ` · ${row.address}, ${row.city ?? ""} ${row.state ?? ""}` : ""}
              </p>
              {row.notes ? <p className="m-0 mt-1 rounded-[12px] bg-app-canvas p-2 text-[13.5px]">{row.notes}</p> : null}
            </div>
            <div className="grid gap-2">
              <PillButton size="sm" busy={busy === `pdf:${row.id}`} disabled={Boolean(busy)} onClick={() => void printFile(row)}>Print PDF</PillButton>
              <label className="grid gap-1 text-[12.5px] font-bold">
                Status
                <select value={row.status} disabled={busy === row.id} onChange={(event) => void update(row.id, { status: event.target.value })} className="h-10 rounded-full border border-app-line bg-white px-3 text-[13.5px]">
                  {PRINT_ORDER_STATUSES.map((status) => <option key={status} value={status}>{PRINT_ORDER_STATUS_LABEL[status as PrintOrderStatus]}</option>)}
                </select>
              </label>
            </div>
          </div>
          <Field label="Tracking (the seller sees this)" initial={row.tracking} busy={busy === row.id} onSave={(tracking) => void update(row.id, { tracking })} />
          <Field label="Team notes (the seller doesn't see these)" initial={row.adminNotes} busy={busy === row.id} onSave={(adminNotes) => void update(row.id, { adminNotes })} />
        </article>
      ))}
      <div aria-hidden className="pointer-events-none fixed left-[-200000px] top-0">
        {exporting ? (
          <div ref={exportRef} className="inline-block">
            <PackRender design={exporting.design} view="flat" pixelSize />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Field({ label, initial, busy, onSave }: { label: string; initial: string | null; busy: boolean; onSave: (value: string | null) => void }) {
  const [value, setValue] = useState(initial ?? "");
  return (
    <div className="grid gap-1.5">
      <label className="text-[12.5px] font-bold">{label}</label>
      <div className="flex gap-2">
        <input value={value} onChange={(event) => setValue(event.target.value)} className="h-10 flex-1 rounded-[12px] border border-app-line px-3 text-[14px]" />
        {value !== (initial ?? "") ? <PillButton size="sm" tone="white" busy={busy} onClick={() => onSave(value.trim() || null)}>Save</PillButton> : null}
      </div>
    </div>
  );
}
