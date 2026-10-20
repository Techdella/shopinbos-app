"use client";

import { useEffect, useState } from "react";
import { DEFAULT_PREFERENCES, MAX_INTROS_SEEN, parsePreferences, tipsOn, type AppPreferences } from "@shared/preferences";

export interface ShellCounts {
  notifications: number;
  inbox: number;
  orders: number;
  preferences?: AppPreferences;
  identity?: ShellIdentity | null;
  /** Sellers: the Shopinbos Wallet ID check (null for other roles). */
  idCheck?: { verified: boolean; checksReady: boolean } | null;
  /** Admins: the menu item ids their team role opens (null or missing: all). */
  adminNav?: string[] | null;
}

export interface ShellIdentity {
  name: string;
  avatarUrl: string | null;
  logoUrl: string | null;
  logoLabel: string | null;
  businessName: string | null;
}

// One request per page load, shared by the sidebar badges, the top bar bell and the menu preferences.
let pending: Promise<ShellCounts | null> | null = null;

function loadCounts() {
  pending ??= fetch("/api/app/shell-counts")
    .then((response) => (response.ok ? response.json() : null))
    .then((body: { data?: ShellCounts } | null) => body?.data ?? null)
    .catch(() => null);
  return pending;
}

export function useShellCounts() {
  const [counts, setCounts] = useState<ShellCounts | null>(null);
  useEffect(() => {
    let alive = true;
    void loadCounts().then((value) => alive && setCounts(value));
    return () => {
      alive = false;
    };
  }, []);
  return counts;
}

/** The top bar's menu button and the sidebar talk through this event (they render in different trees). */
export const TOGGLE_NAV_EVENT = "shopinbos:toggle-nav";

// Menu preferences: cached in localStorage so the sidebar doesn't flash switched-off items, confirmed by the
// server on each load, and broadcast when changed so every open component updates.
const PREFS_KEY = "shopinbos:prefs";
const PREFS_EVENT = "shopinbos:prefs";

function cachedPreferences(): AppPreferences {
  try {
    return parsePreferences(JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null"));
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function broadcast(prefs: AppPreferences) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Private mode: the server copy still applies on the next load.
  }
  window.dispatchEvent(new CustomEvent<AppPreferences>(PREFS_EVENT, { detail: prefs }));
}

export function usePreferences() {
  const [prefs, setPrefs] = useState<AppPreferences | null>(null);
  // True once this page load has the server's copy. The localStorage cache can be stale (new device, cleared
  // storage), so anything that must not repeat (the guided tour) waits for this.
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    let alive = true;
    setPrefs(cachedPreferences());
    const onChange = (event: Event) => setPrefs((event as CustomEvent<AppPreferences>).detail);
    window.addEventListener(PREFS_EVENT, onChange);
    void loadCounts().then((counts) => {
      if (!counts?.preferences) return;
      broadcast(parsePreferences(counts.preferences));
      if (alive) setConfirmed(true);
    });
    return () => {
      alive = false;
      window.removeEventListener(PREFS_EVENT, onChange);
    };
  }, []);

  async function save(patch: Partial<AppPreferences>) {
    const optimistic = { ...(prefs ?? DEFAULT_PREFERENCES), ...patch };
    broadcast(optimistic);
    const response = await fetch("/api/app/preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    const body = (await response.json().catch(() => null)) as { data?: AppPreferences } | null;
    if (!response.ok || !body?.data) {
      broadcast(prefs ?? DEFAULT_PREFERENCES);
      throw new Error("Couldn't save that. Try again.");
    }
    broadcast(parsePreferences(body.data));
  }

  /** Marks a 60-second feature intro as seen (server copy, with this device's localStorage as the fallback). */
  async function markIntroSeen(key: string) {
    rememberIntroLocally(key);
    const seen = prefs?.introsSeen ?? [];
    if (seen.includes(key)) return;
    await save({ introsSeen: [...seen, key].slice(-MAX_INTROS_SEEN) }).catch(() => undefined);
  }

  return { prefs, loaded: prefs !== null, confirmed, save, markIntroSeen };
}

