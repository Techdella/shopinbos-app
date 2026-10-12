"use client";

import { useEffect, useState } from "react";
import { POLL_MS, type ContextRef } from "@/lib/conversations/pure";

// Browser helpers for partner messages: open the Messages drawer from anywhere, the unread badge, and fetch.

export const OPEN_CONVERSATION_EVENT = "shopinbos:open-conversation";
export const MESSAGES_CHANGED_EVENT = "shopinbos:messages-changed";

export interface OpenConversationDetail {
  /** User id, supplier id or delivery partner id. */
  with?: string;
  conversation?: string;
  context?: ContextRef | null;
}

/**
 * Opens the Messages drawer (mounted by the app top bar) on a chat, e.g.
 * openConversation({ with: supplier.id, context: { kind: "product", id: product.id } }).
 * Returns false when no drawer is on the page, so callers can fall back to messagesHref().
 */
export function openConversation(detail: OpenConversationDetail) {
  if (typeof window === "undefined") return false;
  const event = new CustomEvent<OpenConversationDetail>(OPEN_CONVERSATION_EVENT, { detail, cancelable: true });
  window.dispatchEvent(event);
  // The drawer calls preventDefault() to say it took the request.
  return event.defaultPrevented;
}

/** Tells badges and lists that something was read or sent. */
export function announceMessagesChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(MESSAGES_CHANGED_EVENT));
}

/** fetch → the API envelope ({ data, meta }), or an Error carrying the API's message. */
export async function messagesApi<T, M = Record<string, unknown>>(url: string, init?: RequestInit): Promise<{ data: T; meta?: M }> {
  const isForm = typeof FormData !== "undefined" && init?.body instanceof FormData;
  const res = await fetch(url, { ...init, headers: { ...(isForm || !init?.body ? {} : { "Content-Type": "application/json" }), ...(init?.headers ?? {}) } });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error?.message ?? (res.status === 429 ? "Slow down a little and try again." : "Something went wrong. Try again."));
  return json as { data: T; meta?: M };
}

// One shared poller for every badge on the page (top bar, sidebar), refreshed every 30 seconds while the tab
// is visible and whenever a chat is read or sent.
let unreadValue = 0;
const unreadListeners = new Set<(value: number) => void>();
let unreadTimer: number | null = null;

function refreshUnread() {
  if (document.visibilityState !== "visible") return;
  void messagesApi<{ unread: number }>("/api/conversations/unread")
    .then((body) => {
      unreadValue = body.data.unread;
      for (const listener of unreadListeners) listener(unreadValue);
    })
    .catch(() => null);
}

function subscribeUnread(listener: (value: number) => void) {
  unreadListeners.add(listener);
  if (unreadListeners.size === 1) {
    refreshUnread();
    unreadTimer = window.setInterval(refreshUnread, POLL_MS.badge);
    window.addEventListener(MESSAGES_CHANGED_EVENT, refreshUnread);
    document.addEventListener("visibilitychange", refreshUnread);
  }
  return () => {
    unreadListeners.delete(listener);
    if (unreadListeners.size === 0) {
      if (unreadTimer !== null) window.clearInterval(unreadTimer);
      unreadTimer = null;
      window.removeEventListener(MESSAGES_CHANGED_EVENT, refreshUnread);
      document.removeEventListener("visibilitychange", refreshUnread);
    }
  };
}

/** Unread partner messages for badges. */
export function useUnreadMessages() {
  const [unread, setUnread] = useState(unreadValue);
  useEffect(() => {
    setUnread(unreadValue);
    return subscribeUnread(setUnread);
  }, []);
  return unread;
}
