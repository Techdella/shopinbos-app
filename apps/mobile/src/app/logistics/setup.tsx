import { useEffect, useState, type ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { naira } from "@shared/onboarding";
import { NG_STATES, SUGGESTED_PRICES, reachAreas, type DeliverReach } from "@shared/delivery-market";
import { Choice, List, Row, Seg, Small, Sub, Tile, Title } from "@/components/design";
import { AppIcon } from "@/components/icons";
import { CallPeggyButton } from "@/components/CallPeggyButton";
import { HelpButton } from "@/components/Help";
import { LoadingBlock } from "@/components/kit";
import { ChipWrap, LabeledInput } from "@/components/PartnerKit";
import { StatePicker } from "@/components/StatePicker";
import { LinkButton, Notice, PillButton, ProgressBars, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { fetchMarket, fetchOnboarding, saveSetup, type LogisticsOnboarding } from "@/lib/logistics";
import { stateLabel } from "@/lib/logistics-pure";
import { SETUP_QUESTIONS, SETUP_VEHICLES, savedHomeState, savedReach, savedVehicles, setupServices, setupStepOf, type SetupStep } from "@/lib/partner-setup-pure";
import { usePeggyContinue, usePeggySaved } from "@/lib/peggy-call";
import { partnerWizardStep } from "@/lib/peggy-call-pure";
import { colors } from "@/theme";
import { KeyboardShift } from "@/components/KeyboardShift";

// Set-up for a new delivery partner, as short as it can be: two questions, then they're in.
//   1 of 2  Your business: its name (sign-up's name + "Logistics" to start with) and the state they work from.
//   2 of 2  How you deliver: what they ride or drive, and where they deliver (only their state, some other states, or
//           all of Nigeria).
//   Ready   What verification needs before jobs come (ID and selfie, bank, vehicle, guarantor), "Verify me now", or
//           "Later" to Jobs, where the same things wait on the "Finish later" list in tier order.
// Name and phone come from sign-up and aren't asked again. Prices start at typical ones (shared/delivery-market.ts
// suggestedRateRows, saved by the server with step 2); rates, the bank, riders, pickup points and CAC are all on the
// "Finish later" list. Each step is saved as it's done (PATCH /api/logistics/onboarding), so a partner who leaves comes
// back to the step they stopped on. Every step has Help, a way out ("Finish later") and "Step N of 2"; "Call Peggy"
// sets it up with them on a call, and the areas she saves show here at once.

const STATE_OPTIONS = NG_STATES.map((state) => ({ value: state, label: stateLabel(state) }));

function Frame({ step, onBack, children, footer }: { step: SetupStep; onBack: () => void; children: ReactNode; footer: ReactNode }) {
  const t = useT("m_partner", "common");
  const index = step === "biz" ? 0 : step === "deliver" ? 1 : SETUP_QUESTIONS - 1;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <KeyboardShift>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 6 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("back")}
            onPress={onBack}
            hitSlop={6}
            style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.8 : 1 })}
          >
            <View style={{ transform: [{ rotate: "180deg" }] }}>
              <AppIcon name="chevron" size={20} color={colors.ink} strokeWidth={2.2} />
            </View>
          </Pressable>
          <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
            {step === "ready" ? null : <T weight="semibold" style={{ fontSize: 13, color: colors.inkSoft }}>{t("su.step", { step: index + 1, total: SETUP_QUESTIONS })}</T>}
            <View style={{ flexDirection: "row" }}>
              <ProgressBars total={SETUP_QUESTIONS} current={step === "ready" ? SETUP_QUESTIONS - 1 : index} />
            </View>
          </View>
          <HelpButton compact />
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 32, gap: 20 }}>
          {children}
        </ScrollView>
        <View style={{ paddingHorizontal: 20, paddingBottom: 12, paddingTop: 10, gap: 6 }}>{footer}</View>
      </KeyboardShift>
    </SafeAreaView>
  );
}

