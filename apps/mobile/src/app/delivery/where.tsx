import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { NG_STATES } from "@shared/delivery-market";
import { Choice, Heading, Seg, Small, Sub } from "@/components/design";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Chips } from "@/components/seller/bits";
import { Field, Label, Notice, PillButton } from "@/components/ui";
import { fetchDeliveryHub, saveDeliverySettings, type DeliverySettings } from "@/lib/delivery";
import { stateName } from "@/lib/delivery-pure";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";

// Where I sell (the prototype's dvWhere): one state, selected states or all of Nigeria, and where parcels leave
// from (partners pick up there). Sellers and suppliers; PUT /api/mobile/delivery/settings checks it all again.

type Area = "one_state" | "selected" | "nationwide";

export default function WhereISell() {
  const t = useT("m_delivery", "delivery", "common");
  const hub = useLoad(fetchDeliveryHub);
  const settings = hub.data?.settings ?? null;
  if (settings) return <WhereForm settings={settings} />;
  return (
    <Screen title={t("where.title")}>
      {hub.loading ? <LoadingBlock /> : null}
      {hub.error ? <ErrorState message={hub.error} onRetry={() => void hub.reload()} /> : null}
    </Screen>
  );
}

function WhereForm({ settings }: { settings: DeliverySettings }) {
  const t = useT("m_delivery", "delivery", "common");
  const [area, setArea] = useState<Area>((["one_state", "selected", "nationwide"].includes(settings.sellArea) ? settings.sellArea : "nationwide") as Area);
  const [states, setStates] = useState<string[]>(settings.sellStates);
  const [originState, setOriginState] = useState(settings.originState ?? "");
  const [originArea, setOriginArea] = useState(settings.originArea ?? "");
  const [originAddress, setOriginAddress] = useState(settings.originAddress ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleState(state: string) {
    if (area === "one_state") setStates([state]);
    else setStates((current) => (current.includes(state) ? current.filter((entry) => entry !== state) : [...current, state]));
  }

  function pickArea(next: Area) {
    setArea(next);
    if (next === "one_state" && states.length > 1) setStates(states.slice(0, 1));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await saveDeliverySettings({ sellArea: area, sellStates: area === "nationwide" ? [] : states, originState: originState || undefined, originArea: originArea.trim(), originAddress: originAddress.trim() });
      if (router.canGoBack()) router.back();
      else router.replace("/delivery");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  const choices: Array<{ key: Area; title: string; sub: string }> = [
    { key: "one_state", title: t("where.one"), sub: t("where.oneSub") },
    { key: "selected", title: t("where.some"), sub: t("where.someSub") },
    { key: "nationwide", title: t("where.all"), sub: t("where.allSub") },
  ];

  return (
    <Screen
      title={t("where.title")}
      footer={
        <>
          {error ? <Notice>{error}</Notice> : null}
          <PillButton title={t("save")} tone="accent" busy={busy} onPress={() => void save()} />
        </>
      }
    >
      <View style={{ gap: 8 }}>
        <Heading>{t("where.heading")}</Heading>
        <Sub>{t("where.sub")}</Sub>
      </View>
      <View style={{ gap: 10 }}>
        {choices.map((choice) => <Choice key={choice.key} title={choice.title} sub={choice.sub} on={area === choice.key} onPress={() => pickArea(choice.key)} />)}
      </View>
      {area !== "nationwide" ? (
        <View style={{ gap: 10 }}>
          <Small>{area === "one_state" ? t("where.pickOne") : t("where.pickMany")}</Small>
          <Chips>
            {NG_STATES.map((state) => <Seg key={state} label={stateName(state)} on={states.includes(state)} onPress={() => toggleState(state)} />)}
          </Chips>
        </View>
      ) : null}

      <View style={{ gap: 8, marginTop: 8 }}>
        <Heading>{t("where.fromHeading")}</Heading>
        <Sub>{t("where.fromSub")}</Sub>
      </View>
      <View style={{ gap: 10 }}>
        <Small>{t("origin.state")}</Small>
        <Chips>
          {NG_STATES.map((state) => <Seg key={state} label={stateName(state)} on={originState === state} onPress={() => setOriginState(originState === state ? "" : state)} />)}
        </Chips>
      </View>
      <View>
        <Label>{t("origin.area")}</Label>
        <Field value={originArea} onChangeText={setOriginArea} maxLength={80} placeholder={t("where.areaPlaceholder")} accessibilityLabel={t("origin.area")} />
      </View>
      <View>
        <Label>{t("origin.address")}</Label>
        <Field value={originAddress} onChangeText={setOriginAddress} maxLength={200} accessibilityLabel={t("origin.address")} />
        <Small style={{ marginTop: 6 }}>{t("origin.addressHint")}</Small>
      </View>
    </Screen>
  );
}
