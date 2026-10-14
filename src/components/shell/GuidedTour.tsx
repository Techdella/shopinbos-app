"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Mascot, PillButton } from "@/components/app-ui";
import type { Role } from "@/lib/nav";
import { usePreferences } from "./useShellCounts";
import { FIT_MAX_HEIGHT, FitBox } from "./useFitInViewport";
import { useT } from "@/components/i18n/I18nProvider";

// First-visit walkthrough: a short spotlight tour of the menu and the main buttons, shown once on the
// portal's home page and replayable from "Customise your menu". Steps point at [data-tour] anchors; when an
// anchor isn't on screen (e.g. the menu is folded away on a phone) the step shows as a centred card.

interface Step {
  target?: string;
  /** Words are "<role>.<id>.title" and ".body" in the "tour" catalog. */
  id: string;
}

const STEPS: Record<Role, Step[]> = {
  seller: [
    { id: "welcome" },
    { target: "start-checklist", id: "start" },
    { target: "start-helpers", id: "helpers" },
    { target: "nav-start", id: "comeBack" },
    { target: "nav-home", id: "home" },
    { target: "add-product", id: "addProducts" },
    { target: "nav-orders", id: "orders" },
    { target: "nav-marketing", id: "more" },
    { target: "ask-peggy", id: "peggy" },
    { target: "search", id: "search" },
    { target: "nav-settings", id: "settings" },
  ],
  supplier: [
    { id: "welcome" },
    { target: "nav-dashboard", id: "today" },
    { target: "nav-orders", id: "orders" },
    { target: "nav-quote-requests", id: "quotes" },
    { target: "nav-products", id: "products" },
    { target: "search", id: "search" },
    { target: "nav-settings", id: "settings" },
  ],
  logistics_partner: [
    { id: "welcome" },
    { target: "nav-dashboard", id: "today" },
    { target: "nav-bookings", id: "jobs" },
    { target: "nav-couriers", id: "riders" },
    { target: "nav-cash", id: "cash" },
    { target: "nav-coverage", id: "coverage" },
    { target: "nav-profile", id: "profile" },
  ],
  admin: [
    { id: "welcome" },
    { target: "nav-dashboard", id: "today" },
    { target: "nav-suppliers", id: "suppliers" },
    { target: "nav-logistics-partners", id: "logistics" },
  ],
};

// Admin screens stay in English, so the admin tour's words live here rather than in the catalog.
const ADMIN_COPY: Record<string, { title: string; body: string }> = {
  welcome: { title: "Welcome to the admin console", body: "A quick tour of the review queues." },
  today: { title: "Today", body: "What needs review: suppliers, delivery partners and products." },
  suppliers: { title: "Suppliers", body: "Verify suppliers and review their products. Hover for supplier products." },
  logistics: { title: "Logistics", body: "Verify delivery partners." },
};

// Where the tour starts. New sellers land on Start here; sellers who hid it start from Home.
const HOME: Record<Role, string[]> = { seller: ["/home/start", "/home"], supplier: ["/supplier/dashboard"], logistics_partner: ["/logistics/dashboard"], admin: ["/admin/dashboard"] };

function visibleRect(selector: string) {
  const element = document.querySelector<HTMLElement>(`[data-tour="${selector}"]`);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight ? rect : null;
}

// One automatic start per page load, even if the component remounts while the "seen" save is in flight.
let startedThisLoad = false;

export function GuidedTour({ role }: { role: Role }) {
  const pathname = usePathname();
  const { prefs, confirmed, save } = usePreferences();
  const saveRef = useRef(save);
  saveRef.current = save;
  const [step, setStep] = useState<number | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const t = useT("tour", "common");
  // The Start here steps only make sense on Start here; from Home the tour skips them.
  const steps = useMemo(
    () => STEPS[role].filter((item) => pathname === "/home/start" || !(item.target?.startsWith("start-") || item.target === "nav-start")),
    [role, pathname],
  );

  // Shows once, on the portal's home page after onboarding, and never again on its own: it is marked seen the
  // moment it opens (so leaving mid-tour, reloading or closing the tab doesn't bring it back), and only after
  // the server confirms it hasn't been seen (a stale or empty localStorage cache on a new device can't restart
  // it). "Replay the walkthrough" in Customise your menu clears the flag to show it again.
  useEffect(() => {
    if (!confirmed || !prefs || prefs.tour === "done" || step !== null || startedThisLoad || !HOME[role].includes(pathname)) return;
    const timer = window.setTimeout(() => {
      startedThisLoad = true;
      setStep(0);
      void saveRef.current({ tour: "done" }).catch(() => undefined);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [confirmed, prefs, pathname, role, step]);

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
  const copy = role === "admin"
    ? ADMIN_COPY[current.id] ?? { title: "", body: "" }
    : { title: t.dynamic(`${role}.${current.id}.title`), body: t.dynamic(`${role}.${current.id}.body`) };

  // Card next to the highlighted element (right of the sidebar, under the top bar), or centred.
  const width = Math.min(340, window.innerWidth - 32);
  // Its height is measured (FitBox), so a long step near the bottom of the window moves up instead of off-screen.
  let style: React.CSSProperties = { left: "50%", top: "50%", transform: "translate(-50%, -50%)", width, maxHeight: FIT_MAX_HEIGHT, overflowY: "auto" };
  let anchorTop: number | null = null;
  if (rect) {
    const roomRight = window.innerWidth - rect.right > width + 24;
    const left = roomRight ? rect.right + 14 : Math.min(Math.max(16, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 16);
    anchorTop = roomRight ? Math.max(16, rect.top - 8) : rect.bottom + 12;
    style = { left, width };
  }
  const cardClass = "fixed rounded-[22px] bg-white p-5 shadow-[0_24px_60px_-20px_rgba(22,20,31,0.45)]";

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
      <TourCard anchorTop={anchorTop} className={cardClass} style={style}>
        <div className="flex items-center gap-3">
          <Mascot name={role === "seller" ? "peggy" : "rex"} className="h-10 w-10" alt="" />
          <div className="text-[12.5px] font-bold text-app-ink-soft">{t("progress", { n: step + 1, total: steps.length })}</div>
        </div>
        <h2 id="tour-title" className="mb-0 mt-3 text-[18px] font-extrabold">{copy.title}</h2>
        <p className="mb-0 mt-1.5 text-[14.5px] leading-[1.55] text-app-ink-soft">{copy.body}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button type="button" onClick={finish} className="min-h-[40px] rounded-full px-3 text-[13.5px] font-bold text-app-ink-soft hover:text-app-ink">
            {last ? t("close") : t("skip")}
          </button>
          <div className="flex gap-2">
            {step > 0 && <PillButton size="sm" tone="white" onClick={() => setStep(step - 1)}>{t("back")}</PillButton>}
            <PillButton size="sm" autoFocus onClick={() => (last ? finish() : setStep(step + 1))}>{last ? t("done") : t("next")}</PillButton>
          </div>
        </div>
      </TourCard>
    </div>
  );
}

function TourCard({ anchorTop, ...rest }: { anchorTop: number | null } & React.HTMLAttributes<HTMLDivElement>) {
  return anchorTop === null ? <div {...rest} /> : <FitBox anchorTop={anchorTop} {...rest} />;
}
