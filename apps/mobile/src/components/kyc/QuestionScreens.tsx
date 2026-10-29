import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { NG_STATES } from "@shared/delivery-market";
import { lgasOf } from "@shared/ng-lgas";
import { Choice } from "@/components/design";
import { LabeledInput } from "@/components/PartnerKit";
import { T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { lookUpCac, saveAnswer, saveKycBusiness } from "@/lib/kyc";
import { areaToken, feeAmount } from "@/lib/kyc-pure";
import { colors, fonts } from "@/theme";
import { Question, useStepAction, type ScreenProps } from "./KycKit";

// Screens 1–7 of the partner sign-up on the phone, one question each (the web's src/components/logistics/
// verification/QuestionScreens.tsx): business name, CAC, state, areas, what they deliver with, other states, how they
// charge. Each saves through /api/logistics/kyc/answers and moves on with onDone.

const bigInput = () => ({ minHeight: 56, borderRadius: 16, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 16, fontSize: 18, fontFamily: fonts.regular, color: colors.ink } as const);

/** A tap-to-pick chip (states, areas). */
function Chip({ label, on, onPress, disabled = false }: { label: string; on: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{ minHeight: 44, borderRadius: 999, paddingHorizontal: 16, justifyContent: "center", borderWidth: 1.5, borderColor: on ? colors.ink : colors.line, backgroundColor: on ? colors.inkFill : colors.surface, opacity: disabled ? 0.4 : 1 }}
    >
      <T weight="bold" style={{ fontSize: 15, color: on ? "#FFFFFF" : colors.ink }}>{label}</T>
    </Pressable>
  );
}

export function NameScreen({ state, onState, onDone, accountName }: ScreenProps & { accountName: string }) {
  const t = useT("m_kyc");
  const action = useStepAction(onState);
  const [name, setName] = useState(state.flow.answers.name ? state.business.companyName ?? "" : "");
  const save = (companyName: string) => void action.run("name", () => saveAnswer("name", { companyName }), onDone);
  return (
    <Question title={t("q.name.title")} sub={t("q.name.sub")} error={action.error} busy={action.busy === "name"} canContinue={name.trim().length >= 2} onContinue={() => save(name)}>
      <TextInput value={name} onChangeText={setName} autoFocus autoCapitalize="words" placeholder={t("q.name.placeholder")} placeholderTextColor={colors.inkSoft} accessibilityLabel={t("q.name.title")} style={bigInput()} />
      {accountName.trim().length >= 2 ? (
        <Pressable accessibilityRole="button" onPress={() => save(accountName)} disabled={Boolean(action.busy)}>
          <T weight="bold" style={{ fontSize: 16, textDecorationLine: "underline" }}>{t("q.name.useMine", { name: accountName })}</T>
        </Pressable>
      ) : null}
    </Question>
  );
}

