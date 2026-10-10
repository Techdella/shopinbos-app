"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChipAvatar } from "@/components/brand/ChipAvatar";

interface BuildProgressProps {
  selectedPages: string[];
  selectedPageDetails?: Array<{ type: string; label?: string; userContent?: string }>;
  storeConfig: { name: string; category?: string; designStyle?: string; tagline?: string };
  onComplete: () => void;
}

const STEPS_BY_PAGE: Record<string, string> = {
  home: "Building your homepage",
  products: "Setting up products page",
  about: "Writing your About Us",
  contact: "Setting up contact page",
  faq: "Creating FAQ section",
  blog: "Preparing blog layout",
  cart: "Setting up cart page",
  checkout: "Setting up checkout page",
  "product-detail": "Setting up single product pages",
};

const AFRICAN_PHRASES = [
  "Almost there — just a moment...",
  "Rex is putting the finishing touches...",
  "Writing your page copy now...",
  "Setting up your sections...",
  "Nearly ready...",
  "Your store is coming together nicely...",
];

export function BuildProgress({ selectedPages, selectedPageDetails, storeConfig, onComplete }: BuildProgressProps) {
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [isApiDone, setIsApiDone] = useState(false);
  const calledApi = useRef(false);

  const buildPages = useMemo(
    () => {
      const base = selectedPageDetails?.length
        ? selectedPageDetails
        : selectedPages.map((type) => ({ type, label: type.charAt(0).toUpperCase() + type.slice(1), userContent: "" }));
      const automatic = [
        { type: "cart", label: "Cart", userContent: "Automatic cart page with quantity controls, order summary, and checkout handoff." },
        { type: "checkout", label: "Checkout", userContent: "Automatic checkout page with customer details, delivery details, order summary, and payment setup." },
        { type: "product-detail", label: "Single Product", userContent: "Automatic single product page for every product, including gallery, details, wishlist, and add-to-cart controls." },
      ];
      const existing = new Set(base.map((page) => page.type));
      return [...base, ...automatic.filter((page) => !existing.has(page.type))];
    },
    [selectedPageDetails, selectedPages],
  );
  const steps = buildPages.map((p) => STEPS_BY_PAGE[p.type] ?? `Building ${p.type} page`);

  // Simulate build progress UI
  useEffect(() => {
    const totalDuration = 8000;
    const interval = 80;
    const increment = 100 / (totalDuration / interval);

    const timer = setInterval(() => {
      setProgress((p) => {
        const next = Math.min(p + increment, isApiDone ? 100 : 92);
        return next;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [isApiDone]);

  // Advance step labels
  useEffect(() => {
    const stepInterval = Math.max(1200, 7000 / steps.length);
    const timer = setInterval(() => {
      setCurrentStep((s) => {
        if (s < steps.length - 1) {
          setCompletedSteps((prev) => [...prev, steps[s]]);
          return s + 1;
        }
        return s;
      });
    }, stepInterval);
    return () => clearInterval(timer);
  }, [steps]);

  // Rotate African phrases
  useEffect(() => {
    const timer = setInterval(() => {
      setPhraseIdx((i) => (i + 1) % AFRICAN_PHRASES.length);
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  // Call API to actually build the pages
  useEffect(() => {
    if (calledApi.current) return;
    calledApi.current = true;

    (async () => {
      try {
        await fetch("/api/store/pages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pages: buildPages.map((page, i) => ({
              type: page.type,
              title: page.label ?? page.type.charAt(0).toUpperCase() + page.type.slice(1),
              userContent: page.userContent ?? "",
              designStyle: storeConfig.designStyle ?? "minimal",
              storeName: storeConfig.name,
              storeTagline: storeConfig.tagline ?? "",
              category: storeConfig.category ?? "",
              order: i,
            })),
          }),
        });
      } catch {
        // non-fatal: pages will be empty but flow continues
      } finally {
        setIsApiDone(true);
      }
    })();
  }, [buildPages, storeConfig]);

  // Complete when progress hits 100
  useEffect(() => {
    if (progress >= 100) {
      const t = setTimeout(onComplete, 800);
      return () => clearTimeout(t);
    }
  }, [progress, onComplete]);

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {/* Animated Rex */}
      <div
        className="relative mb-8"
        style={{
          animation: "bounce 1.2s ease-in-out infinite",
        }}
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(115,216,200,0.2) 0%, transparent 70%)",
            animation: "pulse 1.5s ease-in-out infinite",
            transform: "scale(1.6)",
          }}
        />
        <ChipAvatar mascot="rex" size={80} className="relative rounded-[20px]" />
      </div>

      <div className="font-mono text-[11px] tracking-[0.16em] uppercase" style={{ color: "var(--color-teal-deep)" }}>
        Rex is building your store
      </div>
      <h2 className="mt-2 font-display text-[28px] font-semibold tracking-[-0.03em]" style={{ color: "var(--color-navy)" }}>
        {progress >= 100 ? "Your store is ready!" : AFRICAN_PHRASES[phraseIdx]}
      </h2>

      {/* Progress bar */}
      <div className="mt-6 w-full max-w-[400px] overflow-hidden rounded-full bg-[rgb(14_42_56_/_0.08)]" style={{ height: 8 }}>
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${progress}%`,
            background: "linear-gradient(90deg, var(--color-mint), var(--color-teal))",
          }}
        />
      </div>
      <div className="mt-2 font-mono text-[12px]" style={{ color: "var(--color-muted)" }}>
        {Math.round(progress)}%
      </div>

      {/* Step list */}
      <div className="mt-6 w-full max-w-[380px] space-y-2 text-left">
        {steps.map((s, i) => {
          const done = completedSteps.includes(s);
          const active = i === currentStep && !done;
          return (
            <div key={s} className="flex items-center gap-3 text-[13px]">
              <div
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                style={{
                  background: done ? "var(--color-teal)" : active ? "var(--color-mint)" : "rgb(14 42 56 / 0.08)",
                  color: done ? "white" : active ? "var(--color-navy)" : "var(--color-muted)",
                }}
              >
                {done ? "OK" : i + 1}
              </div>
              <span style={{ color: done ? "var(--color-teal-deep)" : active ? "var(--color-navy)" : "var(--color-muted)" }}>
                {s} {active && "..."}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
