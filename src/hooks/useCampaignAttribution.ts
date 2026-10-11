"use client";

import { useEffect, useState } from "react";
import { channelFromRef, type OrderChannel } from "@shared/channels";

// Email campaign links arrive with ?sib_c=<recipient token>. Remember it per store so a purchase
// later in the visit (or within the attribution window) is credited to that email.
const PARAM = "sib_c";
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function storageKey(storeSlug: string) {
  return `shopinbos:campaign:${storeSlug}`;
}

function channelKey(storeSlug: string) {
  return `shopinbos:channel:${storeSlug}`;
}

/** The channel (WhatsApp, Instagram…) that first brought this visitor, if a link said so, within 7 days. */
export function readOrderChannel(storeSlug: string): OrderChannel | null {
  try {
    const stored = JSON.parse(localStorage.getItem(channelKey(storeSlug)) ?? "null") as { channel?: string; at?: number } | null;
    return stored?.at && Date.now() - stored.at < WINDOW_MS ? channelFromRef(stored.channel) : null;
  } catch {
    return null;
  }
}

export function useCampaignAttribution(storeSlug: string) {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (!storeSlug) return;
    try {
      const params = new URLSearchParams(window.location.search);
      const channel = channelFromRef(params.get("ref") ?? params.get("utm_source"));
      if (channel) localStorage.setItem(channelKey(storeSlug), JSON.stringify({ channel, at: Date.now() }));
    } catch {
      // Best effort, like the campaign token below.
    }
    try {
      const fromUrl = new URLSearchParams(window.location.search).get(PARAM);
      if (fromUrl && /^[\w-]{8,64}$/.test(fromUrl)) {
        localStorage.setItem(storageKey(storeSlug), JSON.stringify({ token: fromUrl, at: Date.now() }));
        setToken(fromUrl);
        return;
      }
      const stored = JSON.parse(localStorage.getItem(storageKey(storeSlug)) ?? "null") as { token?: string; at?: number } | null;
      if (stored?.token && stored.at && Date.now() - stored.at < WINDOW_MS) setToken(stored.token);
    } catch {
      // Storage can be unavailable (private mode); attribution is best effort.
    }
  }, [storeSlug]);

  return token;
}
