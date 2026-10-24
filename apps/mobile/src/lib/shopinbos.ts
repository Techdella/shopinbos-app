import { useSyncExternalStore } from "react";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { isShopinbosPath } from "@shared/shopinbos-status";
import { openFeatureIntro } from "@/components/learn/events";
import { dismissShopinbos, markStatusSeen, type StatusPost, type StatusVideo } from "./familiar";
import { shareShop } from "./share";
import { supabase } from "./supabase";

// Shopinbos's own getting-started posts on the phone (shared/shopinbos-status.ts): what their buttons do, playing
// their videos, and what this phone already knows before the next refresh (seen posts, "Don't show again"), so
// the Status ring and the Home card update at once. The account keeps the real state (POST …/view, …/dismiss).

let hidden = false;
let seen: ReadonlySet<string> = new Set();
let version = 0;
const listeners = new Set<() => void>();

function emit() {
  version += 1;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Re-renders when a Shopinbos post is seen or the statuses are hidden on this phone. */
export function useShopinbosHere() {
  useSyncExternalStore(subscribe, () => version);
  return { hidden, seen };
}

/** A Shopinbos post was seen or watched: tell the account and remember it here. */
export function markShopinbosSeen(id: string) {
  if (!seen.has(id)) {
    seen = new Set([...seen, id]);
    emit();
  }
  void markStatusSeen(id);
}

/** "Don't show again" (the viewer, or a long-press on the ring): gone from the Status row for good. */
export function hideShopinbosStatus() {
  hidden = true;
  emit();
  return dismissShopinbos("status").catch(() => null);
}

// Signing out (then in as someone else) starts from the server's state again.
supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") {
    hidden = false;
    seen = new Set();
    emit();
  }
});

/** Whether a post (or the whole author) counts as seen, with what this phone saw since the last load. */
export const seenHere = (post: Pick<StatusPost, "id" | "seen">) => Boolean(post.seen) || seen.has(post.id);

/**
 * A Shopinbos post's button: "open" goes to that screen of the app (only the paths Shopinbos's posts use),
 * "share" opens the share sheet with the shop link. False for any other button (the caller handles it).
 */
export function runShopinbosCta(post: StatusPost): boolean {
  const cta = post.cta;
  if (cta?.kind === "open") {
    const path = cta.target?.path;
    if (isShopinbosPath(path)) router.push(path as never);
    return true;
  }
  if (cta?.kind === "share") {
    void shareShop().catch(() => null);
    return true;
  }
  return false;
}

/** A video that plays outside the Status viewer: the 60-second intro in the app, else the recorded video's page. */
export function watchOutside(video: StatusVideo | null | undefined): boolean {
  if (!video || video.url) return false;
  if (video.intro) {
    openFeatureIntro(video.intro);
    return true;
  }
  if (video.watchUrl) {
    void WebBrowser.openBrowserAsync(video.watchUrl);
    return true;
  }
  return false;
}
