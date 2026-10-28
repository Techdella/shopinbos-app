"use client";

import { useCallback, useEffect, useState } from "react";
import { Notice, Spinner } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { whatsappChatUrl } from "@/lib/support-contact";
import { PARTNER_FLOW, isFlowScreen, type FlowScreen } from "@shared/partner-tiers";
import { kycCall, useKycT, type KycState } from "./kit";
import { AreasScreen, CacScreen, ChargeScreen, InterstateScreen, NameScreen, StateScreen, VehiclesScreen } from "./QuestionScreens";
import { BaseScreen, IdScreen, ReviewScreen, SelfieScreen, type NinDraft } from "./CheckScreens";
import { StepRail } from "@/components/onboarding/StepRail";

// Delivery partner sign-up, one question per screen (the owner's "Shopinbos Onboarding — Simplified"): business name
// → CAC → state → areas → what they deliver with → other states → how they charge → where they're based → photo of
// their ID → selfie → review and send ("You're in review"). Each screen saves on Continue, so leaving and coming back
// opens on the first unanswered one (state.flow.first, shared/partner-tiers.ts flowProgress); ?step=<screen> opens
// one directly (the dashboard's "Fix" and "Add CAC" links). Tier rules: shared/partner-tiers.ts.
// Wide screens (2026 "Web onboarding, verify identity"): the steps listed on the left with done / current / upcoming
// and "No BVN needed" (src/components/onboarding/StepRail.tsx); narrow screens keep the bar at the top.

const EMPTY_DRAFT: NinDraft = { nin: "", firstName: "", lastName: "", dateOfBirth: "" };

export function PartnerVerificationFlow({ accountName }: { accountName: string }) {
  const t = useKycT();
  const [state, setState] = useState<KycState | null>(null);
  const [failed, setFailed] = useState(false);
  const [screen, setScreen] = useState<FlowScreen | null>(null);
  const [draft, setDraft] = useState<NinDraft>(() => {
    const parts = accountName.trim().split(/\s+/).filter(Boolean);
    return { ...EMPTY_DRAFT, firstName: parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0] ?? "", lastName: parts.length > 1 ? parts[parts.length - 1] : "" };
  });

  const reload = useCallback(() => {
    kycCall("").then((next) => { setState(next); setFailed(false); }, () => setFailed(true));
  }, []);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    if (!state || screen) return;
    const wanted = new URLSearchParams(window.location.search).get("step");
    setScreen(isFlowScreen(wanted) ? wanted : state.flow.first);
  }, [state, screen]);

  if (failed && !state) return <Notice tone="error">{t("page.loadFailed")}</Notice>;
  if (!state || !screen) {
    return <p className="flex items-center gap-2 py-10 text-[15px] text-app-ink-soft" role="status"><Spinner /> {t("page.loading")}</p>;
  }

  const index = PARTNER_FLOW.indexOf(screen);
  const goTo = (next: FlowScreen) => { setScreen(next); window.scrollTo({ top: 0 }); };
  // Once sent, a fixed item (or CAC added later) goes back to the review screen rather than through every question.
  const onDone = () => goTo(state.submittedAt ? "review" : PARTNER_FLOW[Math.min(index + 1, PARTNER_FLOW.length - 1)]);
  const props = { state, onState: setState, onDone };

  const railSteps = PARTNER_FLOW.map((key) => ({ key, label: t(`rail.${key}`), done: key === "review" ? Boolean(state.submittedAt) : state.flow.done[key] }));
  return (
    <div className="mx-auto w-full max-w-[600px] pb-10 lg:grid lg:max-w-[1040px] lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start lg:gap-10">
      <StepRail
        className="sticky top-4 hidden rounded-[24px] lg:flex"
        showLogo={false}
        who={state.business.companyName || accountName || t("rail.title")}
        role={t("rail.title")}
        steps={railSteps}
        current={screen}
      />
      <div className="grid w-full max-w-[640px] gap-6">
      <header className="grid gap-3">
        <div className="flex items-center gap-3">
          {index > 0 ? (
            <button type="button" onClick={() => goTo(PARTNER_FLOW[index - 1])} aria-label={t("nav.back")} className="grid h-11 w-11 place-items-center rounded-full border border-app-line bg-white">
              <Icon name="arrowLeft" size={18} />
            </button>
          ) : <span className="h-11 w-11" />}
          <span className="flex-1 text-center text-[14px] font-bold text-app-ink-soft">{t("step.of", { step: index + 1, total: PARTNER_FLOW.length })}</span>
          <a href={whatsappChatUrl(t("flow.helpMessage"))} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-app-line bg-white px-3.5 text-[14px] font-bold no-underline">
            <Icon name="whatsapp" size={16} /> {t("flow.help")}
          </a>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-app-line lg:hidden" aria-hidden>
          <div className="h-full rounded-full bg-app-ink transition-all" style={{ width: `${((index + 1) / PARTNER_FLOW.length) * 100}%` }} />
        </div>
      </header>

      {screen === "name" && <NameScreen {...props} accountName={accountName} />}
      {screen === "cac" && <CacScreen {...props} reload={reload} />}
      {screen === "state" && <StateScreen {...props} />}
      {screen === "areas" && <AreasScreen {...props} />}
      {screen === "vehicles" && <VehiclesScreen {...props} />}
      {screen === "interstate" && <InterstateScreen {...props} />}
      {screen === "charge" && <ChargeScreen {...props} />}
      {screen === "base" && <BaseScreen {...props} />}
      {screen === "id" && <IdScreen {...props} draft={draft} onDraft={setDraft} />}
      {screen === "selfie" && <SelfieScreen {...props} draft={draft} onDraft={setDraft} />}
      {screen === "review" && <ReviewScreen state={state} onState={setState} goTo={goTo} />}

      {screen !== "review" && state.flow.done[screen] && (
        <button type="button" onClick={onDone} className="justify-self-center text-[15px] font-bold text-app-ink-soft underline underline-offset-4">{t("flow.skipDone")}</button>
      )}
      </div>
    </div>
  );
}
