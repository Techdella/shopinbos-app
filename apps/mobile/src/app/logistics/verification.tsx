import { useEffect, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { CallPeggyButton } from "@/components/CallPeggyButton";
import { type FlowScreen } from "@shared/partner-tiers";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { BaseScreen, IdScreen, ReviewScreen, SelfieScreen, type NinDraft } from "@/components/kyc/CheckScreens";
import { AreasScreen, CacScreen, ChargeScreen, InterstateScreen, NameScreen, StateScreen, VehiclesScreen } from "@/components/kyc/QuestionScreens";
import { StepHeader } from "@/components/PartnerKit";
import { Screen } from "@/components/Screen";
import { LinkButton, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { fetchKyc, type KycState } from "@/lib/kyc";
import { nextScreen, openScreen, previousScreen, screenNumber } from "@/lib/kyc-pure";
import { usePeggyContinue, usePeggySaved } from "@/lib/peggy-call";
import { useLoad } from "@/lib/useLoad";
import { colors } from "@/theme";

// Delivery partner sign-up on the phone, one question per screen like the web page (/logistics/verification, the
// owner's "Shopinbos Onboarding — Simplified"): business name → CAC (any answer continues) → state → areas → what
// they deliver with → other states → how they charge → where they're based → photo of their ID → selfie (Korapay's
// liveness check first when it's on) → review and send ("You're in review"). No BVN, no bank, no email code, no vehicle
// papers: the bank account is added in their Wallet to get paid. Each screen saves on Continue, so the flow reopens on the
// first unanswered one (state.flow.first); ?step=<screen> opens one directly ("Add CAC" on the tier card). Help is in
// the top corner (WhatsApp). After a Peggy call it reloads and opens the next open screen.

export default function LogisticsVerification() {
  const t = useT("m_kyc");
  const params = useLocalSearchParams<{ step?: string }>();
  const load = useLoad(fetchKyc);
  const [state, setState] = useState<KycState | null>(null);
  const [screen, setScreen] = useState<FlowScreen | null>(null);
  const [draft, setDraft] = useState<NinDraft>({ nin: "", firstName: "", lastName: "", dob: "" });
  const data = state ?? load.data ?? null;
  const accountName = data?.accountName ?? "";

  useEffect(() => {
    if (load.data) setState(load.data);
  }, [load.data]);

  useEffect(() => {
    if (!data || screen) return;
    setScreen(openScreen(data.flow.first, params.step));
    // The NIN fields start from the account holder's name (they correct it to match the slip).
    const words = data.accountName.trim().split(/\s+/).filter(Boolean);
    setDraft((now) => (now.firstName || now.lastName ? now : { ...now, firstName: words.length > 1 ? words.slice(0, -1).join(" ") : words[0] ?? "", lastName: words.length > 1 ? words[words.length - 1] : "" }));
  }, [data, screen, params.step]);

  // Peggy saving on a call, and "Continue" after it: fresh state, then the first screen still open.
  usePeggySaved(() => void fetchKyc().then(setState).catch(() => null));
  usePeggyContinue(() => {
    void fetchKyc()
      .then((fresh) => {
        setState(fresh);
        setScreen(fresh.flow.first);
      })
      .catch(() => null);
    return true;
  });

  const current = screen ?? "name";
  const back = previousScreen(current);
  const number = screenNumber(current);
  // Once sent, a fixed item (or CAC added later) goes back to the review screen rather than through every question.
  const props = data ? { state: data, onState: setState, onDone: () => setScreen(data.submittedAt ? "review" : nextScreen(current)) } : null;

  return (
    <Screen title={t("title")} refreshing={load.refreshing} onRefresh={() => void load.refresh()}>
      {load.loading && !data ? <LoadingBlock /> : null}
      {load.error && !data ? <ErrorState message={load.error} onRetry={() => void load.reload()} /> : null}
      {data && props && screen ? (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ flex: 1 }}>
              {back ? <StepHeader step={number.step} total={number.total} label={t("step.of", number)} onBack={() => setScreen(back)} backLabel={t("back")} /> : <T weight="semibold" style={{ fontSize: 13, color: colors.inkSoft }}>{t("step.of", number)}</T>}
            </View>
            <CallPeggyButton variant="compact" />
          </View>

          {current === "name" ? <NameScreen {...props} accountName={accountName} /> : null}
          {current === "cac" ? <CacScreen {...props} /> : null}
          {current === "state" ? <StateScreen {...props} /> : null}
          {current === "areas" ? <AreasScreen {...props} /> : null}
          {current === "vehicles" ? <VehiclesScreen {...props} /> : null}
          {current === "interstate" ? <InterstateScreen {...props} /> : null}
          {current === "charge" ? <ChargeScreen {...props} /> : null}
          {current === "base" ? <BaseScreen {...props} /> : null}
          {current === "id" ? <IdScreen {...props} draft={draft} onDraft={setDraft} /> : null}
          {current === "selfie" ? <SelfieScreen {...props} draft={draft} onDraft={setDraft} /> : null}
          {current === "review" ? <ReviewScreen state={data} onState={setState} goTo={setScreen} /> : null}

          {current !== "review" && data.flow.done[current] ? <LinkButton title={t("flow.skipDone")} onPress={props.onDone} color={colors.inkSoft} /> : null}
        </>
      ) : null}
    </Screen>
  );
}
