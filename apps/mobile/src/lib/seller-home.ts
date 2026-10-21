import "expo-sqlite/localStorage/install";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { api, API_URL } from "./api";
import type { StatusAuthor, StatusPost } from "./familiar";

// What the seller's "Familiar app" Home remembers on this phone, per signed-in seller, in the same storage and
// with the same key prefix as lib/launch.ts (so signing out clears it too):
// - the first-login tour is done (also saved on the account as the "app-home-tour" intro, so a new phone skips it)
// - "Get your shop ready" was hidden
// - products saved on Discover.
// And where a Status post's button goes for a seller.

const PREFIX = "shopinbos.launch.";
const key = (uid: string, name: string) => `${PREFIX}${name}.${uid}`;

function read(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

function write(k: string, value: string) {
  try {
    localStorage.setItem(k, value);
  } catch {
    // Storage full or unavailable: the app still works, it just forgets.
  }
}

/** The intro id saved in the account's preferences (`introsSeen`) once the Home tour is done. */
export const TOUR_INTRO = "app-home-tour";

export const tourDoneHere = (uid: string) => read(key(uid, "tourDone")) === "1";

/** Has this account finished the tour on another phone (or the web)? Null when it can't tell (offline, old server). */
export async function tourDoneOnAccount(): Promise<boolean | null> {
  try {
    const prefs = await api<{ introsSeen?: string[] }>("/api/app/preferences");
    return Array.isArray(prefs.introsSeen) && prefs.introsSeen.includes(TOUR_INTRO);
  } catch {
    return null;
  }
}

export function rememberTourDone(uid: string) {
  write(key(uid, "tourDone"), "1");
  void api("/api/app/preferences", { method: "PATCH", json: { introsSeen: [TOUR_INTRO] } }).catch(() => null);
}

export const checklistHiddenHere = (uid: string) => read(key(uid, "checklistHidden")) === "1";
export const hideChecklistHere = (uid: string) => write(key(uid, "checklistHidden"), "1");

export function savedFinds(uid: string): string[] {
  try {
    const parsed = JSON.parse(read(key(uid, "findSaved")) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string").slice(0, 200) : [];
  } catch {
    return [];
  }
}

export const rememberSavedFinds = (uid: string, ids: string[]) => write(key(uid, "findSaved"), JSON.stringify(ids.slice(0, 200)));

/**
 * A Status post's button, for a seller: "Add to my shop" opens the supplier's product (which goes through the
 * Dropship agreement), "Chat" the partner or supplier chat, and the delivery buttons the partner's page.
 */
export function openStatusCta(post: StatusPost, author: StatusAuthor) {
  const cta = post.cta;
  if (!cta) return;
  const target = cta.target;
  const slug = target?.slug ?? null;
  switch (cta.kind) {
    case "add_product":
      if (slug) router.push({ pathname: "/find/[slug]", params: { slug } });
      else router.push({ pathname: "/find", params: { q: post.product?.name ?? "" } });
      return;
    case "chat":
      router.push({ pathname: "/partners/[id]", params: { id: target?.userId ?? author.userId, name: author.name } });
      return;
    case "connect":
    case "see_rates":
    case "offer_delivery":
      if (slug) router.push({ pathname: "/delivery/partner/[slug]", params: { slug } });
      else router.push("/delivery/find");
      return;
    case "view_shop":
      if (slug) void WebBrowser.openBrowserAsync(`${API_URL}/s/${encodeURIComponent(slug)}`);
      return;
  }
}
