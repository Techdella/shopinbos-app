"use client";

import type React from "react";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { formatDate, formatMoney } from "@shared/i18n";

// What the seller's Pay small small, ajo and group-buy screens share on the web.

export async function call<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const response = await fetch(path, { ...rest, credentials: "same-origin", headers: json !== undefined ? { "content-type": "application/json" } : undefined, body: json !== undefined ? JSON.stringify(json) : rest.body });
  const body = (await response.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!response.ok) throw new Error(body?.error?.message || String(response.status));
  return body?.data as T;
}

export function act<T = { ok: true }>(body: Record<string, unknown>) {
  return call<T>("/api/app/together", { method: "POST", json: body });
}

export function useFormat() {
  const locale = useLocale();
  return {
    money: (naira: number) => formatMoney(naira, locale, { currency: "NGN" }),
    day: (value: string | Date) => formatDate(typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00+01:00`) : new Date(value), locale, { weekday: "short", day: "numeric", month: "short" }),
  };
}

const TONE: Record<string, string> = {
  active: "bg-[#E7F6F3] text-[#1F6F68]",
  running: "bg-[#E7F6F3] text-[#1F6F68]",
  open: "bg-[#E7F6F3] text-[#1F6F68]",
  joined: "bg-[#E7F6F3] text-[#1F6F68]",
  forming: "bg-[#FFF4E0] text-[#8A5A12]",
  pending: "bg-[#FFF4E0] text-[#8A5A12]",
  filled: "bg-[#FFF4E0] text-[#8A5A12]",
  pay_link: "bg-[#FFF4E0] text-[#8A5A12]",
  completed: "bg-[#E6F4EA] text-[#1F7A4D]",
  charged: "bg-[#E6F4EA] text-[#1F7A4D]",
  collected: "bg-[#E6F4EA] text-[#1F7A4D]",
  defaulted: "bg-[#FDECEA] text-[#B42318]",
  removed: "bg-[#FDECEA] text-[#B42318]",
  dropped: "bg-[#FDECEA] text-[#B42318]",
};

export function StatusPill({ status }: { status: string }) {
  const t = useT("together");
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[12px] font-bold ${TONE[status] ?? "bg-app-canvas text-app-ink-soft"}`}>{t.dynamic(`status.${status}`, status)}</span>;
}

export function Box({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[22px] border border-app-line bg-white p-5 ${className}`}>{children}</section>;
}

export function Button({ children, tone = "ink", className = "", ...props }: { children: React.ReactNode; tone?: "ink" | "line" | "danger"; className?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const look = tone === "ink" ? "bg-app-ink text-white" : tone === "danger" ? "border border-app-line bg-white text-app-danger" : "border border-app-line bg-white text-app-ink";
  return (
    <button type="button" {...props} className={`min-h-[42px] rounded-full px-5 text-[14px] font-bold disabled:opacity-60 ${look} ${className}`}>
      {children}
    </button>
  );
}

export function Message({ message }: { message: { tone: "error" | "success"; text: string } | null }) {
  if (!message) return null;
  return <p role={message.tone === "error" ? "alert" : "status"} className={message.tone === "error" ? "m-0 text-[14px] text-app-danger" : "m-0 text-[14px] text-app-success"}>{message.text}</p>;
}

export const inputClass = "min-h-[44px] w-full rounded-[14px] border border-app-line px-3.5 text-[15px] outline-none focus:border-app-ink";
