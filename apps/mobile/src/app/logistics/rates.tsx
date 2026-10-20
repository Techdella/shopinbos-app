import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { List, Row, Small, Tile } from "@/components/design";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { NoteCard } from "@/components/PartnerKit";
import { useRateWords } from "@/components/PartnerSetup";
import { Screen } from "@/components/Screen";
import { PillButton, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { fetchMarket } from "@/lib/logistics";
import { useLoad } from "@/lib/useLoad";

// Rate card ("Delivery partner app" prototype `rates`): every public price, the re-attempt and return fees and the
// notes for sellers, then "Edit prices".

export default function RatesScreen() {
  const t = useT("m_partner");
  const market = useLoad(fetchMarket);
  const words = useRateWords();
  const card = market.data?.rateCard;

  return (
    <Screen title={t("biz.rates")} refreshing={market.refreshing} onRefresh={() => void market.refresh()} footer={market.data ? <PillButton tone="forest" title={t("rates.editPrices")} onPress={() => router.push("/logistics/rates-edit")} /> : undefined}>
      {market.loading && !market.data ? <LoadingBlock /> : null}
      {market.error && !market.data ? <ErrorState message={market.error} onRetry={() => void market.reload()} /> : null}
      {market.data && !card ? <NoteCard tone="mint" title={t("biz.noRates")}>{t("rates.noneBody")}</NoteCard> : null}
      {card ? (
        <>
          <List>
            {card.rows.map((row) => (
              <Row key={row.id} title={words.route(row)} sub={words.line(row)} right={<T weight="bold">{naira(row.price)}</T>} />
            ))}
          </List>
          <List>
            <Row lead={<Tile icon="route" />} title={t("rates.reattemptFee")} sub={naira(card.failedAttemptFee)} />
            <Row lead={<Tile icon="box" />} title={t("rates.returnFee")} sub={naira(card.returnFee)} />
            <Row lead={<Tile icon="help" />} title={t("rates.notesTitle")} sub={card.notes || "—"} />
          </List>
        </>
      ) : null}
      <Small>{t("rates.newOnly")}</Small>
    </Screen>
  );
}
