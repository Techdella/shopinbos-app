import { router } from "expo-router";
import { List, Pill, Row } from "@/components/design";
import { AppIcon } from "@/components/icons";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { Initial, NoteCard, useRiderWhere } from "@/components/PartnerKit";
import { Screen } from "@/components/Screen";
import { PillButton, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { fetchRiders } from "@/lib/logistics";
import { riderState } from "@/lib/logistics-pure";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";

// Riders ("Delivery partner app" prototype `riders`, under Business): each rider with where they are and a pill
// (Free, Busy, Off, Invited). Tap one for their page; "Add a rider" sends a WhatsApp invite to the Riders app.

export default function Team() {
  const t = useT("m_partner");
  const riders = useLoad(fetchRiders);
  const where = useRiderWhere();
  const list = riders.data?.riders ?? [];

  return (
    <Screen
      title={t("riders.title")}
      refreshing={riders.refreshing}
      onRefresh={() => void riders.refresh()}
      footer={
        <PillButton tone="forest" onPress={() => router.push("/logistics/add-rider")}>
          <AppIcon name="plus" size={20} color="#FFFFFF" />
          <T weight="extrabold" style={{ color: "#FFFFFF", fontSize: 17 }}>{t("riders.add")}</T>
        </PillButton>
      }
    >
      {riders.loading && !riders.data ? <LoadingBlock label={t("riders.loading")} /> : null}
      {riders.error && !riders.data ? <ErrorState message={riders.error} onRetry={() => void riders.reload()} web={{ label: t("openOnWeb"), onPress: () => void openWeb("/logistics/couriers") }} /> : null}
      {riders.data && !list.length ? <NoteCard tone="mint" title={t("riders.none")}>{t("riders.noneBody")}</NoteCard> : null}
      {list.length ? (
        <List>
          {list.map((rider) => {
            const state = riderState(rider);
            return (
              <Row
                key={rider.id}
                lead={<Initial name={rider.name} />}
                title={rider.name}
                sub={where(rider)}
                right={<Pill label={t.dynamic(state.key)} tone={state.tone} />}
                onPress={() => router.push({ pathname: "/logistics/team/[id]", params: { id: rider.id } })}
              />
            );
          })}
        </List>
      ) : null}
    </Screen>
  );
}
