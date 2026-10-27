"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Notice, Spinner, cx } from "@/components/app-ui";
import { Pill } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { ITEM_STEP, ONBOARDING_STEPS, TIER1_ITEMS, TIER2_ITEMS, type ItemState, type OnboardingStep, type PartnerState } from "@shared/partner-tiers";
import { kycCall, useKycT, type KycState } from "./kit";
import { BankStep, IdentityStep } from "./IdentityBankSteps";
import { CoverageStep, GuarantorStep, VehiclesStep } from "./FleetSteps";
import { CacStep, ReviewStep } from "./CacReviewSteps";

// Delivery partner verification, step by step (spec: Identity → Bank → Vehicles → Coverage → Guarantor →
// (Optional) CAC → Review & submit). The tiers and statuses come from shared/partner-tiers.ts through
// GET /api/logistics/kyc; each step saves on its own and answers with the new state.

const STATE_TONE: Record<PartnerState, string> = {
  unverified: "bg-[#FDF0D5]",
  pending_review: "bg-[#E8EAFB]",
  tier1_verified: "bg-app-success-tint",
  tier2_verified: "bg-app-success-tint",
  rejected: "bg-app-danger-tint",
  suspended: "bg-app-danger-tint",
};

/** A step's own status: rejected if anything in it is, else missing, else pending, else done. */
function stepState(state: KycState, step: OnboardingStep): ItemState {
  const items: ItemState[] = [
    ...TIER1_ITEMS.filter((item) => ITEM_STEP[item] === step && item !== "terms").map((item) => state.tier1[item]),
    ...(step === "cac" ? TIER2_ITEMS.map((item) => state.tier2[item]) : []),
  ];
  if (!items.length) return state.readyToSubmit ? "approved" : "missing";
  for (const wanted of ["rejected", "missing", "pending"] as const) if (items.includes(wanted)) return wanted;
  return "approved";
}

const DOT: Record<ItemState, string> = { approved: "bg-app-success", pending: "bg-[#F2A93B]", rejected: "bg-app-danger", missing: "bg-app-line-strong" };

export function PartnerVerificationFlow({ accountEmail, accountPhone }: { accountEmail: string | null; accountPhone: string | null }) {
  const t = useKycT();
  const [state, setState] = useState<KycState | null>(null);
  const [failed, setFailed] = useState(false);
  const [step, setStep] = useState<OnboardingStep>("identity");

  const reload = useCallback(() => {
    kycCall("").then((next) => { setState(next); setFailed(false); }, () => setFailed(true));
  }, []);
  useEffect(() => {
    reload();
    const wanted = new URLSearchParams(window.location.search).get("step");
    if (wanted && (ONBOARDING_STEPS as readonly string[]).includes(wanted)) setStep(wanted as OnboardingStep);
  }, [reload]);

  if (failed && !state) return <Notice tone="error">{t("page.loadFailed")}</Notice>;
  if (!state) {
    return <p className="flex items-center gap-2 py-10 text-[15px] text-app-ink-soft" role="status"><Spinner /> {t("page.loading")}</p>;
  }

  const index = ONBOARDING_STEPS.indexOf(step);
  const goTo = (next: OnboardingStep) => { setStep(next); window.scrollTo({ top: 0 }); };
  const props = { state, onState: setState, reload };

  return (
    <div className="grid gap-5">
      <section className={cx("flex flex-wrap items-start gap-4 rounded-[22px] p-5", STATE_TONE[state.state])}>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white"><Icon name={state.state.endsWith("verified") ? "check" : "clock"} size={20} /></span>
        <div className="min-w-0 flex-1">
          <h2 className="m-0 text-[18px] font-extrabold">{t(`state.${state.state}`)}</h2>
          <p className="m-0 mt-0.5 text-[14.5px] leading-[1.5] text-app-ink-soft">{t(`state.${state.state}.body`)}</p>
          {state.statusReason && (state.state === "rejected" || state.state === "suspended") && (
            <p className="m-0 mt-2 text-[14.5px] font-bold">{t("state.reason", { reason: state.statusReason })}</p>
          )}
          {state.badges.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">{state.badges.map((badge) => <Pill key={badge} tone="success">{t.dynamic(`badge.${badge}`, badge)}</Pill>)}</div>
          )}
        </div>
      </section>

      {state.tier !== "tier2" && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[18px] border border-app-line bg-white px-5 py-4 text-[14.5px]">
          <span className="min-w-0 flex-1 font-bold">{t("page.noCacBanner")}</span>
          <Link href="/logistics/cac-help" className="font-bold text-app-ink underline underline-offset-4">{t("page.cacHelpLink")}</Link>
        </div>
      )}

      <nav aria-label={t("page.title")} className="flex gap-2 overflow-x-auto pb-1">
        {ONBOARDING_STEPS.map((name, position) => {
          const own = stepState(state, name);
          return (
            <button
              key={name}
              type="button"
              aria-current={name === step ? "step" : undefined}
              onClick={() => goTo(name)}
              className={cx("inline-flex min-h-[40px] shrink-0 items-center gap-2 rounded-full border px-4 text-[13.5px] font-bold transition", name === step ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink")}
            >
              <span aria-hidden className={cx("h-2 w-2 rounded-full", DOT[own])} />
              {position + 1}. {t(`step.${name}`)}
            </button>
          );
        })}
      </nav>
      <p className="m-0 text-[13.5px] text-app-ink-soft">
        {t("step.of", { step: index + 1, total: ONBOARDING_STEPS.length })} · {step === "cac" ? t("tier.reach2") : t("tier.reach1")}
      </p>

      {step === "identity" && <IdentityStep {...props} accountEmail={accountEmail} accountPhone={accountPhone} />}
      {step === "bank" && <BankStep {...props} />}
      {step === "vehicles" && <VehiclesStep {...props} />}
      {step === "coverage" && <CoverageStep {...props} />}
      {step === "guarantor" && <GuarantorStep {...props} />}
      {step === "cac" && <CacStep {...props} />}
      {step === "review" && <ReviewStep state={state} onState={setState} goTo={goTo} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {index > 0 ? (
          <button type="button" onClick={() => goTo(ONBOARDING_STEPS[index - 1])} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-app-line bg-white px-4 text-[14px] font-bold">
            <Icon name="arrowLeft" size={15} /> {t("nav.back")}
          </button>
        ) : <span />}
        {index < ONBOARDING_STEPS.length - 1 && (
          <button type="button" onClick={() => goTo(ONBOARDING_STEPS[index + 1])} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-app-ink px-5 text-[14px] font-bold text-white">
            {t("nav.next")} <Icon name="arrow" size={15} />
          </button>
        )}
      </div>
    </div>
  );
}
