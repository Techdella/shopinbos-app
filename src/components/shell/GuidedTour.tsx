"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Mascot, PillButton } from "@/components/app-ui";
import type { Role } from "@/lib/nav";
import { usePreferences } from "./useShellCounts";

// First-visit walkthrough: a short spotlight tour of the menu and the main buttons, shown once on the
// portal's home page and replayable from "Customise your menu". Steps point at [data-tour] anchors; when an
// anchor isn't on screen (e.g. the menu is folded away on a phone) the step shows as a centred card.

interface Step {
  target?: string;
  title: string;
  body: string;
}

const STEPS: Record<Role, Step[]> = {
  seller: [
    { title: "Welcome to Shopinbos", body: "A one-minute tour of where everything lives. You can skip it and replay it from Settings any time." },
    { target: "start-checklist", title: "Start here", body: "A short list to get your shop selling. Each step ticks itself when it's done, and you can skip any of them." },
    { target: "start-helpers", title: "Peggy and Rex can help", body: "Ask Peggy to turn on payments or set delivery fees. Ask Rex to design your store, fix product photos or make a logo." },
    { target: "nav-start", title: "Come back any time", body: "Start here stays at the top of your menu until you finish or hide it." },
    { target: "nav-home", title: "Home", body: "Today's sales, what Peggy needs you to do, and your latest orders, all on one page." },
    { target: "add-product", title: "Add products", body: "Snap photos and Rex names and prices them, or add a product by hand." },
    { target: "nav-orders", title: "Orders", body: "Every order from your store, WhatsApp, Instagram and in person. Record a sale from here too." },
    { target: "nav-marketing", title: "More inside each item", body: "Items with a › open a menu when you hover them, like Marketing → Broadcasts and Automations." },
    { target: "ask-peggy", title: "Ask Peggy", body: "Your shop assistant. She can check sales, create a discount, update stock or draft a post, and tells you exactly what she changed." },
    { target: "search", title: "Search", body: "Press / to find any order, product, customer or page." },
    { target: "nav-settings", title: "Make it yours", body: "Settings → Customise your menu lets you switch off anything you don't use, so your menu stays short." },
  ],
  supplier: [
    { title: "Welcome to Shopinbos for suppliers", body: "A one-minute tour. You can skip it and replay it from Settings any time." },
    { target: "nav-dashboard", title: "Today", body: "Orders to ship, quote requests waiting and what you earned, at a glance." },
    { target: "nav-orders", title: "Orders", body: "Dropship and wholesale orders from shops selling your products." },
    { target: "nav-quote-requests", title: "Quote requests", body: "Shops asking for your price. Reply fast to win the order." },
    { target: "nav-products", title: "Products", body: "Your catalogue. Hover for Add product." },
    { target: "search", title: "Search", body: "Press / to find any order, product or page." },
    { target: "nav-settings", title: "Make it yours", body: "Settings → Customise your menu lets you switch off what you don't use." },
  ],
  logistics_partner: [
    { title: "Welcome to Shopinbos Partners", body: "A one-minute tour. You can skip it and replay it from Company → Customise your menu." },
    { target: "nav-dashboard", title: "Today", body: "New requests to accept, active jobs, deliveries and earnings for today." },
    { target: "nav-bookings", title: "Jobs", body: "Every delivery job. Hover for quote requests and your inbox." },
    { target: "nav-couriers", title: "Riders", body: "Add riders and keep track of who's active." },
    { target: "nav-cash", title: "Cash on delivery", body: "Cash your riders collect, and what's still to collect." },
    { target: "nav-coverage", title: "Coverage and rates", body: "Where you deliver and what you charge, so sellers see the right price." },
    { target: "nav-profile", title: "Make it yours", body: "Company → Customise your menu lets you switch off what you don't use." },
  ],
  admin: [
    { title: "Welcome to the admin console", body: "A quick tour of the review queues." },
    { target: "nav-dashboard", title: "Today", body: "What needs review: suppliers, delivery partners and products." },
    { target: "nav-suppliers", title: "Suppliers", body: "Verify suppliers and review their products. Hover for supplier products." },
    { target: "nav-logistics-partners", title: "Logistics", body: "Verify delivery partners." },
  ],
};

