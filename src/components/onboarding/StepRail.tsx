"use client";

import { Wordmark, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";

// The step list beside supplier and delivery-partner sign-up on wide screens (the 2026 "Web onboarding, verify
// identity" design): every question with done ✓ / current / upcoming, and the "No BVN needed" note at the bottom.
// Narrow screens keep the progress bar at the top instead, so this is hidden below `lg`.

export interface RailStep {
  key: string;
  label: string;
  done: boolean;
}

export function StepRail({ who, role, steps, current, showLogo = true, className = "" }: { who: string; role: string; steps: RailStep[]; current: string; showLogo?: boolean; className?: string }) {
  const t = useT("verification");
  return (
    <aside aria-label={t("rail.aria")} className={cx("flex-col gap-5 bg-app-forest px-5 py-7 text-white", className)}>
      {showLogo && <Wordmark tone="light" className="h-5 self-start" />}
      <p className="m-0 text-[13px] text-white/70">
        <span className="block truncate text-[17px] font-extrabold text-white">{who}</span>
        {role}
      </p>
      <ol className="m-0 grid list-none gap-0.5 p-0">
        {steps.map((step, index) => {
          const isCurrent = step.key === current;
          const done = step.done && !isCurrent;
          return (
            <li
              key={step.key}
              aria-current={isCurrent ? "step" : undefined}
              className={cx("flex items-center gap-3 rounded-[12px] px-2 py-2.5 text-[14px] font-bold", isCurrent ? "bg-white text-app-forest" : "text-white/80")}
            >
              <span
                aria-hidden
                className={cx(
                  "grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 text-[11px] font-extrabold",
                  isCurrent ? "border-app-forest bg-app-forest text-white" : done ? "border-app-mint bg-app-mint text-app-forest" : "border-white/30",
                )}
              >
                {done ? <Icon name="check" size={13} strokeWidth={3} /> : index + 1}
              </span>
              <span className="min-w-0">
                {step.label}
                {done && <span className="sr-only"> ({t("rail.done")})</span>}
                {isCurrent && <span className="sr-only"> ({t("rail.current")})</span>}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="m-0 mt-auto rounded-[14px] bg-white/10 p-3 text-[13px] leading-[1.5] text-white/85">{t("rail.noBvn")}</p>
    </aside>
  );
}
