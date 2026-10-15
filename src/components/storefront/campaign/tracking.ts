"use client";

import { PREVIEW_COOKIE, PREVIEW_PARAM, PREVIEW_TOKEN_PARAM } from "@/lib/store-campaigns/preview-params";

// Storefront side of seasonal campaigns: batched report events, and the signed preview link that follows the
// previewer around the store.

type CampaignEvent = { campaignId: string; blockId?: string | null; event: "page_view" | "block_view" | "block_click" | "popup_shown" | "popup_closed" | "popup_converted" };

const queues = new Map<string, CampaignEvent[]>();
let flushTimer: number | null = null;
let disabled = false;

/** Previews and the builder never count. */
export function disableCampaignTracking() {
  disabled = true;
}

function sessionId() {
  try {
    const key = "sib-campaign-session";
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
      sessionStorage.setItem(key, id);
    }
    return id;
  } catch {
    return "";
  }
}

function flush() {
  flushTimer = null;
  for (const [slug, events] of queues) {
    queues.delete(slug);
    for (let at = 0; at < events.length; at += 30) {
      const body = JSON.stringify({ sessionId: sessionId(), events: events.slice(at, at + 30) });
      const url = `/api/public/store/${encodeURIComponent(slug)}/campaign-events`;
      try {
        if (navigator.sendBeacon?.(url, new Blob([body], { type: "application/json" }))) continue;
      } catch {}
      void fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => null);
    }
  }
}

/** Queues a campaign report event; sent a couple of seconds later in one request (or when the page closes). */
export function trackCampaignEvent(slug: string, event: CampaignEvent) {
  if (disabled || !slug || typeof window === "undefined" || isPreviewing()) return;
  const list = queues.get(slug) ?? [];
  list.push(event);
  queues.set(slug, list);
  if (flushTimer === null) {
    flushTimer = window.setTimeout(flush, 2500);
    window.addEventListener("pagehide", flush, { once: true });
  }
}

/** Once per browser session per campaign: a visit while it runs. */
export function trackCampaignVisit(slug: string, campaignId: string) {
  try {
    const key = `sib-campaign-visit:${campaignId}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {}
  trackCampaignEvent(slug, { campaignId, event: "page_view" });
}

// ─── Preview ──────────────────────────────────────────────────────────────────

function readCookie(name: string) {
  try {
    const match = document.cookie.split("; ").find((part) => part.startsWith(`${name}=`));
    return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
  } catch {
    return null;
  }
}

/** The preview link's query (preview_campaign & token) for API calls, from the address or the preview cookie. */
export function campaignPreviewQuery(): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  const id = params.get(PREVIEW_PARAM);
  const token = params.get(PREVIEW_TOKEN_PARAM);
  if (id && token) return new URLSearchParams({ [PREVIEW_PARAM]: id, [PREVIEW_TOKEN_PARAM]: token }).toString();
  const cookie = readCookie(PREVIEW_COOKIE);
  if (!cookie) return "";
  const [cookieToken] = cookie.split("|");
  try {
    const payload = JSON.parse(atob(cookieToken!.split(".")[0]!.replace(/-/g, "+").replace(/_/g, "/"))) as { c?: string };
    return payload.c ? new URLSearchParams({ [PREVIEW_PARAM]: payload.c, [PREVIEW_TOKEN_PARAM]: cookieToken! }).toString() : "";
  } catch {
    return "";
  }
}

export function isPreviewing() {
  return Boolean(campaignPreviewQuery());
}

/** Keeps the preview going on other pages of the store (a session cookie; the server checks the signature). */
export function rememberPreview(token: string, at: string | null) {
  try {
    document.cookie = `${PREVIEW_COOKIE}=${encodeURIComponent(`${token}${at ? `|${at}` : ""}`)}; path=/; SameSite=Lax`;
  } catch {}
}

export function exitPreview() {
  try {
    document.cookie = `${PREVIEW_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  } catch {}
  const url = new URL(window.location.href);
  url.searchParams.delete(PREVIEW_PARAM);
  url.searchParams.delete(PREVIEW_TOKEN_PARAM);
  url.searchParams.delete("preview_at");
  window.location.assign(url.toString());
}
