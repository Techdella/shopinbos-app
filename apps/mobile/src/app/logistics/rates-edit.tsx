import { useState } from "react";
import { router } from "expo-router";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { RateCardEditor } from "@/components/PartnerSetup";
import { Screen } from "@/components/Screen";
import { Notice, PillButton } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { fetchMarket, saveRateCard, type MarketData } from "@/lib/logistics";
import { deliverModeOf, draftFromRow, nairaInput, priceText, rowsToSave, starterRates, statesIn } from "@/lib/logistics-pure";
import { useLoad } from "@/lib/useLoad";

// Edit prices ("Delivery partner app" prototype pRates, from Rate card → Edit prices): a price box on every row,
// "+ Add a price", the re-attempt and return fees and notes. Saving publishes a new public rate card
// (PUT market { section: "rates" }); it applies to new orders only.

function RatesForm({ data }: { data: MarketData }) {
  const t = useT("m_partner", "common");
  const card = data.rateCard;
  const partner = data.partner;
  const [rows, setRows] = useState(() =>
    card?.rows.length ? card.rows.map(draftFromRow) : starterRates(statesIn(partner.pickupAreas), deliverModeOf(partner.pickupAreas, partner.deliveryAreas), statesIn(partner.deliveryAreas), partner.services),
  );
  const [fail, setFail] = useState(priceText(card?.failedAttemptFee ?? null));
  const [ret, setRet] = useState(priceText(card?.returnFee ?? null));
  const [notes, setNotes] = useState(card?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const priced = rowsToSave(rows);
    if (!priced.length) return setError(t("rates.needOne"));
    setBusy(true);
    setError(null);
    try {
      await saveRateCard({ rows: priced, failedAttemptFee: nairaInput(fail) ?? 0, returnFee: nairaInput(ret) ?? 0, notes });
      router.back();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("error.retry"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title={t("biz.rates")} heading={t("rates.title")} sub={card ? t("rates.sub") : `${t("rates.sub")} ${t("rates.subStarter")}`} footer={<PillButton tone="forest" title={t("save")} busy={busy} onPress={() => void save()} />}>
      <RateCardEditor rows={rows} onRows={setRows} fail={fail} onFail={setFail} ret={ret} onRet={setRet} notes={notes} onNotes={setNotes} />
      {error ? <Notice>{error}</Notice> : null}
    </Screen>
  );
}

export default function RatesEditScreen() {
  const t = useT("m_partner");
  const market = useLoad(fetchMarket);
  if (market.data) return <RatesForm data={market.data} />;
  return (
    <Screen title={t("biz.rates")}>
      {market.loading ? <LoadingBlock /> : null}
      {market.error ? <ErrorState message={market.error} onRetry={() => void market.reload()} /> : null}
    </Screen>
  );
}
