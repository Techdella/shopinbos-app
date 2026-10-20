import { Linking, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { naira } from "@shared/onboarding";
import { Heading, List, Pill, Row, Sub, Tile } from "@/components/design";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { Initial, useRiderWhere } from "@/components/PartnerKit";
import { Screen } from "@/components/Screen";
import { LinkButton } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { fetchRiders } from "@/lib/logistics";
import { riderState } from "@/lib/logistics-pure";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { colors } from "@/theme";

// One rider ("Delivery partner app" prototype `rider`): their initials, status pill and where they are, Call, what
// they delivered today, and "Remove from team" (done on the web riders page; the app has no remove call yet).

export default function RiderPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT("m_partner");
  const riders = useLoad(fetchRiders);
  const where = useRiderWhere();
  const rider = riders.data?.riders.find((entry) => entry.id === id);

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
        <Sub style={{ textAlign: "center" }}>{where(rider)}</Sub>
      </View>
      <List>
        {rider.phone ? <Row lead={<Tile icon="phone" />} title={t("riders.call")} sub={rider.phone} onPress={() => void Linking.openURL(`tel:${rider.phone}`)} /> : null}
        <Row lead={<Tile icon="box" />} title={t("rider.deliveredToday")} sub={String(rider.deliveredToday)} />
        {rider.earnedToday ? <Row lead={<Tile icon="wallet" />} title={t("money.earnedToday")} sub={naira(rider.earnedToday)} /> : null}
      </List>
      <LinkButton title={t("rider.remove")} color={colors.danger} onPress={() => void openWeb("/logistics/couriers")} />
    </Screen>
  );
}