/** Screen 2. "Yes" asks for the number, looks it up and asks "Is this your company?"; every answer continues. */
export function CacScreen({ state, onState, onDone }: ScreenProps) {
  const t = useT("m_kyc");
  const action = useStepAction(onState);
  const [registered, setRegistered] = useState(state.flow.answers.cac === "yes" || Boolean(state.business.cacNumber));
  const [number, setNumber] = useState(state.business.cacNumber ?? "");
  const [kind, setKind] = useState<"RC" | "BN" | null>(state.business.cacType === "RC" || state.business.cacType === "BN" ? state.business.cacType : null);
  const [found, setFound] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const cleaned = number.toUpperCase().replace(/[\s./-]+/g, "");
  const match = /^(RC|BN)?(\d{4,10})$/.exec(cleaned);
  const type = (match?.[1] as "RC" | "BN" | undefined) ?? kind;
  const digits = match?.[2] ?? "";
  const companyName = state.business.companyName || state.displayName;

  const choose = (cac: "no" | "registering") => void action.run(cac, () => saveAnswer("cac", { cac }), onDone);
  const keep = (registeredName: string) =>
    void action.run("keep", async () => {
      await saveKycBusiness({ registeredName, cacType: type ?? "BN", cacNumber: `${type ?? "BN"} ${digits}` });
      return saveAnswer("cac", { cac: "yes" });
    }, onDone);

  function lookUp() {
    if (!digits || !type) return;
    setFound(null);
    setFailed(null);
    void action.run("lookup", () => lookUpCac({ businessName: companyName, number: `${type} ${digits}`, companyType: type === "RC" ? "COMPANY" : "BUSINESS_NAME" }), (result) => {
      if (result.registeredName) setFound(result.registeredName);
      else setFailed(result.message || t("q.cac.failed"));
    }).then((result) => {
      if (result === null) setFailed(t("q.cac.failed"));
    });
  }

  if (!registered) {
    return (
      <Question title={t("q.cac.title")} sub={t("q.cac.sub")} error={action.error}>
        <Choice title={t("q.cac.yes")} on={false} onPress={() => setRegistered(true)} />
        <Choice title={t("q.cac.no")} on={state.flow.answers.cac === "no"} onPress={() => choose("no")} />
        <Choice title={t("q.cac.registering")} sub={t("q.cac.registeringSub")} on={state.flow.answers.cac === "registering"} onPress={() => choose("registering")} />
      </Question>
    );
  }

  if (found) {
    return (
      <Question title={t("q.cac.confirm")} error={action.error}>
        <View style={{ borderRadius: 18, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.surface, padding: 18, gap: 4 }}>
          <T weight="extrabold" style={{ fontSize: 20 }}>{found}</T>
          <T style={{ color: colors.inkSoft }}>{`${type} ${digits}`}</T>
        </View>
        <Choice title={t("q.cac.itsMine")} on onPress={() => keep(found)} />
        <Choice title={t("q.cac.notMine")} on={false} onPress={() => { setFound(null); setNumber(""); }} />
      </Question>
    );
  }

  return (
    <Question title={t("q.cac.number")} sub={t("q.cac.numberHint")} error={failed ? null : action.error} busy={action.busy === "lookup"} canContinue={Boolean(digits && type)} continueLabel={t("q.cac.lookUp")} onContinue={lookUp}>
      <TextInput value={number} onChangeText={(text) => { setNumber(text.toUpperCase()); setFailed(null); }} autoFocus autoCapitalize="characters" placeholder="RC 1234567" placeholderTextColor={colors.inkSoft} accessibilityLabel={t("q.cac.number")} style={bigInput()} />
      {digits && !match?.[1] ? (
        <View style={{ gap: 10 }}>
          <Choice title={t("q.cac.typeRc")} on={kind === "RC"} onPress={() => setKind("RC")} />
          <Choice title={t("q.cac.typeBn")} on={kind === "BN"} onPress={() => setKind("BN")} />
        </View>
      ) : null}
      {failed ? (
        <View style={{ gap: 10, borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 16 }}>
          <T style={{ color: colors.inkSoft }}>{failed}</T>
          <Pressable accessibilityRole="button" disabled={!digits || !type || Boolean(action.busy)} onPress={() => keep(companyName)}>
            <T weight="bold" style={{ fontSize: 16, textDecorationLine: "underline" }}>{t("q.cac.continueAnyway")}</T>
          </Pressable>
        </View>
      ) : null}
      <Pressable accessibilityRole="button" onPress={() => setRegistered(false)}>
        <T weight="bold" style={{ color: colors.inkSoft, textDecorationLine: "underline" }}>{t("q.cac.notRegistered")}</T>
      </Pressable>
    </Question>
  );
}

export function StateScreen({ state, onState, onDone }: ScreenProps) {
  const t = useT("m_kyc");
  const action = useStepAction(onState);
  const [picked, setPicked] = useState(state.flow.answers.homeState ?? state.coverage.deliveryAreas[0]?.split(":")[0]?.trim() ?? "");
  return (
    <Question title={t("q.state.title")} sub={t("q.state.sub")} error={action.error} busy={action.busy === "state"} canContinue={Boolean(picked)} onContinue={() => void action.run("state", () => saveAnswer("state", { state: picked }), onDone)}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {NG_STATES.map((name) => <Chip key={name} label={name} on={picked === name} onPress={() => setPicked(name)} />)}
      </View>
    </Question>
  );
}

