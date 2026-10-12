"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cx } from "@/components/app-ui/cx";
import { PORTAL_LABEL, PRIORITIES, PRIORITY_LABEL, TOPICS, formatTicketNumber, topicLabel, type SupportPortal } from "@/lib/support/pure";
import { PriorityPill, SlaBadge, StatusPill, deskSelect, relativeTime } from "./ui";

// The support desk queue: filter selects, ticket rows with SLA timers and unread dots, and bulk actions.
// Refreshes itself every 30 seconds so new tickets appear without a reload.

export interface DeskRow {
  id: string;
  number: number;
  name: string;
  email: string | null;
  phone: string | null;
  subject: string;
  topic: string;
  portal: string;
  status: string;
  priority: string;
  source: string;
  assigneeName: string | null;
  firstResponseDueAt: string | null;
  firstRespondedAt: string | null;
  lastMessageAt: string;
  unread: boolean;
  preview: string;
  lastFromCustomer: boolean;
}

type Filters = { status?: string; priority?: string; topic?: string; portal?: string; assignee?: string; q?: string };

export function SupportFilters({ filters, admins, meId }: { filters: Filters; admins: Array<{ id: string; name: string }>; meId: string }) {
  const router = useRouter();
  const set = (key: keyof Filters, value: string) => {
    const params = new URLSearchParams();
    for (const [name, current] of Object.entries({ ...filters, [key]: value })) if (current) params.set(name, current);
    const text = params.toString();
    router.push(text ? `/admin/support?${text}` : "/admin/support");
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="desk-priority">Priority</label>
      <select id="desk-priority" className={deskSelect} value={filters.priority ?? ""} onChange={(e) => set("priority", e.target.value)}>
        <option value="">Any priority</option>
        {[...PRIORITIES].reverse().map((value) => <option key={value} value={value}>{PRIORITY_LABEL[value]}</option>)}
      </select>
      <label className="sr-only" htmlFor="desk-topic">Topic</label>
      <select id="desk-topic" className={deskSelect} value={filters.topic ?? ""} onChange={(e) => set("topic", e.target.value)}>
        <option value="">Any topic</option>
        {TOPICS.map((topic) => <option key={topic.value} value={topic.value}>{topic.label}</option>)}
      </select>
      <label className="sr-only" htmlFor="desk-portal">Portal</label>
      <select id="desk-portal" className={deskSelect} value={filters.portal ?? ""} onChange={(e) => set("portal", e.target.value)}>
        <option value="">Any portal</option>
        {(Object.keys(PORTAL_LABEL) as SupportPortal[]).map((portal) => <option key={portal} value={portal}>{PORTAL_LABEL[portal]}</option>)}
      </select>
      <label className="sr-only" htmlFor="desk-assignee">Assignee</label>
      <select id="desk-assignee" className={deskSelect} value={filters.assignee ?? ""} onChange={(e) => set("assignee", e.target.value)}>
        <option value="">Anyone</option>
        <option value="me">Assigned to me</option>
        <option value="none">Unassigned</option>
        {admins.filter((admin) => admin.id !== meId).map((admin) => <option key={admin.id} value={admin.id}>{admin.name}</option>)}
      </select>
    </div>
  );
}

