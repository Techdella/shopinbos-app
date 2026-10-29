import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { List, Row, Seg, Sub } from "@/components/design";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { Pic } from "@/components/SupplierKit";
import { TabScreen } from "@/components/TabScreen";
import { capitalise } from "@/lib/friendly";
import { useT } from "@/lib/i18n";
import { dayWord } from "@/lib/partner-pure";
import { fetchQuoteRequests } from "@/lib/supplier";
import { quoteRequestStage, countWord } from "@/lib/supplier-pure";
import { useLoad } from "@/lib/useLoad";
import { surfaceCard } from "@/theme";

// Every price (quote) request, waiting and answered. Not a tab: waiting ones are Orders → Prices, and Orders →
// Prices and Account → Price requests open this list. Tap one to send your price or see what you said.

export default function QuoteRequests() {
  const t = useT("m_supplier", "m_partner", "common");
  const quotes = useLoad(fetchQuoteRequests);
  const [view, setView] = useState<"waiting" | "answered">("waiting");
  const all = quotes.data ?? [];
  const waiting = all.filter((quote) => quote.status === "pending");
  const answered = all.filter((quote) => quote.status !== "pending");
  const shown = view === "waiting" ? waiting : answered;

  return (
    <TabScreen title={t("account.priceRequests")} refreshing={quotes.refreshing} onRefresh={() => void quotes.refresh()}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Seg label={t("quotes.waiting")} count={quotes.data ? waiting.length : undefined} on={view === "waiting"} onPress={() => setView("waiting")} />
        <Seg label={t("quotes.answered")} count={quotes.data ? answered.length : undefined} on={view === "answered"} onPress={() => setView("answered")} />
      </View>
      {quotes.loading && !quotes.data ? <LoadingBlock label={t("loading")} /> : null}
      {quotes.error && !quotes.data ? <ErrorState message={quotes.error} onRetry={() => void quotes.reload()} /> : null}
      {quotes.data && !shown.length ? (
        <View style={{ ...surfaceCard(), padding: 18 }}>
          <Sub>{view === "waiting" ? t("orders.noPrices") : t("quotes.noneAnswered")}</Sub>
        </View>
      ) : null}
      {shown.length ? (
        <List>
          {shown.map((quote) => (
            <Row
              key={quote.id}
              lead={<Pic uri={quote.supplierProduct.images[0]} />}
              title={t("orders.priceRow", { shop: quote.seller.name, pieces: countWord(quote.quantity, t) })}
              sub={[quote.supplierProduct.name, quoteRequestStage(quote.status, t), quote.quotedPrice ? t("each", { price: naira(quote.quotedPrice) }) : null, capitalise(dayWord(quote.createdAt, undefined, t))].filter(Boolean).join(" · ")}
              onPress={() => router.push({ pathname: "/supplier/quote/[id]", params: { id: quote.id } })}
            />
          ))}
        </List>
      ) : null}
    </TabScreen>
  );
}
