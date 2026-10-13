"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Mascot, PillButton, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import type { StoreConfig } from "@/lib/ai/store-types";

export interface BuildSummary {
  /** What the build-store step created (sample products, images) and anything it skipped. */
  notes: string[];
  /** Pages whose copy couldn't be written. */
  failedPages: string[];
  designSaved: boolean;
  aiOff: boolean;
  previewUrl?: string;
}

interface BuildProgressProps {
  selectedPages: string[];
  selectedPageDetails?: Array<{ type: string; label?: string; userContent?: string }>;
  storeConfig: { name: string; category?: string; designStyle?: string; tagline?: string };
  /** The full design to save as the store's draft (editor, pages, sample products, images). */
  design?: StoreConfig;
  onComplete: (summary: BuildSummary) => void;
}

type StepState = "pending" | "active" | "done" | "failed";

const STEPS_BY_PAGE: Record<string, string> = {
  home: "Writing your homepage",
  products: "Writing your products page",
  about: "Writing your About page",
  contact: "Writing your contact page",
  faq: "Writing your FAQ",
  blog: "Preparing your blog page",
  cart: "Setting up the cart page",
  checkout: "Setting up the checkout page",
  "product-detail": "Setting up single product pages",
};

async function readError(response: Response, fallback: string) {
  const json = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return json?.error?.message ?? fallback;
}

