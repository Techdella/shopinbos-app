"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChipAvatar } from "@/components/brand/ChipAvatar";
import { Icon, type IconName } from "@/components/ui/Icon";
import type { Role } from "@/lib/nav";

interface FirstRunWalkthroughProps {
  role: Role;
  storeName?: string;
}

interface WalkthroughStep {
  icon: IconName;
  title: string;
  body: string;
  actionLabel?: string;
  actionHref?: string;
}

const STORAGE_PREFIX = "shopinbos:first-run-walkthrough";

const walkthroughs: Record<Role, WalkthroughStep[]> = {
  seller: [
    {
      icon: "home",
      title: "Start from the dashboard",
      body: "Track setup, orders, products, and publishing from one home base.",
      actionLabel: "Open dashboard",
      actionHref: "/home",
    },
    {
      icon: "sparkle",
      title: "Build with Rex",
      body: "Describe the store you want and Rex can generate pages, copy, products, cart, checkout, and launch sections.",
      actionLabel: "Open Rex builder",
      actionHref: "/builder/rex?onboarding=true",
    },
    {
      icon: "document",
      title: "Manage pages",
      body: "Preview drafts, schedule publishing, tune SEO, and keep live pages separate from draft changes.",
      actionLabel: "View pages",
      actionHref: "/home/pages",
    },
  ],
  supplier: [
    {
      icon: "box",
      title: "Create your catalog",
      body: "Add wholesale products, pricing, stock, terms, and media so sellers can request quotes.",
      actionLabel: "Add product",
      actionHref: "/supplier/products/new",
    },
    {
      icon: "chat",
      title: "Reply to demand",
      body: "Quote requests collect seller quantity, destination, and product context for quick follow-up.",
      actionLabel: "Review quotes",
      actionHref: "/supplier/quote-requests",
    },
    {
      icon: "shop",
      title: "Finish your supplier profile",
      body: "Verification, profile media, and trust signals control marketplace visibility.",
      actionLabel: "Open profile",
      actionHref: "/supplier/profile",
    },
  ],
  logistics_partner: [
    {
      icon: "truck",
      title: "Run the bookings board",
      body: "Bookings, quotes, couriers, coverage, and pricing stay connected to your operating zones.",
      actionLabel: "View bookings",
      actionHref: "/logistics/bookings",
    },
    {
      icon: "pin",
      title: "Set coverage",
      body: "Coverage zones and depot settings help sellers find the right delivery partner.",
      actionLabel: "Open coverage",
      actionHref: "/logistics/coverage",
    },
    {
      icon: "coin",
      title: "Tune pricing",
      body: "Keep base fees, delivery types, and quote rules ready for marketplace requests.",
      actionLabel: "Open pricing",
      actionHref: "/logistics/pricing",
    },
  ],
  admin: [
    {
      icon: "settings",
      title: "Review platform queues",
      body: "Use the admin dashboard to inspect marketplace health, partners, products, and moderation.",
      actionLabel: "Open admin",
      actionHref: "/admin/dashboard",
    },
  ],
};

function roleTitle(role: Role) {
  if (role === "supplier") return "Supplier portal";
  if (role === "logistics_partner") return "Logistics portal";
  if (role === "admin") return "Admin workspace";
  return "Seller dashboard";
}

export function FirstRunWalkthrough({ role, storeName }: FirstRunWalkthroughProps) {
  const router = useRouter();
  const steps = walkthroughs[role];
  const storageKey = `${STORAGE_PREFIX}:${role}`;
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const step = steps[stepIndex];
  const progress = Math.round(((stepIndex + 1) / steps.length) * 100);

  const intro = useMemo(() => {
    if (role === "supplier") return "A quick demo of the supplier tools sellers will interact with.";
    if (role === "logistics_partner") return "A quick demo of the logistics controls sellers depend on.";
    if (role === "admin") return "A quick demo of the platform controls.";
    return `A quick demo for ${storeName ?? "your store"} before you start selling.`;
  }, [role, storeName]);

  useEffect(() => {
    setOpen(window.localStorage.getItem(storageKey) !== "done");
  }, [storageKey]);

  function finish() {
    window.localStorage.setItem(storageKey, "done");
    setOpen(false);
  }

  function goToStepAction() {
    if (!step.actionHref) return;
    finish();
    router.push(step.actionHref);
  }

  if (!open || !step) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[rgba(8,19,41,0.34)] px-4 py-5 backdrop-blur-[2px] sm:items-center">
      <div className="w-full max-w-[520px] overflow-hidden rounded-[16px] border border-[var(--ink-100)] bg-[var(--paper)] shadow-[var(--shd-pop)]">
        <div className="flex items-start gap-3 border-b border-[var(--ink-100)] px-5 py-4">
          <ChipAvatar mascot="rex" size={42} />
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--teal-700)]">
              Demo walkthrough
            </div>
            <h2 className="m-0 mt-1 text-[20px] font-semibold text-[var(--ink-900)]">{roleTitle(role)}</h2>
            <p className="m-0 mt-1 text-[13px] leading-5 text-[var(--ink-500)]">{intro}</p>
          </div>
          <button type="button" onClick={finish} className="grid h-8 w-8 place-items-center rounded-full border border-[var(--ink-100)] bg-white text-[var(--ink-500)]">
            <Icon name="x" size={15} />
          </button>
        </div>

        <div className="px-5 py-5">
          <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-[var(--ink-100)]">
            <div className="h-full rounded-full bg-[var(--teal-600)] transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="rounded-[14px] border border-[var(--ink-100)] bg-[var(--ink-50)] p-4">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-[12px] bg-[var(--teal-100)] text-[var(--teal-800)]">
              <Icon name={step.icon} size={21} />
            </div>
            <div className="text-[17px] font-semibold text-[var(--ink-900)]">{step.title}</div>
            <p className="m-0 mt-2 text-[13px] leading-6 text-[var(--ink-600)]">{step.body}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--ink-100)] px-5 py-4">
          <button type="button" onClick={finish} className="text-[12.5px] font-semibold text-[var(--ink-500)] underline decoration-dotted underline-offset-4">
            Skip demo
          </button>
          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <button type="button" onClick={() => setStepIndex((current) => current - 1)} className="dbtn dBtn-ghost dBtn-sm">
                Back
              </button>
            )}
            {step.actionHref && (
              <button type="button" onClick={goToStepAction} className="dbtn dBtn-ghost dBtn-sm">
                {step.actionLabel}
              </button>
            )}
            <button
              type="button"
              onClick={() => (stepIndex === steps.length - 1 ? finish() : setStepIndex((current) => current + 1))}
              className="dbtn dBtn-mint dBtn-sm"
            >
              {stepIndex === steps.length - 1 ? "Finish" : "Next"}
              <Icon name={stepIndex === steps.length - 1 ? "check" : "arrow"} size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
