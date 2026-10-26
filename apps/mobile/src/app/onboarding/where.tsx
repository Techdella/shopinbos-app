import { useEffect, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import * as Location from "expo-location";
import { canonicalState, NG_STATES } from "@shared/delivery-market";
import { allowedSellChoice, sellChoiceToSave, type OnboardingSellArea, type SellChoice } from "@shared/onboarding";
import { Choice, Small, Title } from "@/components/design";
import { LoadingBlock } from "@/components/kit";
import { LinkButton, Notice, PillButton, T } from "@/components/ui";
import { OnboardingFrame } from "@/components/OnboardingFrame";
import { fetchDeliveryHub, saveDeliverySettings, type DeliveryHub } from "@/lib/delivery";
import { stateName } from "@/lib/delivery-pure";
import { saveMemory } from "@/lib/onboarding";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";
import { StatePicker } from "@/components/StatePicker";

// "Where do you sell?" (seller onboarding, before payments): just my state, some states, or all of Nigeria, the
// delivery settings' "Where I sell" (PUT /api/mobile/delivery/settings, the web's SellAreaPicker model). The state
// starts as the one the shop ships from, its city, or the phone's location when the seller allows it. A choice the
// plan doesn't include is never refused: the step keeps the nearest allowed choice and says so in one calm line,
// and Continue always moves on (payments then starts with delivery fees for these places).

/** The phone's state, only when location is already allowed (asking is the seller's tap on "Use my location"). */
async function phoneState(ask: boolean): Promise<string | null> {
  try {
    const permission = ask ? await Location.requestForegroundPermissionsAsync() : await Location.getForegroundPermissionsAsync();
    if (permission.status !== "granted") return null;
    const position = (await Location.getLastKnownPositionAsync()) ?? (ask ? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }) : null);
    if (!position) return null;
    const [place] = await Location.reverseGeocodeAsync(position.coords);
    return canonicalState(place?.region ?? place?.subregion ?? place?.city ?? null);
  } catch {
    return null;
  }
}

export default function WhereYouSell() {
  const t = useT("m_onboarding");
  const [hub, setHub] = useState<DeliveryHub | null>(null);
  const [home, setHome] = useState<string | null>(null);
  const [choice, setChoice] = useState<SellChoice>({ area: "one_state", states: [] });
  const [note, setNote] = useState<"nationwide" | "states" | null>(null);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The plan's states are known once the delivery settings load (a failed load counts as one state, like Free).
  const [ready, setReady] = useState(false);
  const limit = hub ? hub.sellLimit?.states ?? null : 1;

  useEffect(() => {
    let alive = true;
    void (async () => {
      const loaded = await fetchDeliveryHub().catch(() => null);
      const fromShop = canonicalState(loaded?.settings.originState ?? null) ?? canonicalState(loaded?.city ?? null);
      const state = fromShop ?? (await phoneState(false));
      if (!alive) return;
      setHub(loaded);
      setHome(state);
      const saved = loaded?.settings;
      // A seller who already chose (a saved "some states" or "my state") starts there; everyone else on their state.
      const start: SellChoice = saved && saved.sellArea !== "nationwide" && saved.sellStates.length ? { area: saved.sellArea as OnboardingSellArea, states: saved.sellStates } : { area: "one_state", states: state ? [state] : [] };
      setChoice(allowedSellChoice(start, loaded ? loaded.sellLimit?.states ?? null : 1, state));
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  function pick(area: OnboardingSellArea) {
    const base = choice.states.length ? choice.states : home ? [home] : [];
    const first = home && base.includes(home) ? home : base[0];
    const states = area === "one_state" ? (first ? [first] : []) : base;
    const kept = allowedSellChoice({ area, states }, limit, home);
    setChoice({ area: kept.area, states: kept.states });
    setNote(kept.note);
  }

  function toggle(state: string) {
    if (choice.area === "one_state") return setChoice({ area: "one_state", states: [state] });
    const states = choice.states.includes(state) ? choice.states.filter((entry) => entry !== state) : [...choice.states, state];
    const kept = allowedSellChoice({ area: "selected", states }, limit, home);
    setChoice({ area: kept.area, states: kept.states });
    setNote(kept.note);
  }

  async function locateMe() {
    setLocating(true);
    const state = await phoneState(true);
    setLocating(false);
    if (!state) return setError(t("where.noLocation"));
    setError(null);
    setHome(state);
    if (choice.area !== "nationwide") setChoice(choice.area === "one_state" ? { area: "one_state", states: [state] } : { area: "selected", states: choice.states.includes(state) ? choice.states : [state, ...choice.states] });
  }

  async function next() {
    setBusy(true);
    const saved = sellChoiceToSave(choice, home);
    // Saved like the delivery settings page; anything that goes wrong here is fixed later in Delivery, never a wall.
    await saveDeliverySettings({ sellArea: saved.area, sellStates: saved.states, ...(hub?.settings.originState || !home ? {} : { originState: home }) }).catch(() => null);
    await saveMemory({ screen: "payments" }).catch(() => null);
    setBusy(false);
    router.push({ pathname: "/onboarding/payments", params: { area: saved.area, states: saved.states.join(","), home: home ?? "" } });
  }

  const nationwideLocked = limit !== null;
  const choices: Array<{ key: OnboardingSellArea; title: string; sub: string }> = [
    { key: "one_state", title: t("where.one"), sub: home ? stateName(home) : t("where.oneSub") },
    ...(limit === 1 ? [] : [{ key: "selected" as const, title: t("where.some"), sub: limit ? t("where.someUpTo", { count: limit }) : t("where.someSub") }]),
    { key: "nationwide", title: t("where.all"), sub: nationwideLocked ? t("where.allPlan") : t("where.allSub") },
  ];

  return (
    <OnboardingFrame step="where" footer={<PillButton title={t("where.continue")} tone="accent" busy={busy} onPress={() => void next()} />}>
      <Title>{t("where.title")}</Title>
      {ready ? null : <View style={{ marginTop: 20 }}><LoadingBlock /></View>}
      <View style={{ gap: 10, marginTop: 20, display: ready ? "flex" : "none" }}>
        {choices.map((item) => <Choice key={item.key} title={item.title} sub={item.sub} on={choice.area === item.key} onPress={() => pick(item.key)} />)}
      </View>
      {note ? (
        <T style={{ color: colors.inkSoft, fontSize: 14.5, lineHeight: 20, marginTop: 12 }} accessibilityLiveRegion="polite">
          {note === "nationwide" ? t("where.nationwideNote") : t("where.statesNote", { count: limit ?? 1 })}
        </T>
      ) : null}
      {ready && choice.area !== "nationwide" ? (
        <View style={{ gap: 10, marginTop: 20 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Small style={{ flex: 1 }}>{choice.area === "one_state" ? t("where.pickOne") : t("where.pickMany")}</Small>
            <LinkButton title={locating ? t("where.locating") : t("where.useLocation")} onPress={() => void locateMe()} />
          </View>
          <StatePicker
            testID="where-states"
            options={NG_STATES.map((state) => ({ value: state, label: stateName(state) }))}
            selected={choice.states}
            onToggle={toggle}
            single={choice.area === "one_state"}
            title={choice.area === "one_state" ? t("where.pickOne") : t("where.pickMany")}
          />
        </View>
      ) : null}
      {error ? <View style={{ marginTop: 12 }}><Notice tone="info">{error}</Notice></View> : null}
    </OnboardingFrame>
  );
}
