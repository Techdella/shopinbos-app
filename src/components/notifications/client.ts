"use client";

import { useEffect, useRef, useState } from "react";
import type { NotifyCategory } from "@shared/notifications";

// The bell's data on the web: the feed (GET /api/notifications), marking read, and one shared unread count that
// the bell, the drawer and the notifications page all keep in step. Live updates poll every 45 seconds while the
// tab is visible, and straight away when a push arrives (the service worker posts a message).

export interface NotificationItem {
  id: string;
  type: string;
  category: NotifyCategory;
  priority: "critical" | "warning" | "info" | "success";
  title: string;
  description: string;
  link: string | null;
  actionLabel: string | null;
  actionUrl: string | null;
  read: boolean;
  createdAt: string;
}

export interface Feed {
  items: NotificationItem[];
  unreadCount: number;
  hasNextPage: boolean;
}

export const POLL_MS = 45_000;
const CHANGED = "shopinbos:notifications-changed";

let unread: number | null = null;
const listeners = new Set<(count: number) => void>();

export function setUnread(count: number) {
  unread = Math.max(0, count);
  for (const listener of listeners) listener(unread);
}

export function useUnreadCount(initial = 0) {
  const [count, setCount] = useState(unread ?? initial);
  useEffect(() => {
    listeners.add(setCount);
    return () => {
      listeners.delete(setCount);
    };
  }, []);
  return count;
}

/** Something changed (read, a push arrived): every open list reloads. */
export function announceChange() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGED));
}

export async function fetchFeed(tab: string, page = 1, limit = 30): Promise<Feed> {
  const params = new URLSearchParams({ tab, page: String(page), limit: String(limit) });
  const response = await fetch(`/api/notifications?${params}`, { credentials: "include", cache: "no-store" });
  const body = (await response.json().catch(() => null)) as { data?: { items: NotificationItem[]; unreadCount: number; pagination: { hasNextPage: boolean } }; error?: { message?: string } } | null;
  if (!response.ok || !body?.data) throw new Error(body?.error?.message ?? "We couldn't load your notifications. Try again.");
  setUnread(body.data.unreadCount);
  return { items: body.data.items, unreadCount: body.data.unreadCount, hasNextPage: body.data.pagination.hasNextPage };
}

export async function markRead(target: { id: string } | { all: true; tab?: string }) {
  const response = await fetch("/api/notifications", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(target) });
  const body = (await response.json().catch(() => null)) as { data?: { unreadCount?: number } } | null;
  if (typeof body?.data?.unreadCount === "number") setUnread(body.data.unreadCount);
  announceChange();
}

/** Runs `tick` now, every POLL_MS while the tab is visible, when the tab comes back, and on any change or push. */
export function useLiveRefresh(tick: () => void, enabled = true) {
  const latest = useRef(tick);
  useEffect(() => {
    latest.current = tick;
  });
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const run = () => latest.current();
    const start = () => {
      if (timer) clearInterval(timer);
      timer = setInterval(() => {
        if (document.visibilityState === "visible") run();
      }, POLL_MS);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        run();
        start();
      } else if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onMessage = (event: MessageEvent) => {
      if ((event.data as { type?: string } | null)?.type === "shopinbos:notification") run();
    };
    run();
    start();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(CHANGED, run);
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(CHANGED, run);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, [enabled]);
}
