"use client";

import { useEffect, useState } from "react";
import { CHUNK_RELOAD_KEY, isStaleBuildError, shouldAutoReload } from "./chunk-reload";

/**
 * For an error boundary: when the error is a missing chunk or server action after a deploy, reload the page
 * once (sessionStorage-guarded so it can't loop) and report `reloading` so the boundary shows an update note
 * instead of the error. Without sessionStorage there is no guard, so it never reloads by itself.
 */
export function useDeployRecovery(error: unknown) {
  // Decided on the first render so the error page never flashes before the update note. Server renders
  // (no window) never reload, and stale-build errors only happen in the browser, so hydration matches.
  const [reloading] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return shouldAutoReload(error, window.sessionStorage.getItem(CHUNK_RELOAD_KEY), Date.now());
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!reloading) return;
    try {
      window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
    } catch {
      return;
    }
    // A beat so the note registers before the page goes.
    const timer = window.setTimeout(() => window.location.reload(), 350);
    return () => window.clearTimeout(timer);
  }, [reloading]);

  return { reloading, stale: isStaleBuildError(error) };
}

/** A full reload: "Try again" can't fetch a build that no longer exists, a fresh page can. */
export function reloadPage() {
  window.location.reload();
}
