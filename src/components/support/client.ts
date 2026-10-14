"use client";

import { attachmentProblem, type SupportStatus } from "@/lib/support/pure";
import { formatDate, type Locale, type TFunction } from "@shared/i18n";
import type { KeysOf } from "@shared/i18n/catalog";

// What the in-app support chat gets back from /api/support (dates arrive as ISO strings).

export interface ChatTicketSummary {
  id: string;
  number: number;
  subject: string;
  topic: string;
  status: SupportStatus;
  lastMessageAt: string;
  unread: boolean;
  preview: string;
  rating: number | null;
}

export interface ChatMessage {
  id: string;
  authorType: "user" | "agent" | "ai" | "system";
  authorName: string | null;
  body: string;
  channel: string;
  attachments: Array<{ name: string; type: string; size: number; url: string }>;
  createdAt: string;
}

export interface ChatTicket {
  id: string;
  number: number;
  subject: string;
  topic: string;
  status: SupportStatus;
  createdAt: string;
  rating: number | null;
  ratingComment: string | null;
  answered: boolean;
  messages: ChatMessage[];
}

export class SupportRequestError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
  ) {
    super(message);
  }
}

/** fetch → { data } or a SupportRequestError with the API's friendly message. */
export async function supportFetch<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
  } catch {
    throw new SupportRequestError("You look offline. Check your connection and try again.", "OFFLINE", 0);
  }
  const json = (await response.json().catch(() => null)) as { data?: T; error?: { code?: string; message?: string } } | null;
  if (!response.ok || !json || json.data === undefined) {
    throw new SupportRequestError(json?.error?.message ?? "Something went wrong. Try again.", json?.error?.code ?? "ERROR", response.status);
  }
  return json.data;
}

export function timeLabel(iso: string, now = Date.now()) {
  const date = new Date(iso);
  const minutes = Math.round((now - date.getTime()) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 24 * 60) return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── In the person's language ("support" catalog) ────────────────────────────

export type SupportT = TFunction<KeysOf<["support", "common"]>>;

/** timeLabel in the person's language: "now", "5m ago", a time today, else "13 Oct" (Lagos time). */
export function localTimeLabel(iso: string, locale: Locale, t: SupportT, now = Date.now()) {
  const date = new Date(iso);
  const minutes = Math.round((now - date.getTime()) / 60_000);
  if (minutes < 1) return t("time.now");
  if (minutes < 60) return t("time.minutesAgo", { count: minutes });
  if (minutes < 24 * 60) return formatDate(date, locale, { hour: "2-digit", minute: "2-digit" });
  return formatDate(date, locale, { day: "numeric", month: "short" });
}

/** attachmentProblem (lib/support/pure, English) as a catalog key. */
export function attachmentProblemKey(file: { type: string; size: number }): "file.type" | "file.empty" | "file.tooBig" | null {
  const problem = attachmentProblem(file);
  if (!problem) return null;
  return problem.startsWith("Attach") ? "file.type" : problem.startsWith("That file") ? "file.empty" : "file.tooBig";
}

/** What to show for a failed support call: offline in the person's language, else the API's own message. */
export function supportErrorText(error: unknown, t: SupportT, fallback: "couldntSend" | "couldntSendConnection" = "couldntSend") {
  if (error instanceof SupportRequestError && error.code === "OFFLINE") return t("offline");
  return error instanceof Error && error.message ? error.message : t(fallback);
}

/** Ticket status as the customer sees it. */
export function customerStatusLabel(status: SupportStatus, t: SupportT) {
  return status === "open" ? t("customerStatus.open") : status === "pending" ? t("customerStatus.pending") : t(`status.${status}` as const);
}
