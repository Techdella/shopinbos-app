"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { isAppHost, isTrackedPath } from "@/lib/platform-analytics/config";
import { CONSENT_EVENT, CONSENT_OPEN_EVENT, readConsent, saveConsent, type ConsentChoice } from "@/lib/analytics/consent";
import { startReplay, stopReplay } from "@/lib/analytics/replay";
import { useT } from "@/components/i18n/I18nProvider";

// Shopinbos's own product analytics in the browser: Google Analytics 4, Mixpanel and PostHog, each only when its
// NEXT_PUBLIC_* key is set. Runs on the app and portal pages on the app's own host, never on a seller's storefront
// (their shoppers get the seller's own tags, behind the store's consent banner). Signed-in people are identified by
// their Supabase user id with their role, the same id the server events use (src/lib/platform-analytics/track.server.ts).
// No names, emails or phone numbers are sent. None of it (nor Sentry's session replay) starts until the person picks
// "Allow analytics" in the cookie banner below (src/lib/analytics/consent.ts); "Essential only" switches it all off.

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
    // Sentry is the one session replay (masked, src/lib/analytics/replay.ts); PostHog never records sessions.
    posthog.init(POSTHOG_KEY, { api_host: POSTHOG_HOST, person_profiles: "identified_only", capture_pageview: false, capture_pageleave: true, disable_session_recording: true, mask_all_text: true, mask_all_element_attributes: true });
    clients.posthog = posthog;
  }
  return clients;
}

const SENTRY_ON = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);

/** Turns everything off after "Essential only" (or a change of mind), without a reload. */
async function stopAll(clients: Promise<Clients> | null) {
  stopReplay();
  if (GA_ID) (window as unknown as Record<string, unknown>)[`ga-disable-${GA_ID}`] = true;
  const c = clients ? await clients.catch(() => ({}) as Clients) : null;
  c?.mixpanel?.opt_out_tracking();
  c?.posthog?.opt_out_capturing();
}

export function ProductAnalytics() {
  const pathname = usePathname() ?? "/";
  const clients = useRef<Promise<Clients> | null>(null);
  const identified = useRef<string | null>(null);
  // undefined until this browser's saved choice is read (after mount, so the server render matches).
  const [consent, setConsent] = useState<ConsentChoice | null | undefined>(undefined);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    setConsent(readConsent());
    const onChoice = (event: Event) => {
      const choice = (event as CustomEvent<ConsentChoice>).detail;
      setConsent(choice);
      setAsking(false);
      if (choice === "essential") void stopAll(clients.current);
    };
    const onOpen = () => setAsking(true);
    window.addEventListener(CONSENT_EVENT, onChoice);
    window.addEventListener(CONSENT_OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener(CONSENT_EVENT, onChoice);
      window.removeEventListener(CONSENT_OPEN_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (consent !== "analytics") return;
    if (!isAppHost(window.location.hostname, APP_URL) || !isTrackedPath(pathname)) return;
    if (!pathname.startsWith("/admin")) startReplay();
    if (!GA_ID && !MIXPANEL_TOKEN && !POSTHOG_KEY) return;
    if (GA_ID) (window as unknown as Record<string, unknown>)[`ga-disable-${GA_ID}`] = false;
    const fresh = !clients.current;
    clients.current ??= start().catch(() => ({}));
    if (!fresh) void clients.current.then((c) => { c.mixpanel?.opt_in_tracking(); c.posthog?.opt_in_capturing(); });
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
  }, [pathname, consent]);

  const somethingToAsk = Boolean(GA_ID || MIXPANEL_TOKEN || POSTHOG_KEY || SENTRY_ON);
  const onAppPage = consent !== undefined && typeof window !== "undefined" && isAppHost(window.location.hostname, APP_URL) && isTrackedPath(pathname);
  if (!somethingToAsk || !onAppPage || (consent !== null && !asking)) return null;
  return <ConsentBanner onChoose={saveConsent} />;
}

function ConsentBanner({ onChoose }: { onChoose: (choice: ConsentChoice) => void }) {
  const t = useT("common");
  return (
    <div role="region" aria-label={t("consent.title")} className="fixed inset-x-3 bottom-3 z-[1100] mx-auto max-w-[520px] rounded-[18px] border border-black/[0.08] bg-white p-4 font-app text-app-ink shadow-[0_20px_50px_-20px_rgba(22,20,31,0.45)] sm:inset-x-auto sm:left-4 sm:mx-0">
      <p className="m-0 text-[15px] font-extrabold">{t("consent.title")}</p>
      <p className="mb-0 mt-1.5 text-[13.5px] leading-[1.5] text-app-ink-soft">
        {t("consent.body")}{" "}
        <a href="https://shopinbos.com/privacy" target="_blank" rel="noreferrer" className="font-bold underline">{t("consent.policy")}</a>
      </p>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => onChoose("essential")} className="min-h-[40px] rounded-full border border-black/[0.12] bg-white px-4 text-[13.5px] font-bold">{t("consent.essential")}</button>
        <button type="button" onClick={() => onChoose("analytics")} className="min-h-[40px] rounded-full bg-app-ink px-4 text-[13.5px] font-bold text-white">{t("consent.allow")}</button>
      </div>
    </div>
  );
}