// Progress here is real: each step is one server call, and the bar moves when a call finishes.
export function BuildProgress({ selectedPages, selectedPageDetails, storeConfig, design, onComplete }: BuildProgressProps) {
  const buildPages = useMemo(() => {
    const base = selectedPageDetails?.length
      ? selectedPageDetails
      : selectedPages.map((type) => ({ type, label: type.charAt(0).toUpperCase() + type.slice(1), userContent: "" }));
    const automatic = [
      { type: "cart", label: "Cart", userContent: "Cart page with quantity controls, order summary, and checkout handoff." },
      { type: "checkout", label: "Checkout", userContent: "Checkout page with customer details, delivery details, order summary, and payment." },
    ];
    const existing = new Set(base.map((page) => page.type));
    return [...base, ...automatic.filter((page) => !existing.has(page.type))];
  }, [selectedPageDetails, selectedPages]);

  const steps = useMemo(
    () => [
      ...(design ? [{ key: "design", label: "Saving your store design, images and starter products" }] : []),
      ...buildPages.map((page) => ({ key: page.type, label: STEPS_BY_PAGE[page.type] ?? `Writing your ${page.label ?? page.type} page` })),
    ],
    [buildPages, design],
  );

  const [states, setStates] = useState<Record<string, StepState>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState<BuildSummary | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const setStep = (key: string, state: StepState, message?: string) => {
      setStates((prev) => ({ ...prev, [key]: state }));
      if (message) setMessages((prev) => ({ ...prev, [key]: message }));
    };

    (async () => {
      const result: BuildSummary = { notes: [], failedPages: [], designSaved: !design, aiOff: false };

      if (design) {
        setStep("design", "active");
        try {
          const response = await fetch("/api/ai/build-store", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ storeConfig: design, generateImages: true }),
          });
          if (!response.ok) throw new Error(await readError(response, "Rex couldn't save the store design."));
          const json = (await response.json()) as { data?: { notes?: string[]; products?: unknown[]; previewUrl?: string; images?: { hero?: string | null; product?: string | null } } };
          const made = [
            json.data?.products?.length ? `${json.data.products.length} sample products (drafts)` : "",
            json.data?.images?.hero ? "a hero image" : "",
            json.data?.images?.product ? "a product photo" : "",
          ].filter(Boolean);
          result.notes.push(...(made.length ? [`Rex added ${made.join(", ")}.`] : []), ...(json.data?.notes ?? []));
          result.previewUrl = json.data?.previewUrl;
          result.designSaved = true;
          setStep("design", "done", made.length ? `Added ${made.join(", ")}` : undefined);
        } catch (error) {
          setStep("design", "failed", error instanceof Error ? error.message : "Couldn't save the design.");
        }
      }

      for (const [index, page] of buildPages.entries()) {
        setStep(page.type, "active");
        try {
          const response = await fetch("/api/store/pages", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              pages: [{
                type: page.type,
                title: page.label ?? page.type.charAt(0).toUpperCase() + page.type.slice(1),
                userContent: page.userContent ?? "",
                designStyle: storeConfig.designStyle ?? "minimal",
                category: storeConfig.category ?? "",
                order: index,
              }],
            }),
          });
          if (!response.ok) throw new Error(await readError(response, "Couldn't write this page."));
          const json = (await response.json()) as { aiOff?: boolean };
          if (json.aiOff) result.aiOff = true;
          setStep(page.type, "done", json.aiOff ? "Starter text (AI is off)" : undefined);
        } catch (error) {
          result.failedPages.push(page.label ?? page.type);
          setStep(page.type, "failed", error instanceof Error ? error.message : "Couldn't write this page.");
        }
      }

      if (result.aiOff) result.notes.push("AI isn't switched on, so pages have starter text for you to edit.");
      setSummary(result);
    })();
  }, [buildPages, design, storeConfig]);

  const finishedCount = Object.values(states).filter((state) => state === "done" || state === "failed").length;
  const progress = steps.length ? Math.round((finishedCount / steps.length) * 100) : 100;
  const activeStep = steps.find((step) => states[step.key] === "active");
  const hasFailures = Boolean(summary && (summary.failedPages.length || !summary.designSaved));

  // Move on by itself only when everything worked; otherwise let the seller read what failed.
  useEffect(() => {
    if (!summary || hasFailures) return;
    const timer = setTimeout(() => onComplete(summary), 900);
    return () => clearTimeout(timer);
  }, [summary, hasFailures, onComplete]);

  return (
    <div className="flex w-full flex-col items-center px-4 py-10 text-center font-app text-app-ink sm:py-12">
      <Mascot name="rex" mood={hasFailures ? "oops" : summary ? "celebrate" : "working"} className="h-20 w-20" alt="Rex" />

      <p className="m-0 mt-5 text-[14px] font-bold text-app-ink-soft">Rex is building {storeConfig.name || "your store"}</p>
      <h2 className="m-0 mt-1.5 text-[26px] font-extrabold leading-[1.15] tracking-[-0.5px] sm:text-[28px]" aria-live="polite">
        {summary ? (hasFailures ? "Built, with a few gaps" : "Your store draft is ready") : activeStep ? `${activeStep.label}…` : "Starting…"}
      </h2>

      <div
        className="mt-6 h-2 w-full max-w-[420px] overflow-hidden rounded-full bg-app-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        aria-label="Build progress"
      >
        <div className="h-full rounded-full bg-app-ink transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>
      <div className="mt-2 text-[13px] text-app-ink-soft">
        {finishedCount} of {steps.length} steps
      </div>

      <ol className="m-0 mt-6 grid w-full max-w-[440px] list-none gap-2.5 p-0 text-left">
        {steps.map((step, index) => {
          const state = states[step.key] ?? "pending";
          return (
            <li key={step.key} className="flex items-start gap-3 text-[14px]">
              <span
                className={cx(
                  "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-extrabold",
                  state === "done" && "bg-app-success text-white",
                  state === "failed" && "bg-app-danger text-white",
                  state === "active" && "bg-app-ink text-white",
                  state === "pending" && "bg-app-canvas text-app-ink-soft",
                )}
              >
                {state === "done" ? <Icon name="check" size={13} /> : state === "failed" ? "!" : index + 1}
                <span className="sr-only">{state === "done" ? " done" : state === "failed" ? " failed" : state === "active" ? " in progress" : " waiting"}</span>
              </span>
              <span className="min-w-0">
                <span className={cx(state === "pending" ? "text-app-ink-soft" : state === "failed" ? "text-app-danger" : "text-app-ink", state === "active" && "font-bold")}>
                  {step.label}{state === "active" && "…"}
                </span>
                {messages[step.key] && <span className="block text-[12.5px] text-app-ink-soft">{messages[step.key]}</span>}
              </span>
            </li>
          );
        })}
      </ol>

      {summary && (summary.notes.length > 0 || hasFailures) && (
        <div className="mt-6 grid w-full max-w-[440px] gap-1.5 rounded-[18px] bg-app-peach px-4 py-3 text-left text-[13.5px] leading-[1.5]">
          {summary.notes.map((note) => <p key={note} className="m-0">{note}</p>)}
          {summary.failedPages.length > 0 && <p className="m-0">Not written yet: {summary.failedPages.join(", ")}. You can ask Rex to write them from the preview.</p>}
          {!summary.designSaved && <p className="m-0">The store design wasn&apos;t saved; your preview still has it, and you can save it from the builder.</p>}
        </div>
      )}

      {summary && hasFailures && (
        <PillButton size="md" className="mt-5" onClick={() => onComplete(summary)}>
          Continue to preview
        </PillButton>
      )}
    </div>
  );
}
