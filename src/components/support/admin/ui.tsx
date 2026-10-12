import type { ReactNode } from "react";
import { cx } from "@/components/app-ui/cx";
import { PRIORITY_LABEL, STATUS_LABEL, formatMinutes, slaState, type SupportPriority, type SupportStatus } from "@/lib/support/pure";

// Small pieces shared by the support desk's server pages and client components (no hooks, no server imports).

const TONE = {
  accent: "bg-app-peach text-app-accent-ink",
  success: "bg-app-success-tint text-app-success",
  warning: "bg-[#FDF0D5] text-[#8A5A00]",
  muted: "bg-app-canvas text-app-ink-soft",
  danger: "bg-app-danger-tint text-app-danger",
  info: "bg-[#E8EAFB] text-[#3D4FB8]",
} as const;

export function DeskPill({ tone = "muted", children, title }: { tone?: keyof typeof TONE; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={cx("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-bold", TONE[tone])}>
      {children}
    </span>
  );
}

const STATUS_TONE: Record<SupportStatus, keyof typeof TONE> = { open: "accent", pending: "info", solved: "success", closed: "muted" };
const PRIORITY_TONE: Record<SupportPriority, keyof typeof TONE> = { urgent: "danger", high: "warning", normal: "muted", low: "muted" };

export function StatusPill({ status }: { status: string }) {
  return <DeskPill tone={STATUS_TONE[status as SupportStatus] ?? "muted"}>{STATUS_LABEL[status as SupportStatus] ?? status}</DeskPill>;
}

export function PriorityPill({ priority }: { priority: string }) {
  return <DeskPill tone={PRIORITY_TONE[priority as SupportPriority] ?? "muted"}>{PRIORITY_LABEL[priority as SupportPriority] ?? priority}</DeskPill>;
}

/** First-response timer: "Due in 23m", "Overdue 12m", or nothing once answered. */
export function SlaBadge({ ticket, now }: { ticket: { firstResponseDueAt: Date | string | null; firstRespondedAt: Date | string | null; status: string }; now?: number }) {
  const sla = slaState(ticket, now);
  if (sla.state === "none" || sla.state === "met") return null;
  if (sla.state === "overdue") return <DeskPill tone="danger" title="First response is overdue">Overdue {formatMinutes(sla.minutes)}</DeskPill>;
  return <DeskPill tone={sla.state === "soon" ? "warning" : "muted"} title="Time left for the first reply">Reply in {formatMinutes(sla.minutes)}</DeskPill>;
}

export const deskSelect =
  "min-h-[40px] rounded-full border border-app-line bg-white px-3.5 pr-8 text-[13.5px] font-bold text-app-ink outline-none transition hover:border-app-line-strong focus:border-app-ink";

export function relativeTime(value: Date | string, now = Date.now()) {
  const minutes = Math.round((now - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)}h ago`;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(value));
}