function Wizard({ saved }: { saved: LogisticsOnboarding }) {
  const t = useT("m_partner", "common", "m_kyc");
  const onboarded = saved.onboardingState?.completed === true || saved.verificationStatus === "verified";
  const savedHome = savedHomeState(saved);
  const [step, setStep] = useState<SetupStep>(setupStepOf({ onboarded, home: savedHome }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 1. The business
  const [name, setName] = useState(saved.displayName ?? saved.companyName ?? "");
  const [home, setHome] = useState<string | null>(savedHome);
  // 2. How and where they deliver
  const [vehicles, setVehicles] = useState<string[]>(savedVehicles(saved));
  const first = savedReach(savedHome, saved.deliveryAreas);
  const [reach, setReach] = useState<DeliverReach>(first.reach);
  const [states, setStates] = useState<string[]>(first.states);

  // Peggy saving areas on a call: they show here straight away.
  usePeggySaved((item) => {
    if (item.kind !== "coverage") return;
    fetchMarket()
      .then((fresh) => {
        const from = fresh.partner.pickupAreas[0];
        if (!from) return;
        const next = savedReach(from, fresh.partner.deliveryAreas);
        setHome(from);
        setReach(next.reach);
        setStates(next.states);
      })
      .catch(() => null);
  });
  // After the call: the step that's still missing.
  usePeggyContinue((status) => {
    if (status && !onboarded) go(partnerWizardStep(status.steps));
    return true;
  });

  function go(next: SetupStep) {
    setError(null);
    setStep(next);
  }
  const later = () => router.replace("/logistics/jobs");
  const label = (state: string) => stateLabel(state);

  async function saveBusiness() {
    const business = name.trim();
    if (business.length < 2) return setError(t("su.needName"));
    if (!home) return setError(t("su.needHome"));
    setBusy(true);
    setError(null);
    try {
      await saveSetup({ displayName: business, city: home, country: "Nigeria", coverageZones: [home], completed: false });
      go("deliver");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("error.retry"));
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (!home) return go("biz");
    if (!vehicles.length) return setError(t("su.needVehicle"));
    if (reach === "states" && !states.filter((state) => state !== home).length) return setError(t("su.needStates", { state: label(home) }));
    setBusy(true);
    setError(null);
    try {
      await saveSetup({
        displayName: name.trim(),
        city: home,
        country: "Nigeria",
        coverageZones: [home],
        vehicleTypes: vehicles,
        deliveryTypes: ["next_day"],
        pickupAreas: [home],
        deliveryAreas: reachAreas(home, reach, states),
        services: setupServices(reach),
        starterRates: true,
        completed: true,
      });
      go("ready");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("error.retry"));
    } finally {
      setBusy(false);
    }
  }

  const note = error ? <Notice>{error}</Notice> : null;
  const laterLink = <LinkButton title={t("su.later")} color={colors.inkSoft} onPress={later} style={{ alignSelf: "center", minHeight: 48 }} />;

  if (step === "biz") {
    return (
      <Frame step="biz" onBack={later} footer={<><PillButton tone="forest" title={t("next")} busy={busy} disabled={busy} onPress={() => void saveBusiness()} />{laterLink}</>}>
        <View style={{ gap: 8 }}>
          <Title>{t("su.bizTitle")}</Title>
          <Sub>{t("su.bizSub")}</Sub>
        </View>
        <View style={{ gap: 6 }}>
          <LabeledInput label={t("su.name")} value={name} onChangeText={setName} autoCapitalize="words" returnKeyType="done" />
          <Small>{t("su.nameHint")}</Small>
        </View>
        <View style={{ gap: 8 }}>
          <T weight="bold" style={{ fontSize: 14, color: colors.inkSoft }}>{t("su.home")}</T>
          <StatePicker single options={STATE_OPTIONS} selected={home ? [home] : []} onToggle={(value) => setHome(value)} title={t("su.home")} placeholder={t("su.homePick")} testID="setup-home" />
        </View>
        {note}
        <CallPeggyButton style={{ marginTop: 6 }} />
      </Frame>
    );
  }

  if (step === "deliver") {
    const where = home ? label(home) : "";
    const reaches: { value: DeliverReach; title: string; sub: string }[] = [
      { value: "home", title: t("su.reach.home", { state: where }), sub: t("su.reach.homeSub") },
      { value: "states", title: t("su.reach.states", { state: where }), sub: t("su.reach.statesSub") },
      { value: "nationwide", title: t("su.reach.nationwide"), sub: t("su.reach.nationwideSub") },
    ];
    const toggleVehicle = (vehicle: string) => setVehicles((was) => (was.includes(vehicle) ? was.filter((item) => item !== vehicle) : [...was, vehicle]));
    return (
      <Frame step="deliver" onBack={() => go("biz")} footer={<><PillButton tone="forest" title={t("su.finish")} busy={busy} disabled={busy} onPress={() => void finish()} />{laterLink}</>}>
        <Title>{t("su.deliverTitle")}</Title>
        <ChipWrap label={t("su.vehicles")}>
          {SETUP_VEHICLES.map((vehicle) => (
            <Seg key={vehicle} label={t.dynamic(`method.${vehicle}`, vehicle)} on={vehicles.includes(vehicle)} onPress={() => toggleVehicle(vehicle)} />
          ))}
        </ChipWrap>
        <View style={{ gap: 10 }}>
          <T weight="bold" style={{ fontSize: 14, color: colors.inkSoft }}>{t("su.reach")}</T>
          {reaches.map((option) => (
            <Choice key={option.value} title={option.title} sub={option.sub} on={reach === option.value} onPress={() => setReach(option.value)} />
          ))}
        </View>
        {reach === "states" ? (
          <StatePicker
            options={STATE_OPTIONS.filter((option) => option.value !== home)}
            selected={states}
            onToggle={(value) => setStates((was) => (was.includes(value) ? was.filter((item) => item !== value) : [...was, value]))}
            title={t("su.pickStates")}
            placeholder={t("su.pickStates")}
            testID="setup-states"
          />
        ) : null}
        {note}
        <CallPeggyButton variant="compact" />
      </Frame>
    );
  }

  // Set-up is done: what verification needs before jobs come, and the prices they start with.
  const needs = ["kyc.need.id", "kyc.need.bank", "kyc.need.vehicle", "kyc.need.guarantor"] as const;
  const where = home ? label(home) : "";
  const prices = reach === "home"
    ? t("su.pricesHome", { near: naira(SUGGESTED_PRICES.doorstep), state: where })
    : t("su.pricesFar", { near: naira(SUGGESTED_PRICES.doorstep), far: naira(SUGGESTED_PRICES.otherStates), state: where });
  return (
    <Frame
      step="ready"
      onBack={later}
      footer={
        <>
          <PillButton tone="forest" title={t("kyc.start")} onPress={() => router.replace("/logistics/verification")} />
          <PillButton tone="white" title={t("su.toJobs")} onPress={later} />
        </>
      }
    >
      <View style={{ alignItems: "center", gap: 12, paddingTop: 8 }}>
        <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.successTint, alignItems: "center", justifyContent: "center" }}>
          <AppIcon name="check" size={40} color={colors.success} strokeWidth={2.4} />
        </View>
        <Title style={{ textAlign: "center" }}>{t("su.readyTitle")}</Title>
        <Sub style={{ textAlign: "center" }}>{t("su.readySub")}</Sub>
      </View>
      <View style={{ gap: 10 }}>
        <T weight="bold" style={{ fontSize: 15 }}>{t("su.needTitle")}</T>
        <List>
          {needs.map((key) => (
            <Row key={key} lead={<Tile icon="shield" tone="mint" />} title={t(key)} />
          ))}
        </List>
      </View>
      <View style={{ backgroundColor: colors.mintTint, borderRadius: 20, padding: 16, gap: 4 }}>
        <T weight="bold" style={{ fontSize: 15, color: colors.forest }}>{t("su.pricesTitle")}</T>
        <T style={{ fontSize: 15, lineHeight: 21, color: colors.forest }}>{prices}</T>
      </View>
      <Small>{t("su.whyLater")}</Small>
    </Frame>
  );
}

export default function LogisticsSetup() {
  const t = useT("common");
  const [saved, setSaved] = useState<LogisticsOnboarding | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchOnboarding()
      .then((data) => live && setSaved(data))
      .catch((loadError: unknown) => live && setError(loadError instanceof Error ? loadError.message : ""));
    return () => {
      live = false;
    };
  }, []);

  if (saved) return <Wizard saved={saved} />;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas, padding: 20, justifyContent: "center", gap: 14 }}>
      {error !== null ? (
        <>
          <Notice>{error || " "}</Notice>
          <PillButton tone="white" title={t("back")} onPress={() => router.replace("/logistics/jobs")} />
        </>
      ) : (
        <LoadingBlock />
      )}
    </SafeAreaView>
  );
}