// Where the tour starts. New sellers land on Start here; sellers who hid it start from Home.
const HOME: Record<Role, string[]> = { seller: ["/home/start", "/home"], supplier: ["/supplier/dashboard"], logistics_partner: ["/logistics/dashboard"], admin: ["/admin/dashboard"] };

function visibleRect(selector: string) {
  const element = document.querySelector<HTMLElement>(`[data-tour="${selector}"]`);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight ? rect : null;
}

export function GuidedTour({ role }: { role: Role }) {
  const pathname = usePathname();
  const { prefs, save } = usePreferences();
  const [step, setStep] = useState<number | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  // The Start here steps only make sense on Start here; from Home the tour skips them.
  const steps = useMemo(
    () => STEPS[role].filter((item) => pathname === "/home/start" || !(item.target?.startsWith("start-") || item.target === "nav-start")),
    [role, pathname],
  );

  // Starts once, on the portal's home page, for people who haven't finished or skipped it.
  useEffect(() => {
    if (prefs && prefs.tour !== "done" && step === null && HOME[role].includes(pathname)) {
      const timer = window.setTimeout(() => setStep(0), 700);
      return () => window.clearTimeout(timer);
    }
  }, [prefs, pathname, role, step]);

  const measure = useCallback(() => {
    if (step === null) return;
    const target = steps[step]?.target;
    setRect(target ? visibleRect(target) : null);
  }, [step, steps]);

  useLayoutEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [measure]);

  const finish = useCallback(() => {
    setStep(null);
    void save({ tour: "done" }).catch(() => undefined);
  }, [save]);

  useEffect(() => {
    if (step === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish();
      if (event.key === "ArrowRight") setStep((current) => (current === null ? null : Math.min(steps.length - 1, current + 1)));
      if (event.key === "ArrowLeft") setStep((current) => (current === null ? null : Math.max(0, current - 1)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, steps.length, finish]);

  if (step === null) return null;
  const current = steps[step];
  const last = step === steps.length - 1;

  // Card next to the highlighted element (right of the sidebar, under the top bar), or centred.
  const width = Math.min(340, window.innerWidth - 32);
  let style: React.CSSProperties = { left: "50%", top: "50%", transform: "translate(-50%, -50%)", width };
  if (rect) {
    const roomRight = window.innerWidth - rect.right > width + 24;
    const left = roomRight ? rect.right + 14 : Math.min(Math.max(16, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 16);
    const top = roomRight ? Math.min(Math.max(16, rect.top - 8), window.innerHeight - 240) : Math.min(rect.bottom + 12, window.innerHeight - 240);
    style = { left, top, width };
  }

  return (
    <div className="fixed inset-0 z-[70] font-app text-app-ink" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {rect ? (
        <div
          aria-hidden
          className="pointer-events-none fixed rounded-[12px] ring-2 ring-app-accent transition-all duration-200"
          style={{ left: rect.left - 4, top: rect.top - 4, width: rect.width + 8, height: rect.height + 8, boxShadow: "0 0 0 9999px rgba(22,20,31,0.45)" }}
        />
      ) : (
        <div aria-hidden className="fixed inset-0 bg-[rgba(22,20,31,0.45)]" />
      )}
      <div className="fixed rounded-[22px] bg-white p-5 shadow-[0_24px_60px_-20px_rgba(22,20,31,0.45)]" style={style}>
        <div className="flex items-center gap-3">
          <Mascot name={role === "seller" ? "peggy" : "rex"} className="h-10 w-10" alt="" />
          <div className="text-[12.5px] font-bold text-app-ink-soft">{step + 1} of {steps.length}</div>
        </div>
        <h2 id="tour-title" className="mb-0 mt-3 text-[18px] font-extrabold">{current.title}</h2>
        <p className="mb-0 mt-1.5 text-[14.5px] leading-[1.55] text-app-ink-soft">{current.body}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button type="button" onClick={finish} className="min-h-[40px] rounded-full px-3 text-[13.5px] font-bold text-app-ink-soft hover:text-app-ink">
            {last ? "Close" : "Skip tour"}
          </button>
          <div className="flex gap-2">
            {step > 0 && <PillButton size="sm" tone="white" onClick={() => setStep(step - 1)}>Back</PillButton>}
            <PillButton size="sm" autoFocus onClick={() => (last ? finish() : setStep(step + 1))}>{last ? "Done" : "Next"}</PillButton>
          </div>
        </div>
      </div>
    </div>
  );
}
