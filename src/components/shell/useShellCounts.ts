"use client";

import { useEffect, useState } from "react";

export interface ShellCounts {
  notifications: number;
  inbox: number;
  orders: number;
}

// One request per page load, shared by the sidebar badges and the top bar bell.
let pending: Promise<ShellCounts | null> | null = null;

export function useShellCounts() {
  const [counts, setCounts] = useState<ShellCounts | null>(null);
  useEffect(() => {
    pending ??= fetch("/api/app/shell-counts")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { data?: ShellCounts } | null) => body?.data ?? null)
      .catch(() => null);
    let alive = true;
    void pending.then((value) => alive && setCounts(value));
    return () => {
      alive = false;
    };
  }, []);
  return counts;
}

/** The top bar's menu button and the sidebar talk through this event (they render in different trees). */
export const TOGGLE_NAV_EVENT = "shopinbos:toggle-nav";
