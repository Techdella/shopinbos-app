"use client";

import { portalLoginPath, portalRoleFromPath } from "@/lib/portal-routes";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

/** Local caches that would show the last person's shop name, photo or menu to the next person. */
const PERSONAL_KEYS = ["shopinbos:identity", "shopinbos:prefs"];

/**
 * Signs out on the server (revoking the session, or every session with "global"), clears this browser's
 * copy and cached account details, then replaces the current history entry with the portal's login page
 * so Back doesn't return to the dashboard.
 */
export async function signOutOfShopinbos(options: { scope?: "local" | "global"; loginPath?: string; reason?: "idle" } = {}) {
  const scope = options.scope ?? "local";
  const ok = await fetch("/api/auth/sign-out", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope }),
    cache: "no-store",
  }).then((response) => response.ok, () => false);
  // Always drop the browser's session too, even if the server call failed (offline): it clears the cookies.
  await getSupabaseBrowserClient()?.auth.signOut({ scope: ok ? "local" : scope }).catch(() => null);
  try {
    for (const key of PERSONAL_KEYS) localStorage.removeItem(key);
    sessionStorage.clear();
  } catch {
    // Storage unavailable: nothing was cached.
  }
  const loginPath = options.loginPath ?? portalLoginPath(portalRoleFromPath(window.location.pathname));
  window.location.replace(scope === "global" ? `${loginPath}?signedOut=all` : options.reason ? `${loginPath}?reason=${options.reason}` : loginPath);
}
