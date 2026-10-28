import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { CallPeggyButton } from "@/components/CallPeggyButton";
import { ONBOARDING_STEPS, type OnboardingStep } from "@shared/partner-tiers";
import { Banner } from "@/components/design";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { BankStep, DeliveryStep } from "@/components/kyc/FleetSteps";
import { CacStep, ReviewStep, openOnWeb } from "@/components/kyc/BusinessSteps";
import { IdentityStep } from "@/components/kyc/IdentityStep";
import { TonePill } from "@/components/partner";
import { Screen } from "@/components/Screen";
import { Card, Notice, PillButton, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { fetchKyc, type KycState } from "@/lib/kyc";
import { STEP_TONE, firstOpenStep, stepState } from "@/lib/kyc-pure";
import { usePeggyContinue, usePeggySaved } from "@/lib/peggy-call";
import { useLoad } from "@/lib/useLoad";
import { colors } from "@/theme";

// Delivery partner sign-up on the phone: one flow of 4 numbered steps, like the web page (/logistics/verification):
// 1. You (NIN + selfie, name, date of birth, phone, email, address) → 2. Bank account (in the NIN's name, never a
// BVN) → 3. Your delivery (company name, where and how, vehicles) → 4. Review and send. CAC is an optional card
// after them, not a numbered step: partners don't need it to start (Tier 1, Verified Individual); adding it makes
// them a Registered Business with no order limits. Pricing is set later, from the portal. New partners land here
// straight away (/logistics/home); saving "Your delivery" finishes set-up. Every call answers with the whole state
// (src/lib/kyc.ts), so the step pills follow at once. Opens on the first step that still needs something, or the one
// asked for (?step=cac from "Add CAC" on the tier card). After a Peggy call it reloads and opens the next open step.

/** The numbered steps; CAC (the last of ONBOARDING_STEPS) is the optional card after them. */
const NUMBERED = ONBOARDING_STEPS.filter((item) => item !== "cac");

const STATE_TONE = { unverified: "muted", pending_review: "info", tier1_verified: "success", tier2_verified: "success", rejected: "danger", suspended: "danger" } as const;

export default function LogisticsVerification() {
  const t = useT("m_kyc");
  const params = useLocalSearchParams<{ step?: string }>();
  const load = useLoad(fetchKyc);
  const [state, setState] = useState<KycState | null>(null);
  const [step, setStep] = useState<OnboardingStep | null>(null);
  const data = state ?? load.data ?? null;

  useEffect(() => {
    if (load.data) setState(load.data);
  }, [load.data]);

  useEffect(() => {
    if (!data || step) return;
    // Older links named the steps "vehicles" and "coverage": both are on "Your delivery" now.
    const wanted = params.step === "vehicles" || params.step === "coverage" ? "delivery" : params.step;
    const asked = ONBOARDING_STEPS.find((item) => item === wanted);
    setStep(asked ?? firstOpenStep(data));
  }, [data, step, params.step]);

  // Peggy saving on a call, and "Continue" after it: fresh state, then the first step still open.
  usePeggySaved(() => void fetchKyc().then(setState).catch(() => null));
  usePeggyContinue(() => {
    void fetchKyc()
      .then((fresh) => {
        setState(fresh);
        setStep(firstOpenStep(fresh));
      })
      .catch(() => null);
    return true;
  });

  const current = step ?? "identity";
  const next = current === "cac" ? undefined : NUMBERED[NUMBERED.indexOf(current) + 1];
  const props = data ? { state: data, onState: setState } : null;

  return (
    <Screen
      title={t("title")}
      refreshing={load.refreshing}
      onRefresh={() => void load.refresh()}
      footer={data && next ? <PillButton tone="white" title={t("next", { step: t(`step.${next}`) })} onPress={() => setStep(next)} /> : null}
    >
      {load.loading && !data ? <LoadingBlock /> : null}
      {load.error && !data ? <ErrorState message={load.error} onRetry={() => void load.reload()} /> : null}
      {data && props ? (
        <>
          <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
            <CallPeggyButton variant="compact" />
          </View>
          <Card style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <T weight="extrabold" style={{ flex: 1, fontSize: 16 }}>{t(`state.${data.state}`)}</T>
              <TonePill tone={STATE_TONE[data.state]} label={data.tier === "tier2" ? t("tier.tier2") : data.tier === "tier1" ? t("tier.tier1") : t("tier.none")} />
            </View>
            <T style={{ color: colors.inkSoft, lineHeight: 20 }}>{t(`state.${data.state}.hint`)}</T>
            {(data.state === "rejected" || data.state === "suspended") && data.statusReason ? <Notice>{data.statusReason}</Notice> : null}
          </Card>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
            {NUMBERED.map((item, position) => {
              const status = stepState(data, item);
              const on = item === current;
              return (
                <Pressable
                  key={item}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  onPress={() => setStep(item)}
                  style={{ borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, gap: 4, backgroundColor: on ? colors.ink : "#FFFFFF", borderWidth: 1, borderColor: on ? colors.ink : colors.line }}
                >
                  <T weight="bold" style={{ fontSize: 14, color: on ? "#FFFFFF" : colors.ink }}>{`${position + 1}. ${t(`step.${item}`)}`}</T>
                  {item !== "review" ? <TonePill tone={STEP_TONE[status]} label={t(`stepState.${status}`)} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>

          {current === "identity" ? <IdentityStep {...props} /> : null}
          {current === "bank" ? <BankStep {...props} /> : null}
          {current === "delivery" ? <DeliveryStep {...props} /> : null}
          {current === "review" ? <ReviewStep {...props} /> : null}
          {current === "cac" ? <CacStep {...props} /> : null}

          {/* CAC: optional, after the four steps. */}
          {current !== "cac" && data.tier !== "tier2" ? (
            <Banner title={t("noCac.title")} tone="mint" icon="shield">
              <T style={{ color: colors.inkSoft, lineHeight: 20, marginTop: 4 }}>{t("cac.cardSub")}</T>
              <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12, marginTop: 8 }}>
                <PillButton title={t("cac.open")} size="sm" tone="white" onPress={() => setStep("cac")} />
                <Pressable accessibilityRole="link" onPress={() => openOnWeb("/logistics/cac-help")}>
                  <T weight="bold" style={{ color: colors.forest }}>{t("noCac.link")}</T>
                </Pressable>
              </View>
            </Banner>
          ) : null}
          {current === "cac" ? <PillButton tone="white" title={t("cac.back")} onPress={() => setStep(firstOpenStep(data))} /> : null}
        </>
      ) : null}
    </Screen>
  );
}
