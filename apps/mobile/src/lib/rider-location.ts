import "expo-sqlite/localStorage/install";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking } from "react-native";
import * as Location from "expo-location";
import { shouldReportLocation } from "@shared/delivery-geo";
import { sendRiderLocations, type RiderLocationPoint } from "./rider";

// Riders app location reporting (spec 9.9). While the rider is online or on a delivery, and only while the app is
// open (foreground only, no background permission), we send the phone's location about once a minute, or sooner
// after moving 100 m (shared/delivery-geo shouldReportLocation). Readings wait in a small queue on the phone when
// there's no signal and go together next time. Saying no is fine: the app works the same, the company just can't
// see who is closest.
//
// Permission: our own plain explanation first ("Shopinbos uses your location only while you're online…"), then
// the phone's question. "Not now" is remembered for a day so we don't keep asking.

const QUEUE_KEY = "shopinbos.rider.locationQueue";
const ASKED_KEY = "shopinbos.rider.locationNotNow";
const QUEUE_MAX = 50;
const TICK_MS = 60_000;
const NOT_NOW_MS = 24 * 60 * 60 * 1000;

export type LocationState = "idle" | "ask" | "on" | "denied" | "unavailable";

function readQueue(): RiderLocationPoint[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? (parsed as RiderLocationPoint[]).slice(-QUEUE_MAX) : [];
  } catch {
    return [];
  }
}

function writeQueue(points: RiderLocationPoint[]) {
  try {
    if (points.length) localStorage.setItem(QUEUE_KEY, JSON.stringify(points.slice(-QUEUE_MAX)));
    else localStorage.removeItem(QUEUE_KEY);
  } catch {
    // Storage unavailable: the points are dropped; the next reading still goes.
  }
}

function saidNotNowRecently() {
  try {
    const at = Number(localStorage.getItem(ASKED_KEY) ?? 0);
    return Number.isFinite(at) && Date.now() - at < NOT_NOW_MS;
  } catch {
    return false;
  }
}

/**
 * Reports the rider's location while `active` (online or carrying a delivery). Returns the state for the screen
 * (show the explanation when "ask"), plus allow() / notNow() / openSettings() for its buttons.
 */
export function useRiderLocation(active: boolean) {
  const [state, setState] = useState<LocationState>("idle");
  const lastSent = useRef<{ lat: number; lng: number; at: number } | null>(null);
  const sending = useRef(false);
  const stopped = useRef(false);

  const flush = useCallback(async () => {
    if (sending.current) return;
    const queue = readQueue();
    if (!queue.length) return;
    sending.current = true;
    try {
      const result = await sendRiderLocations(queue);
      // Only drop what we sent; readings taken meanwhile stay queued.
      writeQueue(readQueue().filter((point) => !queue.some((sent) => sent.at === point.at)));
      if (!result.tracking) stopped.current = true;
    } catch {
      // No signal or the server is busy: keep the queue for next time.
    } finally {
      sending.current = false;
    }
  }, []);

  const take = useCallback(
    (reading: Location.LocationObject | null) => {
      if (!reading || stopped.current) return;
      const next = { lat: reading.coords.latitude, lng: reading.coords.longitude, at: reading.timestamp || Date.now() };
      if (!shouldReportLocation(lastSent.current, next)) return;
      lastSent.current = next;
      writeQueue([...readQueue(), { ...next, accuracy: reading.coords.accuracy ?? null }]);
      void flush();
    },
    [flush],
  );

  // Work out whether we can track: permission already given → on; never asked → show our explanation.
  useEffect(() => {
    if (!active) return;
    stopped.current = false;
    let cancelled = false;
    void (async () => {
      try {
        const enabled = await Location.hasServicesEnabledAsync().catch(() => true);
        const permission = await Location.getForegroundPermissionsAsync();
        if (cancelled) return;
        if (permission.granted) setState(enabled ? "on" : "unavailable");
        else if (permission.canAskAgain && !saidNotNowRecently()) setState("ask");
        else setState("denied");
      } catch {
        if (!cancelled) setState("unavailable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active]);

  // While on: watch for 100 m moves, and take a reading every minute regardless.
  useEffect(() => {
    if (!active || state !== "on") return;
    let watch: Location.LocationSubscription | null = null;
    let cancelled = false;
    void Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, timeInterval: TICK_MS, distanceInterval: 100 }, take)
      .then((subscription) => {
        if (cancelled) subscription.remove();
        else watch = subscription;
      })
      .catch(() => setState("unavailable"));
    const tick = setInterval(() => {
      if (AppState.currentState !== "active") return;
      void Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).then(take).catch(() => undefined);
    }, TICK_MS);
    void Location.getLastKnownPositionAsync().then(take).catch(() => undefined);
    const appState = AppState.addEventListener("change", (next) => {
      if (next === "active") void flush();
    });
    return () => {
      cancelled = true;
      watch?.remove();
      clearInterval(tick);
      appState.remove();
    };
  }, [active, state, take, flush]);

  const allow = useCallback(async () => {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      setState(permission.granted ? "on" : "denied");
    } catch {
      setState("unavailable");
    }
  }, []);

  const notNow = useCallback(() => {
    try {
      localStorage.setItem(ASKED_KEY, String(Date.now()));
    } catch {
      // Storage unavailable: we may ask again next time the app opens.
    }
    setState("denied");
  }, []);

  const openSettings = useCallback(() => void Linking.openSettings().catch(() => undefined), []);

  // Not online and no delivery: nothing to show and nothing reported, whatever was decided before.
  return { state: active ? state : ("idle" as LocationState), allow, notNow, openSettings };
}
