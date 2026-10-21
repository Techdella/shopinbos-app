"use client";

import { useEffect, useState } from "react";
import { cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";
import { RexQuip } from "./RexProgress";

// The full build's real progress: each step is ticked off when its request comes back (design, every page,
// photos), unlike RexProgress, which paces a single request against the usual time.

export type BuildStepState = "pending" | "active" | "done" | "failed" | "skipped";
export interface BuildStep {
  key: string;
  label: string;
  state: BuildStepState;
  /** A short note under the step ("4 of 6 photos made"). */
  note?: string;
}

export function RexBuildProgress({ steps }: { steps: BuildStep[] }) {
  const t = useT("builder", "common");
  const [start] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const done = steps.filter((step) => step.state === "done" || step.state === "skipped" || step.state === "failed").length;
  const percent = Math.round((Math.max(0.3, done) / Math.max(1, steps.length)) * 100);

  return (
    <div role="status" aria-live="polite" className="w-full">
      <p className="m-0 text-[15px] font-extrabold leading-tight">{t("rex.bp.title")}</p>
      <p className="m-0 mt-0.5 text-[12.5px] text-app-ink-soft">
        {t("rex.bp.stepOf", { n: Math.min(steps.length, done + 1), total: steps.length })} · <span className="font-mono tabular-nums">{Math.floor((now - start) / 1000)}s</span>
      </p>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-app-track" aria-hidden>
        <div className="h-full rounded-full bg-app-ink transition-[width] duration-500 ease-out" style={{ width: `${percent}%` }} />
      </div>
      <ol className="m-0 mt-3 grid list-none gap-2 p-0">
        {steps.map((step) => (
          <li key={step.key} className="flex items-start gap-2 text-[13px] leading-[1.35]">
            <span
              aria-hidden
              className={cx(
                "mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full",
                step.state === "done" && "bg-app-success text-white",
                step.state === "active" && "bg-app-ink text-white",
                step.state === "failed" && "bg-app-danger text-white",
                (step.state === "pending" || step.state === "skipped") && "bg-app-canvas",
              )}
            >
              {step.state === "done" ? <Icon name="check" size={11} /> : step.state === "failed" ? <Icon name="x" size={11} /> : step.state === "active" ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> : null}
            </span>
            <span className="min-w-0">
              <span className={cx(step.state === "pending" || step.state === "skipped" ? "text-app-ink-faint" : "text-app-ink", step.state === "active" && "font-bold", step.state === "skipped" && "line-through")}>
                {step.label}
                {step.state === "active" ? "…" : ""}
              </span>
              {step.note ? <span className="block text-[12px] text-app-ink-soft">{step.note}</span> : null}
            </span>
          </li>
        ))}
      </ol>
      <RexQuip className="mt-3 text-[12.5px]" />
    </div>
  );
}