export function SupportQueue({ rows, now }: { rows: DeskRow[]; now: number }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [router]);

  // Drop selections for tickets that left the list after a refresh.
  useEffect(() => {
    setSelected((current) => new Set([...current].filter((id) => rows.some((row) => row.id === id))));
  }, [rows]);

  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const allSelected = rows.length > 0 && selected.size === rows.length;

  const bulk = (change: { status?: string; priority?: string; assigneeId?: string | null }) => {
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/admin/support/tickets/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [...selected], ...change }) }).catch(() => null);
      if (!response?.ok) {
        const json = (await response?.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(json?.error?.message ?? "That didn't save. Try again.");
        return;
      }
      setSelected(new Set());
      router.refresh();
    });
  };

  return (
    <div className="min-w-0">
      {selected.size > 0 && (
        <div className="sticky top-2 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-[18px] bg-app-ink px-4 py-2.5 text-white shadow-lg" role="region" aria-label="Bulk actions">
          <span className="mr-1 text-[13.5px] font-extrabold">{selected.size} selected</span>
          <BulkButton disabled={busy} onClick={() => bulk({ assigneeId: "me" })}>Assign to me</BulkButton>
          <BulkButton disabled={busy} onClick={() => bulk({ status: "pending" })}>Waiting on customer</BulkButton>
          <BulkButton disabled={busy} onClick={() => bulk({ status: "solved" })}>Solved</BulkButton>
          <BulkButton disabled={busy} onClick={() => bulk({ status: "closed" })}>Close</BulkButton>
          <label className="sr-only" htmlFor="bulk-priority">Set priority</label>
          <select
            id="bulk-priority"
            disabled={busy}
            value=""
            onChange={(e) => e.target.value && bulk({ priority: e.target.value })}
            className="min-h-[34px] rounded-full border border-white/25 bg-transparent px-3 text-[13px] font-bold text-white"
          >
            <option value="" className="text-app-ink">Priority…</option>
            {[...PRIORITIES].reverse().map((value) => <option key={value} value={value} className="text-app-ink">{PRIORITY_LABEL[value]}</option>)}
          </select>
          <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-[13px] font-bold text-white/75 hover:text-white">Clear</button>
        </div>
      )}
      {error && <p role="alert" className="mb-3 rounded-[14px] bg-app-danger-tint px-4 py-2.5 text-[13.5px] font-semibold text-app-danger">{error}</p>}

      <div className="overflow-hidden rounded-[22px] border border-app-line bg-white">
        <div className="hidden items-center gap-4 border-b border-app-line px-5 py-2.5 text-[12px] font-extrabold uppercase tracking-[0.06em] text-app-ink-soft md:flex">
          <input type="checkbox" aria-label="Select all tickets" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((row) => row.id)))} className="h-4 w-4 accent-[#16141F]" />
          <span className="flex-1">Ticket</span>
          <span className="w-[150px]">Customer</span>
          <span className="w-[210px]">Status</span>
          <span className="w-[90px] text-right">Activity</span>
        </div>
        <ul className="m-0 list-none divide-y divide-app-line p-0">
          {rows.map((row) => (
            <li key={row.id} className={cx("flex items-start gap-3 px-4 py-3.5 sm:px-5 md:items-center md:gap-4", selected.has(row.id) && "bg-app-canvas")}>
              <input type="checkbox" aria-label={`Select ${formatTicketNumber(row.number)}`} checked={selected.has(row.id)} onChange={() => toggle(row.id)} className="mt-1 h-4 w-4 shrink-0 accent-[#16141F] md:mt-0" />
              <Link href={`/admin/support/${row.number}`} className="flex min-w-0 flex-1 flex-col gap-2 text-app-ink no-underline md:flex-row md:items-center md:gap-4">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    {row.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-app-accent" aria-label="New customer message" />}
                    <span className={cx("truncate text-[14.5px]", row.unread ? "font-extrabold" : "font-bold")}>{row.subject}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[13px] text-app-ink-soft">
                    <span className="font-mono text-[12px]">{formatTicketNumber(row.number)}</span> · {topicLabel(row.topic)} · {row.lastFromCustomer ? "" : "You: "}{row.preview}
                  </span>
                </span>
                <span className="min-w-0 text-[13px] md:w-[150px]">
                  <span className="block truncate font-bold">{row.name}</span>
                  <span className="block truncate text-app-ink-soft">{PORTAL_LABEL[row.portal as SupportPortal] ?? row.portal}{row.source === "email" ? " · email" : row.source === "web" ? " · web form" : ""}</span>
                </span>
                <span className="flex flex-wrap items-center gap-1.5 md:w-[210px]">
                  <StatusPill status={row.status} />
                  {row.priority !== "normal" && <PriorityPill priority={row.priority} />}
                  <SlaBadge ticket={row} now={now} />
                  {row.assigneeName && <span className="text-[12px] text-app-ink-soft">{row.assigneeName.split(" ")[0]}</span>}
                </span>
                <span className="text-[12.5px] text-app-ink-soft md:w-[90px] md:text-right">{relativeTime(row.lastMessageAt, now)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function BulkButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="inline-flex min-h-[34px] items-center gap-1.5 rounded-full bg-white/10 px-3 text-[13px] font-bold text-white hover:bg-white/20 disabled:opacity-50">
      {children}
    </button>
  );
}

