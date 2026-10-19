"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { isAppHost, isTrackedPath } from "@/lib/platform-analytics/config";

// Shopinbos's own product analytics in the browser: Google Analytics 4, Mixpanel and PostHog, each only when its
// NEXT_PUBLIC_* key is set. Runs on the app and portal pages on the app's own host, never on a seller's storefront
// (their shoppers get the seller's own tags, behind the store's consent banner). Signed-in people are identified by
// their Supabase user id with their role, the same id the server events use (src/lib/platform-analytics/track.server.ts).
// No names, emails or phone numbers are sent.

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() || "";
const MIXPANEL_TOKEN = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN?.trim() || "";
const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim() || "";
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || "https://us.i.posthog.com";
const MIXPANEL_EU = (process.env.NEXT_PUBLIC_MIXPANEL_REGION ?? "").trim().toLowerCase() === "eu";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.shopinbos.com";

type Gtag = (...args: unknown[]) => void;
type Clients = { gtag?: Gtag; mixpanel?: typeof import("mixpanel-browser").default; posthog?: typeof import("posthog-js").default };

function loadGa(): Gtag {
  const w = window as unknown as { dataLayer: unknown[]; gtag?: Gtag };
  if (!w.gtag) {
    w.dataLayer = w.dataLayer || [];
    // gtag must push the arguments object itself.
    // eslint-disable-next-line prefer-rest-params
    w.gtag = function gtag() { w.dataLayer.push(arguments); };
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
    document.head.appendChild(script);
    w.gtag("js", new Date());
    // Page views are sent by hand on each route change (below), so the first one isn't counted twice.
    w.gtag("config", GA_ID, { send_page_view: false });
  }
  return w.gtag;
}

async function start(): Promise<Clients> {
  const clients: Clients = {};
  if (GA_ID) clients.gtag = loadGa();
  if (MIXPANEL_TOKEN) {
    const mixpanel = (await import("mixpanel-browser")).default;
    mixpanel.init(MIXPANEL_TOKEN, { persistence: "localStorage", track_pageview: false, ...(MIXPANEL_EU ? { api_host: "https://api-eu.mixpanel.com" } : {}) });
    clients.mixpanel = mixpanel;
  }
  if (POSTHOG_KEY) {
    const posthog = (await import("posthog-js")).default;
    posthog.init(POSTHOG_KEY, { api_host: POSTHOG_HOST, person_profiles: "identified_only", capture_pageview: false, capture_pageleave: true });
    clients.posthog = posthog;
  }
  return clients;
}

export function ProductAnalytics() {
  const pathname = usePathname() ?? "/";
  const clients = useRef<Promise<Clients> | null>(null);
  const identified = useRef<string | null>(null);

  useEffect(() => {
    if (!GA_ID && !MIXPANEL_TOKEN && !POSTHOG_KEY) return;
    if (!isAppHost(window.location.hostname, APP_URL) || !isTrackedPath(pathname)) return;
    clients.current ??= start().catch(() => ({}));
    let live = true;
    void clients.current.then(async (c) => {
      if (!live) return;
      // Who is signed in (if anyone): identify once per person.
      const supabase = getSupabaseBrowserClient();
      const session = supabase ? (await supabase.auth.getSession().catch(() => null))?.data.session : null;
      const person = session?.user;
      if (person && identified.current !== person.id) {
        identified.current = person.id;
        const role = String(person.user_metadata?.role ?? "seller");
        c.gtag?.("set", { user_id: person.id, user_properties: { role } });
        c.mixpanel?.identify(person.id);
        c.mixpanel?.people.set({ role });
        c.posthog?.identify(person.id, { role });
      } else if (!person && identified.current) {
        identified.current = null;
        c.mixpanel?.reset();
        c.posthog?.reset();
      }
      const url = window.location.href;
      c.gtag?.("event", "page_view", { page_location: url, page_path: pathname });
      c.mixpanel?.track_pageview();
      c.posthog?.capture("$pageview", { $current_url: url });
    });
    return () => {
      live = false;
    };
  }, [pathname]);

  return null;
}
