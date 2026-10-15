"use client";

import { useState } from "react";
import { Notice, PillButton, cx } from "@/components/app-ui";
import { AD_REQUEST_STATUSES, AD_REQUEST_STATUS_LABEL, type AdRequestStatus } from "@shared/ad-campaigns";

export interface AdRequestRow {
  id: string;
  platform: string;
  status: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string | null;
  businessName: string;
  handle: string | null;
  pageUrl: string | null;
  website: string | null;
  adAccountId: string | null;
  dailyBudget: number;
  days: number;
  goals: string | null;
  audience: string | null;
  notes: string | null;
  setupFee: number;
  paidAt: string | null;
  adminNotes: string | null;
  campaignId: string | null;
  createdAt: string;
  store: { id: string; name: string; slug: string } | null;
}

const FILTERS = ["open", "awaiting_payment", "all"] as const;

/** The ads team's queue: paid requests first, with everything needed to set the campaign up. */
export function AdRequestsManager({ initial, migrationNeeded }: { initial: AdRequestRow[]; migrationNeeded: boolean }) {
  const [rows, setRows] = useState(initial);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("open");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (migrationNeeded) return <Notice tone="info">Ad requests need a database update first. Run docs/migrations/2026-10-31-video-projects-ad-campaigns.sql, then reload.</Notice>;

  const shown = rows.filter((row) => (filter === "all" ? true : filter === "awaiting_payment" ? row.status === "awaiting_payment" : ["new", "in_progress", "live"].includes(row.status)));

  async function update(id: string, body: { status?: string; adminNotes?: string | null }) {
    setBusy(id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/ad-requests/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = (await response.json().catch(() => null)) as { data?: AdRequestRow; error?: { message?: string } } | null;
      if (!response.ok || !json?.data) throw new Error(json?.error?.message ?? "Couldn't save.");
      setRows((current) => current.map((row) => (row.id === id ? { ...row, ...json.data!, store: row.store } : row)));
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
            {key === "open" ? "To do" : key === "awaiting_payment" ? "Not paid yet" : "All"}
          </button>
        ))}
      </div>
      {error ? <Notice>{error}</Notice> : null}
      {shown.length === 0 ? <p className="m-0 rounded-[16px] bg-white p-6 text-center text-[14px] text-app-ink-soft">Nothing here.</p> : null}
      {shown.map((row) => (
        <article key={row.id} className="grid gap-3 rounded-[20px] border border-app-line bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="m-0 text-[12px] font-bold uppercase tracking-[0.12em] text-app-ink-soft">{row.platform === "tiktok" ? "TikTok" : "Facebook & Instagram"} · ₦{row.setupFee.toLocaleString("en-NG")} {row.paidAt ? `paid ${new Date(row.paidAt).toLocaleDateString("en-NG")}` : "not paid"}</p>
              <h2 className="m-0 mt-1 text-[18px] font-extrabold">{row.businessName}{row.store ? <span className="font-normal text-app-ink-soft"> · {row.store.name} ({row.store.slug})</span> : null}</h2>
              <p className="m-0 mt-1 text-[14px]">{row.contactName} · <a href={`tel:${row.contactPhone}`}>{row.contactPhone}</a>{row.contactEmail ? <> · <a href={`mailto:${row.contactEmail}`}>{row.contactEmail}</a></> : null}</p>
            </div>
            <label className="grid gap-1 text-[12.5px] font-bold">
              Status
              <select value={row.status} disabled={busy === row.id} onChange={(event) => void update(row.id, { status: event.target.value })} className="h-10 rounded-full border border-app-line bg-white px-3 text-[13.5px]">
                {AD_REQUEST_STATUSES.map((status) => <option key={status} value={status}>{AD_REQUEST_STATUS_LABEL[status as AdRequestStatus]}</option>)}
              </select>
            </label>
          </div>
          <dl className="m-0 grid gap-x-6 gap-y-1.5 text-[13.5px] sm:grid-cols-2">
            {[
              ["Handle", row.handle],
              ["Page / profile", row.pageUrl],
              ["Website", row.website],
              ["Ad account", row.adAccountId],
              ["Budget", `₦${row.dailyBudget.toLocaleString("en-NG")} a day for ${row.days} days`],
              ["Campaign", row.campaignId ? `In Shopinbos (${row.campaignId})` : null],
              ["Goals", row.goals],
              ["Audience", row.audience],
              ["Notes", row.notes],
            ].filter(([, value]) => value).map(([label, value]) => (
              <div key={label as string} className="min-w-0">
                <dt className="inline font-bold">{label}: </dt>
                <dd className="m-0 inline break-words">{value}</dd>
              </div>
            ))}
          </dl>
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
      <label className="text-[12.5px] font-bold" htmlFor={`notes-${initial}`}>Team notes (the seller doesn't see these)</label>
      <textarea rows={2} value={value} onChange={(event) => setValue(event.target.value)} className="rounded-[14px] border border-app-line px-3 py-2 text-[14px]" />
      {value !== (initial ?? "") ? <PillButton size="sm" tone="white" busy={busy} className="w-fit" onClick={() => onSave(value.trim() || null)}>Save notes</PillButton> : null}
    </div>
  );
}
