import { useMemo, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { List, Row, Tile } from "@/components/design";
import { AppIcon } from "@/components/icons";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { ServicesEditor } from "@/components/PartnerSetup";
import { Screen } from "@/components/Screen";
import { Notice, PillButton, T, Toggle } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { POD_LOCKED_CODE, podSwitch, wordsOf } from "@/lib/dropship-pure";
import { useT } from "@/lib/i18n";
import { fetchMarket, saveCoverage, type MarketData } from "@/lib/logistics";
import { useLoad } from "@/lib/useLoad";
import { colors } from "@/theme";

// Services ("Delivery partner app" prototype `services`): doorstep, pickup points, same-day and interstate, plus
// whether you offer pay on delivery at all (each business you work with also has its own switch). Saved with the
// coverage (PUT market { section: "coverage" }). Pay on delivery is open to verified partners (riders never hold cash; Supplier & Dropship Rules):
// below it the switch is locked and opens "Pay on delivery jobs" (logistics/pay-on-delivery: the goals and the cash
// rules); a 403 pod_locked from the server opens it too.

function ServicesForm({ data }: { data: MarketData }) {
  const t = useT("m_partner", "common");
  const words = useMemo(() => wordsOf(t), [t]);
  const partner = data.partner;
  const lock = podSwitch(partner, partner.offersPayOnDelivery);
  const [services, setServices] = useState<string[]>(partner.services);
  const [pod, setPod] = useState(partner.offersPayOnDelivery);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!services.length) return setError(t("svc.needOne"));
    setBusy(true);
    setError(null);
    try {
      await saveCoverage({ services, pickupAreas: partner.pickupAreas, deliveryAreas: partner.deliveryAreas, offersPayOnDelivery: pod });
      router.back();
    } catch (saveError) {
      if (saveError instanceof ApiError && saveError.code === POD_LOCKED_CODE) {
        setPod(false);
        router.push("/logistics/pay-on-delivery");
      }
      setError(saveError instanceof Error ? saveError.message : t("error.retry"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title={t("biz.services")} footer={<PillButton tone="forest" title={t("save")} busy={busy} onPress={() => void save()} />}>
      <ServicesEditor services={services} onServices={setServices} />
      <List>
        {lock.locked ? (
          <Row
            title={t("svc.pod")}
            sub={words("pod.lockedRowVerify", "Opens once you're verified. See how it works.")}
            right={
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.grayTint, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}>
                <AppIcon name="lock" size={13} color={colors.grayInk} />
                <T weight="bold" style={{ fontSize: 12, color: colors.grayInk }}>{words("pod.lockedBadge", "Locked")}</T>
              </View>
            }
            onPress={() => router.push("/logistics/pay-on-delivery")}
          />
        ) : (
          <Row title={t("svc.pod")} sub={t("svc.podSub")} right={<View><Toggle on={pod} onChange={setPod} label={t("svc.pod")} /></View>} />
        )}
        <Row lead={<Tile icon="coin" tone="mint" />} title={words("pod.title", "Pay on delivery jobs")} sub={words("pod.rulesRow", "Your level, the cash cap and the rules")} onPress={() => router.push("/logistics/pay-on-delivery")} />
      </List>
      {error ? <Notice>{error}</Notice> : null}
    </Screen>
  );
}

export default function ServicesScreen() {
  const t = useT("m_partner");
  const market = useLoad(fetchMarket);
  if (market.data) return <ServicesForm data={market.data} />;
  return (
    <Screen title={t("biz.services")}>
      {market.loading ? <LoadingBlock /> : null}
      {market.error ? <ErrorState message={market.error} onRetry={() => void market.reload()} /> : null}
    </Screen>
  );
}
