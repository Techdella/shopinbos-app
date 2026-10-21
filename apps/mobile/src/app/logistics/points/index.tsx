import { router } from "expo-router";
import { List, Row, Tile } from "@/components/design";
import { AppIcon } from "@/components/icons";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { NoteCard } from "@/components/PartnerKit";
import { Screen } from "@/components/Screen";
import { PillButton, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { fetchMarket } from "@/lib/logistics";
import { useLoad } from "@/lib/useLoad";

// Pickup points ("Delivery partner app" prototype `points`): where customers collect parcels. Tap one to change or
// remove it; "Add a pickup point" opens a new one.

export default function PickupPoints() {
  const t = useT("m_partner");
  const market = useLoad(fetchMarket);
  const points = market.data?.pickupPoints ?? [];

  return (
    <Screen
      title={t("biz.points")}
      refreshing={market.refreshing}
      onRefresh={() => void market.refresh()}
      footer={
        <PillButton tone="forest" onPress={() => router.push("/logistics/points/edit")}>
          <AppIcon name="plus" size={20} color="#FFFFFF" />
          <T weight="extrabold" style={{ color: "#FFFFFF", fontSize: 17 }}>{t("points.add")}</T>
        </PillButton>
      }
    >
      {market.loading && !market.data ? <LoadingBlock /> : null}
      {market.error && !market.data ? <ErrorState message={market.error} onRetry={() => void market.reload()} /> : null}
      {market.data && !points.length ? <NoteCard tone="mint" title={t("points.none")}>{t("points.noneBody")}</NoteCard> : null}
      {points.length ? (
        <List>
          {points.map((point) => (
            <Row
              key={point.id}
              lead={<Tile icon="pin" tone="mint" />}
              title={point.name}
              sub={[point.address, point.hours].filter(Boolean).join(" · ")}
              onPress={() => router.push({ pathname: "/logistics/points/edit", params: { id: point.id } })}
            />
          ))}
        </List>
      ) : null}
    </Screen>
  );
}
