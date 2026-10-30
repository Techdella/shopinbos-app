"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";
import { cx } from "@/components/app-ui/cx";
import { inAppSessionClient } from "@/lib/app-session";
import { BuyCreditsButton } from "@/components/credits/CreditsBadge";
import { creditsUrlFor } from "@shared/ai-credits";
import { PLAN_PROMPT_EVENT, planPromptFor, plansUrlFor, type PlanPromptDetail } from "@shared/plan-prompts";

// "Upgrade to unlock this feature" and "You're out of AI credits": one slide-in for every page (mounted once in the
// top bar). It shows when any request on the page comes back with a plan-lock or out-of-credits error (the page's
// own fetch is watched, so no page has to remember), or when a locked button fires PLAN_PROMPT_EVENT. On the web it
// has the button to the plans or the top-up popup; on pages the phone app opened it says "This isn't on your plan"
// with no button (shared/plan-prompts.ts).

/** Show the slide-in from a locked button or link (`message` is optional). */
export function showPlanPrompt(detail: PlanPromptDetail) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<PlanPromptDetail>(PLAN_PROMPT_EVENT, { detail }));
}

let watching = false;

/** Watches the page's own API calls once per tab: a 402/403 with a plan or credits code opens the slide-in. */
function watchFetch() {
  if (watching || typeof window === "undefined") return;
  watching = true;
  const original = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const response = await original(...args);
    if (response.status === 402 || response.status === 403) {
      try {
        const url = typeof args[0] === "string" ? args[0] : args[0] instanceof URL ? args[0].href : args[0].url;
        if (new URL(url, window.location.href).origin === window.location.origin) {
          const json = (await response.clone().json()) as { error?: { code?: string; message?: string } };
          const kind = planPromptFor(json?.error?.code);
          if (kind) showPlanPrompt({ kind, message: json.error?.message ?? null });
        }
      } catch {
        // Not JSON, or not ours: the page handles it.
      }
    }
    return response;
  };
}

export function PlanPrompts({ role }: { role: string | null | undefined }) {
  const t = useT("payments");
  const [shown, setShown] = useState<PlanPromptDetail | null>(null);
  const [inApp, setInApp] = useState(false);

  useEffect(() => {
    watchFetch();
    setInApp(inAppSessionClient());
    const show = (event: Event) => setShown((event as CustomEvent<PlanPromptDetail>).detail);
    window.addEventListener(PLAN_PROMPT_EVENT, show);
    return () => window.removeEventListener(PLAN_PROMPT_EVENT, show);
  }, []);

  useEffect(() => {
    if (!shown) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShown(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown]);

  if (!shown) return null;
  const credits = shown.kind === "credits";
  const title = credits ? t("lock.creditsTitle") : inApp ? t("lock.notOnPlan") : t("lock.title");
  const body = shown.message?.trim() || (credits ? (inApp ? t("lock.creditsBodyApp") : t("lock.creditsBody")) : inApp ? t("lock.bodyApp") : t("lock.body"));

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center" role="presentation">
      <button type="button" aria-label={t("lock.close")} onClick={() => setShown(null)} className="absolute inset-0 bg-black/40" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-prompt-title"
        className={cx("plan-slide-in relative m-0 w-full max-w-[440px] rounded-t-[28px] bg-white p-6 pb-8 shadow-2xl sm:m-4 sm:rounded-[28px]")}
      >
        <span aria-hidden className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-app-peach text-app-accent-ink">
          <Icon name={credits ? "sparkle" : "lock"} size={26} />
        </span>
        <h2 id="plan-prompt-title" className="m-0 text-[22px] font-extrabold tracking-[-0.02em]">{title}</h2>
        <p className="m-0 mt-2 text-[15px] leading-[1.5] text-app-ink-soft">{body}</p>
        <div className="mt-6 grid gap-2.5">
          {inApp ? null : credits ? (
            <BuyCreditsButton manageHref={creditsUrlFor(role)} label={t("lock.topUp")} className="w-full justify-center" />
          ) : (
            <Link href={plansUrlFor(role)} onClick={() => setShown(null)} className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-app-ink text-[15px] font-extrabold text-white no-underline hover:opacity-90">
              <Icon name="sparkle" size={16} /> {t("lock.seePlans")}
            </Link>
          )}
          <button type="button" onClick={() => setShown(null)} className="min-h-[44px] rounded-full text-[15px] font-bold text-app-ink">{t("lock.notNow")}</button>
        </div>
      </div>
    </div>
  );
}
