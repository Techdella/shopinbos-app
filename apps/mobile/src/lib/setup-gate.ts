import "expo-sqlite/localStorage/install";
import { useEffect, useState, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { usePathname } from "expo-router";
import { fetchSetupView, usePeggyCall, usePeggySaved } from "./peggy-call";
import { useRole } from "./role";
import { fetchSetup } from "./setup";
import { AFTER_PEGGY_OPENED_MS, roleSetupDone, sellerSetupDone, tipsMayShow, tourMayShow } from "./setup-gate-pure";

// Whether this person's setup is done, from the setup status the app already has: a seller's Start checklist
// (GET /api/app/setup) and a supplier's or delivery partner's setup steps (GET /api/app/setup-peggy). Checked when
// the app opens, as they move around (at most once a minute) and each time Peggy saves on a call; once done it's
// remembered on the phone and never asked again. Unknown (offline, an older server: 404 or 501) counts as not done,
// so tips stay away. Rules in setup-gate-pure.ts.

const RECHECK_MS = 60_000;
const doneKey = (uid: string) => `shopinbos.setup-done.${uid}`;

let current: { uid: string | null; done: boolean | null } = { uid: null, done: null };
let checkedAt = 0;
let inFlight = false;
const listeners = new Set<() => void>();

function set(next: typeof current) {
  current = next;
  listeners.forEach((listener) => listener());
}

function doneOnPhone(uid: string) {
  try {
    return localStorage.getItem(doneKey(uid)) === "1";
  } catch {
    return false;
  }
}

async function check(uid: string, role: string, force = false) {
  if (current.uid !== uid) {
    checkedAt = 0;
    set({ uid, done: doneOnPhone(uid) ? true : null });
  }
  if (current.done === true || inFlight) return;
  if (!force && Date.now() - checkedAt < RECHECK_MS) return;
  inFlight = true;
  checkedAt = Date.now();
  let done: boolean | null = null;
  try {
    done = role === "seller" ? sellerSetupDone(await fetchSetup()) : roleSetupDone(await fetchSetupView());
  } catch {
    done = null;
  } finally {
    inFlight = false;
  }
  if (current.uid !== uid) return;
  if (done) {
    try {
      localStorage.setItem(doneKey(uid), "1");
    } catch {
      // No storage: asked again next launch.
    }
  }
  set({ uid, done });
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const snapshot = () => current;

/** This person's setup is done (true), still going (false) or unknown (null). */
export function useSetupDone(): boolean | null {
  const { role, uid } = useRole();
  const pathname = usePathname();
  const state = useSyncExternalStore(subscribe, snapshot, snapshot);
  const known = Boolean(uid && (role === "seller" || role === "supplier" || role === "logistics_partner"));

  useEffect(() => {
    if (known) void check(uid!, role!);
  }, [known, uid, role, pathname]);
  useEffect(() => {
    if (!known) return;
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") void check(uid!, role!);
    });
    return () => sub.remove();
  }, [known, uid, role]);
  // Peggy saving a step on a call can finish setup.
  usePeggySaved(() => {
    if (known) void check(uid!, role!, true);
  });

  return known && state.uid === uid ? state.done : null;
}

/** Whether tips may show now (the floating Tips button): setup done, tips on, no Peggy call, not just after she opened a screen. */
export function useTipsAllowed(tipsOn: boolean) {
  const setupDone = useSetupDone();
  const call = usePeggyCall();
  const now = useNowUntil(call.openedAt === null ? null : call.openedAt + AFTER_PEGGY_OPENED_MS);
  return tipsMayShow({ setupDone, tipsOn, callPhase: call.phase, peggyOpenedAt: call.openedAt, now });
}

/** Whether the first-run Home tour may start now (same rules, without the tips switch). `known`: a fresher setup
 * answer the screen already has (Home's own Start checklist), used when it's there. */
export function useTourAllowed(known: boolean | null = null) {
  const gate = useSetupDone();
  const setupDone = known ?? gate;
  const call = usePeggyCall();
  const now = useNowUntil(call.openedAt === null ? null : call.openedAt + AFTER_PEGGY_OPENED_MS);
  return tourMayShow({ setupDone, callPhase: call.phase, peggyOpenedAt: call.openedAt, now });
}

/** A clock that moves on once when `until` passes (enough for "just after Peggy opened a screen": a newer opening
 * is always after the last tick, so it counts as just now until its own tick). */
function useNowUntil(until: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until === null) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, until - Date.now()) + 50);
    return () => clearTimeout(timer);
  }, [until]);
  return now;
}
