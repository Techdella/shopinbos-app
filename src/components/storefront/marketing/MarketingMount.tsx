"use client";

import { useCallback, useEffect, useState } from "react";
import { cartCount, cartSubtotal, sanitizeLines } from "@shared/cart-checkout";
import { popupAllowed, type FormDesign, type FormField, type PopupConfig, type PopupRewardSummary } from "@/lib/marketing/forms";
import type { SignupColors, SignupResult } from "./SignupForm";
import type { PopupPrizes } from "./PopupGame";
import { popupMemory } from "@/components/storefront/gamification/client";
import { PopupView } from "./PopupView";
import { campaignPreviewQuery, trackCampaignEvent } from "@/components/storefront/campaign/tracking";

// Storefront mount point for the seller's marketing pop-ups (Marketing > Forms and pop-ups).
// Loads the live pop-ups, waits for each one's trigger (delay, exit intent, scroll depth), respects the
// page/device/frequency rules and shows one at a time, drawn by PopupView (the same renderer the editor previews).
// Cart reminders only show with something in the bag; countdown sales stop once they end; people already on the
// list aren't asked to join again (sales, games and reminders still show).

interface Popup {
  id: string;
  fields: FormField[];
  design: FormDesign;
  config: Omit<PopupConfig, "reward" | "leadMagnet"> & { reward: PopupRewardSummary | null; leadMagnet: { name: string } | null };
  /** Game pop-ups: the store's prizes (labels and odds only). */
  prizes?: PopupPrizes | null;
}

/** The bag on this device (the same storage useCart keeps), read once when the pop-up is chosen. */
function readBag(slug: string) {
  try {
    const lines = sanitizeLines(JSON.parse(localStorage.getItem(`cart:${slug}`) ?? "[]"));
    return { count: cartCount(lines), subtotal: cartSubtotal(lines) };
  } catch {
    return { count: 0, subtotal: 0 };
  }
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

export function MarketingMount({ storeSlug, colors, currency = "NGN", storeBasePath = "" }: { storeSlug: string; colors: SignupColors; currency?: string; storeBasePath?: string }) {
  const [popup, setPopup] = useState<Popup | null>(null);
  const [bagTotal, setBagTotal] = useState(0);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<SignupResult | null>(null);
  const campaignId = popup?.config.campaignId ?? null;
  const close = useCallback(() => {
    setOpen(false);
    if (campaignId) trackCampaignEvent(storeSlug, { campaignId, event: "popup_closed" });
  }, [campaignId, storeSlug]);
  const converted = useCallback(() => {
    if (campaignId) trackCampaignEvent(storeSlug, { campaignId, event: "popup_converted" });
  }, [campaignId, storeSlug]);

  useEffect(() => {
    if (!storeSlug) return;
    let cancelled = false;
    const cleanups: Array<() => void> = [];
    // A seasonal campaign preview link also previews that campaign's pop-up.
    const preview = campaignPreviewQuery();
    void fetch(`/api/public/store/${encodeURIComponent(storeSlug)}/marketing${preview ? `?${preview}` : ""}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled) return;
        const popups: Popup[] = json?.data?.popups ?? [];
        const isMobile = window.matchMedia("(max-width: 767px)").matches;
        const bag = readBag(storeSlug);
        const candidate = popups.find((item) =>
          // A game pop-up someone already played on this device doesn't come back (the server caps plays too).
          !(item.config.kind === "game" && popupMemory(storeSlug, `popup-${item.id}`).played) &&
          popupAllowed(item.config, { path: window.location.pathname, isMobile, lastShownAt: readNumber(shownKey(item.id)), shownThisSession: sessionShown(item.id), subscribed: subscribed(storeSlug), cartCount: bag.count }),
        );
        if (!candidate) return;
        setPopup(candidate);
        setBagTotal(bag.subtotal);
        let fired = false;
        const show = () => {
          if (fired || cancelled) return;
          fired = true;
          cleanups.forEach((cleanup) => cleanup());
          markShown(candidate.id);
          setBagTotal(readBag(storeSlug).subtotal);
          setOpen(true);
          if (candidate.config.campaignId) trackCampaignEvent(storeSlug, { campaignId: candidate.config.campaignId, event: "popup_shown" });
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
  const config = popup.config;
  const kind = config.kind ?? "signup";
  return (
    <PopupView
      popup={{
        id: popup.id,
        fields: popup.fields,
        design: popup.design,
        layout: config.layout,
        reward: config.reward,
        afterSubmit: config.afterSubmit,
        redirectUrl: config.redirectUrl,
        kind,
        game: kind === "game" && popup.prizes ? { game: config.game, collect: config.collect, playEveryDays: config.playEveryDays, prizes: popup.prizes } : null,
        leadMagnetName: config.leadMagnet?.name ?? null,
        endsAt: config.endsAt,
        freeDeliveryOver: config.freeDeliveryOver,
      }}
      storeSlug={storeSlug}
      colors={colors}
      currency={currency}
      basePath={storeBasePath}
      cartSubtotal={bagTotal}
      result={result}
      onResult={(next) => {
        setResult(next);
        if (next) converted();
      }}
      onClose={close}
      onCta={() => {
        converted();
        void fetch(`/api/public/store/${encodeURIComponent(storeSlug)}/marketing`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ formId: popup.id, event: "click" }),
          keepalive: true,
        }).catch(() => null);
      }}
    />
  );
}
