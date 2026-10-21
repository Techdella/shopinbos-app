import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { List, Row } from "@/components/design";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { ServicesEditor } from "@/components/PartnerSetup";
import { Screen } from "@/components/Screen";
import { Notice, PillButton, Toggle } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { fetchMarket, saveCoverage, type MarketData } from "@/lib/logistics";
import { useLoad } from "@/lib/useLoad";

// Services ("Delivery partner app" prototype `services`): doorstep, pickup points, same-day and interstate, plus
// whether you offer pay on delivery at all (each business you work with also has its own switch). Saved with the
// coverage (PUT market { section: "coverage" }).

function ServicesForm({ data }: { data: MarketData }) {
  const t = useT("m_partner", "common");
  const partner = data.partner;
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
      setError(saveError instanceof Error ? saveError.message : t("error.retry"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title={t("biz.services")} footer={<PillButton tone="forest" title={t("save")} busy={busy} onPress={() => void save()} />}>
      <ServicesEditor services={services} onServices={setServices} />
      <List>
        <Row title={t("svc.pod")} sub={t("svc.podSub")} right={<View><Toggle on={pod} onChange={setPod} label={t("svc.pod")} /></View>} />
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
