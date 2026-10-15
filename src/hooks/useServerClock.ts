"use client";

import { useSyncExternalStore } from "react";
import { clockOffset } from "@/lib/store-campaigns/time";

// One shared clock for every countdown on the page (seller backend and storefront): it asks the server for the time
// once, corrects for a wrong device clock (half the round trip either way), ticks every second, and checks again
// every five minutes and whenever the tab comes back into focus. Every timer reads the same tick, so they never
// drift apart, and there is only one interval however many timers show.

const RESYNC_MS = 5 * 60_000;

let offset = 0;
let synced = false;
let now = 0;
let timer: number | null = null;
let lastSync = 0;
let syncing = false;
let endpoint = "/api/time";
const listeners = new Set<() => void>();

function emit() {
  now = Date.now() + offset;
  for (const listener of listeners) listener();
}

async function sync() {
  if (syncing || typeof window === "undefined") return;
  syncing = true;
  try {
    const sentAt = Date.now();
    const res = await fetch(endpoint, { cache: "no-store" });
    const receivedAt = Date.now();
    const json = (await res.json().catch(() => null)) as { data?: { serverNow?: number } } | null;
    const serverNow = Number(json?.data?.serverNow);
    if (res.ok && Number.isFinite(serverNow)) {
      offset = clockOffset(serverNow, sentAt, receivedAt);
      synced = true;
      lastSync = receivedAt;
      emit();
    }
  } catch {
    // Offline: keep the device clock (or the last offset).
  } finally {
    syncing = false;
  }
}

function onFocus() {
  if (document.visibilityState === "visible") void sync();
}

function start() {
  if (timer !== null || typeof window === "undefined") return;
  now = Date.now() + offset;
  timer = window.setInterval(() => {
    emit();
    if (Date.now() - lastSync > RESYNC_MS) void sync();
  }, 1000);
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onFocus);
  void sync();
}

function stop() {
  if (timer === null) return;
  window.clearInterval(timer);
  timer = null;
  window.removeEventListener("focus", onFocus);
  document.removeEventListener("visibilitychange", onFocus);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
    if (!listeners.size) stop();
  };
}

/**
 * Seeds the offset from a server time the page was rendered with (no wait for the first request) and picks the
 * time endpoint: "/api/time" in the seller backend, "/api/public/time" on stores (their own domains only reach
 * /api/public).
 */
export function primeServerClock(serverNowMs: number | null | undefined, options: { endpoint?: string; renderedAt?: number } = {}) {
  if (options.endpoint) endpoint = options.endpoint;
  if (!synced && typeof serverNowMs === "number" && Number.isFinite(serverNowMs)) {
    // The page may have taken a moment to arrive; a fetched time replaces this as soon as it lands.
    offset = serverNowMs - (options.renderedAt ?? Date.now());
  }
}

/** Server time in ms, ticking every second. 0 during server rendering (render nothing time-based then). */
export function useServerNow(): number {
  return useSyncExternalStore(subscribe, () => now, () => 0);
}

/** The current server-corrected time without subscribing (for event handlers). */
export function serverNowMs() {
  return Date.now() + offset;
}
