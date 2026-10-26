import { useState } from "react";
import { Alert, Linking, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { naira } from "@shared/onboarding";
import { Heading, List, Pill, Row, Sub, Tile } from "@/components/design";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { Initial, useRiderWhere } from "@/components/PartnerKit";
import { Screen } from "@/components/Screen";
import { LinkButton, Notice, PillButton } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { fetchRiders, setRiderActive } from "@/lib/logistics";
import { riderState } from "@/lib/logistics-pure";
import { useLoad } from "@/lib/useLoad";
import { colors } from "@/theme";

// One rider ("Delivery partner app" prototype `rider`): their initials, status pill and where they are, Call, what
// they delivered today, and "Remove from team" (PATCH /api/mobile/logistics/riders/[id]: the rider is turned off and
// their Riders app link stops working). A removed rider can be added back; they then need a new link (Add rider).

export default function RiderPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT("m_partner", "common");
  const riders = useLoad(fetchRiders);
  const where = useRiderWhere();
  const rider = riders.data?.riders.find((entry) => entry.id === id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(active: boolean) {
    setBusy(true);
    setError(null);
    try {
      await setRiderActive(String(id), active);
      if (active) await riders.reload();
      else router.back();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("rider.removeFailed"));
    } finally {
      setBusy(false);
    }
  }

  function remove(name: string) {
    Alert.alert(t("rider.removeTitle", { name }), t("rider.removeBody"), [
      { text: t("cancel"), style: "cancel" },
      { text: t("rider.remove"), style: "destructive", onPress: () => void change(false) },
    ]);
  }

  if (!rider) {
    return (
      <Screen title={t("rider.title")}>
        {riders.loading ? <LoadingBlock /> : null}
        {riders.error ? <ErrorState message={riders.error} onRetry={() => void riders.reload()} /> : null}
      </Screen>
    );
  }
  const state = riderState(rider);

  return (
    <Screen title={t("rider.title")} refreshing={riders.refreshing} onRefresh={() => void riders.refresh()}>
      <View style={{ alignItems: "center", gap: 10, paddingTop: 10 }}>
        <Initial name={rider.name} size={84} />
        <Heading style={{ textAlign: "center" }}>{rider.name}</Heading>
        <Pill label={t.dynamic(state.key)} tone={state.tone} style={{ alignSelf: "center" }} />
        <Sub style={{ textAlign: "center" }}>{[rider.plate, where(rider)].filter(Boolean).join(" · ")}</Sub>
      </View>
      <List>
        {rider.phone ? <Row lead={<Tile icon="phone" />} title={t("riders.call")} sub={rider.phone} onPress={() => void Linking.openURL(`tel:${rider.phone}`)} /> : null}
        <Row lead={<Tile icon="box" />} title={t("rider.deliveredToday")} sub={String(rider.deliveredToday)} />
        {rider.earnedToday ? <Row lead={<Tile icon="wallet" />} title={t("money.earnedToday")} sub={naira(rider.earnedToday)} /> : null}
      </List>
      {error ? <Notice>{error}</Notice> : null}
      {rider.active ? (
        <LinkButton title={busy ? t("saving") : t("rider.remove")} color={colors.danger} onPress={() => !busy && remove(rider.name)} />
      ) : (
        <PillButton title={t("rider.addBack")} tone="white" size="md" busy={busy} onPress={() => void change(true)} />
      )}
    </Screen>
  );
}
