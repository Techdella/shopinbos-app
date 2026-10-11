"use client";

import { useEffect, useState } from "react";
import { channelFromRef, type LinkChannel } from "@shared/channels";
import { AFFILIATE_WINDOW_DAYS, cleanAffiliateCode } from "@shared/affiliates";

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

// Creator links carry ?aff=<code> (credited for 30 days, last link wins); ad links carry ?ad=<code> (7 days).
const LINK_CODES = { aff: AFFILIATE_WINDOW_DAYS * 24 * 60 * 60 * 1000, ad: WINDOW_MS } as const;
type LinkCode = keyof typeof LINK_CODES;

function codeKey(kind: LinkCode, storeSlug: string) {
  return `shopinbos:${kind}:${storeSlug}`;
}

function rememberLinkCodes(storeSlug: string, params: URLSearchParams) {
  for (const kind of Object.keys(LINK_CODES) as LinkCode[]) {
    const code = cleanAffiliateCode(params.get(kind));
    if (code) localStorage.setItem(codeKey(kind, storeSlug), JSON.stringify({ code, at: Date.now() }));
  }
}

/** The creator (?aff=) or ad (?ad=) code that brought this visitor, if still within its window. */
export function readLinkCode(kind: LinkCode, storeSlug: string): string | null {
  try {
    const stored = JSON.parse(localStorage.getItem(codeKey(kind, storeSlug)) ?? "null") as { code?: string; at?: number } | null;
    return stored?.at && Date.now() - stored.at < LINK_CODES[kind] ? cleanAffiliateCode(stored.code) : null;
  } catch {
    return null;
  }
}

/** The channel (WhatsApp, Instagram…) that first brought this visitor, if a link said so, within 7 days. */
export function readOrderChannel(storeSlug: string): LinkChannel | null {
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
      rememberLinkCodes(storeSlug, params);
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
