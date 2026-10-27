import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ONBOARDING_STEPS, type OnboardingStep } from "@shared/partner-tiers";
import { Banner } from "@/components/design";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { BankStep, CoverageStep, GuarantorStep, VehiclesStep } from "@/components/kyc/FleetSteps";
import { CacStep, ReviewStep, openOnWeb } from "@/components/kyc/BusinessSteps";
import { IdentityStep } from "@/components/kyc/IdentityStep";
import { TonePill } from "@/components/partner";
import { Screen } from "@/components/Screen";
import { Card, Notice, PillButton, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { fetchKyc, type KycState } from "@/lib/kyc";
import { STEP_TONE, firstOpenStep, stepState } from "@/lib/kyc-pure";
import { useLoad } from "@/lib/useLoad";
import { colors } from "@/theme";

// Delivery partner verification on the phone, in steps like the web page (/logistics/verification): Identity →
// Bank → Vehicles → Coverage → Guarantor → (optional) CAC → Review & submit. Partners don't need CAC to start
// (Tier 1, Verified Individual); adding it later makes them a Registered Business with no order limits. Every call
// answers with the whole state (src/lib/kyc.ts), so the step pills follow at once. Opens on the first step that
// still needs something, or the one asked for (?step=cac from "Upgrade to Registered Business").

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
    const asked = ONBOARDING_STEPS.find((item) => item === params.step);
    setStep(asked ?? firstOpenStep(data));
  }, [data, step, params.step]);

  const current = step ?? "identity";
  const index = ONBOARDING_STEPS.indexOf(current);
  const next = ONBOARDING_STEPS[index + 1];
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
          <Card style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <T weight="extrabold" style={{ flex: 1, fontSize: 16 }}>{t(`state.${data.state}`)}</T>
              <TonePill tone={STATE_TONE[data.state]} label={data.tier === "tier2" ? t("tier.tier2") : data.tier === "tier1" ? t("tier.tier1") : t("tier.none")} />
            </View>
            <T style={{ color: colors.inkSoft, lineHeight: 20 }}>{t(`state.${data.state}.hint`)}</T>
            {(data.state === "rejected" || data.state === "suspended") && data.statusReason ? <Notice>{data.statusReason}</Notice> : null}
          </Card>

          {data.tier !== "tier2" ? (
            <Banner title={t("noCac.title")} tone="mint" icon="shield">
              <Pressable accessibilityRole="link" onPress={() => openOnWeb("/logistics/cac-help")}>
                <T weight="bold" style={{ color: colors.forest, marginTop: 4 }}>{t("noCac.link")}</T>
              </Pressable>
            </Banner>
          ) : null}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
            {ONBOARDING_STEPS.map((item, position) => {
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
          {current === "vehicles" ? <VehiclesStep {...props} /> : null}
          {current === "coverage" ? <CoverageStep {...props} /> : null}
          {current === "guarantor" ? <GuarantorStep {...props} /> : null}
          {current === "cac" ? <CacStep {...props} /> : null}
          {current === "review" ? <ReviewStep {...props} /> : null}
        </>
      ) : null}
    </Screen>
  );
}
