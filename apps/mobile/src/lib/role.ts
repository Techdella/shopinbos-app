import "expo-sqlite/localStorage/install";
import { useEffect, useSyncExternalStore } from "react";
import { api } from "./api";
import { asRole, type AppRole } from "./partner-pure";
import { useSession } from "./session";
import { supabase } from "./supabase";

// The signed-in account's role (seller, supplier, delivery partner or admin), which picks the tab group the app
// shows. The source of truth is the app's User row (POST /api/auth/sync-user answers with it); this phone remembers
// it per account so later launches route straight away. Stored with the launch cache, so sign-out clears it.

const key = (uid: string) => `shopinbos.launch.role.${uid}`;
const memory = new Map<string, AppRole>();
const listeners = new Set<() => void>();
const pending = new Map<string, Promise<AppRole | null>>();

function notify() {
  listeners.forEach((listener) => listener());
}

export function cachedRole(uid: string | null | undefined): AppRole | null {
  if (!uid) return null;
  const known = memory.get(uid);
  if (known) return known;
  try {
    const stored = asRole(localStorage.getItem(key(uid)));
    if (stored) memory.set(uid, stored);
    return stored;
  } catch {
    return null;
  }
}

/** `persist: false` keeps a stand-in role for this launch only (the lookup failed), so the next launch asks again. */
export function rememberRole(uid: string, role: AppRole | null | undefined, { persist = true } = {}) {
  if (!role) return;
  memory.set(uid, role);
  if (persist) {
    try {
      localStorage.setItem(key(uid), role);
    } catch {
      // Storage unavailable: the role is asked for again next launch.
    }
  }
  notify();
}

// Forget in memory too when someone signs out (the launch cache clears the stored copy).
supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") {
    memory.clear();
    pending.clear();
    notify();
  }
});

/** Asks the backend which role this account has (creating the app's User row if it's missing). */
export function resolveRole(uid: string, metadataRole?: unknown): Promise<AppRole | null> {
  const running = pending.get(uid);
  if (running) return running;
  const request = api<{ role?: string }>("/api/auth/sync-user", { method: "POST", json: { role: asRole(metadataRole) ?? "seller" } })
    .then((data) => {
      const role = asRole(data?.role);
      rememberRole(uid, role);
      return role;
    })
    .catch(() => null)
    .finally(() => pending.delete(uid));
  pending.set(uid, request);
  return request;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The current account's role. `role` is null while signed out or while it's being looked up (`resolving`).
 * If the lookup fails (offline on a first launch), the role from sign-up (or seller) stands in for this launch,
 * so the app still opens; the partner APIs check the real role on every call anyway.
 */
export function useRole() {
  const { session, loading } = useSession();
  const uid = session?.user.id ?? null;
  const metadataRole = session?.user.user_metadata?.role;
  const role = useSyncExternalStore(subscribe, () => cachedRole(uid), () => cachedRole(uid));

  useEffect(() => {
    if (!uid || role) return;
    let alive = true;
    void resolveRole(uid, metadataRole).then((found) => {
      if (alive && !found) rememberRole(uid, asRole(metadataRole) ?? "seller", { persist: false });
    });
    return () => {
      alive = false;
    };
  }, [uid, role, metadataRole]);

  return { role, uid, signedIn: Boolean(session), resolving: loading || (Boolean(uid) && !role) };
}

/** After logging in: remember the role the backend answered with, so the launch gate routes without asking again. */
export async function rememberSignedInRole(role: unknown) {
  const found = asRole(role);
  if (!found) return;
  const { data } = await supabase.auth.getSession();
  if (data.session) rememberRole(data.session.user.id, found);
}