/**
 * Whether tips and tooltips are on (Customise your menu → Tips and tooltips). Reads the cached preferences and
 * follows changes; the shell's usePreferences loads the server copy, so this never fetches on its own.
 */
export function useTipsOn() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    setOn(tipsOn(cachedPreferences()));
    const onChange = (event: Event) => setOn(tipsOn((event as CustomEvent<AppPreferences>).detail));
    window.addEventListener(PREFS_EVENT, onChange);
    return () => window.removeEventListener(PREFS_EVENT, onChange);
  }, []);
  return on;
}

// Intros seen on this device: only a fallback for when the server save fails (offline, signed out mid-way).
const INTROS_KEY = "shopinbos:intros-seen";

function rememberIntroLocally(key: string) {
  try {
    const seen = introsSeenLocally().filter((item) => item !== key);
    localStorage.setItem(INTROS_KEY, JSON.stringify([...seen, key].slice(-MAX_INTROS_SEEN)));
  } catch {
    // Private mode: the server copy is the only record.
  }
}

export function introsSeenLocally(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(INTROS_KEY) ?? "[]") as unknown;
    return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

// The person's photo and logo. Pages pass what they loaded on the server; the shell-counts response fills in
// what a page didn't pass; an upload broadcasts the new picture so the top bar, the menu and every other
// avatar or logo on screen change at once, without a reload.
const IDENTITY_EVENT = "shopinbos:identity";
const IDENTITY_KEY = "shopinbos:identity";
let identityOverride: Partial<ShellIdentity> = {};

function rememberIdentity(identity: Partial<ShellIdentity>) {
  try {
    const current = JSON.parse(localStorage.getItem(IDENTITY_KEY) ?? "{}") as Partial<ShellIdentity>;
    localStorage.setItem(IDENTITY_KEY, JSON.stringify({ ...current, ...identity }));
  } catch {
    // Private mode or storage full: loading screens fall back to generic copy.
  }
}

/** Last known name, photo and shop name on this device, for loading screens that show before any data. */
export function cachedIdentity(): Partial<ShellIdentity> {
  try {
    return JSON.parse(localStorage.getItem(IDENTITY_KEY) ?? "{}") as Partial<ShellIdentity>;
  } catch {
    return {};
  }
}

export function broadcastIdentity(identity: Partial<ShellIdentity>) {
  identityOverride = { ...identityOverride, ...identity };
  rememberIdentity(identity);
  pending = null; // The next page's shell-counts request picks up the change too.
  window.dispatchEvent(new CustomEvent<Partial<ShellIdentity>>(IDENTITY_EVENT, { detail: identity }));
}

type IdentityProps = { [K in keyof ShellIdentity]?: ShellIdentity[K] | undefined };

/** Props win over the server copy (they're loaded fresh for the page); an upload in this tab wins over both. */
export function useIdentity(props: IdentityProps): ShellIdentity {
  const [server, setServer] = useState<ShellIdentity | null>(null);
  const [override, setOverride] = useState<Partial<ShellIdentity>>(identityOverride);
  useEffect(() => {
    let alive = true;
    void loadCounts().then((counts) => {
      if (!counts?.identity) return;
      rememberIdentity(counts.identity);
      if (alive) setServer(counts.identity);
    });
    const onChange = (event: Event) => setOverride((current) => ({ ...current, ...(event as CustomEvent<Partial<ShellIdentity>>).detail }));
    window.addEventListener(IDENTITY_EVENT, onChange);
    return () => {
      alive = false;
      window.removeEventListener(IDENTITY_EVENT, onChange);
    };
  }, []);
  const pick = <K extends keyof ShellIdentity>(key: K): ShellIdentity[K] =>
    (key in override ? override[key] : props[key] !== undefined ? props[key] : server?.[key] ?? null) as ShellIdentity[K];
  return {
    name: pick("name") ?? "",
    avatarUrl: pick("avatarUrl"),
    logoUrl: pick("logoUrl"),
    logoLabel: pick("logoLabel"),
    businessName: pick("businessName"),
  };
}