export function AreasScreen({ state, onState, onDone }: ScreenProps) {
  const t = useT("m_kyc");
  const action = useStepAction(onState);
  const home = state.flow.answers.homeState ?? state.coverage.deliveryAreas[0]?.split(":")[0]?.trim() ?? "";
  // Areas in other states (added before, or from the portal) are kept as they are.
  const [areas, setAreas] = useState<string[]>(state.coverage.deliveryAreas);
  const own = (area: string) => area === home || area.startsWith(`${home}:`);
  const whole = areas.includes(home);
  const toggle = (token: string) => setAreas((list) => (list.includes(token) ? list.filter((item) => item !== token) : [...list.filter((item) => item !== home), token]));
  const pickAll = () => setAreas((list) => (whole ? list.filter((item) => item !== home) : [...list.filter((item) => !own(item)), home]));
  return (
    <Question title={t("q.areas.title")} sub={t("q.areas.sub", { state: home })} error={action.error} busy={action.busy === "areas"} canContinue={areas.length > 0} onContinue={() => void action.run("areas", () => saveAnswer("areas", { deliveryAreas: areas }), onDone)}>
      {home ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Chip label={t("q.areas.all", { state: home })} on={whole} onPress={pickAll} />
          {lgasOf(home).map((lga) => {
            const token = areaToken(home, lga);
            return <Chip key={lga} label={lga} on={!whole && areas.includes(token)} disabled={whole} onPress={() => toggle(token)} />;
          })}
        </View>
      ) : (
        <T style={{ color: colors.inkSoft }}>{t("q.areas.noState")}</T>
      )}
    </Question>
  );
}

const VEHICLES = ["bike", "car", "van", "truck", "tricycle"] as const;
const VEHICLE_ICONS: Record<(typeof VEHICLES)[number], string> = { bike: "🏍️", car: "🚗", van: "🚐", truck: "🚚", tricycle: "🛺" };

export function VehiclesScreen({ state, onState, onDone }: ScreenProps) {
  const t = useT("m_kyc");
  const action = useStepAction(onState);
  const [methods, setMethods] = useState<string[]>(state.coverage.deliveryMethods);
  const toggle = (method: string) => setMethods((list) => (list.includes(method) ? list.filter((item) => item !== method) : [...list, method]));
  return (
    <Question title={t("q.vehicles.title")} sub={t("q.vehicles.sub")} error={action.error} busy={action.busy === "vehicles"} canContinue={methods.length > 0} onContinue={() => void action.run("vehicles", () => saveAnswer("vehicles", { deliveryMethods: methods }), onDone)}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {VEHICLES.map((method) => {
          const on = methods.includes(method);
          return (
            <Pressable
              key={method}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              onPress={() => toggle(method)}
              style={{ width: "47%", minHeight: 112, borderRadius: 18, borderWidth: 2, borderColor: on ? colors.ink : colors.line, backgroundColor: on ? colors.inkFill : colors.surface, alignItems: "center", justifyContent: "center", gap: 6 }}
            >
              <T style={{ fontSize: 36 }}>{VEHICLE_ICONS[method]}</T>
              <T weight="extrabold" style={{ fontSize: 16, color: on ? "#FFFFFF" : colors.ink }}>{t(`method.${method}`)}</T>
            </Pressable>
          );
        })}
      </View>
    </Question>
  );
}

export function InterstateScreen({ state, onState, onDone }: ScreenProps) {
  const t = useT("m_kyc");
  const action = useStepAction(onState);
  const current = state.flow.answers.interstate;
  const pick = (interstate: boolean) => void action.run("interstate", () => saveAnswer("interstate", { interstate }), onDone);
  return (
    <Question title={t("q.interstate.title")} sub={t("q.interstate.sub")} error={action.error}>
      <Choice title={t("q.yes")} on={current === true} onPress={() => pick(true)} />
      <Choice title={t("q.no")} on={current === false} onPress={() => pick(false)} />
    </Question>
  );
}

export function ChargeScreen({ state, onState, onDone }: ScreenProps) {
  const t = useT("m_kyc");
  const action = useStepAction(onState);
  const [charge, setCharge] = useState<"flat" | "quote" | null>(state.flow.answers.charge ?? null);
  const [amount, setAmount] = useState(state.pricing.basePrice > 0 ? String(state.pricing.basePrice) : "");
  const fee = feeAmount(amount);
  return (
    <Question
      title={t("q.charge.title")}
      sub={t("q.charge.sub")}
      error={action.error}
      busy={action.busy === "charge"}
      canContinue={charge === "quote" || (charge === "flat" && fee !== null)}
      onContinue={() => void action.run("charge", () => saveAnswer("charge", charge === "flat" ? { charge, amount: fee } : { charge }), onDone)}
    >
      <Choice title={t("q.charge.flat")} on={charge === "flat"} onPress={() => setCharge("flat")} />
      {charge === "flat" ? <LabeledInput label={t("q.charge.amount")} value={amount} onChangeText={(text) => setAmount(text.replace(/\D/g, "").slice(0, 7))} keyboardType="number-pad" placeholder="2500" /> : null}
      <Choice title={t("q.charge.quote")} on={charge === "quote"} onPress={() => setCharge("quote")} />
    </Question>
  );
}
