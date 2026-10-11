"use client";

import { useEffect, useRef, useState } from "react";
import { popupAllowed, type FormDesign, type FormField, type PopupConfig } from "@/lib/marketing/forms";
import { SignupForm, SignupSuccess, type SignupColors, type SignupResult } from "./SignupForm";

// Storefront mount point for the seller's marketing pop-ups (Marketing > Forms and pop-ups).
// Loads the live pop-ups, waits for each one's trigger (delay, exit intent, scroll depth), respects the
// page/device/frequency rules and shows one at a time as a centred window, a corner flyout or a bottom bar.

interface Popup {
  id: string;
  fields: FormField[];
  design: FormDesign;
  config: PopupConfig;
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

export function MarketingMount({ storeSlug, colors }: { storeSlug: string; colors: SignupColors }) {
  const [popup, setPopup] = useState<Popup | null>(null);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<SignupResult | null>(null);

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
  return <PopupView popup={popup} storeSlug={storeSlug} colors={colors} result={result} onResult={setResult} onClose={() => setOpen(false)} />;
}

function PopupView({
  popup,
  storeSlug,
  colors,
  result,
  onResult,
  onClose,
}: {
  popup: Popup;
  storeSlug: string;
  colors: SignupColors;
  result: SignupResult | null;
  onResult: (result: SignupResult) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const { layout, reward } = popup.config;
  const titleId = `sib-popup-title-${popup.id}`;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    if (layout === "modal") dialogRef.current?.querySelector<HTMLElement>("input, button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (layout === "modal") previous?.focus?.();
    };
  }, [layout, onClose]);

  function done(next: SignupResult) {
    onResult(next);
    if (popup.config.afterSubmit === "redirect" && popup.config.redirectUrl && !next.code) window.location.assign(popup.config.redirectUrl);
  }

  const rewardLine = reward ? (reward.type === "percentage" ? `Get ${reward.value}% off your first order.` : `Get ₦${reward.value.toLocaleString("en-NG")} off your first order.`) : null;
  const body = (
    <>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full text-[22px] leading-none opacity-70 hover:opacity-100"
        style={{ color: colors.ink }}
      >
        ×
      </button>
      {popup.design.imageUrl && layout !== "bar" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={popup.design.imageUrl} alt="" className="mb-4 h-40 w-full rounded-2xl object-cover" />
      ) : null}
      <h2 id={titleId} className="m-0 pr-10 text-[22px] font-bold leading-tight">{popup.design.headline}</h2>
      {!result ? (
        <>
          <p className="mb-4 mt-2 text-[14.5px] leading-[1.5] opacity-80">
            {popup.design.body}
            {rewardLine ? <strong className="block pt-1 opacity-100">{rewardLine}</strong> : null}
          </p>
          <SignupForm storeSlug={storeSlug} formId={popup.id} fields={popup.fields} design={popup.design} colors={colors} onDone={done} compact={layout !== "modal"} />
        </>
      ) : (
        <div className="mt-3">
          <SignupSuccess result={result} colors={colors} />
        </div>
      )}
    </>
  );

  const panelStyle = { background: colors.paper, color: colors.ink };
  if (layout === "bar") {
    return (
      <div role="region" aria-labelledby={titleId} className="fixed inset-x-0 bottom-0 z-[60] max-h-[85vh] overflow-y-auto border-t px-4 pb-6 pt-5 shadow-[0_-12px_40px_rgba(0,0,0,0.18)] sm:px-6" style={{ ...panelStyle, borderColor: `${colors.ink}22` }}>
        <div className="relative mx-auto max-w-[720px]">{body}</div>
      </div>
    );
  }
  if (layout === "flyout") {
    return (
      <div role="dialog" aria-labelledby={titleId} className="fixed bottom-4 right-4 z-[60] max-h-[85vh] w-[calc(100vw-32px)] max-w-[380px] overflow-y-auto rounded-3xl p-5 shadow-[0_20px_60px_rgba(0,0,0,0.25)]" style={panelStyle}>
        <div className="relative">{body}</div>
      </div>
    );
  }
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative max-h-[90vh] w-full max-w-[440px] overflow-y-auto rounded-3xl p-6 shadow-[0_30px_80px_rgba(0,0,0,0.3)]" style={panelStyle}>
        {body}
      </div>
    </div>
  );
}
