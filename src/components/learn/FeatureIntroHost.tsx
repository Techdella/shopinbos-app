"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { introByKey, introForPath, type FeatureIntro as Intro } from "@shared/feature-intros";
import { introsSeenLocally, usePreferences } from "@/components/shell/useShellCounts";
import { FeatureIntro } from "./FeatureIntro";
import { OPEN_INTRO_EVENT, openFeatureIntro } from "./Term";
import { useT } from "@/components/i18n/I18nProvider";

// Mounted once in the app shell (AppFrame). Picks the 60-second intro for the current page and opens it by itself
// the first time a person visits one of its pages, once per person per intro:
//  - only after the server's copy of their preferences has loaded (`confirmed`), so a new device or cleared
//    storage can't replay intros they've seen; this device's list is checked too, as a fallback;
//  - never on top of the guided tour or another open dialog (it waits and tries again);
//  - marked seen the moment it opens (closing the tab mid-way doesn't bring it back).
// "Learn · 60s" (LearnPill), a Term's "Watch 60-sec intro" and the sidebar tips open any intro again any time.

/** The portal home pages where the guided tour (GuidedTour.tsx) may start; intros never auto-open there first. */
const TOUR_HOMES = ["/home/start", "/home", "/supplier/dashboard", "/logistics/dashboard", "/admin/dashboard"];
const AUTO_DELAY_MS = 1400;
const RETRY_MS = 2500;
const MAX_RETRIES = 8;

// One automatic open per intro per page load, even if the host remounts while the "seen" save is in flight.
const autoOpened = new Set<string>();

function somethingElseOpen() {
  if (document.getElementById("tour-title")) return true;
  return [...document.querySelectorAll('[aria-modal="true"]')].some((node) => !node.closest("[data-feature-intro]"));
}

export function FeatureIntroHost({ role }: { role: string }) {
  const pathname = usePathname();
  const { prefs, confirmed, markIntroSeen } = usePreferences();
  const markRef = useRef(markIntroSeen);
  markRef.current = markIntroSeen;
  const [open, setOpen] = useState<Intro | null>(null);
  const current = introForPath(pathname, role);

  // Replays: "Learn · 60s", Term tooltips and sidebar tips.
  useEffect(() => {
    const onOpen = (event: Event) => {
      const key = (event as CustomEvent<{ key?: string }>).detail?.key;
      const intro = key ? introByKey(key) : introForPath(window.location.pathname, role);
      if (intro) setOpen(intro);
    };
    window.addEventListener(OPEN_INTRO_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_INTRO_EVENT, onOpen);
  }, [role]);

  // First visit.
  const key = current?.key ?? null;
  const tourPending = prefs?.tour !== "done" && TOUR_HOMES.includes(pathname);
  const seen = Boolean(key && (prefs?.introsSeen?.includes(key) || autoOpened.has(key)));
  useEffect(() => {
    if (!key || !confirmed || !prefs || seen || tourPending || open) return;
    if (introsSeenLocally().includes(key)) return;
    let tries = 0;
    let timer = window.setTimeout(function attempt() {
      if (somethingElseOpen()) {
        if (++tries < MAX_RETRIES) timer = window.setTimeout(attempt, RETRY_MS);
        return;
      }
      const intro = introByKey(key);
      if (!intro || autoOpened.has(key)) return;
      autoOpened.add(key);
      setOpen(intro);
      void markRef.current(key);
    }, AUTO_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [key, confirmed, prefs, seen, tourPending, open]);

  // Leaving the page closes the intro (its CTA navigates).
  useEffect(() => {
    setOpen(null);
  }, [pathname]);

  if (!open) return null;
  return (
    <FeatureIntro
      key={open.key}
      intro={open}
      role={role}
      onClose={() => {
        void markRef.current(open.key);
        setOpen(null);
      }}
    />
  );
}

/** "Learn · 60s" next to the page title: replays the intro for this page. Hidden where there's none. */
export function LearnPill({ role, className = "", variant = "pill" }: { role: string; className?: string; variant?: "pill" | "inline" }) {
  const pathname = usePathname();
  const intro = introForPath(pathname, role);
  const t = useT("learn");
  const tIntros = useT("intros");
  if (!intro) return null;
  const title = t("pillTitle", { title: tIntros.dynamic(`${intro.key}.title`, intro.title) });
  if (variant === "inline") {
    // Sits under the page title, where people look first: a big, easy target with what it teaches.
    return (
      <button
        type="button"
        onClick={() => openFeatureIntro(intro.key)}
        data-learn-pill={intro.key}
        className={`group inline-flex min-h-[48px] max-w-full items-center gap-3 rounded-full border border-[#0E2A38]/10 bg-[#0E2A38] py-1.5 pl-1.5 pr-5 text-left text-[#F4F1EA] shadow-[0_10px_30px_-18px_rgba(14,42,56,0.8)] transition hover:-translate-y-px hover:bg-[#143A4C] ${className}`}
      >
        <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#73D8C8] text-[#0E2A38]">
          <span aria-hidden className="absolute inset-0 rounded-full bg-[#73D8C8] opacity-60 motion-safe:animate-ping group-hover:animate-none" />
          <svg aria-hidden className="relative" width="12" height="12" viewBox="0 0 10 10"><path d="M2.2 1 L9 5 L2.2 9 Z" fill="currentColor" /></svg>
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block text-[14px] font-extrabold">{t("watchIntro")}</span>
          <span className="block truncate text-[12.5px] text-[#F4F1EA]/70">{title}</span>
        </span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => openFeatureIntro(intro.key)}
      data-learn-pill={intro.key}
      title={title}
      className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[#0E2A38]/10 bg-[#0E2A38] pl-1.5 pr-4 text-[13.5px] font-extrabold text-[#F4F1EA] transition hover:bg-[#143A4C] ${className}`}
    >
      <span className="grid h-8 w-8 place-items-center rounded-full bg-[#73D8C8] text-[#0E2A38]">
        <svg aria-hidden width="11" height="11" viewBox="0 0 10 10"><path d="M2.2 1 L9 5 L2.2 9 Z" fill="currentColor" /></svg>
      </span>
      {t("pill")}
      <span className="font-mono text-[11px] font-medium tracking-[0.08em] text-[#73D8C8]">60s</span>
    </button>
  );
}
