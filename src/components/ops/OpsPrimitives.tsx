import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";

export function formatMoney(currency: string | null | undefined, value: number | null | undefined) {
  const amount = value ?? 0;
  return `${currency || "NGN"} ${amount.toLocaleString()}`;
}

export function formatDate(value: Date | string | null | undefined) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export function statusTone(status: string) {
  if (["published", "verified", "delivered", "accepted", "paid", "active"].includes(status)) {
    return { bg: "rgb(46 126 120 / 0.12)", color: "var(--color-teal-deep)" };
  }
  if (["pending", "pending_review", "processing", "picked_up", "in_transit", "responded"].includes(status)) {
    return { bg: "rgb(242 169 59 / 0.14)", color: "var(--color-amber)" };
  }
  if (["rejected", "suspended", "cancelled", "failed", "refunded", "unpublished"].includes(status)) {
    return { bg: "rgb(232 106 79 / 0.12)", color: "var(--color-coral)" };
  }
  return { bg: "rgb(14 42 56 / 0.08)", color: "var(--color-muted)" };
}

export function StatusPill({ status }: { status: string }) {
  const tone = statusTone(status);
  return (
    <Pill bg={tone.bg} color={tone.color}>
      {status.replace(/_/g, " ")}
    </Pill>
  );
}

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <div className="text-[15px] font-semibold text-[var(--color-navy)]">{title}</div>
      <p className="mt-2 text-[13px] leading-6 text-[var(--color-muted)]">{children}</p>
    </Card>
  );
}

export function DetailLine({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-muted)]">{label}</div>
      <div className="mt-1 text-[14px] font-semibold text-[var(--color-navy)]">{value}</div>
    </div>
  );
}

export function TextInput({
  label,
  name,
  defaultValue,
  placeholder,
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[13px] font-semibold text-[var(--color-muted)]">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        className="w-full rounded-[14px] border border-[rgb(14_42_56_/_0.12)] bg-white px-4 py-3 text-[14px] text-[var(--color-navy)] outline-none"
      />
    </label>
  );
}

export function TextArea({
  label,
  name,
  defaultValue,
  placeholder,
  rows = 4,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[13px] font-semibold text-[var(--color-muted)]">{label}</span>
      <textarea
        name={name}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        rows={rows}
        className="w-full resize-none rounded-[14px] border border-[rgb(14_42_56_/_0.12)] bg-white px-4 py-3 text-[14px] text-[var(--color-navy)] outline-none"
      />
    </label>
  );
}
