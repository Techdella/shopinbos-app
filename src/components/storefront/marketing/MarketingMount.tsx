"use client";

import { useCallback, useEffect, useState } from "react";
import { popupAllowed, type FormDesign, type FormField, type PopupConfig, type PopupRewardSummary } from "@/lib/marketing/forms";
import type { SignupColors, SignupResult } from "./SignupForm";
import { PopupView } from "./PopupView";

// Storefront mount point for the seller's marketing pop-ups (Marketing > Forms and pop-ups).
// Loads the live pop-ups, waits for each one's trigger (delay, exit intent, scroll depth), respects the
// page/device/frequency rules and shows one at a time, drawn by PopupView (the same renderer the editor previews).

interface Popup {
  id: string;
  fields: FormField[];
  design: FormDesign;
  config: Omit<PopupConfig, "reward"> & { reward: PopupRewardSummary | null };
}

const shownKey = (id: string) => `sib-popup:${id}:shown`;

function readNumber(key: string) {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function subscribed(slug: string) {
  try {
    return localStorage.getItem(`sib-subscribed:${slug}`) === "1";
  } catch {
    return false;
  }
}

function sessionShown(id: string) {
  try {
    return sessionStorage.getItem(shownKey(id)) === "1";
  } catch {
    return false;
  }
}

function markShown(id: string) {
  try {
    localStorage.setItem(shownKey(id), String(Date.now()));
    sessionStorage.setItem(shownKey(id), "1");
  } catch {}
}

export function MarketingMount({ storeSlug, colors, currency = "NGN" }: { storeSlug: string; colors: SignupColors; currency?: string }) {
  const [popup, setPopup] = useState<Popup | null>(null);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<SignupResult | null>(null);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!storeSlug) return;
    let cancelled = false;
    const cleanups: Array<() => void> = [];
    void fetch(`/api/public/store/${encodeURIComponent(storeSlug)}/marketing`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled) return;
        const popups: Popup[] = json?.data?.popups ?? [];
        const isMobile = window.matchMedia("(max-width: 767px)").matches;
        const candidate = popups.find((item) =>
          popupAllowed(item.config, { path: window.location.pathname, isMobile, lastShownAt: readNumber(shownKey(item.id)), shownThisSession: sessionShown(item.id), subscribed: subscribed(storeSlug) }),
        );
        if (!candidate) return;
        setPopup(candidate);
        let fired = false;
        const show = () => {
          if (fired || cancelled) return;
          fired = true;
          cleanups.forEach((cleanup) => cleanup());
          markShown(candidate.id);
          setOpen(true);
          void fetch(`/api/public/store/${encodeURIComponent(storeSlug)}/marketing`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ formId: candidate.id, event: "view" }),
            keepalive: true,
          }).catch(() => null);
        };
        const { trigger, delaySeconds, scrollPercent } = candidate.config;
        // Phones have no mouse to leave the window with; exit intent falls back to scrolling halfway.
        const effective = trigger === "exit_intent" && isMobile ? "scroll" : trigger;
        if (effective === "immediate") show();
        else if (effective === "delay") {
          const timer = window.setTimeout(show, delaySeconds * 1000);
          cleanups.push(() => window.clearTimeout(timer));
        } else if (effective === "exit_intent") {
          const onLeave = (event: MouseEvent) => {
            if (!event.relatedTarget && event.clientY <= 0) show();
          };
          document.addEventListener("mouseout", onLeave);
          cleanups.push(() => document.removeEventListener("mouseout", onLeave));
        } else {
          const target = trigger === "exit_intent" ? 50 : scrollPercent;
          const onScroll = () => {
            const max = document.documentElement.scrollHeight - window.innerHeight;
            if (max <= 0 || (window.scrollY / max) * 100 >= target) show();
          };
          window.addEventListener("scroll", onScroll, { passive: true });
          cleanups.push(() => window.removeEventListener("scroll", onScroll));
        }
      })
      .catch(() => null);
    return () => {
      cancelled = true;
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [storeSlug]);

  if (!popup || !open) return null;
  return (
    <PopupView
      popup={{ id: popup.id, fields: popup.fields, design: popup.design, layout: popup.config.layout, reward: popup.config.reward, afterSubmit: popup.config.afterSubmit, redirectUrl: popup.config.redirectUrl }}
      storeSlug={storeSlug}
      colors={colors}
      currency={currency}
      result={result}
      onResult={setResult}
      onClose={close}
    />
  );
}
