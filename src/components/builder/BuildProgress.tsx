"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChipAvatar } from "@/components/brand/ChipAvatar";
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
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="relative mb-8">
        <ChipAvatar mascot="rex" size={80} className="relative rounded-[20px]" />
      </div>

      <div className="font-mono text-[11px] tracking-[0.16em] uppercase" style={{ color: "var(--color-teal-deep)" }}>
        Rex is building {storeConfig.name || "your store"}
      </div>
      <h2 className="mt-2 font-display text-[28px] font-semibold tracking-[-0.03em]" style={{ color: "var(--color-navy)" }}>
        {summary ? (hasFailures ? "Built, with a few gaps" : "Your store draft is ready") : activeStep ? `${activeStep.label}…` : "Starting…"}
      </h2>

      <div className="mt-6 w-full max-w-[400px] overflow-hidden rounded-full bg-[rgb(14_42_56_/_0.08)]" style={{ height: 8 }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${progress}%`, background: "linear-gradient(90deg, var(--color-mint), var(--color-teal))" }}
        />
      </div>
      <div className="mt-2 font-mono text-[12px]" style={{ color: "var(--color-muted)" }}>
        {finishedCount} of {steps.length} steps
      </div>

      <div className="mt-6 w-full max-w-[420px] space-y-2 text-left">
        {steps.map((step, index) => {
          const state = states[step.key] ?? "pending";
          return (
            <div key={step.key} className="flex items-start gap-3 text-[13px]">
              <div
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                style={{
                  background: state === "done" ? "var(--color-teal)" : state === "failed" ? "var(--color-coral)" : state === "active" ? "var(--color-mint)" : "rgb(14 42 56 / 0.08)",
                  color: state === "done" || state === "failed" ? "white" : state === "active" ? "var(--color-navy)" : "var(--color-muted)",
                }}
              >
                {state === "done" ? "OK" : state === "failed" ? "!" : index + 1}
              </div>
              <div>
                <span style={{ color: state === "done" ? "var(--color-teal-deep)" : state === "failed" ? "#9F2D20" : state === "active" ? "var(--color-navy)" : "var(--color-muted)" }}>
                  {step.label} {state === "active" && "..."}
                </span>
                {messages[step.key] && <div className="text-[11px]" style={{ color: "var(--color-muted)" }}>{messages[step.key]}</div>}
              </div>
            </div>
          );
        })}
      </div>

      {summary && (summary.notes.length > 0 || hasFailures) && (
        <div className="mt-6 w-full max-w-[420px] rounded-[14px] border px-4 py-3 text-left text-[12px] leading-5" style={{ borderColor: "rgb(14 42 56 / 0.08)", color: "var(--color-navy)" }}>
          {summary.notes.map((note) => <p key={note}>{note}</p>)}
          {summary.failedPages.length > 0 && <p>Not written yet: {summary.failedPages.join(", ")}. You can ask Rex to write them from the preview.</p>}
          {!summary.designSaved && <p>The store design wasn&apos;t saved; your preview still has it, and you can save it from the editor.</p>}
        </div>
      )}

      {summary && hasFailures && (
        <button
          type="button"
          onClick={() => onComplete(summary)}
          className="mt-5 rounded-full px-6 py-2.5 text-[13px] font-semibold"
          style={{ background: "var(--color-mint)", color: "var(--color-navy)" }}
        >
          Continue to preview
        </button>
      )}
    </div>
  );
}
