"use client";

import { useState } from "react";
import { Notice, PillButton, cx } from "@/components/app-ui";
import { PACKAGING_REQUEST_STATUSES, PACKAGING_REQUEST_STATUS_LABEL, PACKAGING_SERVICE_LABEL, type PackagingRequestStatus, type PackagingService } from "@shared/packaging-requests";
import { PACK_FORMAT_INFO, PRODUCT_TYPE_INFO, type PackFormat, type ProductType } from "@shared/packaging";

export interface PackagingRequestRow {
  id: string;
  status: string;
  productName: string;
  productType: string;
  packType: string;
  quantity: number;
  size: string | null;
  budget: number | null;
  deadline: string | null;
  services: string[];
  details: string;
  referenceUrls: string[];
  contactName: string;
  contactPhone: string;
  contactEmail: string | null;
  adminNotes: string | null;
  createdAt: string;
  store: { id: string; name: string; slug: string } | null;
  design: { id: string; title: string; previewUrl: string | null } | null;
}

const FILTERS = ["open", "all"] as const;

/** The branding team's queue: what the seller wants, their references and design, and how to reach them. */
export function PackagingRequestsManager({ initial, migrationNeeded }: { initial: PackagingRequestRow[]; migrationNeeded: boolean }) {
  const [rows, setRows] = useState(initial);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("open");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (migrationNeeded) return <Notice tone="info">Packaging requests need a database update first. Run docs/migrations/2026-11-01-print-designs-packaging-requests.sql, then reload.</Notice>;

  const shown = rows.filter((row) => (filter === "all" ? true : ["new", "quoted", "in_progress"].includes(row.status)));

  async function update(id: string, body: { status?: string; adminNotes?: string | null }) {
    setBusy(id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/packaging-requests/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = (await response.json().catch(() => null)) as { data?: Partial<PackagingRequestRow>; error?: { message?: string } } | null;
      if (!response.ok || !json?.data) throw new Error(json?.error?.message ?? "Couldn't save.");
      setRows((current) => current.map((row) => (row.id === id ? { ...row, status: json.data!.status ?? row.status, adminNotes: json.data!.adminNotes ?? null } : row)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((key) => (
          <button key={key} type="button" onClick={() => setFilter(key)} className={cx("min-h-[38px] rounded-full border px-4 text-[13.5px] font-bold", filter === key ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white")}>
            {key === "open" ? "To do" : "All"}
          </button>
        ))}
      </div>
      {error ? <Notice>{error}</Notice> : null}
      {shown.length === 0 ? <p className="m-0 rounded-[16px] bg-white p-6 text-center text-[14px] text-app-ink-soft">Nothing here.</p> : null}
      {shown.map((row) => (
        <article key={row.id} className="grid gap-3 rounded-[20px] border border-app-line bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="m-0 text-[12px] font-bold uppercase tracking-[0.12em] text-app-ink-soft">
                {PRODUCT_TYPE_INFO[row.productType as ProductType]?.name ?? row.productType} · {PACK_FORMAT_INFO[row.packType as PackFormat]?.name ?? row.packType} · {new Date(row.createdAt).toLocaleDateString("en-NG")}
              </p>
              <h2 className="m-0 mt-1 text-[18px] font-extrabold">
                {row.productName}
                {row.store ? <span className="font-normal text-app-ink-soft"> · {row.store.name} ({row.store.slug})</span> : null}
              </h2>
              <p className="m-0 mt-1 text-[14px]">
                {row.contactName} · <a href={`https://wa.me/${row.contactPhone.replace(/\D/g, "")}`}>{row.contactPhone}</a>
                {row.contactEmail ? <> · <a href={`mailto:${row.contactEmail}`}>{row.contactEmail}</a></> : null}
              </p>
            </div>
            <label className="grid gap-1 text-[12.5px] font-bold">
              Status
              <select value={row.status} disabled={busy === row.id} onChange={(event) => void update(row.id, { status: event.target.value })} className="h-10 rounded-full border border-app-line bg-white px-3 text-[13.5px]">
                {PACKAGING_REQUEST_STATUSES.map((status) => <option key={status} value={status}>{PACKAGING_REQUEST_STATUS_LABEL[status as PackagingRequestStatus]}</option>)}
              </select>
            </label>
          </div>
          <dl className="m-0 grid gap-x-6 gap-y-1.5 text-[13.5px] sm:grid-cols-2">
            {[
              ["Quantity", row.quantity.toLocaleString("en-NG")],
              ["Size", row.size],
              ["Budget", row.budget ? `₦${row.budget.toLocaleString("en-NG")}` : null],
              ["Needed by", row.deadline],
              ["Wants", row.services.map((service) => PACKAGING_SERVICE_LABEL[service as PackagingService] ?? service).join(", ")],
            ].filter(([, value]) => value).map(([label, value]) => (
              <div key={label as string} className="min-w-0">
                <dt className="inline font-bold">{label}: </dt>
                <dd className="m-0 inline break-words">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="m-0 whitespace-pre-line rounded-[14px] bg-app-canvas p-3 text-[14px]">{row.details}</p>
          {row.design || row.referenceUrls.length ? (
            <div className="flex flex-wrap gap-2">
              {row.design ? (
                <span className="flex items-center gap-2 rounded-[12px] border border-app-line p-1.5 pr-3 text-[13px] font-bold">
                  {row.design.previewUrl ? <img src={row.design.previewUrl} alt="" className="h-14 w-14 rounded-[8px] bg-app-canvas object-contain" /> : null}
                  Their design: {row.design.title}
                </span>
              ) : null}
              {row.referenceUrls.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer" className="block h-16 w-16 overflow-hidden rounded-[12px] border border-app-line">
                  <img src={url} alt="Reference" className="h-full w-full object-cover" />
                </a>
              ))}
            </div>
          ) : null}
          <AdminNotes initial={row.adminNotes} busy={busy === row.id} onSave={(adminNotes) => void update(row.id, { adminNotes })} />
        </article>
      ))}
    </div>
  );
}

function AdminNotes({ initial, busy, onSave }: { initial: string | null; busy: boolean; onSave: (value: string | null) => void }) {
  const [value, setValue] = useState(initial ?? "");
  return (
    <div className="grid gap-2">
      <label className="text-[12.5px] font-bold">Team notes (the seller doesn&apos;t see these)</label>
      <textarea rows={2} value={value} onChange={(event) => setValue(event.target.value)} className="rounded-[14px] border border-app-line px-3 py-2 text-[14px]" />
      {value !== (initial ?? "") ? <PillButton size="sm" tone="white" busy={busy} className="w-fit" onClick={() => onSave(value.trim() || null)}>Save notes</PillButton> : null}
    </div>
  );
}
