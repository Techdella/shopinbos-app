"use client";

import type { SupportStatus } from "@/lib/support/pure";

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
