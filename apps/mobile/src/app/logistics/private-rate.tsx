import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { naira } from "@shared/onboarding";
import { List, Row, Small } from "@/components/design";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { DoneScreen, NoteCard, PriceBox } from "@/components/PartnerKit";
import { useRateWords } from "@/components/PartnerSetup";
import { Screen } from "@/components/Screen";
import { Notice, PillButton } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { fetchMarket, sendPrivateRate, type MarketData } from "@/lib/logistics";
import { SERVICE_KEYS, SIZE_KEYS, draftFromRow, rowsToSave } from "@/lib/logistics-pure";
import { useLoad } from "@/lib/useLoad";

// Private rate ("Delivery partner app" prototype `privRate` and `privDone`), from "Send them a private rate" in a
// chat or from a connected business: your public rate card with a new price on each row. Only that business sees
// it, and it replaces your public price for them once they accept (POST market/private-rates).

function PrivateRateForm({ data, ownerUserId, name }: { data: MarketData; ownerUserId: string; name: string }) {
  const t = useT("m_partner", "common");
  const words = useRateWords();
  const card = data.rateCard!;
  const [rows, setRows] = useState(() => card.rows.map(draftFromRow));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function send() {
    const priced = rowsToSave(rows);
    if (!priced.length) return setError(t("rates.needOne"));
    setBusy(true);
    setError(null);
    try {
      await sendPrivateRate({ ownerUserId, rows: priced, failedAttemptFee: card.failedAttemptFee, returnFee: card.returnFee, notes: card.notes ?? "" });
      setSent(true);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : t("error.retry"));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return <DoneScreen icon="send" title={t("priv.sent")} sub={t("priv.sentBody", { name })} footer={<PillButton tone="forest" title={t("done")} onPress={() => router.back()} />} />;
  }

  return (
    <Screen
      title={t("priv.title")}
      heading={t("priv.heading", { name })}
      sub={t("priv.sub")}
      footer={
        <PillButton tone="forest" busy={busy} onPress={() => void send()} icon="send" title={t("priv.send", { name })} />
      }
    >
      <List>
        {rows.map((row, index) => (
          <Row
            key={row.id}
            title={words.route(row)}
            sub={t("priv.rowLine", { svc: t.dynamic(SERVICE_KEYS[row.service]), size: t.dynamic(SIZE_KEYS[row.sizeBand]), price: naira(card.rows[index]?.price ?? 0) })}
            right={<PriceBox value={row.price} onChangeText={(price) => setRows(rows.map((entry) => (entry.id === row.id ? { ...entry, price } : entry)))} label={t("priv.newPrice")} />}
          />
        ))}
      </List>
      <Small>{t("priv.newOnly")}</Small>
      {error ? <Notice>{error}</Notice> : null}
    </Screen>
  );
}

export default function PrivateRate() {
  const { ownerUserId, name } = useLocalSearchParams<{ ownerUserId: string; name?: string }>();
  const t = useT("m_partner");
  const market = useLoad(fetchMarket);
  const who = name || t("chat.conversation");
  if (market.data?.rateCard?.rows.length) return <PrivateRateForm data={market.data} ownerUserId={String(ownerUserId)} name={who} />;
  return (
    <Screen title={t("priv.title")}>
      {market.loading ? <LoadingBlock /> : null}
      {market.error ? <ErrorState message={market.error} onRetry={() => void market.reload()} /> : null}
      {market.data ? (
        <>
          <NoteCard tone="mint" title={t("biz.noRates")}>{t("priv.needCard")}</NoteCard>
          <PillButton tone="forest" title={t("rates.editPrices")} onPress={() => router.push("/logistics/rates-edit")} />
        </>
      ) : null}
    </Screen>
  );
}

