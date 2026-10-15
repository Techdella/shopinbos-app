"use client";

import { useEffect, useState } from "react";
import { Mascot, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";
import { REX_JOB_PLAN, REX_QUIPS, rexIsSlow, rexProgressAt, rexStepAt, type RexJob } from "@shared/rex-progress";

/** Seconds since the component mounted, ticking every half second. */
function useElapsed() {
  const [start] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setElapsed(Date.now() - start), 500);
    return () => window.clearInterval(timer);
  }, [start]);
  return elapsed;
}

/** A rotating light-hearted line ("Hold your zobo, we're almost there."). */
export function RexQuip({ className, every = 4500 }: { className?: string; every?: number }) {
  const t = useT("rex");
  const [index, setIndex] = useState(0);
  useEffect(() => {
    setIndex(Math.floor(Math.random() * REX_QUIPS));
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % REX_QUIPS), every);
    return () => window.clearInterval(timer);
  }, [every]);
  return (
    <p key={index} className={cx("m-0 animate-[rexFade_400ms_ease-out] italic text-app-ink-soft", className)}>
      {t.dynamic(`prog.quip.${index}`, "")}
    </p>
  );
}

/**
 * What Rex is doing while he works: the job's steps (checked off as the usual time passes, the last one held until
 * the answer arrives), a progress bar, the seconds so far and a rotating line. `compact` fits a chat bubble.
 */
export function RexProgress({ job, compact = false, className }: { job: RexJob; compact?: boolean; className?: string }) {
  const t = useT("rex");
  const elapsed = useElapsed();
  const plan = REX_JOB_PLAN[job];
  const step = rexStepAt(elapsed, plan);
  const percent = rexProgressAt(elapsed, plan.seconds);
  const slow = rexIsSlow(elapsed, plan.seconds);
  const seconds = Math.floor(elapsed / 1000);

  return (
    <div role="status" aria-live="polite" className={cx("w-full", className)}>
      <style>{"@keyframes rexFade{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}"}</style>
      <div className="flex items-center gap-3">
        {compact ? null : <Mascot name="rex" mood="working" alt="" className="h-14 w-14 shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[15px] font-extrabold leading-tight">{t.dynamic(`prog.title.${job}`, t("prog.title.chat"))}</p>
          <p className="m-0 mt-0.5 text-[12.5px] text-app-ink-soft">
            {t("prog.step", { n: step + 1, total: plan.steps })} · <span className="font-mono tabular-nums">{seconds}s</span>
          </p>
        </div>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-app-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={t("prog.bar")}>
        <div className="h-full rounded-full bg-app-ink transition-[width] duration-500 ease-out" style={{ width: `${Math.max(4, percent)}%` }} />
      </div>

      <ol className="m-0 mt-3 grid list-none gap-1.5 p-0">
        {Array.from({ length: plan.steps }, (_, index) => {
          const state = index < step ? "done" : index === step ? "active" : "pending";
          return (
            <li key={index} className="flex items-center gap-2 text-[13px] leading-[1.35]">
              <span
                aria-hidden
                className={cx(
                  "grid h-5 w-5 shrink-0 place-items-center rounded-full",
                  state === "done" && "bg-app-success text-white",
                  state === "active" && "bg-app-ink text-white",
                  state === "pending" && "bg-app-canvas",
                )}
              >
                {state === "done" ? <Icon name="check" size={11} /> : state === "active" ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> : null}
              </span>
              <span className={cx(state === "pending" ? "text-app-ink-faint" : "text-app-ink", state === "active" && "font-bold")}>
                {t.dynamic(`prog.${job}.${index}`, "")}
                {state === "active" ? "…" : ""}
              </span>
            </li>
          );
        })}
      </ol>

      {slow ? <p className="m-0 mt-3 text-[12.5px] font-bold text-app-ink-soft">{t("prog.slow")}</p> : <RexQuip className="mt-3 text-[12.5px]" />}
    </div>
  );
}
