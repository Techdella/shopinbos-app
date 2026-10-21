import { useState } from "react";
import { router } from "expo-router";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { CoverageEditor } from "@/components/PartnerSetup";
import { Screen } from "@/components/Screen";
import { Notice, PillButton } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { fetchMarket, saveCoverage, type MarketData } from "@/lib/logistics";
import { deliverModeOf, deliveryAreasFor, pickupAreasFor, statesIn, type DeliverMode } from "@/lib/logistics-pure";
import { useLoad } from "@/lib/useLoad";

// Coverage ("Delivery partner app" prototype `cover`): the states you pick up from and where you deliver (same
// states, all of Nigeria or selected states). Saved as area tokens with PUT market { section: "coverage" }; finer
// areas saved on the web ("Lagos: Ikeja", regions) are kept.

function CoverageForm({ data }: { data: MarketData }) {
  const t = useT("m_partner", "common");
  const partner = data.partner;
  const [pickup, setPickup] = useState<string[]>(statesIn(partner.pickupAreas));
  const [mode, setMode] = useState<DeliverMode>(deliverModeOf(partner.pickupAreas, partner.deliveryAreas));
  const [deliver, setDeliver] = useState<string[]>(statesIn(partner.deliveryAreas));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!pickup.length) return setError(t("cover.needPickup"));
    if (mode === "some" && !deliver.length) return setError(t("cover.needDeliver"));
    setBusy(true);
    setError(null);
    try {
      await saveCoverage({
        services: partner.services,
        pickupAreas: pickupAreasFor(pickup, partner.pickupAreas),
        deliveryAreas: deliveryAreasFor(mode, pickup, deliver, partner.deliveryAreas),
        offersPayOnDelivery: partner.offersPayOnDelivery,
      });
      router.back();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("error.retry"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title={t("biz.coverage")} footer={<PillButton tone="forest" title={t("save")} busy={busy} onPress={() => void save()} />}>
      <CoverageEditor pickup={pickup} onPickup={setPickup} mode={mode} onMode={setMode} deliver={deliver} onDeliver={setDeliver} />
      {error ? <Notice>{error}</Notice> : null}
    </Screen>
  );
}

export default function CoverageScreen() {
  const t = useT("m_partner");
  const market = useLoad(fetchMarket);
  if (market.data) return <CoverageForm data={market.data} />;
  return (
    <Screen title={t("biz.coverage")}>
      {market.loading ? <LoadingBlock /> : null}
      {market.error ? <ErrorState message={market.error} onRetry={() => void market.reload()} /> : null}
    </Screen>
  );
}
