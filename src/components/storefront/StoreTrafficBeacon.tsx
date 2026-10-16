"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// Store traffic for /home/analytics/traffic: one small POST per page opened (its path, and the shop search on /shop),
// the session's landing details once (referrer host only, ?ref / utm tags), and how long each page stayed visible.
// Counts only: nothing identifies the shopper (see src/lib/analytics/traffic.ts). Never runs in the owner's preview
// or the builder frame. With Do Not Track or Global Privacy Control on, the landing details and location are left out.

const lagosDay = () => new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 10);

function storage(kind: "local" | "session") {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function limitedTracking() {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string };
  return nav.globalPrivacyControl === true || nav.doNotTrack === "1" || nav.msDoNotTrack === "1";
}

function referrerHost() {
  try {
    return document.referrer ? new URL(document.referrer).hostname : "";
  } catch {
    return "";
  }
}

function send(slug: string, body: Record<string, unknown>, beacon = false) {
  const url = `/api/public/store/${encodeURIComponent(slug)}/traffic`;
  const json = JSON.stringify(body);
  if (beacon && typeof navigator.sendBeacon === "function") {
    if (navigator.sendBeacon(url, new Blob([json], { type: "application/json" }))) return;
  }
  void fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: json, keepalive: true }).catch(() => null);
}

export function StoreTrafficBeacon({ slug }: { slug: string }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const lastSent = useRef("");
  const landed = useRef(false);
  const page = useRef<{ path: string; visibleMs: number; since: number | null } | null>(null);

  const query = search?.toString() ?? "";

  useEffect(() => {
    if (!slug || !pathname || /(^|\/)preview(\/|$)/.test(pathname)) return;
    try {
      if (window.top !== window.self) return;
    } catch {
      return;
    }
    if ((navigator as Navigator & { webdriver?: boolean }).webdriver) return;
    const key = `${pathname}?${query}`;
    if (lastSent.current === key) return;
    lastSent.current = key;

    // The previous page's visible time, then this page.
    flush(slug, page.current, false);
    page.current = { path: pathname, visibleMs: 0, since: document.visibilityState === "visible" ? Date.now() : null };

    const limited = limitedTracking();
    const local = storage("local");
    const session = storage("session");
    const body: Record<string, unknown> = { type: "page_view", path: pathname };
    const q = new URLSearchParams(query).get("q");
    if (q) body.q = q.slice(0, 80);
    const sessionKey = `sib-trf-session:${slug}`;
    // Without sessionStorage, the first page this tab shows is the landing page.
    if (session ? !session.getItem(sessionKey) : !landed.current) {
      session?.setItem(sessionKey, "1");
      landed.current = true;
      const params = new URLSearchParams(window.location.search);
      body.entry = limited
        ? {}
        : {
            referrerHost: referrerHost(),
            ref: params.get("ref") ?? params.get("utm_source") ?? undefined,
            medium: params.get("utm_medium") ?? undefined,
            campaign: params.get("utm_campaign") ?? undefined,
          };
    }
    if (limited) body.limited = true;
    const dayKey = `sib-trf-day:${slug}`;
    const today = lagosDay();
    if (local && local.getItem(dayKey) !== today) {
      local.setItem(dayKey, today);
      body.firstToday = true;
    }
    const seenKey = `sib-trf-seen:${slug}`;
    if (local && !local.getItem(seenKey)) {
      local.setItem(seenKey, "1");
      body.newVisitor = true;
    }
    send(slug, body);
  }, [slug, pathname, query]);

  useEffect(() => {
    if (!slug) return;
    const onVisibility = () => {
      const current = page.current;
      if (!current) return;
      if (document.visibilityState === "hidden") {
        // Phones often never fire pagehide: report what we have now and start again if they come back.
        flush(slug, current, true);
        page.current = { path: current.path, visibleMs: 0, since: null };
      } else if (current.since == null) {
        current.since = Date.now();
      }
    };
    const onHide = () => {
      flush(slug, page.current, true);
      page.current = null;
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
    };
  }, [slug]);

  return null;
}

function flush(slug: string, current: { path: string; visibleMs: number; since: number | null } | null, beacon: boolean) {
  if (!current) return;
  const ms = current.visibleMs + (current.since != null ? Date.now() - current.since : 0);
  const seconds = Math.round(ms / 1000);
  if (seconds >= 1) send(slug, { type: "engagement", path: current.path, seconds: Math.min(seconds, 1800) }, beacon);
}
