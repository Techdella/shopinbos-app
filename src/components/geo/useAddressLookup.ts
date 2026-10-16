"use client";

// Address entry helpers for any form: Google suggestions as you type, "use my location", and NIPOST postcode
// checks, all through /api/public/geo/* (keys stay on the server). Each one quietly does nothing when its service
// isn't configured, so a form always works as plain text fields.

import { useCallback, useEffect, useRef, useState } from "react";
import type { GeoAddress, GeoStatus, GeoSuggestion } from "@/lib/geo/types";

let statusPromise: Promise<GeoStatus> | null = null;

/** Which helpers are on (fetched once per page). */
export function useGeoStatus() {
  const [status, setStatus] = useState<GeoStatus>({ maps: false, nipost: false });
  useEffect(() => {
    statusPromise ??= fetch("/api/public/geo/status")
      .then((response) => response.json())
      .then((json: { data?: GeoStatus }) => json.data ?? { maps: false, nipost: false })
      .catch(() => ({ maps: false, nipost: false }));
    let live = true;
    void statusPromise.then((value) => live && setStatus(value));
    return () => {
      live = false;
    };
  }, []);
  return status;
}

function newSessionToken() {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function getData<T>(url: string, signal?: AbortSignal): Promise<{ data: T | null; error: string | null }> {
  try {
    const response = await fetch(url, { signal });
    const json = (await response.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
    if (!response.ok || !json?.data) return { data: null, error: json?.error?.message ?? "We couldn't look that up. Type it in instead." };
    return { data: json.data, error: null };
  } catch (error) {
    if ((error as Error)?.name === "AbortError") return { data: null, error: null };
    return { data: null, error: "You seem to be offline. Type the address in instead." };
  }
}

/**
 * Suggestions for what's typed (debounced), and `pick` to turn one into address parts. One Google billing session
 * runs from the first keystroke to the pick.
 */
export function useAddressSuggestions(query: string, opts: { country?: string; enabled: boolean }) {
  const [suggestions, setSuggestions] = useState<GeoSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const session = useRef<string>("");
  // A pick fills the field with the street; that new text must not open the list again.
  const skipNext = useRef<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (!opts.enabled || q.length < 3 || skipNext.current === q) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      session.current ||= newSessionToken();
      setLoading(true);
      const params = new URLSearchParams({ q, session: session.current, country: opts.country || "Nigeria" });
      const { data } = await getData<{ suggestions: GeoSuggestion[] }>(`/api/public/geo/suggest?${params}`, controller.signal);
      if (!controller.signal.aborted) {
        setSuggestions(data?.suggestions ?? []);
        setLoading(false);
      }
    }, 300);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, opts.country, opts.enabled]);

  const pick = useCallback(async (suggestion: GeoSuggestion) => {
    setSuggestions([]);
    const params = new URLSearchParams({ id: suggestion.placeId });
    if (session.current) params.set("session", session.current);
    session.current = "";
    const result = await getData<GeoAddress>(`/api/public/geo/place?${params}`);
    if (result.data) skipNext.current = result.data.street.trim();
    return result;
  }, []);

  const close = useCallback(() => setSuggestions([]), []);

  return { suggestions, loading, pick, close };
}

/** The phone's location as an address ("use my location"). Asks for permission the first time. */
export function useMyLocation() {
  const [busy, setBusy] = useState(false);
  const supported = typeof navigator !== "undefined" && "geolocation" in navigator;

  const locate = useCallback(async (): Promise<{ data: GeoAddress | null; error: string | null }> => {
    if (!supported) return { data: null, error: "This browser can't share your location. Type the address in instead." };
    setBusy(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 }),
      );
      const params = new URLSearchParams({ lat: String(position.coords.latitude), lng: String(position.coords.longitude) });
      return await getData<GeoAddress>(`/api/public/geo/reverse?${params}`);
    } catch (error) {
      const denied = (error as GeolocationPositionError)?.code === 1;
      return { data: null, error: denied ? "Location is blocked for this site. Allow it in your browser settings, or type the address." : "We couldn't get your location. Type the address in instead." };
    } finally {
      setBusy(false);
    }
  }, [supported]);

  return { locate, busy, supported };
}

/** NIPOST's answer for a typed postcode. */
export function lookupPostcode(code: string) {
  return getData<GeoAddress>(`/api/public/geo/postcode?${new URLSearchParams({ code })}`);
}

/** Our own map-preview image (Maps Static API through /api/public/geo/map). */
export function mapImageUrl(point: { lat: number; lng: number }, size: { w?: number; h?: number; z?: number } = {}) {
  const params = new URLSearchParams({ lat: point.lat.toFixed(5), lng: point.lng.toFixed(5), w: String(size.w ?? 600), h: String(size.h ?? 220), z: String(size.z ?? 16) });
  return `/api/public/geo/map?${params}`;
}
